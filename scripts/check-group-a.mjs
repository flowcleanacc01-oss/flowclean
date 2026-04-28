#!/usr/bin/env node
/**
 * Check Group A (รามบุตรีรุ่งเรือง) — current DB state
 * Maps shortName → X-code from ติ๊ด's data
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const GROUP_A = [
  { code: 'X0021', shortName: 'SWD',  branch: '00004', address: '147 ซอย รามบุตรี ถนนจักรพงษ์ แขวง ชนะสงคราม เขต พระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0023', shortName: 'WOV',  branch: '00006', address: '8 ซอย ชนะสงคราม ถนน พระอาทิตย์ แขวง ชนะสงคราม เขต พระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0027', shortName: 'VLB',  branch: '00001', address: '36/1 ถนนตานี แขวงตลาดยอด เขตพระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0053', shortName: 'VLR',  branch: '00003', address: '327/2 ถนนรามบุตรี แขวงตลาดยอด เขตพระนคร กรุงเทพมหานคร 10200' },
  { code: 'X0100', shortName: 'VLR2', branch: '00003', address: '327/2,3,4 ถนนรามบุตรี แขวงตลาดยอด เขตพระนคร กรุงเทพมหานคร 10200', closed: true },
]
const COMMON = { name: 'บริษัท รามบุตรีรุ่งเรือง จำกัด', taxId: '0105558158882' }

const { data: customers, error } = await sb
  .from('customers')
  .select('id, customer_code, short_name, name, tax_id, branch, address, is_active')
  .or(`tax_id.eq.${COMMON.taxId},short_name.in.(SWD,WOV,VLB,VLR,VLR2)`)
if (error) { console.error(error); process.exit(1) }

console.log(`\n📊 พบ ${customers.length} customers ที่ตรงกับ Group A\n`)

const byShort = new Map(customers.map(c => [c.short_name, c]))
const byCode = new Map(customers.map(c => [c.customer_code, c]))

console.log('═══ Plan ═══')
for (const target of GROUP_A) {
  const existing = byShort.get(target.shortName) || byCode.get(target.code)
  if (!existing) {
    console.log(`\n   ${target.shortName.padEnd(5)} (${target.code}) → 🆕 CREATE  ${target.closed ? '(ปิด)' : '(active)'}`)
  } else {
    const fixes = []
    if (existing.customer_code !== target.code) fixes.push(`code: "${existing.customer_code || '-'}" → "${target.code}"`)
    if (existing.tax_id !== COMMON.taxId)        fixes.push(`taxId: "${existing.tax_id || '-'}" → "${COMMON.taxId}"`)
    if (existing.branch !== target.branch)       fixes.push(`branch: "${existing.branch || '-'}" → "${target.branch}"`)
    if (existing.name !== COMMON.name)           fixes.push(`name: "${existing.name}" → "${COMMON.name}"`)
    if ((existing.address || '').trim() !== target.address.trim()) fixes.push(`address: ต่าง`)
    if (target.closed && existing.is_active)     fixes.push(`is_active: true → false`)
    console.log(`\n   ${target.shortName.padEnd(5)} (${target.code}) → ${fixes.length === 0 ? '✅ OK' : '🔧 BACKFILL'} (id=${existing.id})`)
    fixes.forEach(f => console.log(`         • ${f}`))
  }
}

// Extras under same taxId (not in Group A)
const targetShorts = new Set(GROUP_A.map(g => g.shortName))
const extras = customers.filter(c => !targetShorts.has(c.short_name))
if (extras.length > 0) {
  console.log(`\n⚠️  พบ ${extras.length} customer อื่นที่ taxId เดียวกัน:`)
  extras.forEach(c => console.log(`   • ${c.short_name} (${c.customer_code || '-'}) — id=${c.id}`))
}
