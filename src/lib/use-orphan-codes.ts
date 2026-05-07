'use client'

/**
 * 193/194/225 — Detect orphan codes (code in QT/LF/DN but NOT in catalog)
 *
 * 225 fix: ขยาย scope จาก QT-only → QT + LF + DN
 * ก่อนหน้านี้ codes ที่อยู่ใน LF/DN เก่า แต่ถูกลบจาก catalog แล้ว
 * จะกลายเป็น "orphan ที่ลบไม่ได้" — Vocab Audit เห็นแต่ Hygiene Center reassign ไม่ได้
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import type { QuotationStatus } from '@/types'

export interface OrphanEntry {
  code: string
  /** unique names found across all sources */
  names: string[]
  /** total rows referencing this code (qts + lfs + dns) */
  totalRows: number
  /** average pricePerUnit from QT + DN snapshots (excl. zero) */
  avgPrice: number
  /** QT references */
  qts: { id: string; number: string; status: QuotationStatus; nameInQT: string; pricePerUnit: number }[]
  /** LF references (225) */
  lfs: { id: string; formNumber: string; date: string; rowsCount: number }[]
  /** DN references (225) */
  dns: { id: string; noteNumber: string; date: string; itemName: string; quantity: number; pricePerUnit: number }[]
}

export function useOrphanCodes() {
  const { linenCatalog, quotations, linenForms, deliveryNotes } = useStore()

  return useMemo(() => {
    const catalogCodes = new Set(linenCatalog.map(i => i.code))
    const map = new Map<string, OrphanEntry>()

    const ensure = (code: string): OrphanEntry => {
      if (!map.has(code)) {
        map.set(code, { code, names: [], totalRows: 0, avgPrice: 0, qts: [], lfs: [], dns: [] })
      }
      return map.get(code)!
    }
    const addName = (entry: OrphanEntry, name: string) => {
      const n = (name || '').trim()
      if (n && !entry.names.includes(n)) entry.names.push(n)
    }

    // 1. QT
    for (const qt of quotations) {
      for (const it of qt.items || []) {
        const code = (it.code || '').trim()
        if (!code || catalogCodes.has(code)) continue
        const e = ensure(code)
        addName(e, it.name)
        e.totalRows++
        e.qts.push({
          id: qt.id, number: qt.quotationNumber, status: qt.status,
          nameInQT: (it.name || '').trim(), pricePerUnit: it.pricePerUnit || 0,
        })
      }
    }

    // 2. LF (225)
    for (const lf of linenForms) {
      const orphanRows = (lf.rows || []).filter(r => {
        const code = (r.code || '').trim()
        return code && !catalogCodes.has(code)
      })
      if (orphanRows.length === 0) continue
      // group by code
      const byCode = new Map<string, number>()
      for (const r of orphanRows) {
        const code = (r.code || '').trim()
        byCode.set(code, (byCode.get(code) || 0) + 1)
      }
      for (const [code, rowsCount] of byCode.entries()) {
        const e = ensure(code)
        e.totalRows += rowsCount
        e.lfs.push({ id: lf.id, formNumber: lf.formNumber, date: lf.date, rowsCount })
      }
    }

    // 3. DN (skip ad-hoc — ad-hoc ไม่นับเป็น vocab)
    for (const dn of deliveryNotes) {
      for (const item of dn.items || []) {
        if (item.isAdhoc) continue
        const code = (item.code || '').trim()
        if (!code || catalogCodes.has(code)) continue
        const e = ensure(code)
        e.totalRows++
        const itemName = (item as { name?: string }).name || ''
        addName(e, itemName)
        const snapshotPrice = dn.priceSnapshot?.[code] ?? 0
        e.dns.push({
          id: dn.id, noteNumber: dn.noteNumber, date: dn.date,
          itemName, quantity: item.quantity || 0, pricePerUnit: snapshotPrice,
        })
      }
    }

    // Compute avg price (QT + DN snapshots, ignore zero)
    for (const e of map.values()) {
      const prices = [
        ...e.qts.map(q => q.pricePerUnit),
        ...e.dns.map(d => d.pricePerUnit),
      ].filter(p => p > 0)
      e.avgPrice = prices.length === 0 ? 0 : Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100
    }

    const orphans = Array.from(map.values()).sort((a, b) => b.totalRows - a.totalRows)
    return {
      orphanMap: map,
      orphans,
      totalCodes: orphans.length,
      totalRows: orphans.reduce((s, e) => s + e.totalRows, 0),
    }
  }, [linenCatalog, quotations, linenForms, deliveryNotes])
}
