'use client'

/**
 * 222 — Executive Dashboard Tier 2-3
 * 6 datasets:
 *  - Item Mix Profitability      (current data only — needs item-level)
 *  - Seasonality Decomposition   (current + legacy WB — multi-year)
 *  - Customer Cohort Retention   (current + legacy WB — see real first-seen)
 *  - Churn Risk Predictor        (current + legacy WB)
 *  - Capacity Utilization        (current LF only)
 *  - Win-Loss QT Analysis        (current QT + legacy QT count)
 */
import { useMemo } from 'react'
import { useStore } from './store'
import type {
  BillingStatement, Customer, DeliveryNote, LinenForm, Quotation,
  LegacyDocument, LinenItemDef,
} from '@/types'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface Tier23Filters {
  /** YYYY-MM-DD */
  dateFrom: string
  dateTo: string
  /** YYYY-MM — anchor for current/today calculations */
  anchorMonth: string
  includeLegacy: boolean
}

export interface ItemMixRow {
  code: string
  name: string
  qty: number
  revenue: number
  qtyShare: number       // 0-100
  revenueShare: number
  yieldPerPiece: number
  customerCount: number
}

export interface SeasonalityPoint {
  ym: string
  actual: number
  trend: number          // 12-month centered moving average
  seasonal: number       // actual - trend
  isLegacy: boolean
}

export interface SeasonalityIndex {
  monthOfYear: number    // 1-12
  index: number          // ratio to overall mean (1.0 = average, 1.2 = 20% above)
  count: number          // # observations
}

export interface SeasonalityData {
  series: SeasonalityPoint[]
  monthIndex: SeasonalityIndex[]
  totalMonths: number
  legacyMonths: number
}

export interface CohortCell {
  cohortMonth: string    // YYYY-MM (when customer first seen)
  monthIndex: number     // 0 = first month, 1 = month+1, ...
  retainedCount: number
  retentionPct: number
}

export interface CohortData {
  cohorts: { cohortMonth: string; size: number; cells: CohortCell[] }[]
  maxMonthIndex: number
}

export interface ChurnRiskRow {
  customerId: string
  shortName: string
  name: string
  lastActiveMonth: string | null
  silentMonths: number
  avgMonthlyRevenue: number
  totalLifetimeRevenue: number
  riskScore: number       // 0-100
  status: 'active' | 'warning' | 'at_risk' | 'churned'
}

export interface CapacityDailyRow {
  date: string            // YYYY-MM-DD
  countIn: number         // sum col5
  packOut: number         // sum col6
  utilization: number     // % of max
}

export interface CapacityHeatmapCell {
  weekOfYear: string      // YYYY-WW
  dayOfWeek: number       // 0=Sun, 6=Sat
  pieces: number
}

export interface CapacityData {
  daily: CapacityDailyRow[]
  heatmap: CapacityHeatmapCell[]
  maxDaily: number
  avgDaily: number
  totalDays: number
  workingDays: number
}

export interface WinLossPoint {
  period: string          // YYYY-MM or YYYY-Qx
  draft: number
  sent: number
  accepted: number
  rejected: number
  winRate: number         // accepted / (accepted + rejected) * 100
}

export interface WinLossData {
  byMonth: WinLossPoint[]
  totals: { draft: number; sent: number; accepted: number; rejected: number; winRate: number }
  legacyCount: number
}

