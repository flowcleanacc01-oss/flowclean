'use client'

/**
 * Phase A.1 — SD Integrity Audit hook
 * 324 — Redesign transport fee logic per customer flags
 *
 * Post-batch verification: ตรวจ SD ทุกใบ ว่า data integrity ครบไหม
 * — Read-only — ไม่แก้ไขข้อมูล
 * — Per-SD row (รวม issues หลายตัวต่อ 1 SD)
 *
 * Checks:
 *   (a) linenFormIds empty หรือ LF ไม่มีจริง
 *   (b) LF ที่ผูกอยู่ status ≠ confirmed
 *   (c) col6 LF ≠ items.quantity SD (qty drift per item)
 *   (d) priceSnapshot missing keys (items ที่ไม่มี snapshot)
 *   (e) Transport fee checks per customer flags:
 *       - missing_trip_fee:  enableMinPerTrip + ไม่ได้ waive + actual trip = 0
 *       - missing_month_fee: enableMinPerMonth + เป็นใบสุดท้ายของเดือน + expected > 0 + actual = 0
 *       - stale_month_fee:   month > 0 ใน SD ที่ไม่ใช่ใบสุดท้ายของเดือน
 *       - unexpected_trip_fee:  ไม่ enable trip แต่มี trip > 0 (info)
 *       - unexpected_month_fee: ไม่ enable month แต่มี month > 0 (info)
 */
import { useMemo } from 'react'
import { useStore } from './store'
import { matchesThaiQueryAnyField } from './thai-search'
import {
  calculateDNSubtotal,
  calculateTransportFeeTrip,
  calculateTransportFeeMonth,
  createDNLastOfMonthCompare,
} from './transport-fee'

export type SDAuditReason =
  | 'orphan_lf'             // linenFormIds ชี้ไป LF ที่ไม่มีในระบบ
  | 'no_lf_link'            // linenFormIds empty (orphan SD)
  | 'lf_not_confirmed'      // LF ที่ผูกอยู่ status ≠ confirmed
  | 'qty_drift'             // col6 LF ≠ items.quantity SD (per item)
  | 'missing_snapshot'      // priceSnapshot ไม่มี key ของ items ที่ billable
  | 'missing_trip_fee'      // 324: ขาดค่ารถครั้ง (customer ติ๊ก trip, ไม่ได้ waive)
  | 'missing_month_fee'     // 324: ขาดค่ารถเดือน (ใบสุดท้ายของเดือน + customer ติ๊ก month)
  | 'stale_month_fee'       // 324: มีค่ารถเดือน ใน SD ที่ไม่ใช่ใบสุดท้าย
  | 'unexpected_trip_fee'   // 324: มี trip fee แต่ customer ไม่ติ๊ก enableMinPerTrip
  | 'unexpected_month_fee'  // 324: มี month fee แต่ customer ไม่ติ๊ก enableMinPerMonth

export type SDAuditSeverity = 'critical' | 'high' | 'warning' | 'info'

export interface SDAuditIssue {
  reason: SDAuditReason
  severity: SDAuditSeverity
  /** Detail message — เช่น 'col6=10 แต่ SD=12 (item B/T)' */
  detail: string
}

export interface SDAuditRow {
  id: string
  dnId: string
  dnNumber: string
  dnDate: string
  isBilled: boolean
  customerId: string
  customerShortName: string
  customerName: string
  issues: SDAuditIssue[]
  /** สูงสุดของ issues */
  severity: SDAuditSeverity
}

export interface SDAuditFilters {
  dateFrom?: string
  dateTo?: string
  customerId?: string
  severity?: 'all' | SDAuditSeverity
  reason?: 'all' | SDAuditReason
  showOk?: boolean
  search?: string
}

export interface SDAuditStats {
  critical: number
  high: number
  warning: number
  info: number
  ok: number
  total: number
  customersAudited: number
  /** Issue count by reason — สำหรับ summary chips */
  byReason: Record<SDAuditReason, number>
}

export interface SDAuditResult {
  rows: SDAuditRow[]
  allRows: SDAuditRow[]
  stats: SDAuditStats
}

