/**
 * Global Search (Feature A1)
 *
 * Unified search across: customers, LF, SD, WB, IV, QT
 * Fuzzy match on number, name, date
 */

import type {
  Customer, LinenForm, DeliveryNote,
  BillingStatement, TaxInvoice, Quotation,
} from '@/types'
import { formatDate } from './utils'

export type SearchResultKind = 'customer' | 'lf' | 'sd' | 'wb' | 'iv' | 'qt'

export interface SearchResult {
  kind: SearchResultKind
  id: string
  /** ที่แสดงเป็นชื่อหลัก (เช่น เลขที่เอกสาร) */
  primary: string
  /** ข้อความรอง (ชื่อลูกค้า + วันที่) */
  secondary: string
  /** ข้อความที่ใช้ filter */
  haystack: string
  href: string
}

export interface SearchStore {
  customers: Customer[]
  linenForms: LinenForm[]
  deliveryNotes: DeliveryNote[]
  billingStatements: BillingStatement[]
  taxInvoices: TaxInvoice[]
  quotations: Quotation[]
}

/**
 * Build complete search index from store (all entities)
 * Result list is bounded per type to keep response snappy
 */
export function buildSearchIndex(store: SearchStore): SearchResult[] {
  const custMap = new Map(store.customers.map(c => [c.id, c]))
  const results: SearchResult[] = []

  // Customers
  for (const c of store.customers) {
    if (!c.isActive) continue
    results.push({
      kind: 'customer',
      id: c.id,
      primary: c.shortName || c.name,
      secondary: `${c.customerCode}${c.name && c.shortName ? ' · ' + c.name : ''}`,
      haystack: [c.customerCode, c.shortName, c.name, c.nameEn, c.taxId].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/customers?detail=${c.id}`,
    })
  }

  // LFs
  for (const f of store.linenForms) {
    const c = custMap.get(f.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'lf',
      id: f.id,
      primary: f.formNumber,
      secondary: `${custLabel} · ${formatDate(f.date)}`,
      haystack: [f.formNumber, custLabel, c?.customerCode, f.date].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/linen-forms?detail=${f.id}`,
    })
  }

  // SDs
  for (const d of store.deliveryNotes) {
    const c = custMap.get(d.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'sd',
      id: d.id,
      primary: d.noteNumber,
      secondary: `${custLabel} · ${formatDate(d.date)}`,
      haystack: [d.noteNumber, custLabel, c?.customerCode, d.date].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/delivery?detail=${d.id}`,
    })
  }

  // WBs
  for (const b of store.billingStatements) {
    const c = custMap.get(b.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'wb',
      id: b.id,
      primary: b.billingNumber,
      secondary: `${custLabel} · ${b.billingMonth}`,
      haystack: [b.billingNumber, custLabel, c?.customerCode, b.billingMonth].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=billing&detail=${b.id}`,
    })
  }

  // IVs
  for (const iv of store.taxInvoices) {
    const c = custMap.get(iv.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'iv',
      id: iv.id,
      primary: iv.invoiceNumber,
      secondary: `${custLabel} · ${formatDate(iv.issueDate)}`,
      haystack: [iv.invoiceNumber, custLabel, c?.customerCode, iv.issueDate].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=invoice&detail=${iv.id}`,
    })
  }

  // QTs
  for (const q of store.quotations) {
    const c = custMap.get(q.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'qt',
      id: q.id,
      primary: q.quotationNumber,
      secondary: `${custLabel} · ${formatDate(q.date)}`,
      haystack: [q.quotationNumber, custLabel, c?.customerCode, q.date].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=quotation&openqt=${q.id}`,
    })
  }

  return results
}

/**
 * Filter by query (all tokens must match, case-insensitive, substring)
 * Sort by relevance: primary match > secondary match > haystack
 */
export function searchResults(index: SearchResult[], query: string, limit = 30): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  type Scored = { r: SearchResult; score: number }
  const scored: Scored[] = []

  for (const r of index) {
    let allMatch = true
    let score = 0
    const primaryLow = r.primary.toLowerCase()
    for (const t of tokens) {
      if (r.haystack.includes(t)) {
        if (primaryLow.includes(t)) score += 10
        else if (r.secondary.toLowerCase().includes(t)) score += 5
        else score += 1
        if (primaryLow.startsWith(t)) score += 5
      } else {
        allMatch = false
        break
      }
    }
    if (allMatch) scored.push({ r, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => s.r)
}

export const KIND_LABEL: Record<SearchResultKind, string> = {
  customer: 'ลูกค้า',
  lf: 'LF',
  sd: 'SD',
  wb: 'WB',
  iv: 'IV',
  qt: 'QT',
}

export const KIND_COLOR: Record<SearchResultKind, string> = {
  customer: 'bg-slate-100 text-slate-700',
  lf: 'bg-teal-100 text-teal-700',
  sd: 'bg-blue-100 text-blue-700',
  wb: 'bg-orange-100 text-orange-700',
  iv: 'bg-purple-100 text-purple-700',
  qt: 'bg-emerald-100 text-emerald-700',
}
