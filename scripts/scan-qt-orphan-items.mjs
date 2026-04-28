#!/usr/bin/env node
/**
 * Scan QT items vs linen_items catalog
 * Lists item codes/names that appear in QT but NOT in the master linen catalog.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()

const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY') || get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!url || !key) {
  console.error('Missing SUPABASE env vars in .env.local')
  process.exit(1)
}
const sb = createClient(url, key)

const [{ data: catalog, error: e1 }, { data: qts, error: e2 }] = await Promise.all([
  sb.from('linen_items').select('code,name,name_en'),
  sb.from('quotations').select('id,quotation_number,customer_name,status,date,items'),
])
if (e1) { console.error('linen_items error:', e1); process.exit(1) }
if (e2) { console.error('quotations error:', e2); process.exit(1) }

const codeSet = new Set(catalog.map(c => (c.code || '').trim().toUpperCase()))
const nameSet = new Set(
  catalog.flatMap(c => [c.name, c.name_en])
    .filter(Boolean).map(s => s.trim().toLowerCase())
)

// orphan = code not in catalog (and name doesn't match either)
const orphans = new Map() // key: code|name -> { code, name, qts: [{qtNumber, customerName, qty, price}] }

for (const qt of qts) {
  const items = Array.isArray(qt.items) ? qt.items : []
  for (const it of items) {
    const code = String(it.code || it.itemCode || '').trim().toUpperCase()
    const name = String(it.name || it.itemName || it.description || '').trim()
    const nameKey = name.toLowerCase()
    const codeOk = code && codeSet.has(code)
    const nameOk = name && nameSet.has(nameKey)
    if (codeOk || nameOk) continue

    const key = `${code}|${nameKey}`
    if (!orphans.has(key)) {
      orphans.set(key, { code: code || '(ไม่มีรหัส)', name: name || '(ไม่มีชื่อ)', qts: [], totalQty: 0 })
    }
    const o = orphans.get(key)
    o.qts.push({
      qtNumber: qt.quotation_number,
      customer: qt.customer_name,
      status: qt.status,
      date: qt.date,
      qty: it.quantity ?? it.qty ?? 0,
      price: it.unitPrice ?? it.price ?? 0,
    })
    o.totalQty += Number(it.quantity ?? it.qty ?? 0)
  }
}

console.log(`\n📊 Catalog: ${catalog.length} items | QT: ${qts.length} docs`)
console.log(`🔴 Orphan rows (code+name combos in QT but NOT in catalog): ${orphans.size}\n`)

if (orphans.size === 0) {
  console.log('✅ ไม่มี orphan')
  process.exit(0)
}

const sorted = Array.from(orphans.values()).sort((a, b) => b.qts.length - a.qts.length)

// ── 1. Group by code prefix ────────────────────────────────────────
const byPrefix = new Map()
for (const o of sorted) {
  const m = o.code.match(/^([A-Z]+)/i)
  const pref = m ? m[1].toUpperCase() : '(no-code)'
  if (!byPrefix.has(pref)) byPrefix.set(pref, { count: 0, qtRefs: 0, items: [] })
  const p = byPrefix.get(pref)
  p.count += 1
  p.qtRefs += o.qts.length
  p.items.push(o)
}

console.log('═══ สรุปตาม Code Prefix ═══')
const prefixSorted = Array.from(byPrefix.entries()).sort((a, b) => b[1].qtRefs - a[1].qtRefs)
for (const [pref, p] of prefixSorted) {
  console.log(`   ${pref.padEnd(12)} ${String(p.count).padStart(4)} รายการ  ใช้ใน ${p.qtRefs} QT-rows`)
}

// ── 2. Code clashes — code เดียว ชื่อต่าง ────────────────────────
const byCode = new Map()
for (const o of sorted) {
  if (!o.code || o.code === '(ไม่มีรหัส)') continue
  if (!byCode.has(o.code)) byCode.set(o.code, [])
  byCode.get(o.code).push(o)
}
const clashes = Array.from(byCode.entries()).filter(([, list]) => list.length > 1)
const catalogByCode = new Map(catalog.map(c => [c.code.toUpperCase(), c]))

console.log(`\n═══ ⚠️  Code Clashes (รหัสเดียว ชื่อต่าง) — ${clashes.length} รหัส ═══`)
for (const [code, list] of clashes.slice(0, 20)) {
  const inCatalog = catalogByCode.get(code)
  console.log(`\n   [${code}] ${inCatalog ? `(catalog: "${inCatalog.name}")` : '(ไม่อยู่ใน catalog)'}`)
  for (const o of list) {
    console.log(`     • "${o.name}" — ใน ${o.qts.length} QT`)
  }
}

// ── 3. Top 30 orphans by QT usage ────────────────────────────────
console.log(`\n═══ Top 30 Orphan Items (by QT count) ═══`)
for (const o of sorted.slice(0, 30)) {
  console.log(`   [${o.code.padEnd(8)}] ${o.name.padEnd(40)} — ${o.qts.length} QT`)
}

// ── 4. Categorize by likely cause ────────────────────────────────
const noCode = sorted.filter(o => !o.code || o.code === '(ไม่มีรหัส)')
const withCode = sorted.filter(o => o.code && o.code !== '(ไม่มีรหัส)')

console.log(`\n═══ จัดประเภท ═══`)
console.log(`   • รายการมีรหัสแต่ไม่มีใน catalog: ${withCode.length}`)
console.log(`   • รายการไม่มีรหัส:               ${noCode.length}`)
console.log(`   • Code clashes (รหัสซ้ำ):         ${clashes.length}`)

// Save full list to JSON for follow-up
import { writeFileSync } from 'node:fs'
const out = sorted.map(o => ({
  code: o.code,
  name: o.name,
  qtCount: o.qts.length,
  inCatalog: !!catalogByCode.get(o.code),
  catalogName: catalogByCode.get(o.code)?.name || null,
  qts: o.qts.map(q => ({ qt: q.qtNumber, customer: q.customer, status: q.status, date: q.date })),
}))
writeFileSync(resolve(here, 'qt-orphan-items.json'), JSON.stringify(out, null, 2))
console.log(`\n💾 เขียนรายการเต็มที่ scripts/qt-orphan-items.json (${out.length} รายการ)`)
