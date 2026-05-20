'use client'

/**
 * Phase A.3 — Carry-over Drift Detector hook
 *
 * Per-customer scan ของ stock balance + discrepancy rate ใน period
 * — Read-only — ไม่แก้ไขข้อมูล
 *
 * Checks per customer:
 *   - cumulative_imbalance: |sum carry-over| > threshold = workflow drift
 *   - discrepancy_ratio: % ของ LF ที่มี Type1/Type2 discrepancy
 *   - mode_disagreement: 4 modes ของ carry-over ต่างกันมาก (config inconsistent)
 *
 * Use case: หลัง batch ใหญ่ หรือ trust-mode migration → ตรวจดูว่า data drift ไหม
 */
import { useMemo } from 'react'
import { useStore } from './store'
import { matchesThaiQueryAnyField } from './thai-search'
import { hasType1Discrepancy, hasType2Discrepancy } from './discrepancy'
import type { CarryOverMode } from '@/types'

export type CarryDriftReason =
  | 'imbalance_high'        // |carry-over| > 500
  | 'imbalance_medium'      // |carry-over| > 200
  | 'discrepancy_high'      // discrepancy ratio > 30%
  | 'discrepancy_medium'    // discrepancy ratio > 10%
  | 'mode_disagreement'     // spread ของ 4 modes > 50

export type CarryDriftSeverity = 'critical' | 'high' | 'warning' | 'info'

export interface CarryDriftIssue {
  reason: CarryDriftReason
  severity: CarryDriftSeverity
  detail: string
}

export interface CarryDriftRow {
  id: string
  customerId: string
  customerShortName: string
  customerName: string
  workflowMode: string
  lfCount: number
  type1Count: number
  type2Count: number
  discrepancyRatio: number  // 0-1
  /** Cumulative carry-over (default mode) — sum of items across all carry-over items */
  cumulativeBalance: number
  /** Per-mode totals — for spread calc */
  modeBalances: { 1: number; 2: number; 3: number; 4: number }
  modeSpread: number  // max - min across 4 modes
  issues: CarryDriftIssue[]
  severity: CarryDriftSeverity
}

export interface CarryDriftFilters {
  dateFrom?: string
  dateTo?: string
  customerId?: string
  severity?: 'all' | CarryDriftSeverity
  reason?: 'all' | CarryDriftReason
  showOk?: boolean
  search?: string
}

export interface CarryDriftStats {
  critical: number
  high: number
  warning: number
  info: number
  ok: number
  total: number
  byReason: Record<CarryDriftReason, number>
}

export interface CarryDriftResult {
  rows: CarryDriftRow[]
  allRows: CarryDriftRow[]
  stats: CarryDriftStats
}

export const CARRY_DRIFT_REASON_CONFIG: Record<CarryDriftReason, { label: string; color: string; icon: string }> = {
  imbalance_high:     { label: 'สต๊อกค้าง > 500',    color: 'red',    icon: '⚖️' },
  imbalance_medium:   { label: 'สต๊อกค้าง > 200',    color: 'orange', icon: '📦' },
  discrepancy_high:   { label: 'นับไม่ตรง > 30%',    color: 'red',    icon: '📊' },
  discrepancy_medium: { label: 'นับไม่ตรง > 10%',    color: 'orange', icon: '📉' },
  mode_disagreement:  { label: '4 modes ต่างมาก',   color: 'amber',  icon: '🔀' },
}

export const CARRY_DRIFT_SEVERITY_RANK: Record<CarryDriftSeverity, number> = {
  critical: 0, high: 1, warning: 2, info: 3,
}

function maxSeverity(issues: CarryDriftIssue[]): CarryDriftSeverity {
  if (issues.length === 0) return 'info'
  return issues.reduce<CarryDriftSeverity>((max, i) =>
    CARRY_DRIFT_SEVERITY_RANK[i.severity] < CARRY_DRIFT_SEVERITY_RANK[max] ? i.severity : max,
    'info' as CarryDriftSeverity,
  )
}

