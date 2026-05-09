'use client'

/**
 * 217.1 — SD Price Audit hook
 *
 * ตรวจราคาในใบส่งของ (priceSnapshot) vs ราคาในใบเสนอราคา (accepted QT)
 * — Read-only monitoring tool — ไม่แก้ไขข้อมูล
 * — Flat-rate customers excluded by default (ไม่มีราคาต่อชิ้นให้เทียบ)
 * — Date range filter (สำคัญ — ติ๊ดต้องการ scope ช่วงเวลาที่ monitor)
 */
import { useMemo } from 'react'
import { useStore } from './store'
import { isFlatRateCustomer } from './customer-pricing'

export type PriceAuditReason =
  | 'ok'
  | 'price_mismatch'
  | 'missing_snapshot'
  | 'zero_price'
  | 'orphan_item'   // item ใน DN ไม่มีใน accepted QT (ad-hoc)
  | 'no_qt'         // customer ไม่มี accepted QT เลย

export type PriceAuditSeverity = 'critical' | 'high' | 'warning' | 'info'

export interface PriceAuditRow {
  id: string
  dnId: string
  dnNumber: string
  dnDate: string
  isBilled: boolean
  customerId: string
  customerShortName: string
  customerName: string
  qtId: string | null
  qtNumber: string | null
  itemCode: string
  itemName: string
  snapshotPrice: number | null
  qtPrice: number | null
  diff: number | null
  diffPercent: number | null
  reason: PriceAuditReason
  severity: PriceAuditSeverity
}

export interface PriceAuditFilters {
  dateFrom?: string
  dateTo?: string
  customerId?: string
  severity?: 'all' | 'critical' | 'high' | 'warning'
  reason?: 'all' | PriceAuditReason
  showOk?: boolean
  showFlatRate?: boolean
  search?: string
}

export interface PriceAuditStats {
  critical: number
  high: number
  warning: number
  ok: number
  total: number
  flatRateExcluded: number
  /** 235: ลูกค้าที่ flat-rate + DN count ในช่วง — ใช้ debug ว่าเลขมาจากใคร */
  flatRateCustomers: { id: string; shortName: string; name: string; dnCount: number }[]
  customersAudited: number
  dnsAudited: number
}

export interface PriceAuditResult {
  rows: PriceAuditRow[]   // filtered (apply severity/showOk/search)
  allRows: PriceAuditRow[] // unfiltered (for stats)
  stats: PriceAuditStats
}

export const REASON_CONFIG: Record<PriceAuditReason, { label: string; color: string; icon: string }> = {
  ok:                { label: 'ราคาตรง',           color: 'emerald', icon: '✅' },
  price_mismatch:    { label: 'ราคาไม่ตรง QT',      color: 'red',     icon: '⚠️' },
  missing_snapshot:  { label: 'ไม่มี snapshot',     color: 'orange',  icon: '❓' },
  zero_price:        { label: 'ราคา 0 แต่ QT > 0', color: 'orange',  icon: '0️⃣' },
  orphan_item:       { label: 'ไม่อยู่ใน QT (ad-hoc)', color: 'amber', icon: '👻' },
  no_qt:             { label: 'ลูกค้าไม่มี QT',     color: 'red',     icon: '🚫' },
}

export const SEVERITY_CONFIG: Record<PriceAuditSeverity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'red' },
  high:     { label: 'High',     color: 'orange' },
  warning:  { label: 'Warning',  color: 'amber' },
  info:     { label: 'OK',       color: 'emerald' },
}

function classifyRow(
  snapshot: number | null | undefined,
  qtPrice: number | null | undefined,
  hasQt: boolean,
  hasItemInQt: boolean,
  isBilled: boolean,
): { reason: PriceAuditReason; severity: PriceAuditSeverity } {
  if (!hasQt) return { reason: 'no_qt', severity: isBilled ? 'critical' : 'high' }
  if (!hasItemInQt) return { reason: 'orphan_item', severity: isBilled ? 'critical' : 'high' }
  if (snapshot === undefined || snapshot === null) {
    return { reason: 'missing_snapshot', severity: isBilled ? 'critical' : 'high' }
  }
  if (snapshot === 0 && (qtPrice ?? 0) > 0) {
    return { reason: 'zero_price', severity: isBilled ? 'critical' : 'high' }
  }
  if (qtPrice == null) return { reason: 'orphan_item', severity: isBilled ? 'critical' : 'high' }
  if (Math.abs(snapshot - qtPrice) < 0.01) return { reason: 'ok', severity: 'info' }
  return { reason: 'price_mismatch', severity: isBilled ? 'critical' : 'high' }
}

