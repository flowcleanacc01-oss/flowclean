'use client'

/**
 * 220 — Executive/Marketing Dashboard hook
 *
 * รวม 6 datasets สำหรับ insights ผู้บริหาร:
 *  220.1 Customer Revenue Share + Pareto + HHI
 *  220.2 Category Revenue Share
 *  220.3 MoM Waterfall (per-customer change)
 *  220.C Customer Health Score (Tier 1 #1)
 *  220.D Price Realization / Discount Leakage (Tier 1 #2)
 *  220.E Yield per Piece (Tier 1 #3)
 *
 * Source: BillingStatement (revenue) + DN (volume) + LF (discrepancy) + QT (expected price)
 */
import { useMemo } from 'react'
import { useStore } from './store'
import type { BillingStatement, Customer, DeliveryNote, LinenForm, Quotation, CustomerType, LegacyDocument } from '@/types'
import { CUSTOMER_TYPE_CONFIG } from '@/types'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface ExecutiveFilters {
  /** YYYY-MM — current period for waterfall + share */
  currentMonth: string
  /** YYYY-MM — previous period for comparison (default: previous month) */
  prevMonth: string
  /** ISO date — start for trend / health calculations (default: 6 months back) */
  trendFrom: string
  /** ISO date — end (default: today) */
  trendTo: string
  /** 221: รวม legacy WB เข้า revenue calculations (A, B, C, Health Score) */
  includeLegacy: boolean
}

export interface CustomerShareRow {
  customerId: string
  shortName: string
  name: string
  revenue: number
  share: number      // 0-100
  cumShare: number   // 0-100
}

export interface CategoryShareRow {
  category: CustomerType
  label: string
  revenue: number
  share: number
  customerCount: number
}

export interface WaterfallRow {
  customerId: string
  shortName: string
  prevRevenue: number
  currentRevenue: number
  change: number      // current - prev
  changePct: number   // (current/prev - 1) * 100, or 100 if prev=0
  type: 'new' | 'lost' | 'grew' | 'shrank' | 'stable'
}

export interface HealthScoreRow {
  customerId: string
  shortName: string
  name: string
  /** 0-100 composite */
  score: number
  status: 'healthy' | 'at_risk' | 'critical'
  signals: {
    revenueTrend: number       // -100 to +100 (% slope over period)
    volumeStability: number    // 0-100 (1 - CV)
    discrepancyRate: number    // %
    paymentSpeed: number       // avg DSO in days (or 0 if all paid on time / no data)
  }
  flags: string[]              // human-readable signals
}

export interface PriceRealizationRow {
  customerId: string
  shortName: string
  expectedRevenue: number   // sum(qty × QT price)
  actualRevenue: number     // sum(qty × DN snapshot)
  leakage: number           // expected - actual
  leakagePct: number        // leakage / expected * 100
  realizationPct: number    // actual / expected * 100
}

export interface YieldRow {
  customerId: string
  shortName: string
  pieces: number
  revenue: number
  yieldPerPiece: number   // revenue / pieces
}

export interface ExecutiveStats {
  totalRevenue: number
  totalCustomers: number
  hhi: number                  // Herfindahl-Hirschman Index (0-1)
  hhiLevel: 'low' | 'moderate' | 'high'
  paretoTopShare: number       // % revenue from top 20% customers
  newCustomers: number
  lostCustomers: number
  netChange: number
  netChangePct: number
  /** 221: legacy integration stats */
  legacyRevenueIncluded: number   // total legacy WB amount included in current month
  legacyDocsUsed: number          // # legacy docs used
  legacyDocsUnmatched: number     // # legacy docs skipped (no customerId match)
}

export interface ExecutiveData {
  stats: ExecutiveStats
  customerShare: CustomerShareRow[]
  categoryShare: CategoryShareRow[]
  waterfall: WaterfallRow[]
  topGrowers: WaterfallRow[]
  topLosers: WaterfallRow[]
  healthScores: HealthScoreRow[]
  priceRealization: PriceRealizationRow[]
  yieldRanking: YieldRow[]
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function getCategoryLabel(cat: CustomerType): string {
  return CUSTOMER_TYPE_CONFIG[cat] || cat || 'ไม่ระบุ'
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

function calculateHHI(shares: number[]): number {
  // shares as percentages (0-100), return 0-1
  return shares.reduce((sum, s) => sum + Math.pow(s / 100, 2), 0)
}

function classifyHHI(hhi: number): 'low' | 'moderate' | 'high' {
  if (hhi < 0.15) return 'low'
  if (hhi < 0.25) return 'moderate'
  return 'high'
}

function classifyHealth(score: number): 'healthy' | 'at_risk' | 'critical' {
  if (score >= 70) return 'healthy'
  if (score >= 40) return 'at_risk'
  return 'critical'
}

/** Linear regression slope as % change per month */
function trendSlopePercent(monthlyValues: number[]): number {
  if (monthlyValues.length < 2) return 0
  const n = monthlyValues.length
  const xs = monthlyValues.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = monthlyValues.reduce((a, b) => a + b, 0) / n
  if (meanY === 0) return 0
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (monthlyValues[i] - meanY)
    den += Math.pow(xs[i] - meanX, 2)
  }
  if (den === 0) return 0
  const slope = num / den
  return (slope / meanY) * 100
}

/** Coefficient of variation (CV) = std/mean — 0 = perfectly stable */
function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance) / mean
}

