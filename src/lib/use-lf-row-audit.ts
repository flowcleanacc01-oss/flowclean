// 413 — LF Row Duplicate Audit
//
// ตรวจ "row code ซ้ำใน LF เดียว" — สาเหตุที่ SD.qty ไม่ตรง LF
//   SD builder รวม col6 ตาม code ข้ามทุก row (billableMap[code] += col6)
//   แต่ LF grid/print แสดง row เดียว (.find(r => r.code === x))
//   → ถ้ามี row code ซ้ำ → SD รวม > LF แสดง → จำนวนไม่ตรง
//   ยิ่งกว่านั้น by-code apply (checklist/AI/sync) เขียนค่าลง "ทุก" row ที่ code ตรง
//   → 2 row × ค่าเดียวกัน → SD เด้งเป็น 2 เท่า (เคส TSR 17→34)
//
// Root cause: QT มี item code ซ้ำ → buildRows(qt.items.map(code)) สร้าง row ซ้ำ
//   (แก้ที่ buildRows dedupe แล้ว — tool นี้ตรวจ + ล้างของเก่า)
//
// 3 ระดับ:
//   🔴 doubled — มี row ที่ "ไม่ว่าง" ≥ 2 (เสี่ยง over-bill, ต้องคนตัดสิน)
//   🟠 ghost   — row ไม่ว่าง 1 + row ว่าง ≥ 1 (SD = ค่าจริง, ล้าง row ว่างได้ปลอดภัย)
//   ⚪ latent  — row ว่างทั้งหมด (ยังไม่กระทบ แต่ระเบิดได้ถ้าลงยอด, ล้างได้ปลอดภัย)

import { useMemo } from 'react'
import { useStore } from './store'
import { isRowEmpty, groupByCode } from './lf-row-dedup'

export { isRowEmpty, collapseDuplicateRows } from './lf-row-dedup'

export type LFRowDupSeverity = 'doubled' | 'ghost' | 'latent'

export const LF_ROW_SEVERITY_RANK: Record<LFRowDupSeverity, number> = {
  doubled: 0, ghost: 1, latent: 2,
}

export interface DupCodeDetail {
  code: string
  name: string
  count: number
  col6Values: number[]
  col6Sum: number
  nonEmptyCount: number
  severity: LFRowDupSeverity
}

export interface LFRowDupRow {
  id: string
  formNumber: string
  date: string
  customerId: string
  customerShortName: string
  customerName: string
  severity: LFRowDupSeverity
  dups: DupCodeDetail[]
  linkedSds: { id: string; noteNumber: string; isBilled: boolean }[]
  removableEmptyRows: number
}

export interface QtDupRow {
  id: string
  quotationNumber: string
  status: string
  customerId: string
  customerShortName: string
  customerName: string
  dupCodes: { code: string; count: number }[]
}

export interface LFRowAuditStats {
  doubled: number
  ghost: number
  latent: number
  total: number
  removableTotal: number
  affectedSds: number
  qtDupCount: number
}

export interface LFRowAuditFilters {
  severity: 'all' | LFRowDupSeverity
  customerId: string
  search: string
}

