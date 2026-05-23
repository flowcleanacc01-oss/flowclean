'use client'

/**
 * 193/194/225/226.A/240.2 — Detect orphan codes (code in QT/LF/DN/Customer/CO-Adjust but NOT in catalog)
 *
 * 225: ขยาย scope จาก QT-only → QT + LF + DN
 * 226.A: เพิ่ม Customer.enabledItems / priceList / priceHistory
 * 240.2: เพิ่ม carryOverAdjustments[].items[].code
 *   ก่อน 240.2 — orphan ที่อยู่ใน CO adjustments เท่านั้น (เช่น merge เก่าก่อน Feature 229
 *   ที่ไม่ rewrite CO) → orphan list มองไม่เห็น → เลือกใน MergeCodesTool ไม่ได้
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { isProtectedCode } from '@/lib/protected-codes'
import type { QuotationStatus, CarryOverAdjustmentType } from '@/types'

/** 226.A: customer.* fields ที่อาจมี orphan code */
export type CustomerOrphanSource = 'enabledItems' | 'priceList' | 'priceHistory'

export interface OrphanEntry {
  code: string
  /** unique names found across all sources */
  names: string[]
  /** total rows referencing this code (qts + lfs + dns + customers + coas) */
  totalRows: number
  /** average pricePerUnit from QT + DN snapshots + Customer.priceList (excl. zero) */
  avgPrice: number
  /** QT references */
  qts: { id: string; number: string; status: QuotationStatus; nameInQT: string; pricePerUnit: number }[]
  /** LF references (225 + 230: เพิ่ม customer info) */
  lfs: { id: string; formNumber: string; date: string; rowsCount: number; customerId: string; customerShortName: string }[]
  /** DN references (225 + 230: เพิ่ม customer info) */
  dns: { id: string; noteNumber: string; date: string; itemName: string; quantity: number; pricePerUnit: number; customerId: string; customerShortName: string }[]
  /** Customer references (226.A) — ชื่อลูกค้า + array ของ field ที่ใช้ code นี้ */
  customers: { id: string; shortName: string; name: string; sources: CustomerOrphanSource[]; priceListPrice: number | null }[]
  /** 240.2: Carry-Over Adjustments references */
  coas: { id: string; date: string; type: CarryOverAdjustmentType; customerId: string; customerShortName: string; delta: number }[]
}

