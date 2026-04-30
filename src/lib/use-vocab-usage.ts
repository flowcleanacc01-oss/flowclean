'use client'

/**
 * 205 — Vocabulary Usage Audit
 *
 * Aggregate การใช้ code/name ข้ามทุก source (Catalog / QT / LF / DN)
 * → 1 row/code → ใช้ดูภาพรวม cleanup catalog ใน Hygiene Center
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'

export type VocabStatus =
  | 'unused'         // ไม่อยู่ใน QT/LF/DN เลย
  | 'rarely'         // ใช้น้อย (< RARELY_THRESHOLD docs)
  | 'often'          // ใช้บ่อย (>= RARELY_THRESHOLD docs)
  | 'orphan'         // มีใน QT/LF/DN แต่ไม่อยู่ใน catalog
  | 'catalog_only'   // อยู่ catalog แต่ไม่มีใน QT/LF/DN

const RARELY_THRESHOLD = 10  // < 10 docs รวม = ใช้น้อย

export interface VocabUsageRow {
  code: string
  /** ชื่อหลัก: catalog name ก่อน, ถ้าไม่มี → ชื่อแรกที่เจอใน QT/LF/DN */
  name: string
  /** มีใน catalog ไหม */
  inCatalog: boolean
  /** ชื่อทั้งหมดที่เจอ (รวม catalog + drift names ใน QT) */
  allNames: string[]
  /** จำนวน QT ที่ใช้ code นี้ */
  qtCount: number
  /** จำนวน rows ใน LF ทั้งหมด */
  lfRows: number
  /** จำนวน rows ใน DN (ไม่รวม ad-hoc) */
  dnRows: number
  /** ผลรวม quantity ใน DN (ใช้ดู volume) */
  dnTotalQty: number
  /** วันที่ล่าสุดที่ถูกใช้ (max ของ QT/LF/DN date) — '' ถ้าไม่เคยใช้ */
  lastUsed: string
  /** Status สรุป */
  status: VocabStatus
  /** รวม docs ทั้งหมด (qt + lf + dn) */
  totalDocs: number
}

export interface VocabUsageStats {
  rows: VocabUsageRow[]
  totalCodes: number
  unusedCount: number
  rarelyCount: number
  oftenCount: number
  orphanCount: number
  catalogOnlyCount: number
}

export function useVocabUsage(): VocabUsageStats {
  const { linenCatalog, quotations, linenForms, deliveryNotes } = useStore()

  return useMemo(() => {
    // Aggregate per-code
    const acc = new Map<string, {
      code: string
      catalogName: string | null
      allNames: Set<string>
      qtIds: Set<string>
      lfRows: number
      dnRows: number
      dnTotalQty: number
      maxDate: string
    }>()

    const ensure = (code: string) => {
      if (!acc.has(code)) {
        acc.set(code, {
          code,
          catalogName: null,
          allNames: new Set(),
          qtIds: new Set(),
          lfRows: 0,
          dnRows: 0,
          dnTotalQty: 0,
          maxDate: '',
        })
      }
      return acc.get(code)!
    }

    // 1. Catalog — seed all catalog codes (so catalog-only ก็ติด)
    for (const it of linenCatalog) {
      const e = ensure(it.code)
      e.catalogName = it.name
      if (it.name) e.allNames.add(it.name)
    }

    // 2. QT — count unique QTs per code
    for (const qt of quotations) {
      const date = qt.date || ''
      for (const row of qt.items || []) {
        const code = (row.code || '').trim()
        if (!code) continue
        const e = ensure(code)
        e.qtIds.add(qt.id)
        const name = (row.name || '').trim()
        if (name) e.allNames.add(name)
        if (date && date > e.maxDate) e.maxDate = date
      }
    }

    // 3. LF — count rows
    for (const lf of linenForms) {
      const date = lf.date || ''
      for (const row of lf.rows || []) {
        const code = (row.code || '').trim()
        if (!code) continue
        const e = ensure(code)
        e.lfRows++
        if (date && date > e.maxDate) e.maxDate = date
      }
    }

    // 4. DN — count rows + qty (skip ad-hoc — ไม่ใช่ vocab จริง)
    for (const dn of deliveryNotes) {
      const date = dn.date || ''
      for (const item of dn.items || []) {
        if (item.isAdhoc) continue
        const code = (item.code || '').trim()
        if (!code) continue
        const e = ensure(code)
        e.dnRows++
        e.dnTotalQty += item.quantity || 0
        if (date && date > e.maxDate) e.maxDate = date
      }
    }

    // Build rows + classify
    const rows: VocabUsageRow[] = []
    let unusedCount = 0
    let rarelyCount = 0
    let oftenCount = 0
    let orphanCount = 0
    let catalogOnlyCount = 0

    for (const e of acc.values()) {
      const inCatalog = e.catalogName !== null
      const qtCount = e.qtIds.size
      const totalDocs = qtCount + e.lfRows + e.dnRows

      let status: VocabStatus
      if (!inCatalog) {
        status = 'orphan'
        orphanCount++
      } else if (totalDocs === 0) {
        status = 'catalog_only'
        catalogOnlyCount++
      } else if (totalDocs < RARELY_THRESHOLD) {
        status = 'rarely'
        rarelyCount++
      } else {
        status = 'often'
        oftenCount++
      }
      // ถ้า unused = ทุกอย่าง 0 (catalog_only ก็คือ unused จาก catalog perspective)
      if (totalDocs === 0 && inCatalog) unusedCount++

      const primaryName = e.catalogName ?? (e.allNames.size > 0 ? Array.from(e.allNames)[0] : e.code)

      rows.push({
        code: e.code,
        name: primaryName,
        inCatalog,
        allNames: Array.from(e.allNames),
        qtCount,
        lfRows: e.lfRows,
        dnRows: e.dnRows,
        dnTotalQty: e.dnTotalQty,
        lastUsed: e.maxDate,
        status,
        totalDocs,
      })
    }

    // Default sort: ใช้น้อย/ไม่เคยใช้ ขึ้นก่อน (admin จะได้เห็น candidate cleanup)
    rows.sort((a, b) => {
      // 1. orphan > catalog_only > rarely > often (priority for review)
      const order: Record<VocabStatus, number> = {
        orphan: 0, catalog_only: 1, unused: 1, rarely: 2, often: 3,
      }
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      // 2. รวม docs น้อยก่อน
      if (a.totalDocs !== b.totalDocs) return a.totalDocs - b.totalDocs
      // 3. code asc
      return a.code.localeCompare(b.code)
    })

    return {
      rows,
      totalCodes: rows.length,
      unusedCount,
      rarelyCount,
      oftenCount,
      orphanCount,
      catalogOnlyCount,
    }
  }, [linenCatalog, quotations, linenForms, deliveryNotes])
}

export const VOCAB_STATUS_CONFIG: Record<VocabStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  orphan:       { label: 'Orphan',     color: 'text-red-700',     bgColor: 'bg-red-50 border-red-200',         icon: '⚠️' },
  catalog_only: { label: 'ไม่เคยใช้',  color: 'text-slate-600',   bgColor: 'bg-slate-50 border-slate-200',     icon: '📦' },
  unused:       { label: 'ไม่เคยใช้',  color: 'text-slate-600',   bgColor: 'bg-slate-50 border-slate-200',     icon: '📦' },
  rarely:       { label: 'ใช้น้อย',    color: 'text-amber-700',   bgColor: 'bg-amber-50 border-amber-200',     icon: '🟡' },
  often:        { label: 'ใช้บ่อย',    color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', icon: '🟢' },
}
