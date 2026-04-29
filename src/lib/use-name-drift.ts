'use client'

/**
 * 188 — Name drift detection
 *
 * Scan QT.items[].name vs current catalog name → return drift map per code:
 *   { catalogName, driftNames: Set<string>, qts: [{id, number, status, name}] }
 *
 * Drift = name in QT differs from catalog name.
 * (Customer.priceList ไม่มี name; DN/SD live-lookup; WB/IV เป็น compliance doc — ไม่นับ)
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import type { QuotationStatus } from '@/types'

export interface DriftEntry {
  code: string
  catalogName: string
  driftNames: string[]   // unique drift names
  qts: { id: string; number: string; status: QuotationStatus; nameInQT: string }[]
}

export function useNameDrift() {
  const { linenCatalog, quotations } = useStore()

  return useMemo(() => {
    const catalogByCode = new Map(linenCatalog.map(i => [i.code, i.name]))
    const map = new Map<string, DriftEntry>()

    for (const qt of quotations) {
      // ข้าม rejected — เก็บไว้เป็น historical record
      if (qt.status === 'rejected') continue
      for (const it of qt.items || []) {
        const code = it.code
        const catalogName = catalogByCode.get(code)
        // ถ้า code ไม่อยู่ใน catalog (orphan) → ข้าม (เป็นปัญหาคนละแบบ ใช้ MergeCodesTool)
        if (catalogName === undefined) continue
        const qtName = (it.name || '').trim()
        if (!qtName || qtName === catalogName) continue

        if (!map.has(code)) {
          map.set(code, { code, catalogName, driftNames: [], qts: [] })
        }
        const entry = map.get(code)!
        if (!entry.driftNames.includes(qtName)) entry.driftNames.push(qtName)
        entry.qts.push({
          id: qt.id,
          number: qt.quotationNumber,
          status: qt.status,
          nameInQT: qtName,
        })
      }
    }

    return {
      driftMap: map,
      driftCodes: Array.from(map.keys()),
      totalCodes: map.size,
      totalQts: Array.from(map.values()).reduce((s, e) => s + e.qts.length, 0),
    }
  }, [linenCatalog, quotations])
}