export function useOrphanCodes() {
  const { linenCatalog, quotations, linenForms, deliveryNotes, customers, carryOverAdjustments } = useStore()

  return useMemo(() => {
    const catalogCodes = new Set(linenCatalog.map(i => i.code))
    const map = new Map<string, OrphanEntry>()
    const custMap = new Map(customers.map(c => [c.id, c]))

    const ensure = (code: string): OrphanEntry => {
      if (!map.has(code)) {
        map.set(code, { code, names: [], totalRows: 0, avgPrice: 0, qts: [], lfs: [], dns: [], customers: [], coas: [] })
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
        // 338: X-prefix = protected variety → skip orphan scan
        if (!code || catalogCodes.has(code) || isProtectedCode(code)) continue
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
        // 338: X-prefix = protected variety → skip orphan scan
        return code && !catalogCodes.has(code) && !isProtectedCode(code)
      })
      if (orphanRows.length === 0) continue
      // group by code
      const byCode = new Map<string, number>()
      for (const r of orphanRows) {
        const code = (r.code || '').trim()
        byCode.set(code, (byCode.get(code) || 0) + 1)
      }
      const lfCust = custMap.get(lf.customerId)
      for (const [code, rowsCount] of byCode.entries()) {
        const e = ensure(code)
        e.totalRows += rowsCount
        e.lfs.push({
          id: lf.id, formNumber: lf.formNumber, date: lf.date, rowsCount,
          customerId: lf.customerId,
          customerShortName: lfCust?.shortName || lf.customerId.slice(0, 8),
        })
      }
    }

    // 3. DN (skip ad-hoc — ad-hoc ไม่นับเป็น vocab)
    for (const dn of deliveryNotes) {
      const dnCust = custMap.get(dn.customerId)
      for (const item of dn.items || []) {
        if (item.isAdhoc) continue
        const code = (item.code || '').trim()
        // 338: X-prefix = protected variety → skip orphan scan
        if (!code || catalogCodes.has(code) || isProtectedCode(code)) continue
        const e = ensure(code)
        e.totalRows++
        const itemName = (item as { name?: string }).name || ''
        addName(e, itemName)
        const snapshotPrice = dn.priceSnapshot?.[code] ?? 0
        e.dns.push({
          id: dn.id, noteNumber: dn.noteNumber, date: dn.date,
          itemName, quantity: item.quantity || 0, pricePerUnit: snapshotPrice,
          customerId: dn.customerId,
          customerShortName: dnCust?.shortName || dn.customerId.slice(0, 8),
        })
      }
    }

    // 4. Carry-Over Adjustments (240.2) — orphan ที่ค้างอยู่ในตารางปรับผ้าค้าง
    //   เคสจริง: A19 → H17 merge เก่า ก่อน Feature 229 → A19 หลุดออกจาก LF/QT/DN/Customer
    //   แต่ adjustments[].items[].code = "A19" ยังค้าง → carry-over computeแสดง A19 ขึ้นมาตลอด
    for (const ca of carryOverAdjustments) {
      if (ca.isDeleted) continue
      const caCust = custMap.get(ca.customerId)
      for (const it of ca.items || []) {
        const code = (it.code || '').trim()
        // 338: X-prefix = protected variety → skip orphan scan
        if (!code || catalogCodes.has(code) || isProtectedCode(code)) continue
        const e = ensure(code)
        e.totalRows++
        e.coas.push({
          id: ca.id, date: ca.date, type: ca.type,
          customerId: ca.customerId,
          customerShortName: caCust?.shortName || ca.customerId.slice(0, 8),
          delta: it.delta || 0,
        })
      }
    }

    // 5. Customer (226.A) — scan enabledItems / priceList / priceHistory
    // 338: X-prefix = protected variety → skip orphan scan
    for (const c of customers) {
      const sources: { code: string; source: CustomerOrphanSource; price?: number }[] = []
      for (const code of c.enabledItems || []) {
        const trimmed = (code || '').trim()
        if (trimmed && !catalogCodes.has(trimmed) && !isProtectedCode(trimmed)) sources.push({ code: trimmed, source: 'enabledItems' })
      }
      for (const p of c.priceList || []) {
        const trimmed = (p.code || '').trim()
        if (trimmed && !catalogCodes.has(trimmed) && !isProtectedCode(trimmed)) sources.push({ code: trimmed, source: 'priceList', price: p.price })
      }
      for (const p of c.priceHistory || []) {
        const ph = p as unknown as { code?: string }
        const trimmed = (ph.code || '').trim()
        if (trimmed && !catalogCodes.has(trimmed) && !isProtectedCode(trimmed)) sources.push({ code: trimmed, source: 'priceHistory' })
      }
      // Group by code per customer (1 customer × 1 code = 1 entry, multiple sources)
      const byCode = new Map<string, { sources: Set<CustomerOrphanSource>; priceListPrice: number | null }>()
      for (const s of sources) {
        const ex = byCode.get(s.code) || { sources: new Set<CustomerOrphanSource>(), priceListPrice: null }
        ex.sources.add(s.source)
        if (s.source === 'priceList' && s.price != null && s.price > 0) ex.priceListPrice = s.price
        byCode.set(s.code, ex)
      }
      for (const [code, info] of byCode.entries()) {
        const e = ensure(code)
        e.customers.push({
          id: c.id, shortName: c.shortName, name: c.name,
          sources: Array.from(info.sources),
          priceListPrice: info.priceListPrice,
        })
        e.totalRows += info.sources.size
      }
    }

    // Compute avg price (QT + DN snapshots + Customer.priceList, ignore zero)
    for (const e of map.values()) {
      const prices = [
        ...e.qts.map(q => q.pricePerUnit),
        ...e.dns.map(d => d.pricePerUnit),
        ...e.customers.map(c => c.priceListPrice).filter((p): p is number => p != null && p > 0),
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
    // 240.2: เพิ่ม customers + carryOverAdjustments ใน deps (ก่อนหน้าขาด → stale orphan list)
  }, [linenCatalog, quotations, linenForms, deliveryNotes, customers, carryOverAdjustments])
}
