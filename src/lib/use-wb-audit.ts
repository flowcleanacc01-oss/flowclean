'use client'

/**
 * Phase A.2 — WB ↔ SD Reconciliation Audit hook
 *
 * ตรวจ data integrity ของใบวางบิล (WB) เทียบกับ SD ที่ผูกอยู่
 * — Read-only — ไม่แก้ไขข้อมูล
 *
 * Checks per WB:
 *   - orphan_sd: deliveryNoteIds ชี้ SD ที่ไม่มีในระบบ
 *   - sd_not_billed: SD ที่ผูกอยู่ดัน isBilled=false (data drift)
 *   - customer_mismatch: SD.customerId ≠ WB.customerId
 *   - subtotal_drift: WB.subtotal ≠ sum(lineItems.amount)
 *   - vat_drift: WB.vat ≠ 7% × subtotal (เมื่อ enableVat)
 *   - wht_drift: WB.withholdingTax ≠ 3% × subtotal (เมื่อ enableWithholding)
 *   - total_drift: grandTotal ≠ subtotal + vat
 *   - vat_config_mismatch: WB.vat>0 แต่ customer.enableVat=false (หรือกลับกัน)
 *
 * Cross-WB check:
 *   - sd_duplicate_link: SD ผูกกับ ≥2 WB (โดน double-billing!)
 */
import { useMemo } from 'react'
import { useStore } from './store'
import { matchesThaiQueryAnyField } from './thai-search'

export type WBAuditReason =
  | 'orphan_sd'
  | 'sd_not_billed'
  | 'customer_mismatch'
  | 'sd_duplicate_link'
  | 'subtotal_drift'
  | 'vat_drift'
  | 'wht_drift'
  | 'total_drift'
  | 'vat_config_mismatch'

export type WBAuditSeverity = 'critical' | 'high' | 'warning' | 'info'

export interface WBAuditIssue {
  reason: WBAuditReason
  severity: WBAuditSeverity
  detail: string
}

export interface WBAuditRow {
  id: string
  wbId: string
  wbNumber: string
  issueDate: string
  billingMonth: string
  status: string
  customerId: string
  customerShortName: string
  customerName: string
  issues: WBAuditIssue[]
  severity: WBAuditSeverity
}

export interface WBAuditFilters {
  dateFrom?: string
  dateTo?: string
  customerId?: string
  severity?: 'all' | WBAuditSeverity
  reason?: 'all' | WBAuditReason
  showOk?: boolean
  search?: string
}

export interface WBAuditStats {
  critical: number
  high: number
  warning: number
  info: number
  ok: number
  total: number
  customersAudited: number
  byReason: Record<WBAuditReason, number>
}

export interface WBAuditResult {
  rows: WBAuditRow[]
  allRows: WBAuditRow[]
  stats: WBAuditStats
}

export const WB_AUDIT_REASON_CONFIG: Record<WBAuditReason, { label: string; color: string; icon: string }> = {
  orphan_sd:           { label: 'SD ไม่มีในระบบ',         color: 'red',    icon: '👻' },
  sd_not_billed:       { label: 'SD ดัน isBilled=false',  color: 'orange', icon: '🏷️' },
  customer_mismatch:   { label: 'ลูกค้าไม่ตรง SD',         color: 'red',    icon: '🔀' },
  sd_duplicate_link:   { label: 'SD ผูก ≥2 WB',           color: 'red',    icon: '⛓️' },
  subtotal_drift:      { label: 'subtotal ไม่ตรง',          color: 'red',    icon: '💰' },
  vat_drift:           { label: 'VAT ไม่ตรง 7%',          color: 'orange', icon: '🧾' },
  wht_drift:           { label: 'หัก ณ ที่จ่ายไม่ตรง 3%',     color: 'orange', icon: '✂️' },
  total_drift:         { label: 'grandTotal ไม่ตรง',       color: 'orange', icon: '📊' },
  vat_config_mismatch: { label: 'VAT config ไม่ตรงลูกค้า',  color: 'amber',  icon: '⚙️' },
}

