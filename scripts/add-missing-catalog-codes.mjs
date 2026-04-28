#!/usr/bin/env node
/**
 * 174 — เพิ่ม S037 + A92 เข้า linen_items catalog
 * ทั้งสอง code มีใน QT (legacy import) แต่ search ไม่เจอเพราะไม่ register
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const NEW_ITEMS = [
  {
    code: 'S037',
    name: 'ปลอกหมอนซิบ',
    name_en: 'Pillow Case (Zipper)',
    category: 'spa',
    unit: 'ชิ้น',
    default_price: 6,
    sort_order: 9999,
  },
  {
    code: 'A92',
    name: 'ปลอกผ้านวมใหญ่ 5/6 ซิบ',
    name_en: 'Duvet Cover 5/6 ft (Zipper)',
    category: 'accommodation',
    unit: 'ชิ้น',
    default_price: 0,
    sort_order: 9999,
  },
]

// Check existing
const { data: existing } = await sb.from('linen_items').select('code, name').in('code', NEW_ITEMS.map(i => i.code))
const existingCodes = new Set((existing || []).map(c => c.code))

console.log('\n📊 Catalog audit:')
for (const item of NEW_ITEMS) {
  if (existingCodes.has(item.code)) {
    console.log(`   ✅ ${item.code} — already in catalog (skip)`)
  } else {
    const { error } = await sb.from('linen_items').insert(item)
    if (error) console.error(`   ❌ ${item.code} insert error:`, error.message)
    else console.log(`   ➕ ${item.code} "${item.name}" — added (default_price=${item.default_price})`)
  }
}

// Audit usage in QT
console.log('\n📊 QT usage audit:')
const { data: qts } = await sb
  .from('quotations')
  .select('id, quotation_number, customer_name, status, items')
const codes = new Set(NEW_ITEMS.map(i => i.code))
const usage = new Map()
for (const qt of qts || []) {
  const items = Array.isArray(qt.items) ? qt.items : []
  for (const it of items) {
    const c = String(it.code || '').toUpperCase()
    if (codes.has(c)) {
      if (!usage.has(c)) usage.set(c, [])
      usage.get(c).push({
        qt: qt.quotation_number, customer: qt.customer_name, status: qt.status,
        nameInQT: it.name || '(no name)', priceInQT: it.unitPrice ?? it.price ?? 0,
      })
    }
  }
}
for (const code of NEW_ITEMS.map(i => i.code)) {
  const list = usage.get(code) || []
  console.log(`\n   ${code} — used in ${list.length} QT:`)
  for (const u of list.slice(0, 5)) {
    console.log(`     • ${u.qt} | ${u.customer} | "${u.nameInQT}" | ราคา ${u.priceInQT} | ${u.status}`)
  }
  if (list.length > 5) console.log(`     ... และอีก ${list.length - 5} QT`)
}

console.log('\n✅ Done — เปิดหน้า "รายการผ้า" จะ search เจอ S037 + A92 แล้ว')
