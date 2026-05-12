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
import { matchesThaiQuery, phoneticThai, containsThai } from './thai-search'

export type SearchResultKind = 'customer' | 'lf' | 'sd' | 'wb' | 'iv' | 'rc' | 'qt' | 'item'

/**
 * 252: Kinds that aggregate multiple items in their haystack.
 * Layer 4 split disabled for these to prevent cross-item false positives.
 */
const MULTI_ITEM_KINDS: ReadonlySet<SearchResultKind> = new Set(['lf', 'sd', 'qt', 'wb', 'iv', 'rc'])

/**
 * 162: Build amount tokens for haystack — supports digit-only queries
 *
 * 251: removed no-dot variant — `5.00`.replace('.','') = `500` caused false
 * positives (search "500" matched items priced 5.00 baht).
 * Kept: rounded integer + 2-decimal form.
 */
function amountTokens(...values: number[]): string {
  return values.flatMap(v => {
    if (!Number.isFinite(v) || v === 0) return []
    return [String(Math.round(v)), v.toFixed(2)]
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
  /** 249.1: precomputed phonetic of haystack — avoids per-search recomputation */
  haystackPhonetic: string
  /** 250: precomputed lowercase versions for relevance scoring */
  primaryLow: string
  secondaryLow: string
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
  // 249.1 + 250: helper to push with precomputed phonetic + lowercase fields
  const push = (r: Omit<SearchResult, 'haystackPhonetic' | 'primaryLow' | 'secondaryLow'>) => {
    results.push({
      ...r,
      haystackPhonetic: phoneticThai(r.haystack),
      primaryLow: r.primary.toLowerCase(),
      secondaryLow: r.secondary.toLowerCase(),
    })
  }

  // Customers
  for (const c of store.customers) {
    if (!c.isActive) continue
    push({
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
    push({
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
    push({
      kind: 'sd',
      id: d.id,
      primary: d.noteNumber,
      secondary: `${custLabel} · ${formatDate(d.date)}`,
      haystack: [d.noteNumber, custLabel, c?.customerCode, d.date, sdItems].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/delivery?detail=${d.id}`,
    })
  }

  // WBs (162: amount search · 214: รหัส + ชื่อรายการ + per-line amount)
  for (const b of store.billingStatements) {
    const c = custMap.get(b.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    const lineHaystack = b.lineItems.map(li => `${li.code} ${li.name}`).join(' ')
    const lineAmounts = b.lineItems.map(li => li.pricePerUnit || 0)
    push({
      kind: 'wb',
      id: b.id,
      primary: b.billingNumber,
      secondary: `${custLabel} · ${b.billingMonth} · ${formatDate(b.issueDate)}`,
      haystack: [b.billingNumber, custLabel, c?.customerCode, b.billingMonth, lineHaystack, amountTokens(b.grandTotal, b.netPayable, ...lineAmounts)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=billing&detail=${b.id}`,
    })
  }

  // IVs (162: amount search · 214: รหัส + ชื่อรายการ + per-line amount)
  for (const iv of store.taxInvoices) {
    const c = custMap.get(iv.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    const lineHaystack = iv.lineItems.map(li => `${li.code} ${li.name}`).join(' ')
    const lineAmounts = iv.lineItems.map(li => li.pricePerUnit || 0)
    push({
      kind: 'iv',
      id: iv.id,
      primary: iv.invoiceNumber,
      secondary: `${custLabel} · ${formatDate(iv.issueDate)}`,
      haystack: [iv.invoiceNumber, custLabel, c?.customerCode, iv.issueDate, lineHaystack, amountTokens(iv.grandTotal, ...lineAmounts)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/billing?tab=invoice&detail=${iv.id}`,
    })
  }

  // RCs (162/164: amount search + new entity in Cmd+K)
  for (const rc of store.receipts || []) {
    const c = custMap.get(rc.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    push({
      kind: 'rc',
      id: rc.id,
      primary: rc.receiptNumber,
      secondary: `${custLabel} · ${formatDate(rc.issueDate)}`,
      haystack: [rc.receiptNumber, custLabel, c?.customerCode, rc.issueDate, amountTokens(rc.grandTotal)].filter(Boolean).join(' ').toLowerCase(),
      href: `/dashboard/receipts?detail=${rc.id}`,
    })
  }

  // QTs (147: haystack รวม item codes + names · 214.1: per-item amount)
  for (const q of store.quotations) {
    const c = custMap.get(q.customerId)
    const custLabel = c?.shortName || c?.name || '-'
    const qtItems = q.items.map(qi => {
      const def = catalogByCode.get(qi.code)
      return `${qi.code} ${qi.name || ''} ${def?.name || ''} ${def?.nameEn || ''}`
    }).join(' ')
    const qtAmounts = q.items.map(qi => qi.pricePerUnit || 0)
    push({
      kind: 'qt',
      id: q.id,
      primary: q.quotationNumber,
      secondary: `${custLabel} · ${formatDate(q.date)}`,
      haystack: [q.quotationNumber, custLabel, c?.customerCode, q.date, qtItems, amountTokens(...qtAmounts)].filter(Boolean).join(' ').toLowerCase(),
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
    lfCount: number  // 238: รวม LF rows ที่ reference code นี้
  }
  const itemAgg = new Map<string, ItemAggregate>()
  const upsert = (code: string, name: string, inCat: boolean): ItemAggregate => {
    let a = itemAgg.get(code)
    if (!a) {
      a = { code, names: new Set(), inCatalog: inCat, customers: new Set(), qtCount: 0, sdCount: 0, lfCount: 0 }
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
  // 238: LF rows — orphan codes ที่อยู่ใน LF (carry-over) จะหาเจอใน Cmd+K
  for (const f of store.linenForms) {
    const seenLf = new Set<string>()
    for (const r of f.rows || []) {
      if (!r.code) continue
      const a = upsert(r.code, '', catalogByCode.has(r.code))
      if (!seenLf.has(r.code)) { a.lfCount++; seenLf.add(r.code) }
      a.customers.add(f.customerId)
    }
  }
  // 238: Customer fields — code ที่ user enable/มี price แต่ไม่อยู่ใน QT/DN/LF
  for (const c of store.customers) {
    const seen = new Set<string>()
    const collect = (code: string) => {
      if (!code || seen.has(code)) return
      seen.add(code)
      const a = upsert(code, '', catalogByCode.has(code))
      a.customers.add(c.id)
    }
    for (const code of c.enabledItems || []) collect(code)
    for (const p of c.priceList || []) collect(p.code)
    for (const p of c.priceHistory || []) collect((p as { code?: string }).code || '')
  }
  for (const a of itemAgg.values()) {
    const cat = catalogByCode.get(a.code)
    const primaryName = cat?.name || [...a.names][0] || a.code
    const variantNames = [...a.names].filter(n => n !== primaryName)
    const hasUsage = a.customers.size > 0 || a.qtCount > 0 || a.sdCount > 0 || a.lfCount > 0
    const summary = hasUsage
      ? `ใช้ใน ${a.customers.size} ลูกค้า · ${a.qtCount} QT · ${a.sdCount} SD · ${a.lfCount} LF`
      : 'ยังไม่มีการใช้งาน'
    const tag = a.inCatalog ? '' : ' · ⚠ ไม่มีใน catalog'
    push({
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
      // 238: orphan code → เปิด Hygiene Center พร้อม prefill MergeCodesTool
      // 258: in-catalog → focusCode → catalog page scrolls to row + activates
      href: a.inCatalog
        ? `/dashboard/items?tab=items&focusCode=${encodeURIComponent(a.code)}`
        : `/dashboard/items?tab=merge&mergeSource=${encodeURIComponent(a.code)}`,
    })
  }

  return results
}

/**
 * Filter by query (all tokens must match) — 245: Thai-aware tolerant filter
 * Sort by relevance: primary match > secondary match > haystack
 *
 * Match layers (per token):
 *   - Plain substring (exact match — gets boosted score)
 *   - Phonetic substring + Lev ≤ 1 + split-and-match (via matchesThaiQuery)
 */
export function searchResults(index: SearchResult[], query: string, limit = 30): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  // 251 + 250.2: precompute per-token matchers
  //   - isDigit + digitRe: word-boundary for number search (prevents 500↔5000/5.00)
  //   - trigrams: 3-char substrings of token for fast prefilter (skip Layer 2-4
  //     for entries that don't contain ANY trigram — 5-10x speedup)
  type TokenMatcher = {
    raw: string
    isDigit: boolean
    digitRe?: RegExp
    trigrams: string[]            // raw trigrams of token
    trigramsPhonetic: string[]    // phonetic trigrams (for prefilter on haystackPhonetic)
    hasThai: boolean
  }
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const buildTrigrams = (s: string): string[] => {
    const out: string[] = []
    for (let i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3))
    return out
  }
  const matchers: TokenMatcher[] = tokens.map(t => {
    const isDigit = /^\d+(?:\.\d+)?$/.test(t)
    const hasThai = containsThai(t)
    const tp = hasThai ? phoneticThai(t) : ''
    return {
      raw: t,
      isDigit,
      digitRe: isDigit ? new RegExp(`\\b${escapeRe(t)}\\b`) : undefined,
      trigrams: t.length >= 3 ? buildTrigrams(t) : [],
      trigramsPhonetic: tp.length >= 3 ? buildTrigrams(tp) : [],
      hasThai,
    }
  })

  type Scored = { r: SearchResult; score: number }
  const scored: Scored[] = []

  for (const r of index) {
    let allMatch = true
    let score = 0
    const isMultiItem = MULTI_ITEM_KINDS.has(r.kind)
    for (const tm of matchers) {
      if (tm.isDigit && tm.digitRe) {
        // 251: digit-only query — exact word boundary (prevents 500↔5000/5.00)
        if (tm.digitRe.test(r.haystack)) {
          if (tm.digitRe.test(r.primaryLow)) score += 10
          else if (tm.digitRe.test(r.secondaryLow)) score += 5
          else score += 1
        } else {
          allMatch = false
          break
        }
      } else {
        const t = tm.raw
        // Fast path: plain substring → boost relevance
        if (r.haystack.includes(t)) {
          if (r.primaryLow.includes(t)) score += 10
          else if (r.secondaryLow.includes(t)) score += 5
          else score += 1
          if (r.primaryLow.startsWith(t)) score += 5
        } else {
          // 250.2: trigram prefilter — skip Layer 2-4 if entry has NO 3-char
          // substring of token (raw or phonetic). Eliminates ~95% of unrelated
          // entries before running expensive matchesThaiQuery.
          // For short tokens (< 6 chars) skip prefilter — keep permissive matching.
          if (t.length >= 6) {
            let hasTrigram = false
            for (const g of tm.trigrams) {
              if (r.haystack.includes(g)) { hasTrigram = true; break }
            }
            if (!hasTrigram && tm.trigramsPhonetic.length > 0) {
              for (const g of tm.trigramsPhonetic) {
                if (r.haystackPhonetic.includes(g)) { hasTrigram = true; break }
              }
            }
            if (!hasTrigram) { allMatch = false; break }
          }
          // 252: noSplit for multi-item kinds (LF/SD/QT/WB/IV/RC) to prevent
          // cross-item false positives (e.g., "ปลอกเล็กชมพู" matching LF where
          // 3 slices appear in 3 different items)
          const opts = isMultiItem ? { noSplit: true } : undefined
          if (matchesThaiQuery(r.haystack, t, r.haystackPhonetic, opts)) {
            // Slow path: Thai tolerant (phonetic / Lev / [split])
            if (matchesThaiQuery(r.primary, t)) score += 6
            else if (matchesThaiQuery(r.secondary, t)) score += 3
            else score += 1
          } else {
            allMatch = false
            break
          }
        }
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
