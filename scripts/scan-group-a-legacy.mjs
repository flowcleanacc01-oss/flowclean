#!/usr/bin/env node
/**
 * Scan legacy_documents for Group A (รามบุตรีรุ่งเรือง)
 * Goal: ดูว่า legacy 380 ใบที่ pile ขึ้น VLR2 มี customer_code (X-prefix) ระบุได้ไหม
 *      เพื่อ re-attribute by code (Plan B)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const GROUP_A_TAX = '0105558158882'
const X_TO_SHORT = {
  X0021: 'SWD', X0023: 'WOV', X0027: 'VLB', X0053: 'VLR', X0100: 'VLR2',
}

// 1. ดึง customers Group A
const { data: customers } = await sb
  .from('customers').select('id, customer_code, short_name, name, tax_id')
  .or(`tax_id.eq.${GROUP_A_TAX},short_name.in.(SWD,WOV,VLB,VLR,VLR2)`)
const idToShort = new Map(customers.map(c => [c.id, c.short_name]))
const shortToId = new Map(customers.map(c => [c.short_name, c.id]))

console.log('\n📊 Group A customers:')
for (const c of customers) {
  console.log(`   ${c.short_name.padEnd(5)} (code: ${c.customer_code || '-'}) — id=${c.id.slice(0, 8)}…`)
}

// 2. ดึง legacy ทั้งหมดที่ผูกกับ Group A (ผ่าน customer_id หรือ name)
const ids = customers.map(c => c.id)
const { data: byId } = await sb
  .from('legacy_documents')
  .select('id, kind, doc_number, doc_date, customer_id, customer_name, customer_code, amount')
  .in('customer_id', ids)

const { data: byName } = await sb
  .from('legacy_documents')
  .select('id, kind, doc_number, doc_date, customer_id, customer_name, customer_code, amount')
  .ilike('customer_name', '%รามบุตรีรุ่งเรือง%')

// dedupe
const all = new Map()
for (const r of [...byId, ...byName]) all.set(r.id, r)
const legacy = Array.from(all.values())

console.log(`\n📦 Legacy docs ผูกกับ Group A: ${legacy.length} รายการ`)

// 3. แยกตาม customer_code (X-prefix) ในแต่ละ row
const byXCode = new Map()
const noCode = []
for (const r of legacy) {
  const code = (r.customer_code || '').trim().toUpperCase()
  if (X_TO_SHORT[code]) {
    if (!byXCode.has(code)) byXCode.set(code, [])
    byXCode.get(code).push(r)
  } else {
    noCode.push(r)
  }
}

console.log(`\n═══ แยกตาม X-code (Plan B target) ═══`)
for (const [code, short] of Object.entries(X_TO_SHORT)) {
  const list = byXCode.get(code) || []
  const currentlyAt = list.length > 0
    ? Array.from(new Set(list.map(r => idToShort.get(r.customer_id) || '(no-id)'))).join(', ')
    : '-'
  const targetId = shortToId.get(short)
  const needMove = list.filter(r => r.customer_id !== targetId).length
  console.log(`   ${code} → ${short.padEnd(5)}  มี ${String(list.length).padStart(4)} ใบ  | ปัจจุบัน land ที่: [${currentlyAt}] | ต้อง move: ${needMove}`)
}

console.log(`\n   (no X-code) ........ ${noCode.length} ใบ ⚠ — re-attribute by code ไม่ได้`)

// 4. ใน "no X-code" — ดูว่า kind/year/amount มี pattern หรือไม่
if (noCode.length > 0) {
  console.log(`\n═══ ⚠️  No-code breakdown ═══`)
  const byKind = new Map()
  const byYear = new Map()
  for (const r of noCode) {
    byKind.set(r.kind, (byKind.get(r.kind) || 0) + 1)
    const y = (r.doc_date || '').slice(0, 4) || '?'
    byYear.set(y, (byYear.get(y) || 0) + 1)
  }
  console.log(`   By kind:`, Array.from(byKind.entries()).map(([k, n]) => `${k}=${n}`).join(' '))
  console.log(`   By year:`, Array.from(byYear.entries()).sort().map(([y, n]) => `${y}=${n}`).join(' '))
  console.log(`   Sample:`)
  for (const r of noCode.slice(0, 5)) {
    console.log(`     • ${r.kind} ${r.doc_number} ${r.doc_date} | name="${r.customer_name}" | code="${r.customer_code}"`)
  }
}

// 5. Summary
const movable = Array.from(byXCode.values()).reduce((s, list) => s + list.length, 0)
console.log(`\n═══ Summary ═══`)
console.log(`   Total legacy:       ${legacy.length}`)
console.log(`   Movable (มี X-code): ${movable}  (${((movable/legacy.length)*100).toFixed(1)}%)`)
console.log(`   Stuck (no X-code):   ${noCode.length}  (${((noCode.length/legacy.length)*100).toFixed(1)}%)`)