export function usePriceAudit(filters: PriceAuditFilters): PriceAuditResult {
  const { deliveryNotes, customers, quotations, linenCatalog } = useStore()

  return useMemo(() => {
    const allRows: PriceAuditRow[] = []
    let flatRateExcluded = 0
    const flatRateCustMap = new Map<string, { id: string; shortName: string; name: string; dnCount: number }>()
    const customerIdsSeen = new Set<string>()
    const dnIdsSeen = new Set<string>()

    // Build accepted QT map per customer (latest accepted)
    const qtByCustomer = new Map<string, typeof quotations[number]>()
    for (const q of quotations) {
      if (q.status !== 'accepted') continue
      const existing = qtByCustomer.get(q.customerId)
      if (!existing) {
        qtByCustomer.set(q.customerId, q)
      } else if (q.date > existing.date) {
        qtByCustomer.set(q.customerId, q)
      }
    }

    for (const dn of deliveryNotes) {
      if (filters.dateFrom && dn.date < filters.dateFrom) continue
      if (filters.dateTo && dn.date > filters.dateTo) continue
      if (filters.customerId && filters.customerId !== 'all' && dn.customerId !== filters.customerId) continue

      const cust = customers.find(c => c.id === dn.customerId)
      if (!cust) continue

      // 237: ใช้ helper เดียวกันทั้งระบบ — true flat-rate = !enablePerPiece && enableMinPerMonth
      // (per-piece + min/month floor ไม่นับ — ยังมีราคา/ชิ้นต้อง audit)
      if (isFlatRateCustomer(cust) && !filters.showFlatRate) {
        flatRateExcluded++
        // 235: track customer info เพื่อ debug
        const ex = flatRateCustMap.get(cust.id)
        if (ex) ex.dnCount++
        else flatRateCustMap.set(cust.id, { id: cust.id, shortName: cust.shortName, name: cust.name, dnCount: 1 })
        continue
      }

      const qt = qtByCustomer.get(dn.customerId) || null
      const qtItemMap = new Map<string, number>()
      if (qt) {
        for (const it of qt.items) qtItemMap.set(it.code, it.pricePerUnit)
      }

      customerIdsSeen.add(dn.customerId)
      dnIdsSeen.add(dn.id)

      for (const item of dn.items) {
        const snapshot = dn.priceSnapshot?.[item.code] ?? null
        const hasItemInQt = qtItemMap.has(item.code)
        const qtPrice = hasItemInQt ? (qtItemMap.get(item.code) ?? null) : null
        const { reason, severity } = classifyRow(snapshot, qtPrice, !!qt, hasItemInQt, dn.isBilled)

        const diff = (snapshot != null && qtPrice != null) ? snapshot - qtPrice : null
        const diffPercent = (diff != null && qtPrice && qtPrice !== 0)
          ? (diff / qtPrice) * 100
          : null

        const catItem = linenCatalog.find(c => c.code === item.code)
        const itemName = catItem?.name || item.code

        allRows.push({
          id: `${dn.id}-${item.code}`,
          dnId: dn.id,
          dnNumber: dn.noteNumber,
          dnDate: dn.date,
          isBilled: dn.isBilled,
          customerId: dn.customerId,
          customerShortName: cust.shortName,
          customerName: cust.name,
          qtId: qt?.id ?? null,
          qtNumber: qt?.quotationNumber ?? null,
          itemCode: item.code,
          itemName,
          snapshotPrice: snapshot,
          qtPrice,
          diff,
          diffPercent,
          reason,
          severity,
        })
      }
    }

    // Filter
    let filtered = allRows
    if (filters.severity && filters.severity !== 'all') {
      filtered = filtered.filter(r => r.severity === filters.severity)
    }
    if (filters.reason && filters.reason !== 'all') {
      filtered = filtered.filter(r => r.reason === filters.reason)
    }
    if (!filters.showOk) {
      filtered = filtered.filter(r => r.reason !== 'ok')
    }
    if (filters.search && filters.search.trim()) {
      const s = filters.search.toLowerCase().trim()
      filtered = filtered.filter(r =>
        r.dnNumber.toLowerCase().includes(s) ||
        r.customerShortName.toLowerCase().includes(s) ||
        r.customerName.toLowerCase().includes(s) ||
        r.itemCode.toLowerCase().includes(s) ||
        r.itemName.toLowerCase().includes(s) ||
        (r.qtNumber && r.qtNumber.toLowerCase().includes(s)),
      )
    }

    const stats: PriceAuditStats = {
      critical: allRows.filter(r => r.severity === 'critical').length,
      high: allRows.filter(r => r.severity === 'high').length,
      warning: allRows.filter(r => r.severity === 'warning').length,
      ok: allRows.filter(r => r.reason === 'ok').length,
      total: allRows.length,
      flatRateExcluded,
      flatRateCustomers: Array.from(flatRateCustMap.values()).sort((a, b) => b.dnCount - a.dnCount),
      customersAudited: customerIdsSeen.size,
      dnsAudited: dnIdsSeen.size,
    }

    return { rows: filtered, allRows, stats }
  }, [
    deliveryNotes, customers, quotations, linenCatalog,
    filters.dateFrom, filters.dateTo, filters.customerId,
    filters.severity, filters.reason, filters.showOk,
    filters.showFlatRate, filters.search,
  ])
}