export const SD_AUDIT_REASON_CONFIG: Record<SDAuditReason, { label: string; color: string; icon: string }> = {
  orphan_lf:             { label: 'LF ไม่มีในระบบ',           color: 'red',    icon: '👻' },
  no_lf_link:            { label: 'ไม่ผูก LF',                 color: 'orange', icon: '🔗' },
  lf_not_confirmed:      { label: 'LF status ≠ 7/7',          color: 'orange', icon: '⚠️' },
  qty_drift:             { label: 'จำนวนต่าง LF (drift)',      color: 'red',    icon: '📊' },
  missing_snapshot:      { label: 'ไม่มี priceSnapshot',       color: 'orange', icon: '❓' },
  missing_trip_fee:      { label: 'ขาดค่ารถครั้ง',              color: 'orange', icon: '🚚' },
  missing_month_fee:     { label: 'ขาดค่ารถเดือน (ใบสุดท้าย)',  color: 'orange', icon: '📅' },
  stale_month_fee:       { label: 'ค่ารถเดือนผิดใบ',           color: 'red',    icon: '🚫' },
  unexpected_trip_fee:   { label: 'มี trip ทั้งที่ไม่ติ๊ก',        color: 'amber',  icon: 'ℹ️' },
  unexpected_month_fee:  { label: 'มี month ทั้งที่ไม่ติ๊ก',      color: 'amber',  icon: 'ℹ️' },
}

export const SD_AUDIT_SEVERITY_RANK: Record<SDAuditSeverity, number> = {
  critical: 0, high: 1, warning: 2, info: 3,
}

function maxSeverity(issues: SDAuditIssue[]): SDAuditSeverity {
  if (issues.length === 0) return 'info'
  return issues.reduce<SDAuditSeverity>((max, i) =>
    SD_AUDIT_SEVERITY_RANK[i.severity] < SD_AUDIT_SEVERITY_RANK[max] ? i.severity : max,
    'info' as SDAuditSeverity,
  )
}

