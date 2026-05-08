/**
 * 232 — Code reference checker (guard ก่อนสร้าง/promote catalog item)
 *
 * Use case:
 *  - User promote orphan code → check ว่า code นั้นมี ref ที่ name ≠ promoted name หรือไม่
 *  - User เพิ่มรายการใหม่ใน Items page ด้วย code ที่เคยมีใน orphan refs → warn
 *  - Wizard add new item → similar guard
 *
 * Goal: ป้องกัน "code reuse collision" ที่ทำให้ QT เก่ากลายเป็น drift หรือ data ผิดความหมาย
 */
import type { Quotation, LinenForm, DeliveryNote, Customer } from '@/types'

export interface CodeRefSummary {
  /** QT references — มี name ใน items[] เปรียบเทียบได้ */
  qts: { id: string; number: string; status: string; nameInQT: string; customerShortName: string }[]
  /** LF references — row.code only, ไม่มี name */
  lfs: { id: string; formNumber: string; date: string; customerShortName: string; rowsCount: number }[]
  /** DN references — items[].name optional */
  dns: { id: string; noteNumber: string; date: string; customerShortName: string; itemName: string; quantity: number }[]
  /** Customer references — enabledItems / priceList / priceHistory */
  customers: { id: string; shortName: string; sources: ('enabledItems' | 'priceList' | 'priceHistory')[] }[]
  /** รวม refs ทุกแหล่ง */
  totalRefs: number
  /** unique names ที่เจอใน QT/DN — ใช้เปรียบเทียบกับ name ที่ user จะใส่ */
  uniqueNames: string[]
  /** มี ref ใน LF/Customer ที่ไม่มี name field — silent merger ถ้า promote */
  hasNamelessRefs: boolean
}

interface CheckData {
  quotations: Quotation[]
  linenForms: LinenForm[]
  deliveryNotes: DeliveryNote[]
  customers: Customer[]
}

/**
 * รวบรวม references ของ code ในทุก source — ไม่สนว่า code อยู่ใน catalog หรือไม่
 * ใช้ได้ทั้งกับ orphan promote (ตอน promote, code ยังไม่อยู่ใน catalog)
 * และ create new (ตอน user ใส่ code ใหม่ที่เคยมี ref ค้าง)
 */
export function getCodeReferences(code: string, data: CheckData): CodeRefSummary {
  const target = (code || '').trim()
  const result: CodeRefSummary = {
    qts: [], lfs: [], dns: [], customers: [],
    totalRefs: 0, uniqueNames: [], hasNamelessRefs: false,
  }
  if (!target) return result

  const custMap = new Map(data.customers.map(c => [c.id, c]))
  const namesSet = new Set<string>()

  // QT
  for (const qt of data.quotations) {
    for (const it of qt.items || []) {
      if ((it.code || '').trim() !== target) continue
      const name = (it.name || '').trim()
      const cust = custMap.get(qt.customerId)
      result.qts.push({
        id: qt.id, number: qt.quotationNumber, status: qt.status,
        nameInQT: name,
        customerShortName: cust?.shortName || qt.customerId.slice(0, 8),
      })
      if (name) namesSet.add(name)
      result.totalRefs++
    }
  }

  // LF — group rows per form
  for (const lf of data.linenForms) {
    const matchingRows = (lf.rows || []).filter(r => (r.code || '').trim() === target)
    if (matchingRows.length === 0) continue
    const cust = custMap.get(lf.customerId)
    result.lfs.push({
      id: lf.id, formNumber: lf.formNumber, date: lf.date,
      customerShortName: cust?.shortName || lf.customerId.slice(0, 8),
      rowsCount: matchingRows.length,
    })
    result.totalRefs += matchingRows.length
    result.hasNamelessRefs = true // LF rows ไม่มี name field
  }

  // DN
  for (const dn of data.deliveryNotes) {
    const cust = custMap.get(dn.customerId)
    for (const item of dn.items || []) {
      if (item.isAdhoc) continue
      if ((item.code || '').trim() !== target) continue
      const itemName = (item as { name?: string }).name || ''
      result.dns.push({
        id: dn.id, noteNumber: dn.noteNumber, date: dn.date,
        customerShortName: cust?.shortName || dn.customerId.slice(0, 8),
        itemName, quantity: item.quantity || 0,
      })
      if (itemName) namesSet.add(itemName.trim())
      result.totalRefs++
    }
  }

  // Customer
  for (const c of data.customers) {
    const sources: ('enabledItems' | 'priceList' | 'priceHistory')[] = []
    if ((c.enabledItems || []).includes(target)) sources.push('enabledItems')
    if ((c.priceList || []).some(p => p.code === target)) sources.push('priceList')
    if ((c.priceHistory || []).some(p => (p as unknown as { code?: string }).code === target)) sources.push('priceHistory')
    if (sources.length === 0) continue
    result.customers.push({ id: c.id, shortName: c.shortName, sources })
    result.totalRefs += sources.length
    result.hasNamelessRefs = true // Customer fields ไม่มี name field
  }

  result.uniqueNames = Array.from(namesSet)
  return result
}

/**
 * ตรวจว่าจะเกิด conflict ถ้าใช้ code นี้กับ name ที่ระบุ
 * - 'no_refs': code นี้ไม่มี ref → ปลอดภัย เพิ่มได้
 * - 'name_match': มี ref แต่ name ตรงกับที่จะใช้ → ปลอดภัย (orphan promote ตามปกติ)
 * - 'name_drift': มี ref ที่ name ต่างจากที่จะใช้ → จะเกิด drift หลัง promote
 * - 'nameless_only': มี ref แต่ทั้งหมดเป็น LF/Customer (ไม่มี name) → silent merge เข้า name ใหม่
 */
export type ConflictLevel = 'no_refs' | 'name_match' | 'name_drift' | 'nameless_only'

export function detectConflict(refs: CodeRefSummary, plannedName: string): ConflictLevel {
  if (refs.totalRefs === 0) return 'no_refs'
  const planned = (plannedName || '').trim()
  const differingNames = refs.uniqueNames.filter(n => n !== planned)
  if (refs.uniqueNames.length === 0) return 'nameless_only' // refs in LF/Customer only
  if (differingNames.length === 0) return 'name_match'
  return 'name_drift'
}