/** เดือนก่อนหน้าจาก YYYY-MM */
export function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Iterate months from start to end inclusive */
function monthsBetween(startYM: string, endYM: string): string[] {
  const result: string[] = []
  let [y, m] = startYM.split('-').map(Number)
  const [endY, endM] = endYM.split('-').map(Number)
  while (y < endY || (y === endY && m <= endM)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

// ────────────────────────────────────────────────────────────────
// Main hook
// ────────────────────────────────────────────────────────────────

export function useExecutiveDashboard(filters: ExecutiveFilters): ExecutiveData {
  const { billingStatements, customers, deliveryNotes, linenForms, quotations, legacyDocuments } = useStore()

  return useMemo(() => {
    return computeExecutive(filters, billingStatements, customers, deliveryNotes, linenForms, quotations, legacyDocuments)
  }, [filters, billingStatements, customers, deliveryNotes, linenForms, quotations, legacyDocuments])
}

function computeExecutive(
  filters: ExecutiveFilters,
  billingStatements: BillingStatement[],
  customers: Customer[],
  deliveryNotes: DeliveryNote[],
  linenForms: LinenForm[],
  quotations: Quotation[],
  legacyDocuments: LegacyDocument[],
): ExecutiveData {
  const custMap = new Map(customers.map(c => [c.id, c]))
  const validCustomerIds = new Set(customers.map(c => c.id))

  // ── 221: Filter legacy WB into per-customer per-month revenue
  // Unmatched (no customerId match) → counted but skipped from calculation
  let legacyDocsUsed = 0
  let legacyDocsUnmatched = 0
  // Map: customerId → billingMonth → legacy revenue
  const legacyRevByCustomerMonth = new Map<string, Map<string, number>>()
  if (filters.includeLegacy) {
    for (const d of legacyDocuments) {
      if (d.kind !== 'WB') continue
      const ym = (d.docDate || '').slice(0, 7)
      if (!ym) continue
      if (!d.customerId || !validCustomerIds.has(d.customerId)) {
        legacyDocsUnmatched++
        continue
      }
      let m = legacyRevByCustomerMonth.get(d.customerId)
      if (!m) { m = new Map(); legacyRevByCustomerMonth.set(d.customerId, m) }
      m.set(ym, (m.get(ym) || 0) + (d.amount || 0))
      legacyDocsUsed++
    }
  }
  const getLegacyRev = (cid: string, ym: string): number =>
    legacyRevByCustomerMonth.get(cid)?.get(ym) || 0
  let legacyRevenueIncluded = 0

  // ── Build accepted QT map (latest per customer)
  const qtByCustomer = new Map<string, Quotation>()
  for (const q of quotations) {
    if (q.status !== 'accepted') continue
    const ex = qtByCustomer.get(q.customerId)
    if (!ex || q.date > ex.date) qtByCustomer.set(q.customerId, q)
  }

  // ── Filter billing for current period
  const currentBills = billingStatements.filter(b => b.billingMonth === filters.currentMonth)
  const prevBills = billingStatements.filter(b => b.billingMonth === filters.prevMonth)

  // ── 220.1 Customer Revenue Share (current month + 221: legacy if enabled)
  const revByCustomer = new Map<string, number>()
  for (const b of currentBills) {
    revByCustomer.set(b.customerId, (revByCustomer.get(b.customerId) || 0) + b.subtotal)
  }
  // 221: เพิ่ม legacy WB ของเดือนเดียวกัน (matched customers only)
  if (filters.includeLegacy) {
    for (const [cid, monthMap] of legacyRevByCustomerMonth.entries()) {
      const legacy = monthMap.get(filters.currentMonth) || 0
      if (legacy > 0) {
        revByCustomer.set(cid, (revByCustomer.get(cid) || 0) + legacy)
        legacyRevenueIncluded += legacy
      }
    }
  }
  const totalRevenue = Array.from(revByCustomer.values()).reduce((a, b) => a + b, 0)

  const customerShare: CustomerShareRow[] = Array.from(revByCustomer.entries())
    .map(([cid, rev]) => {
      const c = custMap.get(cid)
      return {
        customerId: cid,
        shortName: c?.shortName || '?',
        name: c?.name || cid,
        revenue: rev,
        share: safeDiv(rev, totalRevenue) * 100,
        cumShare: 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  let cum = 0
  for (const r of customerShare) {
    cum += r.share
    r.cumShare = cum
  }

  // ── HHI
  const hhi = calculateHHI(customerShare.map(r => r.share))
  const hhiLevel = classifyHHI(hhi)

  // Pareto: top 20% customers' revenue share
  const top20Count = Math.max(1, Math.ceil(customerShare.length * 0.2))
  const paretoTopShare = customerShare.slice(0, top20Count).reduce((sum, r) => sum + r.share, 0)

  // ── 220.2 Category Revenue Share — derive from revByCustomer (already includes legacy)
  const revByCategory = new Map<CustomerType, { revenue: number; customers: Set<string> }>()
  for (const [cid, rev] of revByCustomer.entries()) {
    const c = custMap.get(cid)
    if (!c) continue
    const cat = c.customerType
    const ex = revByCategory.get(cat) || { revenue: 0, customers: new Set() }
    ex.revenue += rev
    ex.customers.add(cid)
    revByCategory.set(cat, ex)
  }
  const categoryShare: CategoryShareRow[] = Array.from(revByCategory.entries())
    .map(([cat, { revenue, customers }]) => ({
      category: cat,
      label: getCategoryLabel(cat),
      revenue,
      share: safeDiv(revenue, totalRevenue) * 100,
      customerCount: customers.size,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── 220.3 MoM Waterfall — prev period also includes legacy if enabled
  const prevRevByCustomer = new Map<string, number>()
  for (const b of prevBills) {
    prevRevByCustomer.set(b.customerId, (prevRevByCustomer.get(b.customerId) || 0) + b.subtotal)
  }
  if (filters.includeLegacy) {
    for (const [cid, monthMap] of legacyRevByCustomerMonth.entries()) {
      const legacy = monthMap.get(filters.prevMonth) || 0
      if (legacy > 0) {
        prevRevByCustomer.set(cid, (prevRevByCustomer.get(cid) || 0) + legacy)
      }
    }
  }

  // Union of all customers in either period
  const allCustomerIds = new Set<string>([
    ...revByCustomer.keys(),
    ...prevRevByCustomer.keys(),
  ])

  const waterfall: WaterfallRow[] = Array.from(allCustomerIds).map(cid => {
    const c = custMap.get(cid)
    const prev = prevRevByCustomer.get(cid) || 0
    const current = revByCustomer.get(cid) || 0
    const change = current - prev
    const changePct = prev === 0 ? (current > 0 ? 100 : 0) : (current / prev - 1) * 100
    let type: WaterfallRow['type']
    if (prev === 0 && current > 0) type = 'new'
    else if (prev > 0 && current === 0) type = 'lost'
    else if (change > 0.01) type = 'grew'
    else if (change < -0.01) type = 'shrank'
    else type = 'stable'
    return {
      customerId: cid,
      shortName: c?.shortName || '?',
      prevRevenue: prev,
      currentRevenue: current,
      change,
      changePct,
      type,
    }
  })

  const sortedByChange = [...waterfall].sort((a, b) => b.change - a.change)
  const topGrowers = sortedByChange.filter(r => r.change > 0).slice(0, 5)
  const topLosers = sortedByChange.filter(r => r.change < 0).slice(-5).reverse()

  const newCustomers = waterfall.filter(r => r.type === 'new').length
  const lostCustomers = waterfall.filter(r => r.type === 'lost').length
  const prevTotal = Array.from(prevRevByCustomer.values()).reduce((a, b) => a + b, 0)
  const netChange = totalRevenue - prevTotal
  const netChangePct = prevTotal === 0 ? 0 : (netChange / prevTotal) * 100

  // ── 220.C Customer Health Score (use trend window) — 221: include legacy
  const trendMonths = monthsBetween(filters.trendFrom.slice(0, 7), filters.trendTo.slice(0, 7))
  const billsByCustMonth = new Map<string, Map<string, number>>()
  for (const b of billingStatements) {
    if (b.billingMonth < trendMonths[0] || b.billingMonth > trendMonths[trendMonths.length - 1]) continue
    let cm = billsByCustMonth.get(b.customerId)
    if (!cm) { cm = new Map(); billsByCustMonth.set(b.customerId, cm) }
    cm.set(b.billingMonth, (cm.get(b.billingMonth) || 0) + b.subtotal)
  }
  // 221: เพิ่ม legacy WB ที่อยู่ใน trend window
  if (filters.includeLegacy) {
    for (const [cid, monthMap] of legacyRevByCustomerMonth.entries()) {
      let cm = billsByCustMonth.get(cid)
      for (const [ym, rev] of monthMap.entries()) {
        if (ym < trendMonths[0] || ym > trendMonths[trendMonths.length - 1]) continue
        if (!cm) { cm = new Map(); billsByCustMonth.set(cid, cm) }
        cm.set(ym, (cm.get(ym) || 0) + rev)
      }
    }
  }

  // Discrepancy rate per customer (LF rows that have discrepancy / total LF rows)
  const discByCustomer = new Map<string, { total: number; disc: number }>()
  for (const lf of linenForms) {
    if (lf.date < filters.trendFrom || lf.date > filters.trendTo) continue
    const ex = discByCustomer.get(lf.customerId) || { total: 0, disc: 0 }
    for (const row of lf.rows || []) {
      ex.total++
      const c5 = row.col5_factoryClaimApproved ?? 0
      const c2 = row.col2_hotelCountIn ?? 0
      const c3 = row.col3_hotelClaimCount ?? 0
      const c4 = row.col4_factoryApproved ?? 0
      const c6 = row.col6_factoryPackSend ?? 0
      // Type 1: c5 ≠ c2+c3 ; Type 2: c4 ≠ c6
      if (Math.abs(c5 - (c2 + c3)) > 0.01 || Math.abs(c4 - c6) > 0.01) ex.disc++
    }
    discByCustomer.set(lf.customerId, ex)
  }

  // DSO per customer (avg days from issueDate to paidDate)
  const dsoByCustomer = new Map<string, number[]>()
  for (const b of billingStatements) {
    if (b.billingMonth < trendMonths[0] || b.billingMonth > trendMonths[trendMonths.length - 1]) continue
    if (!b.paidDate || !b.issueDate) continue
    const issueT = new Date(b.issueDate).getTime()
    const paidT = new Date(b.paidDate).getTime()
    if (isNaN(issueT) || isNaN(paidT)) continue
    const days = (paidT - issueT) / (1000 * 60 * 60 * 24)
    if (days < 0) continue
    const arr = dsoByCustomer.get(b.customerId) || []
    arr.push(days)
    dsoByCustomer.set(b.customerId, arr)
  }

  const healthScores: HealthScoreRow[] = []
  for (const c of customers) {
    if (!c.isActive) continue
    const monthly = trendMonths.map(m => billsByCustMonth.get(c.id)?.get(m) || 0)
    const hasAny = monthly.some(v => v > 0)
    if (!hasAny) continue

    const trend = trendSlopePercent(monthly)
    const cv = coefficientOfVariation(monthly.filter(v => v > 0))
    const stability = Math.max(0, Math.min(100, (1 - cv) * 100))
    const disc = discByCustomer.get(c.id)
    const discRate = disc && disc.total > 0 ? (disc.disc / disc.total) * 100 : 0
    const dsoArr = dsoByCustomer.get(c.id) || []
    const avgDso = dsoArr.length === 0 ? 0 : dsoArr.reduce((a, b) => a + b, 0) / dsoArr.length

    // Composite score (0-100):
    //   trend 30% (clamp -50..+50 → 0..100)
    //   stability 30%
    //   discrepancy 20% (inverted: 0% disc = 100, 10% disc = 0)
    //   DSO 20% (inverted: <30 days = 100, >90 days = 0)
    const trendScore = Math.max(0, Math.min(100, ((trend + 50) / 100) * 100))
    const discScore = Math.max(0, Math.min(100, 100 - (discRate / 10) * 100))
    const dsoScore = avgDso === 0
      ? 80 // no data — neutral
      : Math.max(0, Math.min(100, 100 - ((avgDso - 30) / 60) * 100))

    const score = Math.round(trendScore * 0.3 + stability * 0.3 + discScore * 0.2 + dsoScore * 0.2)

    const flags: string[] = []
    if (trend < -10) flags.push(`รายได้ลด ${Math.abs(trend).toFixed(1)}%/เดือน`)
    if (cv > 0.5) flags.push(`รายได้ผันผวนสูง (CV ${cv.toFixed(2)})`)
    if (discRate > 5) flags.push(`มีการนับไม่ตรง ${discRate.toFixed(1)}%`)
    if (avgDso > 45) flags.push(`เก็บเงินช้า ${Math.round(avgDso)} วัน`)
    if (flags.length === 0 && trend > 5) flags.push(`เติบโต +${trend.toFixed(1)}%/เดือน`)

    healthScores.push({
      customerId: c.id,
      shortName: c.shortName,
      name: c.name,
      score,
      status: classifyHealth(score),
      signals: { revenueTrend: trend, volumeStability: stability, discrepancyRate: discRate, paymentSpeed: avgDso },
      flags,
    })
  }
  healthScores.sort((a, b) => a.score - b.score)

  // ── 220.D Price Realization (current period)
  // For each DN in current month → expected = sum(qty × QT price) ; actual = sum(qty × snapshot)
  const realByCustomer = new Map<string, { expected: number; actual: number }>()
  const currentDNIds = new Set(currentBills.flatMap(b => b.deliveryNoteIds))
  for (const dn of deliveryNotes) {
    if (!currentDNIds.has(dn.id)) continue
    const cust = custMap.get(dn.customerId)
    if (!cust) continue
    if (cust.billingModel === 'monthly_flat' || cust.enableMinPerMonth) continue
    const qt = qtByCustomer.get(dn.customerId)
    if (!qt) continue
    const qtMap = new Map(qt.items.map(it => [it.code, it.pricePerUnit]))
    let expected = 0, actual = 0
    for (const item of dn.items) {
      const qty = item.quantity || 0
      if (item.isClaim) continue
      const expPrice = qtMap.get(item.code) ?? 0
      const actPrice = dn.priceSnapshot?.[item.code] ?? expPrice
      expected += qty * expPrice
      actual += qty * actPrice
    }
    const ex = realByCustomer.get(dn.customerId) || { expected: 0, actual: 0 }
    ex.expected += expected
    ex.actual += actual
    realByCustomer.set(dn.customerId, ex)
  }

  const priceRealization: PriceRealizationRow[] = Array.from(realByCustomer.entries())
    .map(([cid, { expected, actual }]) => {
      const c = custMap.get(cid)
      const leakage = expected - actual
      return {
        customerId: cid,
        shortName: c?.shortName || '?',
        expectedRevenue: expected,
        actualRevenue: actual,
        leakage,
        leakagePct: safeDiv(leakage, expected) * 100,
        realizationPct: safeDiv(actual, expected) * 100,
      }
    })
    .filter(r => r.expectedRevenue > 0)
    .sort((a, b) => b.leakage - a.leakage)

  // ── 220.E Yield per Piece (current period — DN-based)
  const yieldByCustomer = new Map<string, { pieces: number; revenue: number }>()
  for (const dn of deliveryNotes) {
    if (!currentDNIds.has(dn.id)) continue
    const cust = custMap.get(dn.customerId)
    if (!cust) continue
    if (cust.billingModel === 'monthly_flat' || cust.enableMinPerMonth) continue
    let pieces = 0
    for (const item of dn.items) {
      if (item.isClaim) continue
      pieces += item.quantity || 0
    }
    const ex = yieldByCustomer.get(dn.customerId) || { pieces: 0, revenue: 0 }
    ex.pieces += pieces
    yieldByCustomer.set(dn.customerId, ex)
  }
  // Map revenue from current bills
  for (const b of currentBills) {
    const ex = yieldByCustomer.get(b.customerId)
    if (ex) ex.revenue += b.subtotal
  }

  const yieldRanking: YieldRow[] = Array.from(yieldByCustomer.entries())
    .filter(([, v]) => v.pieces > 0 && v.revenue > 0)
    .map(([cid, { pieces, revenue }]) => {
      const c = custMap.get(cid)
      return {
        customerId: cid,
        shortName: c?.shortName || '?',
        pieces,
        revenue,
        yieldPerPiece: revenue / pieces,
      }
    })
    .sort((a, b) => b.yieldPerPiece - a.yieldPerPiece)

  const stats: ExecutiveStats = {
    totalRevenue,
    totalCustomers: revByCustomer.size,
    hhi,
    hhiLevel,
    paretoTopShare,
    newCustomers,
    lostCustomers,
    netChange,
    netChangePct,
    legacyRevenueIncluded,
    legacyDocsUsed,
    legacyDocsUnmatched,
  }

  return {
    stats,
    customerShare,
    categoryShare,
    waterfall,
    topGrowers,
    topLosers,
    healthScores,
    priceRealization,
    yieldRanking,
  }
}
