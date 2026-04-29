#!/usr/bin/env node
/**
 * 191 — Scan QT ที่ใช้ H01 + breakdown ตาม status + name
 * เพื่อตอบว่าทำไม "7 QT ตามไม่ทัน" vs search ได้ 9
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

// ดึง catalog name ของ H01
const { data: cat } = await sb.from('linen_items').select('code, name').eq('code', 'H01').single()
console.log(`\n📦 Catalog: H01 = "${cat?.name}"\n`)

// ดึง QT ทั้งหมด (paginate ป้องกัน limit 1000)
const all = []
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('quotations')
    .select('id, quotation_number, customer_name, status, items')
    .range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
}

// Filter เฉพาะ QT ที่มี H01
const h01Usage = []
for (const qt of all) {
  const items = Array.isArray(qt.items) ? qt.items : []
  const matches = items.filter(it => it.code === 'H01')
  if (matches.length === 0) continue
  for (const m of matches) {
    h01Usage.push({
      qt: qt.quotation_number,
      status: qt.status,
      customer: qt.customer_name,
      nameInQT: m.name || '(empty)',
      matchesCatalog: m.name === cat?.name,
    })
  }
}

console.log(`📊 พบ ${h01Usage.length} rows ที่ใช้ H01 (ใน ${new Set(h01Usage.map(u => u.qt)).size} QT)\n`)

// Breakdown ตาม status + matchesCatalog
const byStatusMatch = new Map()
for (const u of h01Usage) {
  const key = `${u.status} | ${u.matchesCatalog ? '✅ ตรง catalog' : '❌ drift'}`
  if (!byStatusMatch.has(key)) byStatusMatch.set(key, [])
  byStatusMatch.get(key).push(u)
}

console.log('═══ Breakdown ═══')
for (const [key, list] of byStatusMatch) {
  console.log(`\n   ${key} — ${list.length} rows`)
  // unique names
  const names = new Map()
  for (const u of list) names.set(u.nameInQT, (names.get(u.nameInQT) || 0) + 1)
  for (const [n, c] of names) console.log(`     "${n}" — ${c} rows`)
}

console.log('\n═══ Logic ของ Sync Names Tool ═══')
const driftCount = h01Usage.filter(u => u.status !== 'rejected' && !u.matchesCatalog).length
const draftSentCount = h01Usage.filter(u => (u.status === 'draft' || u.status === 'sent') && !u.matchesCatalog).length
const acceptedCount = h01Usage.filter(u => u.status === 'accepted' && !u.matchesCatalog).length
const rejectedDriftCount = h01Usage.filter(u => u.status === 'rejected' && !u.matchesCatalog).length
const matchedCount = h01Usage.filter(u => u.matchesCatalog).length

console.log(`   Drift (excl. rejected — useNameDrift นับ): ${driftCount}`)
console.log(`     - draft + sent (default sync):           ${draftSentCount}`)
console.log(`     - accepted (toggle "รวม accepted"):       ${acceptedCount}`)
console.log(`   Drift in rejected (ข้ามไม่นับ):              ${rejectedDriftCount}`)
console.log(`   Matched catalog แล้ว:                       ${matchedCount}`)
console.log(`   Total:                                       ${h01Usage.length}`)