export interface Tier23Data {
  itemMix: ItemMixRow[]
  seasonality: SeasonalityData
  cohorts: CohortData
  churnRisk: ChurnRiskRow[]
  capacity: CapacityData
  winLoss: WinLossData
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/**
 * Extract YYYY-MM from date string · 246: guard Excel epoch quirk
 *
 * NeoSME .xls import legacy ที่มี cell ว่าง → Excel serial 0 → date "1899-12-30"
 * (Lotus 1-2-3 leap year bug compatibility). Slice(0,7) = "1899-12" ทำให้กราฟ
 * seasonality มีแท่งโผล่ที่ปี 1899. Guard ตัดทุก year < 2010 (ก่อนติ๊ดเริ่ม
 * ธุรกิจ) หรือ > 2100 (garbage future date).
 */
function ymFromDate(d: string): string {
  const ym = (d || '').slice(0, 7)
  if (ym.length < 7) return ''
  const year = parseInt(ym.slice(0, 4), 10)
  if (!Number.isFinite(year) || year < 2010 || year > 2100) return ''
  return ym
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

function monthsDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return 0
  return (ty - fy) * 12 + (tm - fm)
}

function monthRange(from: string, to: string): string[] {
  const result: string[] = []
  let cur = from
  while (cur <= to) {
    result.push(cur)
    cur = nextMonth(cur)
    if (result.length > 240) break // safety: 20 years
  }
  return result
}

/**
 * Combined customer revenue map: customerId → month → revenue
 * — Sum bills + legacy WB (assumes import periods don't overlap)
 */
function buildCombinedMonthlyRevenue(
  bills: BillingStatement[],
  legacyDocs: LegacyDocument[],
  includeLegacy: boolean,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()
  for (const b of bills) {
    if (!b.customerId) continue
    if (!ymFromDate(b.billingMonth)) continue // 246: guard Excel 1899-12 quirk
    let m = result.get(b.customerId)
    if (!m) { m = new Map(); result.set(b.customerId, m) }
    m.set(b.billingMonth, (m.get(b.billingMonth) || 0) + b.subtotal)
  }
  if (includeLegacy) {
    for (const d of legacyDocs) {
      if (d.kind !== 'WB' || !d.customerId) continue
      const ym = ymFromDate(d.docDate)
      if (!ym) continue
      let m = result.get(d.customerId)
      if (!m) { m = new Map(); result.set(d.customerId, m) }
      m.set(ym, (m.get(ym) || 0) + (d.amount || 0))
    }
  }
  return result
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useExecutiveTier23(filters: Tier23Filters): Tier23Data {
  const { billingStatements, customers, deliveryNotes, linenForms, quotations, legacyDocuments, linenCatalog } = useStore()

  return useMemo(() => {
    return {
      itemMix: computeItemMix(filters, deliveryNotes, linenCatalog),
      seasonality: computeSeasonality(filters, billingStatements, legacyDocuments),
      cohorts: computeCohorts(filters, billingStatements, legacyDocuments),
      churnRisk: computeChurnRisk(filters, billingStatements, legacyDocuments, customers),
      capacity: computeCapacity(filters, linenForms),
      winLoss: computeWinLoss(filters, quotations, legacyDocuments),
    }
  }, [filters, billingStatements, customers, deliveryNotes, linenForms, quotations, legacyDocuments, linenCatalog])
}

// ────────────────────────────────────────────────────────────────
// Item Mix Profitability
// ────────────────────────────────────────────────────────────────

function computeItemMix(filters: Tier23Filters, deliveryNotes: DeliveryNote[], linenCatalog: LinenItemDef[]): ItemMixRow[] {
  // Feat 266: claim = discount (subtract revenue) — qty/customers ยังนับเฉพาะ billable
  const itemMap = new Map<string, { qty: number; revenue: number; customers: Set<string> }>()
  for (const dn of deliveryNotes) {
    if (dn.date < filters.dateFrom || dn.date > filters.dateTo) continue
    for (const item of dn.items || []) {
      const ex = itemMap.get(item.code) || { qty: 0, revenue: 0, customers: new Set() }
      const price = dn.priceSnapshot?.[item.code] ?? 0
      const amt = (item.quantity || 0) * price
      if (item.isClaim) {
        ex.revenue -= amt
      } else {
        ex.qty += item.quantity || 0
        ex.revenue += amt
        ex.customers.add(dn.customerId)
      }
      itemMap.set(item.code, ex)
    }
  }

  const totalQty = Array.from(itemMap.values()).reduce((s, v) => s + v.qty, 0)
  const totalRev = Array.from(itemMap.values()).reduce((s, v) => s + v.revenue, 0)

  return Array.from(itemMap.entries())
    .map(([code, v]) => {
      const cat = linenCatalog.find(c => c.code === code)
      return {
        code,
        name: cat?.name || code,
        qty: v.qty,
        revenue: v.revenue,
        qtyShare: safeDiv(v.qty, totalQty) * 100,
        revenueShare: safeDiv(v.revenue, totalRev) * 100,
        yieldPerPiece: safeDiv(v.revenue, v.qty),
        customerCount: v.customers.size,
      }
    })
    .filter(r => r.qty > 0)
    .sort((a, b) => b.revenue - a.revenue)
}

// ────────────────────────────────────────────────────────────────
// Seasonality Decomposition (multi-year)
// ────────────────────────────────────────────────────────────────

function computeSeasonality(filters: Tier23Filters, bills: BillingStatement[], legacyDocs: LegacyDocument[]): SeasonalityData {
  // Aggregate revenue per month (all customers)
  const monthRev = new Map<string, { revenue: number; isLegacy: boolean }>()
  for (const b of bills) {
    if (!ymFromDate(b.billingMonth)) continue // 246: guard Excel 1899-12 quirk
    const ex = monthRev.get(b.billingMonth) || { revenue: 0, isLegacy: false }
    ex.revenue += b.subtotal
    monthRev.set(b.billingMonth, ex)
  }
  if (filters.includeLegacy) {
    for (const d of legacyDocs) {
      if (d.kind !== 'WB') continue
      const ym = ymFromDate(d.docDate)
      if (!ym) continue
      const ex = monthRev.get(ym)
      if (ex) {
        ex.revenue += d.amount || 0
      } else {
        monthRev.set(ym, { revenue: d.amount || 0, isLegacy: true })
      }
    }
  }

  if (monthRev.size === 0) {
    return { series: [], monthIndex: [], totalMonths: 0, legacyMonths: 0 }
  }

  const sortedMonths = Array.from(monthRev.keys()).sort()
  // 12-month centered moving average for trend
  const series: SeasonalityPoint[] = sortedMonths.map((ym, i) => {
    const actual = monthRev.get(ym)!.revenue
    const isLegacy = monthRev.get(ym)!.isLegacy
    // Trend: ±6 months
    const lo = Math.max(0, i - 6)
    const hi = Math.min(sortedMonths.length - 1, i + 6)
    let sum = 0, n = 0
    for (let j = lo; j <= hi; j++) { sum += monthRev.get(sortedMonths[j])!.revenue; n++ }
    const trend = n === 0 ? actual : sum / n
    return {
      ym,
      actual,
      trend,
      seasonal: actual - trend,
      isLegacy,
    }
  })

  // Per-month-of-year index
  const overallMean = series.reduce((s, p) => s + p.actual, 0) / series.length
  const moyAccum = new Map<number, { sum: number; count: number }>()
  for (const p of series) {
    const moy = parseInt(p.ym.split('-')[1], 10)
    const ex = moyAccum.get(moy) || { sum: 0, count: 0 }
    ex.sum += p.actual
    ex.count += 1
    moyAccum.set(moy, ex)
  }
  const monthIndex: SeasonalityIndex[] = []
  for (let m = 1; m <= 12; m++) {
    const ex = moyAccum.get(m)
    if (!ex) {
      monthIndex.push({ monthOfYear: m, index: 1, count: 0 })
    } else {
      const avg = ex.sum / ex.count
      monthIndex.push({ monthOfYear: m, index: safeDiv(avg, overallMean), count: ex.count })
    }
  }

  const legacyMonths = series.filter(p => p.isLegacy).length

  return { series, monthIndex, totalMonths: series.length, legacyMonths }
}

// ────────────────────────────────────────────────────────────────
// Customer Cohort Retention
// ────────────────────────────────────────────────────────────────

function computeCohorts(filters: Tier23Filters, bills: BillingStatement[], legacyDocs: LegacyDocument[]): CohortData {
  const monthlyRev = buildCombinedMonthlyRevenue(bills, legacyDocs, filters.includeLegacy)

  // For each customer: firstSeen month + active months set
  const firstSeen = new Map<string, string>()
  const activeByCustomer = new Map<string, Set<string>>()
  for (const [cid, monthMap] of monthlyRev.entries()) {
    let earliest: string | null = null
    const active = new Set<string>()
    for (const [m, rev] of monthMap.entries()) {
      if (rev <= 0) continue
      active.add(m)
      if (earliest === null || m < earliest) earliest = m
    }
    if (earliest) {
      firstSeen.set(cid, earliest)
      activeByCustomer.set(cid, active)
    }
  }

  // Group customers by cohort month
  const cohortGroups = new Map<string, string[]>()
  for (const [cid, m] of firstSeen.entries()) {
    if (m < filters.dateFrom.slice(0, 7) || m > filters.dateTo.slice(0, 7)) continue
    const list = cohortGroups.get(m) || []
    list.push(cid)
    cohortGroups.set(m, list)
  }

  // For each cohort, compute retention per month-since-cohort
  const anchorYM = filters.dateTo.slice(0, 7)
  const cohorts: CohortData['cohorts'] = []
  let maxIdx = 0
  const sortedCohortMonths = Array.from(cohortGroups.keys()).sort()
  for (const cohortMonth of sortedCohortMonths) {
    const members = cohortGroups.get(cohortMonth)!
    const size = members.length
    const months = monthRange(cohortMonth, anchorYM)
    const cells: CohortCell[] = months.map((m, idx) => {
      const retained = members.filter(cid => activeByCustomer.get(cid)?.has(m)).length
      return {
        cohortMonth,
        monthIndex: idx,
        retainedCount: retained,
        retentionPct: size === 0 ? 0 : (retained / size) * 100,
      }
    })
    if (cells.length - 1 > maxIdx) maxIdx = cells.length - 1
    cohorts.push({ cohortMonth, size, cells })
  }

  return { cohorts, maxMonthIndex: maxIdx }
}

// ────────────────────────────────────────────────────────────────
// Churn Risk Predictor
// ────────────────────────────────────────────────────────────────

function computeChurnRisk(filters: Tier23Filters, bills: BillingStatement[], legacyDocs: LegacyDocument[], customers: Customer[]): ChurnRiskRow[] {
  const monthlyRev = buildCombinedMonthlyRevenue(bills, legacyDocs, filters.includeLegacy)
  const anchor = filters.anchorMonth
  const custMap = new Map(customers.map(c => [c.id, c]))
  const result: ChurnRiskRow[] = []

  for (const [cid, monthMap] of monthlyRev.entries()) {
    const c = custMap.get(cid)
    if (!c || !c.isActive) continue

    let lastActive: string | null = null
    let totalRev = 0
    let activeMonthCount = 0
    for (const [m, rev] of monthMap.entries()) {
      if (rev <= 0) continue
      if (lastActive === null || m > lastActive) lastActive = m
      totalRev += rev
      activeMonthCount += 1
    }

    if (!lastActive) continue
    const silent = monthsDiff(lastActive, anchor)
    const avgMonthly = activeMonthCount === 0 ? 0 : totalRev / activeMonthCount

    let status: ChurnRiskRow['status']
    if (silent <= 0) status = 'active'
    else if (silent === 1) status = 'warning'
    else if (silent <= 3) status = 'at_risk'
    else status = 'churned'

    // Risk score: silent months × historical importance (avg monthly revenue → log scale)
    const importance = Math.min(100, Math.log10(Math.max(1, avgMonthly / 1000)) * 30)
    const silentFactor = Math.min(100, silent * 25)
    const riskScore = Math.round((silentFactor * 0.7) + (importance * 0.3))

    result.push({
      customerId: cid,
      shortName: c.shortName,
      name: c.name,
      lastActiveMonth: lastActive,
      silentMonths: silent,
      avgMonthlyRevenue: avgMonthly,
      totalLifetimeRevenue: totalRev,
      riskScore,
      status,
    })
  }

  return result.sort((a, b) => b.riskScore - a.riskScore)
}

// ────────────────────────────────────────────────────────────────
// Capacity Utilization
// ────────────────────────────────────────────────────────────────

function computeCapacity(filters: Tier23Filters, linenForms: LinenForm[]): CapacityData {
  const dailyMap = new Map<string, { countIn: number; packOut: number }>()
  for (const lf of linenForms) {
    if (lf.date < filters.dateFrom || lf.date > filters.dateTo) continue
    const ex = dailyMap.get(lf.date) || { countIn: 0, packOut: 0 }
    for (const row of lf.rows || []) {
      ex.countIn += row.col5_factoryClaimApproved || 0
      ex.packOut += row.col6_factoryPackSend || 0
    }
    dailyMap.set(lf.date, ex)
  }

  const dailyArr = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v, utilization: 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const maxDaily = Math.max(0, ...dailyArr.map(d => d.countIn))
  for (const d of dailyArr) {
    d.utilization = maxDaily === 0 ? 0 : (d.countIn / maxDaily) * 100
  }

  const avgDaily = dailyArr.length === 0 ? 0 : dailyArr.reduce((s, d) => s + d.countIn, 0) / dailyArr.length
  const workingDays = dailyArr.filter(d => d.countIn > 0).length

  // Heatmap: week × day-of-week
  const heatmap: CapacityHeatmapCell[] = dailyArr.map(d => {
    const date = new Date(d.date)
    const yr = date.getFullYear()
    // ISO week number (simplified)
    const start = new Date(yr, 0, 1)
    const diff = (date.getTime() - start.getTime()) / 86400000
    const week = Math.floor((diff + start.getDay()) / 7) + 1
    return {
      weekOfYear: `${yr}-${String(week).padStart(2, '0')}`,
      dayOfWeek: date.getDay(),
      pieces: d.countIn,
    }
  })

  return { daily: dailyArr, heatmap, maxDaily, avgDaily, totalDays: dailyArr.length, workingDays }
}

// ────────────────────────────────────────────────────────────────
// Win-Loss QT Analysis
// ────────────────────────────────────────────────────────────────

function computeWinLoss(filters: Tier23Filters, quotations: Quotation[], legacyDocs: LegacyDocument[]): WinLossData {
  const monthMap = new Map<string, { draft: number; sent: number; accepted: number; rejected: number }>()
  let totalDraft = 0, totalSent = 0, totalAccepted = 0, totalRejected = 0

  for (const q of quotations) {
    if (q.date < filters.dateFrom || q.date > filters.dateTo) continue
    const ym = ymFromDate(q.date)
    const ex = monthMap.get(ym) || { draft: 0, sent: 0, accepted: 0, rejected: 0 }
    if (q.status === 'draft') { ex.draft++; totalDraft++ }
    else if (q.status === 'sent') { ex.sent++; totalSent++ }
    else if (q.status === 'accepted') { ex.accepted++; totalAccepted++ }
    else if (q.status === 'rejected') { ex.rejected++; totalRejected++ }
    monthMap.set(ym, ex)
  }

  // Legacy QT count (no status mapping — just count)
  let legacyCount = 0
  if (filters.includeLegacy) {
    for (const d of legacyDocs) {
      if (d.kind !== 'QT') continue
      if (d.docDate < filters.dateFrom || d.docDate > filters.dateTo) continue
      legacyCount++
    }
  }

  const byMonth: WinLossPoint[] = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, v]) => {
      const denom = v.accepted + v.rejected
      return {
        period,
        ...v,
        winRate: denom === 0 ? 0 : (v.accepted / denom) * 100,
      }
    })

  const overallDenom = totalAccepted + totalRejected
  const totals = {
    draft: totalDraft,
    sent: totalSent,
    accepted: totalAccepted,
    rejected: totalRejected,
    winRate: overallDenom === 0 ? 0 : (totalAccepted / overallDenom) * 100,
  }

  return { byMonth, totals, legacyCount }
}
