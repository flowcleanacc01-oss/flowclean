#!/usr/bin/env node
/**
 * 184 / 184.1 — Phase 2.2 finalize
 * Input: ติ๊ด เติม suggested_brand + Missing WB list ใน CSV
 *
 * Tasks:
 *   1. Re-attribute 170 unpaired WB → SWD/WOV/VLB/VLR/VLR2 ตาม suggested_brand
 *   2. Validate Missing WB list — เช็คว่าอยู่ใน DB จริงไหม (legacy + ใหม่)
 *
 * Idempotent: รันซ้ำได้ เช็คก่อนเขียน
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const CSV_PATH = '/Users/jobaiproject/Downloads/group-a-unpaired-wb-suggest and missing.csv'

// suggested_brand numeric → shortName
const NUM_TO_SHORT = {
  '21': 'SWD', '23': 'WOV', '27': 'VLB', '53': 'VLR', '100': 'VLR2',
}

// ── 1. Parse CSV ────────────────────────────────────────────────
const raw = readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, '')
const lines = raw.split(/\r?\n/).filter(Boolean)
const header = lines.shift()
console.log(`📄 Header: ${header.slice(0, 80)}...`)

const rows = []
const missingRaw = []
for (const ln of lines) {
  const cols = ln.split(',')
  const docNumber = cols[0]?.trim()
  const suggested = cols[4]?.trim()
  const missingCell = cols[8]?.trim()
  if (docNumber && suggested) rows.push({ docNumber, suggested })
  if (missingCell) missingRaw.push(missingCell)
}
console.log(`\n📊 Rows: ${rows.length} | Missing entries (raw): ${missingRaw.length}`)

// ── 2. Get customers + legacy WBs once ─────────────────────────
const { data: customers } = await sb
  .from('customers').select('id, short_name, customer_code')
  .in('short_name', ['SWD', 'WOV', 'VLB', 'VLR', 'VLR2'])
const shortToId = new Map(customers.map(c => [c.short_name, c.id]))
const idToShort = new Map(customers.map(c => [c.id, c.short_name]))

// Paginate — Supabase default limit is 1000 per query
const legacyAll = []
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb
    .from('legacy_documents')
    .select('id, kind, doc_number, customer_id, customer_code, doc_date, amount')
    .range(from, from + PAGE - 1)
  if (error) { console.error('legacy fetch error:', error); process.exit(1) }
  if (!data || data.length === 0) break
  legacyAll.push(...data)
  if (data.length < PAGE) break
}
console.log(`📦 Loaded ${legacyAll.length} legacy docs from DB`)
const legacyByNumber = new Map()
for (const r of legacyAll) {
  if (!legacyByNumber.has(r.doc_number)) legacyByNumber.set(r.doc_number, [])
  legacyByNumber.get(r.doc_number).push(r)
}

// ── 3. Re-attribute 170 unpaired WB ─────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  184 — Re-attribute 170 unpaired WB                  ║')
console.log('╚══════════════════════════════════════════════════════╝')

let moved = 0, unchanged = 0, notFound = 0, badSug = 0
const moveByBrand = new Map()
for (const { docNumber, suggested } of rows) {
  const short = NUM_TO_SHORT[suggested]
  if (!short) { console.warn(`   ⚠ ${docNumber}: invalid suggested "${suggested}"`); badSug++; continue }
  const targetId = shortToId.get(short)
  if (!targetId) { console.warn(`   ❌ ${docNumber}: no customer ${short}`); continue }

  const matches = legacyByNumber.get(docNumber) || []
  const wb = matches.find(m => m.kind === 'WB')
  if (!wb) { console.warn(`   ⚠ ${docNumber}: not in legacy DB`); notFound++; continue }

  const xCode = customers.find(c => c.short_name === short)?.customer_code || ''
  const update = { customer_id: targetId }
  if ((wb.customer_code || '').toUpperCase() !== xCode.toUpperCase() && xCode) {
    update.customer_code = xCode
  }
  if (wb.customer_id === targetId && (wb.customer_code || '').toUpperCase() === xCode.toUpperCase()) {
    unchanged++; continue
  }
  const { error } = await sb.from('legacy_documents').update(update).eq('id', wb.id)
  if (error) { console.error(`   ❌ ${docNumber}: ${error.message}`); continue }
  moved++
  moveByBrand.set(short, (moveByBrand.get(short) || 0) + 1)
}

console.log(`\n   ✅ Moved:     ${moved}`)
console.log(`   ⏭  Unchanged: ${unchanged}`)
console.log(`   ⚠  Not in DB: ${notFound}`)
console.log(`   ⚠  Bad suggested: ${badSug}`)
console.log(`\n   Per brand:`)
for (const short of ['SWD', 'WOV', 'VLB', 'VLR', 'VLR2']) {
  console.log(`     +${String(moveByBrand.get(short) || 0).padStart(3)} → ${short}`)
}

// ── 4. Validate Missing WB list ─────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  184.1 — Validate Missing WB list                    ║')
console.log('╚══════════════════════════════════════════════════════╝')

// Expand ranges: WB661000014-17 → WB661000014, ...015, ...016, ...017
const expandRange = (entry) => {
  // form: WB{prefix}{first}-{last}
  const m = entry.match(/^(WB[\d]+?)(\d{2,3})-(\d+)$/)
  if (!m) return [entry]
  const [, prefix, firstStr, lastStr] = m
  const padLen = firstStr.length
  const first = parseInt(firstStr, 10)
  const last = parseInt(lastStr, 10)
  // last อาจเป็น last 2 digits (เช่น 14-17 → 14..17 ตาม pad)
  // หรือ full (14-2 = แปลก)
  if (last < first) {
    // assume last is suffix of same length as first
    return [`${prefix}${firstStr}`]  // bad input, just keep first
  }
  const out = []
  for (let n = first; n <= last; n++) {
    out.push(`${prefix}${String(n).padStart(padLen, '0')}`)
  }
  return out
}

// Check both legacy_documents AND billing_statements (เผื่ออยู่ในระบบใหม่)
const { data: wbNew } = await sb
  .from('billing_statements').select('billing_number')
const newWbSet = new Set((wbNew || []).map(b => b.billing_number))

const expanded = []
for (const m of missingRaw) {
  const parts = expandRange(m)
  console.log(`   "${m}" → expand: ${parts.join(', ')}`)
  expanded.push(...parts.map(p => ({ raw: m, expanded: p })))
}

console.log(`\n   Total expanded: ${expanded.length}`)
console.log('\n   Validation:')
console.log('   ' + 'doc_number'.padEnd(18) + 'in legacy?    in new system?    verdict')
console.log('   ' + '-'.repeat(75))
const missingResult = []
for (const { raw, expanded: doc } of expanded) {
  const legacyMatch = legacyByNumber.get(doc) || []
  const inLegacy = legacyMatch.length > 0
  const inNew = newWbSet.has(doc)
  let verdict
  if (inLegacy && inNew) verdict = '⚠ DUPLICATE in both'
  else if (inLegacy) {
    const wb = legacyMatch.find(x => x.kind === 'WB')
    const cust = wb ? idToShort.get(wb.customer_id) || '?' : '?'
    verdict = `📦 in legacy → ${cust}`
  }
  else if (inNew) verdict = '🆕 in new system'
  else verdict = '❌ NOT FOUND (truly missing)'
  console.log('   ' + doc.padEnd(18) + (inLegacy ? '✅'.padEnd(13) : '—'.padEnd(14)) + (inNew ? '✅'.padEnd(17) : '—'.padEnd(18)) + verdict)
  missingResult.push({ raw, expanded: doc, inLegacy, inNew, verdict })
}

// Summary by verdict
const byVerdict = new Map()
for (const r of missingResult) byVerdict.set(r.verdict.split(' →')[0].split(' (')[0], (byVerdict.get(r.verdict.split(' →')[0].split(' (')[0]) || 0) + 1)
console.log(`\n   Summary:`)
for (const [v, n] of byVerdict.entries()) console.log(`     ${n} → ${v}`)

// ── 5. Final state per brand ────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  Final state — Group A หลังทุก phase                  ║')
console.log('╚══════════════════════════════════════════════════════╝')
const { data: after } = await sb
  .from('legacy_documents')
  .select('customer_id, kind')
  .in('customer_id', Array.from(shortToId.values()))
const tally = new Map()
for (const r of after) {
  const s = idToShort.get(r.customer_id) || '?'
  if (!tally.has(s)) tally.set(s, { WB: 0, IV: 0, SD: 0, QT: 0 })
  tally.get(s)[r.kind] = (tally.get(s)[r.kind] || 0) + 1
}
for (const short of ['SWD', 'WOV', 'VLB', 'VLR', 'VLR2']) {
  const t = tally.get(short) || { WB: 0, IV: 0 }
  console.log(`   ${short.padEnd(5)} → IV=${String(t.IV || 0).padStart(3)}  WB=${String(t.WB || 0).padStart(3)}  total=${(t.IV || 0) + (t.WB || 0)}`)
}
