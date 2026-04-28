#!/usr/bin/env node
/**
 * 192 WB no-code ของ Group A — ลองหา IV ที่ pair ได้ผ่าน:
 *   1. doc_number pattern (WB6509xxx ↔ IV6509xxx เลขเดียวกัน)
 *   2. amount + date proximity
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const X_TO_SHORT = { X0021: 'SWD', X0023: 'WOV', X0027: 'VLB', X0053: 'VLR', X0100: 'VLR2' }

const { data: legacy } = await sb
  .from('legacy_documents')
  .select('id, kind, doc_number, doc_date, customer_code, amount, net_payable')
  .ilike('customer_name', '%รามบุตรีรุ่งเรือง%')

const wb = legacy.filter(r => r.kind === 'WB')
const iv = legacy.filter(r => r.kind === 'IV')
const wbNoCode = wb.filter(r => !X_TO_SHORT[(r.customer_code || '').toUpperCase()])
const ivWithCode = iv.filter(r => X_TO_SHORT[(r.customer_code || '').toUpperCase()])

console.log(`\nWB total: ${wb.length} | WB no-code: ${wbNoCode.length}`)
console.log(`IV total: ${iv.length} | IV with-code: ${ivWithCode.length}`)

// ── 1. เลขเดียวกัน WBxxx ↔ IVxxx ──────────────────────────────────
const ivByNum = new Map()
for (const r of ivWithCode) {
  const num = r.doc_number.replace(/^[A-Z]+/, '')
  if (!ivByNum.has(num)) ivByNum.set(num, [])
  ivByNum.get(num).push(r)
}

let pairedByNumber = 0
const matches = []
for (const w of wbNoCode) {
  const num = w.doc_number.replace(/^[A-Z]+/, '')
  const candidates = ivByNum.get(num) || []
  if (candidates.length === 1) {
    pairedByNumber++
    matches.push({ wb: w, iv: candidates[0], match: 'number-exact' })
  } else if (candidates.length > 1) {
    // หลายตัว → ต้องเทียบ amount
    const same = candidates.find(c => Math.abs(Number(c.amount || c.net_payable) - Number(w.amount || w.net_payable)) < 1)
    if (same) {
      pairedByNumber++
      matches.push({ wb: w, iv: same, match: 'number+amount' })
    }
  }
}

console.log(`\n━━━ Pairing by doc_number suffix ━━━`)
console.log(`   Paired: ${pairedByNumber}/${wbNoCode.length} (${(pairedByNumber/wbNoCode.length*100).toFixed(1)}%)`)

// ── 2. นับ pair ตาม brand ──────────────────────────────────────────
const pairTo = new Map()
for (const m of matches) {
  const code = m.iv.customer_code.toUpperCase()
  pairTo.set(code, (pairTo.get(code) || 0) + 1)
}
console.log(`\n   By target brand:`)
for (const [code, short] of Object.entries(X_TO_SHORT)) {
  console.log(`     ${code} → ${short.padEnd(5)}: +${pairTo.get(code) || 0} WB`)
}

// ── 3. WB ที่ยัง pair ไม่ได้ ─────────────────────────────────────
const unpaired = wbNoCode.length - pairedByNumber
console.log(`\n━━━ Unpaired WB: ${unpaired} ━━━`)
const unpairedSet = new Set(matches.map(m => m.wb.id))
const stillStuck = wbNoCode.filter(w => !unpairedSet.has(w.id))
console.log(`   Sample (first 10):`)
for (const w of stillStuck.slice(0, 10)) {
  const num = w.doc_number.replace(/^[A-Z]+/, '')
  const candidates = ivByNum.get(num) || []
  console.log(`     ${w.doc_number} ${w.doc_date} amount=${w.amount} | IV candidates same suffix: ${candidates.length}`)
}

// ── 4. Combined re-attribute potential ───────────────────────────
const movableIv = ivWithCode.length
const movableWb = pairedByNumber
const totalMovable = movableIv + movableWb
console.log(`\n═══ Combined Re-attribute Potential ═══`)
console.log(`   IV (มี X-code):           ${movableIv}`)
console.log(`   WB (paired กับ IV):        ${movableWb}`)
console.log(`   ─────────────────────────────────────`)
console.log(`   Total movable:             ${totalMovable} / ${legacy.length}  (${(totalMovable/legacy.length*100).toFixed(1)}%)`)
console.log(`   ยังคงค้างที่ VLR2 (no match): ${legacy.length - totalMovable}`)