export function useSDAudit(filters: SDAuditFilters): SDAuditResult {
  const { deliveryNotes, linenForms, customers } = useStore()

  return useMemo(() => {
    const lfById = new Map<string, typeof linenForms[number]>()
    for (const f of linenForms) lfById.set(f.id, f)

    const allRows: SDAuditRow[] = []
    const customerIdsSeen = new Set<string>()
    const byReason: Record<SDAuditReason, number> = {
      orphan_lf: 0, no_lf_link: 0, lf_not_confirmed: 0,
      qty_drift: 0, missing_snapshot: 0,
      missing_trip_fee: 0, missing_month_fee: 0, stale_month_fee: 0,
      unexpected_trip_fee: 0, unexpected_month_fee: 0,
    }

    // 324: Precompute last-DN-of-month per customer · month — สำหรับ month fee logic
    //   Use LF-based operational order (transport-fee.ts pattern)
    const lastDNOfMonth = new Map<string, string>() // key: "{customerId}|{YYYY-MM}" → dnId
    const dnsByCustMonth = new Map<string, typeof deliveryNotes>()
    for (const dn of deliveryNotes) {
      const month = dn.date.slice(0, 7)
      const key = `${dn.customerId}|${month}`
      if (!dnsByCustMonth.has(key)) dnsByCustMonth.set(key, [])
      dnsByCustMonth.get(key)!.push(dn)
    }
    const compareLastOfMonth = createDNLastOfMonthCompare(linenForms)
    for (const [key, dns] of dnsByCustMonth.entries()) {
      const sorted = [...dns].sort(compareLastOfMonth)
      if (sorted.length > 0) lastDNOfMonth.set(key, sorted[0].id) // compare returns DESC → [0] = latest
    }

    for (const dn of deliveryNotes) {
      if (filters.dateFrom && dn.date < filters.dateFrom) continue
      if (filters.dateTo && dn.date > filters.dateTo) continue
      if (filters.customerId && filters.customerId !== 'all' && dn.customerId !== filters.customerId) continue

      const cust = customers.find(c => c.id === dn.customerId)
      if (!cust) continue
      customerIdsSeen.add(dn.customerId)

      const issues: SDAuditIssue[] = []
      const billedSev = (sev: SDAuditSeverity): SDAuditSeverity =>
        dn.isBilled && sev === 'high' ? 'critical' : sev

      // (a)+(b): linenFormIds checks
      if (!dn.linenFormIds || dn.linenFormIds.length === 0) {
        issues.push({ reason: 'no_lf_link', severity: billedSev('high'), detail: 'SD ไม่ได้ผูก LF' })
      } else {
        const missingLF: string[] = []
        const wrongStatus: { lfId: string; status: string }[] = []
        const linkedLFs: typeof linenForms[number][] = []
        for (const lfId of dn.linenFormIds) {
          const lf = lfById.get(lfId)
          if (!lf) {
            missingLF.push(lfId)
          } else {
            linkedLFs.push(lf)
            if (lf.status !== 'confirmed') {
              wrongStatus.push({ lfId, status: lf.status })
            }
          }
        }
        if (missingLF.length > 0) {
          issues.push({
            reason: 'orphan_lf', severity: billedSev('critical'),
            detail: `LF ${missingLF.length} ใบ ไม่มีในระบบ (${missingLF.slice(0, 2).join(', ')}${missingLF.length > 2 ? '...' : ''})`,
          })
        }
        if (wrongStatus.length > 0) {
          issues.push({
            reason: 'lf_not_confirmed', severity: billedSev('high'),
            detail: `LF ${wrongStatus.length} ใบ status ≠ 7/7 (${wrongStatus.slice(0, 2).map(w => `${w.status}`).join(', ')})`,
          })
        }

        // (c) qty drift — sum col6 LF vs items.quantity SD per item code (only billable items)
        if (linkedLFs.length > 0) {
          const lfSums: Record<string, number> = {}
          for (const lf of linkedLFs) {
            for (const r of lf.rows) {
              const pack = r.col6_factoryPackSend || 0
              if (pack > 0) lfSums[r.code] = (lfSums[r.code] || 0) + pack
            }
          }
          const sdSums: Record<string, number> = {}
          for (const it of dn.items) {
            if (it.isClaim) continue
            sdSums[it.code] = (sdSums[it.code] || 0) + (it.quantity || 0)
          }
          const allCodes = new Set([...Object.keys(lfSums), ...Object.keys(sdSums)])
          const drifts: { code: string; lf: number; sd: number }[] = []
          for (const code of allCodes) {
            const lfQ = lfSums[code] || 0
            const sdQ = sdSums[code] || 0
            if (lfQ !== sdQ) drifts.push({ code, lf: lfQ, sd: sdQ })
          }
          if (drifts.length > 0) {
            const sample = drifts.slice(0, 2).map(d => `${d.code}: LF=${d.lf}/SD=${d.sd}`).join(', ')
            issues.push({
              reason: 'qty_drift', severity: billedSev('high'),
              detail: `${drifts.length} item drift (${sample}${drifts.length > 2 ? '...' : ''})`,
            })
          }
        }
      }

      // (d) priceSnapshot missing — สำหรับ items ที่ billable
      const billableCodes = new Set(dn.items.filter(it => !it.isClaim).map(it => it.code))
      const snapKeys = new Set(Object.keys(dn.priceSnapshot || {}))
      const missingSnapCodes: string[] = []
      for (const code of billableCodes) {
        if (!snapKeys.has(code)) missingSnapCodes.push(code)
      }
      if (billableCodes.size > 0 && (!dn.priceSnapshot || Object.keys(dn.priceSnapshot).length === 0)) {
        issues.push({
          reason: 'missing_snapshot', severity: billedSev('high'),
          detail: 'ไม่มี priceSnapshot เลย (items ทั้งหมด)',
        })
      } else if (missingSnapCodes.length > 0) {
        issues.push({
          reason: 'missing_snapshot', severity: billedSev('high'),
          detail: `priceSnapshot ขาด ${missingSnapCodes.length} item (${missingSnapCodes.slice(0, 2).join(', ')}${missingSnapCodes.length > 2 ? '...' : ''})`,
        })
      }

      // (e) 324: Transport fee logic per customer flags
      const tripFee = dn.transportFeeTrip || 0
      const monthFee = dn.transportFeeMonth || 0
      const isLastOfMonth = lastDNOfMonth.get(`${dn.customerId}|${dn.date.slice(0, 7)}`) === dn.id

      // (e.1) Trip fee — เฉพาะลูกค้าที่ enableMinPerTrip
      if (cust.enableMinPerTrip) {
        const subtotal = calculateDNSubtotal(dn, cust, dn.priceSnapshot)
        const expectedTrip = calculateTransportFeeTrip(subtotal, cust)
        if (expectedTrip > 0 && tripFee === 0) {
          const waiveHint = cust.enableWaive && cust.minPerTripThreshold > 0
            ? ` · waive threshold = ${cust.minPerTripThreshold} แต่ subtotal = ${subtotal.toLocaleString()}`
            : ''
          issues.push({
            reason: 'missing_trip_fee', severity: billedSev('high'),
            detail: `ขาดค่ารถครั้ง — expected ${expectedTrip.toLocaleString()} (subtotal=${subtotal.toLocaleString()}, minPerTrip=${cust.minPerTrip})${waiveHint}`,
          })
        }
      } else if (tripFee > 0) {
        // มี trip fee ทั้งที่ไม่ enable — info (อาจเป็น manual override)
        issues.push({
          reason: 'unexpected_trip_fee', severity: 'info',
          detail: `ลูกค้าไม่ได้ติ๊ก enableMinPerTrip แต่ SD มีค่ารถครั้ง ${tripFee.toLocaleString()}`,
        })
      }

      // (e.2) Month fee — เฉพาะลูกค้าที่ enableMinPerMonth
      if (cust.enableMinPerMonth) {
        if (isLastOfMonth) {
          // expected เกิดจาก recalc — ถ้า expected > 0 แต่ actual = 0 → ขาด
          // คำนวณ monthTotal ของ DNs อื่นในเดือน (excluding this DN's own contribution)
          const monthDNs = (dnsByCustMonth.get(`${dn.customerId}|${dn.date.slice(0, 7)}`) || [])
            .filter(d => d.id !== dn.id)
          const subtotal = calculateDNSubtotal(dn, cust, dn.priceSnapshot)
          const expectedMonth = calculateTransportFeeMonth(monthDNs, cust, subtotal, tripFee, dn.priceSnapshot)
          if (expectedMonth > 0 && monthFee === 0) {
            issues.push({
              reason: 'missing_month_fee', severity: billedSev('high'),
              detail: `ขาดค่ารถเดือน — expected ${expectedMonth.toLocaleString()} (ใบสุดท้ายของเดือน, monthlyFlatRate=${cust.monthlyFlatRate.toLocaleString()})`,
            })
          }
        } else if (monthFee > 0) {
          // มี month fee ใน SD ที่ไม่ใช่ใบสุดท้าย
          issues.push({
            reason: 'stale_month_fee', severity: billedSev('high'),
            detail: `ค่ารถเดือน ${monthFee.toLocaleString()} อยู่ใน SD ที่ไม่ใช่ใบสุดท้ายของเดือน — ควรอยู่ใน SD ใบสุดท้ายเท่านั้น`,
          })
        }
      } else if (monthFee > 0) {
        // มี month fee ทั้งที่ไม่ enable — info
        issues.push({
          reason: 'unexpected_month_fee', severity: 'info',
          detail: `ลูกค้าไม่ได้ติ๊ก enableMinPerMonth แต่ SD มีค่ารถเดือน ${monthFee.toLocaleString()}`,
        })
      }

      const severity = maxSeverity(issues)

      // นับ issue per reason
      for (const i of issues) byReason[i.reason]++

      allRows.push({
        id: dn.id,
        dnId: dn.id,
        dnNumber: dn.noteNumber,
        dnDate: dn.date,
        isBilled: dn.isBilled,
        customerId: dn.customerId,
        customerShortName: cust.shortName,
        customerName: cust.name,
        issues,
        severity,
      })
    }

    // Apply filters
    let filtered = allRows
    if (filters.severity && filters.severity !== 'all') {
      filtered = filtered.filter(r => r.severity === filters.severity)
    }
    if (filters.reason && filters.reason !== 'all') {
      filtered = filtered.filter(r => r.issues.some(i => i.reason === filters.reason))
    }
    // 305: apply showOk filter เฉพาะตอน severity='all' && reason='all'
    const severityNarrowed = !!filters.severity && filters.severity !== 'all'
    const reasonNarrowed = !!filters.reason && filters.reason !== 'all'
    if (!severityNarrowed && !reasonNarrowed && !filters.showOk) {
      filtered = filtered.filter(r => r.issues.length > 0)
    }
    if (filters.search && filters.search.trim()) {
      filtered = filtered.filter(r =>
        matchesThaiQueryAnyField(
          [r.dnNumber, r.customerShortName, r.customerName],
          filters.search!,
        ),
      )
    }

    const stats: SDAuditStats = {
      critical: allRows.filter(r => r.severity === 'critical').length,
      high: allRows.filter(r => r.severity === 'high').length,
      warning: allRows.filter(r => r.severity === 'warning').length,
      info: allRows.filter(r => r.severity === 'info' && r.issues.length > 0).length,
      ok: allRows.filter(r => r.issues.length === 0).length,
      total: allRows.length,
      customersAudited: customerIdsSeen.size,
      byReason,
    }

    return { rows: filtered, allRows, stats }
  }, [
    deliveryNotes, linenForms, customers,
    filters.dateFrom, filters.dateTo, filters.customerId,
    filters.severity, filters.reason, filters.showOk, filters.search,
  ])
}
