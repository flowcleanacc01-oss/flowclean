/**
 * Global Search (Feature A1)
 *
 * Unified search across: customers, LF, SD, WB, IV, QT
 * Fuzzy match on number, name, date
 */

import type {
  Customer, LinenForm, DeliveryNote,
  BillingStatement, TaxInvoice, Quotation, LinenItemDef, Receipt,
} from '@/types'
import { formatDate } from './utils'

export type SearchResultKind = 'customer' | 'lf' | 'sd' | 'wb' | 'iv' | 'rc' | 'qt' | 'item'

/** 162: Build amount tokens for haystack — supports digit-only queries */
function amountTokens(...values: number[]): string {
  return values.flatMap(v => {
    if (!Number.isFinite(v) || v === 0) return []
    return [String(Math.round(v)), v.toFixed(2), v.toFixed(2).replace(/\./g, '')]
  }).join(' ')
}

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
  receipts: Receipt[] // 162/164: ค้นหา RC
  quotations: Quotation[]
  linenCatalog: LinenItemDef[] // 147: ค้นหา item code/name
}

/**
 * Build complete search index from store (all entities)
 * Result list is bounded per type to keep response snappy
 */
export function buildSearchIndex(store: SearchStore): SearchResult[] {
  const custMap = new Map(store.customers.map(c => [c.id, c]))
  // 147: catalog lookup สำหรับ enrich haystack + item kind result
  const catalogByCode = new Map(store.linenCatalog.map(i => [i.code, i]))
  const itemsHaystack = (items: { code: string }[]): string =>
    items.map(i => {
      const def = catalogByCode.get(i.code)
      return def ? `${i.code} ${def.name} ${def.nameEn || ''}` : i.code
    }).join(' ')

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

  // LFs (147: haystack รวม item codes + names)
  for (const f of store.linenForms) {
    const c = custMap.get(f.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'lf',
      id: f.id,
      primary: f.formNumber,
      secondary: `${custLabel} · ${formatDate(f.date)}`,
      haystack: [f.formNumber, custLabel, c?.customerCode, f.date, itemsHaystack(f.rows)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/linen-forms?detail=${f.id}`,
    })
  }

  // SDs (147: haystack รวม item codes + names + displayName)
  for (const d of store.deliveryNotes) {
    const c = custMap.get(d.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    const sdItems = d.items.map(i => {
      const def = catalogByCode.get(i.code)
      return `${i.code} ${def?.name || ''} ${def?.nameEn || ''} ${i.displayName || ''}`
    }).join(' ')
    results.push({
      kind: 'sd',
      id: d.id,
      primary: d.noteNumber,
      secondary: `${custLabel} · ${formatDate(d.date)}`,
      haystack: [d.noteNumber, custLabel, c?.customerCode, d.date, sdItems].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/delivery?detail=${d.id}`,
    })
  }

  // WBs (162: amount search)
  for (const b of store.billingStatements) {
    const c = custMap.get(b.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'wb',
      id: b.id,
      primary: b.billingNumber,
      secondary: `${custLabel} · ${b.billingMonth} · ${formatDate(b.issueDate)}`,
      haystack: [b.billingNumber, custLabel, c?.customerCode, b.billingMonth, amountTokens(b.grandTotal, b.netPayable)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=billing&detail=${b.id}`,
    })
  }

  // IVs (162: amount search)
  for (const iv of store.taxInvoices) {
    const c = custMap.get(iv.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'iv',
      id: iv.id,
      primary: iv.invoiceNumber,
      secondary: `${custLabel} · ${formatDate(iv.issueDate)}`,
      haystack: [iv.invoiceNumber, custLabel, c?.customerCode, iv.issueDate, amountTokens(iv.grandTotal)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=invoice&detail=${iv.id}`,
    })
  }

  // RCs (162/164: amount search + new entity in Cmd+K)
  for (const rc of store.receipts || []) {
    const c = custMap.get(rc.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    results.push({
      kind: 'rc',
      id: rc.id,
      primary: rc.receiptNumber,
      secondary: `${custLabel} · ${formatDate(rc.issueDate)}`,
      haystack: [rc.receiptNumber, custLabel, c?.customerCode, rc.issueDate, amountTokens(rc.grandTotal)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/receipts?detail=${rc.id}`,
    })
  }

  // QTs (147: haystack รวม item codes + names + price-facing fields)
  for (const q of store.quotations) {
    const c = custMap.get(q.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    const qtItems = q.items.map(qi => {
      const def = catalogByCode.get(qi.code)
      return `${qi.code} ${def?.name || ''} ${def?.nameEn || ''}`
    }).join(' ')
    results.push({
      kind: 'qt',
      id: q.id,
      primary: q.quotationNumber,
      secondary: `${custLabel} · ${formatDate(q.date)}`,
      haystack: [q.quotationNumber, custLabel, c?.customerCode, q.date, qtItems].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=quotation&openqt=${q.id}`,
    })
  }

  // 147: Item kind — catalog items + 175: virtual items จาก QT/SD snapshots
  // (เพื่อให้เจอ legacy codes ที่อยู่ใน QT แต่ไม่มีใน catalog หลัก เช่น
  // S037, A92 ที่ import มาจาก NeoSME แต่ไม่ได้ register ใน catalog)
  type ItemAggregate = {
    code: string
    names: Set<string>          // collect all variants of name seen
    inCatalog: boolean
    customers: Set<string>
    qtCount: number
    sdCount: number
  }
  const itemAgg = new Map<string, ItemAggregate>()
  const upsert = (code: string, name: string, inCat: boolean): ItemAggregate => {
    let a = itemAgg.get(code)
    if (!a) {
      a = { code, names: new Set(), inCatalog: inCat, customers: new Set(), qtCount: 0, sdCount: 0 }
      itemAgg.set(code, a)
    } else if (inCat) a.inCatalog = true
    if (name) a.names.add(name.trim())
    return a
  }
  // Seed from catalog
  for (const item of store.linenCatalog) {
    upsert(item.code, item.name, true)
    if (item.nameEn) upsert(item.code, item.nameEn, true)
  }
  // QT items — also collect non-catalog codes + name variants
  for (const q of store.quotations) {
    const seen = new Set<string>()
    for (const qi of q.items) {
      if (!qi.code) continue
      const a = upsert(qi.code, qi.name || '', catalogByCode.has(qi.code))
      if (!seen.has(qi.code)) { a.qtCount++; seen.add(qi.code) }
      a.customers.add(q.customerId)
    }
  }
  // SD items — same treatment (DN uses displayName, name comes from catalog)
  for (const d of store.deliveryNotes) {
    const seen = new Set<string>()
    for (const di of d.items) {
      if (!di.code) continue
      const a = upsert(di.code, di.displayName || '', catalogByCode.has(di.code))
      if (!seen.has(di.code)) { a.sdCount++; seen.add(di.code) }
      a.customers.add(d.customerId)
    }
  }
  for (const a of itemAgg.values()) {
    const cat = catalogByCode.get(a.code)
    const primaryName = cat?.name || [...a.names][0] || a.code
    const variantNames = [...a.names].filter(n => n !== primaryName)
    const summary = a.customers.size > 0 || a.qtCount > 0 || a.sdCount > 0
      ? `ใช้ใน ${a.customers.size} ลูกค้า · ${a.qtCount} QT · ${a.sdCount} SD`
      : 'ยังไม่มีการใช้งาน'
    const tag = a.inCatalog ? '' : ' · ⚠ ไม่มีใน catalog'
    results.push({
      kind: 'item',
      id: a.code,
      primary: `${a.code} · ${primaryName}${tag}`,
      secondary: variantNames.length > 0
        ? `${summary} · ชื่ออื่น: ${variantNames.join(' / ')}`
        : (cat?.nameEn ? `${summary} · ${cat.nameEn}` : summary),
      // 175: haystack รวมทุก name variant + nameEn + category + unit
      haystack: [
        a.code,
        ...a.names,
        cat?.nameEn,
        cat?.category,
        cat?.unit,
      ].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/items`,
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
  rc: 'RC',
  qt: 'QT',
  item: 'รายการ',
}

export const KIND_COLOR: Record<SearchResultKind, string> = {
  customer: 'bg-slate-100 text-slate-700',
  lf: 'bg-teal-100 text-teal-700',
  sd: 'bg-blue-100 text-blue-700',
  wb: 'bg-orange-100 text-orange-700',
  iv: 'bg-purple-100 text-purple-700',
  rc: 'bg-amber-100 text-amber-700',
  qt: 'bg-emerald-100 text-emerald-700',
  item: 'bg-pink-100 text-pink-700',
}
