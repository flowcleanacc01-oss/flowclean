'use client'

/**
 * 188/191 — Name drift detection
 *
 * Scan QT.items[].name vs current catalog name → return drift map per code.
 * เก็บทุก status รวม rejected (191 fix) เพื่อให้ตัวเลขตรงกับ search ของ QT page
 * ส่วนเลือกว่าจะ sync ตัวไหน = component เลือกเอง (status filter ภายหลัง)
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

/** Helper: count drift QT ใน scope ที่กำหนด */
export function countDriftInScope(entry: DriftEntry, allowed: Set<QuotationStatus>) {
  return entry.qts.filter(q => allowed.has(q.status)).length
}
