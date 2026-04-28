#!/usr/bin/env node
/**
 * Group A — รามบุตรีรุ่งเรือง
 * Phase 1: Backfill customer_code + address (5 customers)
 * Phase 2.1: Re-attribute 210 legacy docs (188 IV + 22 WB pair)
 * Phase 2.2: Export 170 unpaired WB → CSV
 *
 * Idempotent: รันซ้ำได้ — ตรวจสถานะก่อนเขียน
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const COMMON = { name: 'บริษัท รามบุตรีรุ่งเรือง จำกัด', taxId: '0105558158882' }
const GROUP_A = [
  { code: 'X0021', shortName: 'SWD',  branch: '00004', address: '147 ซอย รามบุตรี ถนนจักรพงษ์ แขวง ชนะสงคราม เขต พระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0023', shortName: 'WOV',  branch: '00006', address: '8 ซอย ชนะสงคราม ถนน พระอาทิตย์ แขวง ชนะสงคราม เขต พระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0027', shortName: 'VLB',  branch: '00001', address: '36/1 ถนนตานี แขวงตลาดยอด เขตพระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0053', shortName: 'VLR',  branch: '00003', address: '327/2 ถนนรามบุตรี แขวงตลาดยอด เขตพระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0100', shortName: 'VLR2', branch: '00003', address: '327/2,3,4 ถนนรามบุตรี แขวงตลาดยอด เขตพระนคร กรุงเทพมหานคร 10200', closed: true },
]
const X_TO_SHORT = Object.fromEntries(GROUP_A.map(g => [g.code, g.shortName]))

// ─────────────────────────────────────────────────────────────────
// Phase 1: Backfill customer_code + address
// ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  Phase 1 — Backfill 5 customers                      ║')
console.log('╚══════════════════════════════════════════════════════╝')

const { data: customers, error: e1 } = await sb
  .from('customers')
  .select('id, customer_code, short_name, name, tax_id, branch, address, is_active')
  .or(`tax_id.eq.${COMMON.taxId},short_name.in.(SWD,WOV,VLB,VLR,VLR2)`)
if (e1) { console.error('customers fetch error:', e1); process.exit(1) }
const byShort = new Map(customers.map(c => [c.short_name, c]))

let backfilled = 0
for (const target of GROUP_A) {
  const c = byShort.get(target.shortName)
  if (!c) { console.log(`   ❌ ${target.shortName} ไม่อยู่ใน DB — SKIP`); continue }

  const update = {}
  if (c.customer_code !== target.code) update.customer_code = target.code
  if ((c.address || '').trim() !== target.address.trim()) update.address = target.address
  if (c.tax_id !== COMMON.taxId) update.tax_id = COMMON.taxId
  if (c.branch !== target.branch) update.branch = target.branch
  if (target.closed && c.is_active) update.is_active = false

  if (Object.keys(update).length === 0) {
    console.log(`   ✅ ${target.shortName.padEnd(5)} — already ok`)
    continue
  }

  const { error } = await sb.from('customers').update(update).eq('id', c.id)
  if (error) { console.error(`   ❌ ${target.shortName} update error:`, error); continue }
  console.log(`   🔧 ${target.shortName.padEnd(5)} — backfilled: ${Object.keys(update).join(', ')}`)
  backfilled++
}
console.log(`\n   Phase 1 complete: ${backfilled} customers backfilled.`)

// ─────────────────────────────────────────────────────────────────
// Phase 2.1: Re-attribute legacy docs
// ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  Phase 2.1 — Re-attribute legacy 210 docs            ║')
console.log('╚══════════════════════════════════════════════════════╝')

// Refresh customer ids → shortName + shortName → id
const { data: customers2 } = await sb
  .from('customers').select('id, short_name, customer_code')
  .in('short_name', ['SWD', 'WOV', 'VLB', 'VLR', 'VLR2'])
const shortToId = new Map(customers2.map(c => [c.short_name, c.id]))

const { data: legacy } = await sb
  .from('legacy_documents')
  .select('id, kind, doc_number, doc_date, customer_id, customer_name, customer_code, amount, net_payable')
  .ilike('customer_name', '%รามบุตรีรุ่งเรือง%')

const ivByCode = new Map()  // X-code → IVs
const ivWithCode = []
const wbAll = []
for (const r of legacy) {
  if (r.kind === 'IV' && X_TO_SHORT[(r.customer_code || '').toUpperCase()]) {
    ivWithCode.push(r)
    const code = r.customer_code.toUpperCase()
    if (!ivByCode.has(code)) ivByCode.set(code, [])
    ivByCode.get(code).push(r)
  } else if (r.kind === 'WB') {
    wbAll.push(r)
  }
}

// Build IV-by-suffix index for WB pairing
const ivByNumSuffix = new Map()
for (const r of ivWithCode) {
  const suffix = r.doc_number.replace(/^[A-Z]+/, '')
  if (!ivByNumSuffix.has(suffix)) ivByNumSuffix.set(suffix, [])
  ivByNumSuffix.get(suffix).push(r)
}

// Decide target for each WB by pairing
const wbAssignments = []  // { wb, targetCode, source }
const wbUnpaired = []
for (const w of wbAll) {
  // already has X-code? (rare, but handle)
  const ownCode = (w.customer_code || '').toUpperCase()
  if (X_TO_SHORT[ownCode]) {
    wbAssignments.push({ wb: w, targetCode: ownCode, source: 'self-code' })
    continue
  }
  const suffix = w.doc_number.replace(/^[A-Z]+/, '')
  const candidates = ivByNumSuffix.get(suffix) || []
  if (candidates.length === 1) {
    wbAssignments.push({ wb: w, targetCode: candidates[0].customer_code.toUpperCase(), source: 'pair-number' })
  } else if (candidates.length > 1) {
    const same = candidates.find(c =>
      Math.abs(Number(c.amount || c.net_payable) - Number(w.amount || w.net_payable)) < 1
    )
    if (same) {
      wbAssignments.push({ wb: w, targetCode: same.customer_code.toUpperCase(), source: 'pair-number+amount' })
    } else {
      wbUnpaired.push(w)
    }
  } else {
    wbUnpaired.push(w)
  }
}

console.log(`   IV with code: ${ivWithCode.length}`)
console.log(`   WB paired:    ${wbAssignments.length}`)
console.log(`   WB unpaired:  ${wbUnpaired.length}`)

// Apply updates
let updates = 0
let unchanged = 0

for (const r of ivWithCode) {
  const targetShort = X_TO_SHORT[r.customer_code.toUpperCase()]
  const targetId = shortToId.get(targetShort)
  if (!targetId) { console.error(`   ❌ no customer for ${targetShort}`); continue }
  if (r.customer_id === targetId) { unchanged++; continue }
  const { error } = await sb.from('legacy_documents')
    .update({ customer_id: targetId })
    .eq('id', r.id)
  if (error) { console.error(`   ❌ ${r.doc_number}:`, error.message); continue }
  updates++
}

for (const a of wbAssignments) {
  const targetShort = X_TO_SHORT[a.targetCode]
  const targetId = shortToId.get(targetShort)
  if (!targetId) continue
  const update = { customer_id: targetId }
  // backfill code on WB so future scans recognize
  if ((a.wb.customer_code || '').toUpperCase() !== a.targetCode) {
    update.customer_code = a.targetCode
  }
  if (a.wb.customer_id === targetId && (a.wb.customer_code || '').toUpperCase() === a.targetCode) {
    unchanged++; continue
  }
  const { error } = await sb.from('legacy_documents').update(update).eq('id', a.wb.id)
  if (error) { console.error(`   ❌ ${a.wb.doc_number}:`, error.message); continue }
  updates++
}

console.log(`\n   Phase 2.1 complete: ${updates} docs moved, ${unchanged} already correct.`)

// ─────────────────────────────────────────────────────────────────
// Phase 2.2: Export 170 unpaired WB → CSV
// ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  Phase 2.2 — Export unpaired WB to CSV               ║')
console.log('╚══════════════════════════════════════════════════════╝')

wbUnpaired.sort((a, b) => (a.doc_date || '').localeCompare(b.doc_date) || a.doc_number.localeCompare(b.doc_number))

const csvLines = ['doc_number,doc_date,amount,net_payable,suggested_brand,note']
for (const w of wbUnpaired) {
  const num = (w.doc_number || '').replace(/[",]/g, '')
  const date = (w.doc_date || '').replace(/[",]/g, '')
  const amount = Number(w.amount || 0).toFixed(2)
  const net = Number(w.net_payable || 0).toFixed(2)
  csvLines.push(`${num},${date},${amount},${net},,(เลือก: SWD/WOV/VLB/VLR/VLR2)`)
}
const csvPath = resolve(here, 'group-a-unpaired-wb.csv')
writeFileSync(csvPath, '﻿' + csvLines.join('\n'))  // BOM for Excel Thai support
console.log(`   📤 ${wbUnpaired.length} WB → ${csvPath}`)
console.log(`      ส่งให้ติ๊ดเปิดด้วย Excel แล้วเติม column "suggested_brand"`)

// ─────────────────────────────────────────────────────────────────
// Final summary
// ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║  Summary — Group A หลังประมวลผล                       ║')
console.log('╚══════════════════════════════════════════════════════╝')

const { data: after } = await sb
  .from('legacy_documents')
  .select('customer_id, kind')
  .in('customer_id', Array.from(shortToId.values()))

const idToShort = new Map(customers2.map(c => [c.id, c.short_name]))
const tally = new Map()
for (const r of after) {
  const s = idToShort.get(r.customer_id) || '?'
  if (!tally.has(s)) tally.set(s, { WB: 0, IV: 0, SD: 0, QT: 0 })
  tally.get(s)[r.kind] = (tally.get(s)[r.kind] || 0) + 1
}
for (const short of ['SWD', 'WOV', 'VLB', 'VLR', 'VLR2']) {
  const t = tally.get(short) || { WB: 0, IV: 0 }
  const total = (t.WB || 0) + (t.IV || 0) + (t.SD || 0) + (t.QT || 0)
  console.log(`   ${short.padEnd(5)} → IV=${String(t.IV || 0).padStart(3)}  WB=${String(t.WB || 0).padStart(3)}  total=${total}`)
}
console.log(`\n   Unpaired WB still on VLR2 (ที่ติ๊ดต้องดูใน CSV): ${wbUnpaired.length}`)