export const WB_AUDIT_SEVERITY_RANK: Record<WBAuditSeverity, number> = {
  critical: 0, high: 1, warning: 2, info: 3,
}

function maxSeverity(issues: WBAuditIssue[]): WBAuditSeverity {
  if (issues.length === 0) return 'info'
  return issues.reduce<WBAuditSeverity>((max, i) =>
    WB_AUDIT_SEVERITY_RANK[i.severity] < WB_AUDIT_SEVERITY_RANK[max] ? i.severity : max,
    'info' as WBAuditSeverity,
  )
}

/** เปรียบเทียบเงิน — tolerance 0.01 (1 satang) */
function approxEq(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) < tolerance
}

export function useWBAudit(filters: WBAuditFilters): WBAuditResult {
  const { billingStatements, deliveryNotes, customers } = useStore()

  return useMemo(() => {
    const dnById = new Map<string, typeof deliveryNotes[number]>()
    for (const d of deliveryNotes) dnById.set(d.id, d)

    // Cross-WB: นับ SD ที่ผูกใน WBs > 1 ครั้ง
    const sdWbCount = new Map<string, string[]>() // sdId → [wbId, ...]
    for (const wb of billingStatements) {
      for (const dnId of wb.deliveryNoteIds || []) {
        if (!sdWbCount.has(dnId)) sdWbCount.set(dnId, [])
        sdWbCount.get(dnId)!.push(wb.id)
      }
    }

    const allRows: WBAuditRow[] = []
    const customerIdsSeen = new Set<string>()
    const byReason: Record<WBAuditReason, number> = {
      orphan_sd: 0, sd_not_billed: 0, customer_mismatch: 0, sd_duplicate_link: 0,
      subtotal_drift: 0, vat_drift: 0, wht_drift: 0, total_drift: 0, vat_config_mismatch: 0,
    }

    for (const wb of billingStatements) {
      // Date filter — ใช้ issueDate
      if (filters.dateFrom && wb.issueDate < filters.dateFrom) continue
      if (filters.dateTo && wb.issueDate > filters.dateTo) continue
      if (filters.customerId && filters.customerId !== 'all' && wb.customerId !== filters.customerId) continue

      const cust = customers.find(c => c.id === wb.customerId)
      if (!cust) continue
      customerIdsSeen.add(wb.customerId)

      const issues: WBAuditIssue[] = []

      // (1) SD link checks
      const missingSDs: string[] = []
      const notBilledSDs: { id: string; num: string }[] = []
      const wrongCustomerSDs: { id: string; num: string }[] = []
      const duplicateSDs: { id: string; num: string; wbCount: number }[] = []

      for (const dnId of wb.deliveryNoteIds || []) {
        const sd = dnById.get(dnId)
        if (!sd) {
          missingSDs.push(dnId)
          continue
        }
        if (!sd.isBilled) {
          notBilledSDs.push({ id: dnId, num: sd.noteNumber })
        }
        if (sd.customerId !== wb.customerId) {
          wrongCustomerSDs.push({ id: dnId, num: sd.noteNumber })
        }
        const linkedCount = sdWbCount.get(dnId)?.length ?? 0
        if (linkedCount > 1) {
          duplicateSDs.push({ id: dnId, num: sd.noteNumber, wbCount: linkedCount })
        }
      }

      if (missingSDs.length > 0) {
        issues.push({
          reason: 'orphan_sd', severity: 'critical',
          detail: `SD ${missingSDs.length} ใบ ไม่มีในระบบ`,
        })
      }
      if (notBilledSDs.length > 0) {
        issues.push({
          reason: 'sd_not_billed', severity: 'high',
          detail: `SD ${notBilledSDs.length} ใบ isBilled=false (${notBilledSDs.slice(0, 2).map(s => s.num).join(', ')}${notBilledSDs.length > 2 ? '...' : ''})`,
        })
      }
      if (wrongCustomerSDs.length > 0) {
        issues.push({
          reason: 'customer_mismatch', severity: 'critical',
          detail: `SD ${wrongCustomerSDs.length} ใบ customerId ไม่ตรง WB (${wrongCustomerSDs.slice(0, 2).map(s => s.num).join(', ')})`,
        })
      }
      if (duplicateSDs.length > 0) {
        issues.push({
          reason: 'sd_duplicate_link', severity: 'critical',
          detail: `SD ${duplicateSDs.length} ใบ ผูกกับ WB หลายใบ (double-billing risk: ${duplicateSDs.slice(0, 2).map(s => `${s.num}×${s.wbCount}`).join(', ')})`,
        })
      }

      // (2) Total drifts
      const recalcSubtotal = (wb.lineItems || []).reduce((s, i) => s + i.amount, 0)
      const recalcVat = Math.round(recalcSubtotal * 0.07 * 100) / 100
      const recalcGrandTotal = Math.round((recalcSubtotal + recalcVat) * 100) / 100
      const recalcWht = Math.round(recalcSubtotal * 0.03 * 100) / 100

      if (!approxEq(wb.subtotal, recalcSubtotal)) {
        issues.push({
          reason: 'subtotal_drift', severity: 'critical',
          detail: `subtotal: WB=${wb.subtotal.toFixed(2)} vs sum(lineItems)=${recalcSubtotal.toFixed(2)} (diff ${(wb.subtotal - recalcSubtotal).toFixed(2)})`,
        })
      }

      const wbHasVat = (wb.vat || 0) > 0
      if (cust.enableVat && wbHasVat) {
        if (!approxEq(wb.vat, recalcVat)) {
          issues.push({
            reason: 'vat_drift', severity: 'high',
            detail: `VAT: WB=${wb.vat.toFixed(2)} vs 7%×subtotal=${recalcVat.toFixed(2)}`,
          })
        }
      } else if (cust.enableVat && !wbHasVat) {
        issues.push({
          reason: 'vat_config_mismatch', severity: 'high',
          detail: 'ลูกค้า enableVat=true แต่ WB.vat=0',
        })
      } else if (!cust.enableVat && wbHasVat) {
        issues.push({
          reason: 'vat_config_mismatch', severity: 'high',
          detail: 'ลูกค้า enableVat=false แต่ WB.vat>0',
        })
      }

      if (cust.enableWithholding) {
        if (!approxEq(wb.withholdingTax || 0, recalcWht)) {
          issues.push({
            reason: 'wht_drift', severity: 'high',
            detail: `WHT: WB=${(wb.withholdingTax || 0).toFixed(2)} vs 3%×subtotal=${recalcWht.toFixed(2)}`,
          })
        }
      }

      // grandTotal sanity (subtotal + vat)
      if (!approxEq(wb.grandTotal, recalcGrandTotal)) {
        issues.push({
          reason: 'total_drift', severity: 'high',
          detail: `grandTotal: WB=${wb.grandTotal.toFixed(2)} vs subtotal+VAT=${recalcGrandTotal.toFixed(2)}`,
        })
      }

      for (const i of issues) byReason[i.reason]++
      const severity = maxSeverity(issues)

      allRows.push({
        id: wb.id,
        wbId: wb.id,
        wbNumber: wb.billingNumber,
        issueDate: wb.issueDate,
        billingMonth: wb.billingMonth,
        status: wb.status,
        customerId: wb.customerId,
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
    if (!filters.showOk) {
      filtered = filtered.filter(r => r.issues.length > 0)
    }
    if (filters.search && filters.search.trim()) {
      filtered = filtered.filter(r =>
        matchesThaiQueryAnyField(
          [r.wbNumber, r.customerShortName, r.customerName],
          filters.search!,
        ),
      )
    }

    const stats: WBAuditStats = {
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
    billingStatements, deliveryNotes, customers,
    filters.dateFrom, filters.dateTo, filters.customerId,
    filters.severity, filters.reason, filters.showOk, filters.search,
  ])
}
