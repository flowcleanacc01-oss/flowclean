'use client'

/**
 * 193/194 — Detect orphan codes (code in QT.items but NOT in catalog)
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import type { QuotationStatus } from '@/types'

export interface OrphanEntry {
  code: string
  /** unique names found in QT for this code */
  names: string[]
  /** total QT.items rows referencing this code */
  totalRows: number
  /** average pricePerUnit (excl. zero) */
  avgPrice: number
  qts: { id: string; number: string; status: QuotationStatus; nameInQT: string; pricePerUnit: number }[]
}

export function useOrphanCodes() {
  const { linenCatalog, quotations } = useStore()

  return useMemo(() => {
    const catalogCodes = new Set(linenCatalog.map(i => i.code))
    const map = new Map<string, OrphanEntry>()

    for (const qt of quotations) {
      for (const it of qt.items || []) {
        const code = (it.code || '').trim()
        if (!code) continue
        if (catalogCodes.has(code)) continue // not orphan
        const name = (it.name || '').trim()
        if (!map.has(code)) {
          map.set(code, { code, names: [], totalRows: 0, avgPrice: 0, qts: [] })
        }
        const entry = map.get(code)!
        if (name && !entry.names.includes(name)) entry.names.push(name)
        entry.totalRows++
        entry.qts.push({
          id: qt.id, number: qt.quotationNumber, status: qt.status,
          nameInQT: name, pricePerUnit: it.pricePerUnit || 0,
        })
      }
    }
    // Compute avg price
    for (const e of map.values()) {
      const prices = e.qts.map(q => q.pricePerUnit).filter(p => p > 0)
      e.avgPrice = prices.length === 0 ? 0 : Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100
    }

    const orphans = Array.from(map.values()).sort((a, b) => b.totalRows - a.totalRows)
    return {
      orphanMap: map,
      orphans,
      totalCodes: orphans.length,
      totalRows: orphans.reduce((s, e) => s + e.totalRows, 0),
    }
  }, [linenCatalog, quotations])
}