export function useLFRowAudit(filters: LFRowAuditFilters) {
  const { linenForms, deliveryNotes, quotations, getCustomer, linenCatalog } = useStore()

  const nameMap = useMemo(
    () => Object.fromEntries(linenCatalog.map(i => [i.code, i.name])),
    [linenCatalog],
  )

  // SD ที่ผูกแต่ละ LF (linenFormIds)
  const sdsByLf = useMemo(() => {
    const m = new Map<string, { id: string; noteNumber: string; isBilled: boolean }[]>()
    for (const dn of deliveryNotes) {
      for (const lfId of (dn.linenFormIds || [])) {
        if (!m.has(lfId)) m.set(lfId, [])
        m.get(lfId)!.push({ id: dn.id, noteNumber: dn.noteNumber, isBilled: !!dn.isBilled })
      }
    }
    return m
  }, [deliveryNotes])

  // หา dup ทุก LF
  const allRows = useMemo<LFRowDupRow[]>(() => {
    const out: LFRowDupRow[] = []
    for (const lf of linenForms) {
      const rows = Array.isArray(lf.rows) ? lf.rows : []
      const byCode = groupByCode(rows)
      const dups: DupCodeDetail[] = []
      for (const [code, idxs] of byCode) {
        if (idxs.length < 2) continue
        const rs = idxs.map(i => rows[i])
        const nonEmptyCount = rs.filter(r => !isRowEmpty(r)).length
        const col6Values = rs.map(r => r.col6_factoryPackSend || 0)
        const severity: LFRowDupSeverity =
          nonEmptyCount >= 2 ? 'doubled' : nonEmptyCount === 1 ? 'ghost' : 'latent'
        dups.push({
          code, name: nameMap[code] || code, count: idxs.length,
          col6Values, col6Sum: col6Values.reduce((s, v) => s + v, 0),
          nonEmptyCount, severity,
        })
      }
      if (dups.length === 0) continue
      const severity: LFRowDupSeverity = dups.some(d => d.severity === 'doubled') ? 'doubled'
        : dups.some(d => d.severity === 'ghost') ? 'ghost' : 'latent'
      // row ว่างที่ลบได้ (ghost/latent codes เท่านั้น)
      const removableEmptyRows = dups.reduce((s, d) =>
        d.severity === 'doubled' ? s : s + (d.count - 1), 0)
      const cust = getCustomer(lf.customerId)
      out.push({
        id: lf.id, formNumber: lf.formNumber, date: lf.date,
        customerId: lf.customerId,
        customerShortName: cust?.shortName || lf.customerId.slice(0, 6),
        customerName: cust?.name || '',
        severity, dups,
        linkedSds: sdsByLf.get(lf.id) || [],
        removableEmptyRows,
      })
    }
    return out
  }, [linenForms, sdsByLf, getCustomer, nameMap])

  // QT ที่มี code ซ้ำ (ต้นเหตุ upstream)
  const qtDupRows = useMemo<QtDupRow[]>(() => {
    const out: QtDupRow[] = []
    for (const q of quotations) {
      const items = Array.isArray(q.items) ? q.items : []
      const counts = new Map<string, number>()
      for (const it of items) counts.set(it.code, (counts.get(it.code) || 0) + 1)
      const dupCodes = [...counts.entries()].filter(([, n]) => n > 1).map(([code, count]) => ({ code, count }))
      if (dupCodes.length === 0) continue
      const cust = getCustomer(q.customerId)
      out.push({
        id: q.id, quotationNumber: q.quotationNumber, status: q.status,
        customerId: q.customerId,
        customerShortName: cust?.shortName || q.customerName || '',
        customerName: cust?.name || q.customerName || '',
        dupCodes,
      })
    }
    return out.sort((a, b) => (a.status === 'accepted' ? 0 : 1) - (b.status === 'accepted' ? 0 : 1))
  }, [quotations, getCustomer])

  const stats = useMemo<LFRowAuditStats>(() => {
    const affectedSds = new Set<string>()
    for (const r of allRows) {
      if (r.severity === 'doubled') r.linkedSds.forEach(s => affectedSds.add(s.id))
    }
    return {
      doubled: allRows.filter(r => r.severity === 'doubled').length,
      ghost: allRows.filter(r => r.severity === 'ghost').length,
      latent: allRows.filter(r => r.severity === 'latent').length,
      total: allRows.length,
      removableTotal: allRows.reduce((s, r) => s + r.removableEmptyRows, 0),
      affectedSds: affectedSds.size,
      qtDupCount: qtDupRows.length,
    }
  }, [allRows, qtDupRows])

  // filter + sort
  const rows = useMemo(() => {
    let list = allRows
    if (filters.severity !== 'all') list = list.filter(r => r.severity === filters.severity)
    if (filters.customerId !== 'all') list = list.filter(r => r.customerId === filters.customerId)
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      list = list.filter(r =>
        r.customerShortName.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.formNumber.toLowerCase().includes(q) ||
        r.dups.some(d => d.code.toLowerCase().includes(q)))
    }
    return [...list].sort((a, b) =>
      LF_ROW_SEVERITY_RANK[a.severity] - LF_ROW_SEVERITY_RANK[b.severity] ||
      b.date.localeCompare(a.date))
  }, [allRows, filters])

  return { rows, qtDupRows, stats }
}