export function useCarryDriftAudit(filters: CarryDriftFilters): CarryDriftResult {
  const { linenForms, customers, getCarryOver } = useStore()

  return useMemo(() => {
    const allRows: CarryDriftRow[] = []
    const byReason: Record<CarryDriftReason, number> = {
      imbalance_high: 0, imbalance_medium: 0,
      discrepancy_high: 0, discrepancy_medium: 0,
      mode_disagreement: 0,
    }

    const cutoffDate = filters.dateTo || new Date().toISOString().slice(0, 10)

    for (const cust of customers) {
      if (!cust.isActive) continue
      if (filters.customerId && filters.customerId !== 'all' && cust.id !== filters.customerId) continue

      // LFs in period
      const custLFs = linenForms.filter(f => {
        if (f.customerId !== cust.id) return false
        if (filters.dateFrom && f.date < filters.dateFrom) return false
        if (filters.dateTo && f.date > filters.dateTo) return false
        return true
      })

      if (custLFs.length === 0) continue

      const type1Count = custLFs.filter(hasType1Discrepancy).length
      const type2Count = custLFs.filter(hasType2Discrepancy).length
      const discRatio = (type1Count + type2Count) / Math.max(custLFs.length * 2, 1)

      // Carry-over per mode @ end of period (next day)
      const nextDay = new Date(cutoffDate); nextDay.setDate(nextDay.getDate() + 1)
      const nextDayISO = nextDay.toISOString().slice(0, 10)
      const modeBalances: { 1: number; 2: number; 3: number; 4: number } = {
        1: 0, 2: 0, 3: 0, 4: 0,
      }
      const sumMap = (m: Record<string, number>) =>
        Object.values(m).reduce((s, v) => s + Math.abs(v), 0)
      for (const mode of [1, 2, 3, 4] as CarryOverMode[]) {
        const co = getCarryOver(cust.id, nextDayISO, mode)
        modeBalances[mode] = sumMap(co)
      }
      const modeValues = Object.values(modeBalances)
      const modeSpread = Math.max(...modeValues) - Math.min(...modeValues)
      const cumulativeBalance = modeBalances[(cust.defaultCarryOverMode || 1) as 1 | 2 | 3 | 4]

      const issues: CarryDriftIssue[] = []

      // Imbalance check
      if (cumulativeBalance > 500) {
        issues.push({
          reason: 'imbalance_high', severity: 'critical',
          detail: `สต๊อกค้างรวม ${cumulativeBalance.toLocaleString()} ชิ้น (mode default) — workflow อาจไม่สมดุล`,
        })
      } else if (cumulativeBalance > 200) {
        issues.push({
          reason: 'imbalance_medium', severity: 'high',
          detail: `สต๊อกค้างรวม ${cumulativeBalance.toLocaleString()} ชิ้น`,
        })
      }

      // Discrepancy ratio
      const discPct = Math.round(discRatio * 1000) / 10
      if (discRatio > 0.3) {
        issues.push({
          reason: 'discrepancy_high', severity: 'critical',
          detail: `LF นับไม่ตรง ${type1Count + type2Count}/${custLFs.length * 2} ครั้ง (${discPct}%) — workflow มีปัญหา`,
        })
      } else if (discRatio > 0.1) {
        issues.push({
          reason: 'discrepancy_medium', severity: 'warning',
          detail: `LF นับไม่ตรง ${type1Count + type2Count}/${custLFs.length * 2} (${discPct}%)`,
        })
      }

      // Mode disagreement (spread between modes)
      if (modeSpread > 50) {
        issues.push({
          reason: 'mode_disagreement', severity: 'warning',
          detail: `4 modes ต่างกัน spread ${modeSpread.toLocaleString()} — ตรวจสอบ workflow config`,
        })
      }

      for (const i of issues) byReason[i.reason]++

      const severity = maxSeverity(issues)

      allRows.push({
        id: cust.id,
        customerId: cust.id,
        customerShortName: cust.shortName,
        customerName: cust.name,
        workflowMode: cust.workflowMode || 'cross_check',
        lfCount: custLFs.length,
        type1Count,
        type2Count,
        discrepancyRatio: discRatio,
        cumulativeBalance,
        modeBalances,
        modeSpread,
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
    const severityNarrowed = !!filters.severity && filters.severity !== 'all'
    const reasonNarrowed = !!filters.reason && filters.reason !== 'all'
    if (!severityNarrowed && !reasonNarrowed && !filters.showOk) {
      filtered = filtered.filter(r => r.issues.length > 0)
    }
    if (filters.search && filters.search.trim()) {
      filtered = filtered.filter(r =>
        matchesThaiQueryAnyField([r.customerShortName, r.customerName], filters.search!),
      )
    }

    const stats: CarryDriftStats = {
      critical: allRows.filter(r => r.severity === 'critical').length,
      high: allRows.filter(r => r.severity === 'high').length,
      warning: allRows.filter(r => r.severity === 'warning').length,
      info: allRows.filter(r => r.severity === 'info' && r.issues.length > 0).length,
      ok: allRows.filter(r => r.issues.length === 0).length,
      total: allRows.length,
      byReason,
    }

    return { rows: filtered, allRows, stats }
  }, [
    linenForms, customers, getCarryOver,
    filters.dateFrom, filters.dateTo, filters.customerId,
    filters.severity, filters.reason, filters.showOk, filters.search,
  ])
}
