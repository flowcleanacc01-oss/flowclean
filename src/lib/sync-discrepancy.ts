/**
 * Discrepancy Sync (70 + 73 + 74 + 75)
 *
 * เมื่อ "ผ้าจริง" ตามที่ลูกค้านับ ≠ จำนวนที่ระบบเก็บไว้:
 * - sync col6 (โรงซักแพคส่ง) + col4 (ลูกค้านับกลับ) ให้ตรงกัน
 * - เก็บ originalCol6/4 เพื่อ track history
 * - บันทึก syncSource (lf_manual / sd_create / sd_edit)
 * - audit log
 *
 * ใช้กับ 3 จุด:
 * - LF detail (lf_manual): ผู้ใช้แก้ใน LF เอง
 * - SD create (sd_create): ผู้ใช้สร้าง SD ใหม่และแก้จำนวน
 * - SD edit (sd_edit): ผู้ใช้แก้ SD ที่มีอยู่
 */

import type { LinenForm, LinenFormRow, DeliveryNote, Customer, Quotation } from './../types'
import { calculateTransportFeeTrip, createDNLastOfMonthCompare } from './transport-fee'

export type SyncSource = 'lf_manual' | 'sd_create' | 'sd_edit'

export interface RowSyncInput {
  code: string
  newQty: number
}

/**
 * Apply sync to a single row — returns updated row
 *
 * Logic:
 * - ถ้า originalCol6/4 ยังไม่มีค่า (ครั้งแรก) → เก็บค่าเดิมไว้
 * - ถ้ามีอยู่แล้ว (re-sync) → keep originalCol6/4 เดิม (ไม่ overwrite)
 * - col6 = col4 = newQty
 */
export function applyRowSync(
  row: LinenFormRow,
  newQty: number,
  source: SyncSource,
  syncedBy: string,
): LinenFormRow {
  // ถ้าเป็น sync ครั้งแรก → เก็บค่าเดิม
  const originalCol6 = row.originalCol6 ?? row.col6_factoryPackSend
  const originalCol4 = row.originalCol4 ?? row.col4_factoryApproved
  return {
    ...row,
    col6_factoryPackSend: newQty,
    col4_factoryApproved: newQty,
    originalCol6,
    originalCol4,
    syncedAt: new Date().toISOString(),
    syncedBy,
    syncSource: source,
  }
}

/**
 * Apply sync to multiple rows in a single LF — returns updated LF.rows array
 */
export function applyRowsSync(
  rows: LinenFormRow[],
  inputs: RowSyncInput[],
  source: SyncSource,
  syncedBy: string,
): LinenFormRow[] {
  const inputMap = new Map(inputs.map(i => [i.code, i.newQty]))
  return rows.map(r => {
    const newQty = inputMap.get(r.code)
    if (newQty === undefined) return r
    // ถ้าค่าไม่เปลี่ยน → ไม่ต้อง sync
    if (newQty === r.col6_factoryPackSend && newQty === r.col4_factoryApproved) return r
    return applyRowSync(r, newQty, source, syncedBy)
  })
}

/**
 * เช็คว่า row นี้เคยถูก sync แล้วหรือไม่
 */
export function wasSynced(row: LinenFormRow): boolean {
  return row.syncedAt !== undefined && row.syncedAt.length > 0
}

/**
 * เช็คว่า row นี้มี active discrepancy (col4 ≠ col6) หรือไม่ (Pending)
 */
export function hasActiveDiscrepancy(row: LinenFormRow): boolean {
  const c4 = row.col4_factoryApproved
  const c6 = row.col6_factoryPackSend || 0
  return c4 > 0 && c6 > 0 && c4 !== c6
}

/**
 * เช็คว่า LF มี row ที่เคยถูก sync แล้วหรือไม่ (สำหรับ visual indicator)
 */
export function lfHasSyncedRows(lf: LinenForm): boolean {
  return lf.rows.some(r => wasSynced(r))
}

/**
 * Format sync history สำหรับ note auto-append
 */
export function formatSyncNote(
  rowCode: string,
  oldVal: number,
  newVal: number,
  source: SyncSource,
  syncedBy: string,
): string {
  const sourceLabel = source === 'sd_create' ? 'sd_create' : source === 'sd_edit' ? 'sd_edit' : 'lf_manual'
  const date = new Date().toLocaleDateString('th-TH')
  return `📝 ${rowCode}: col6+col4 sync ${oldVal}→${newVal} (${sourceLabel}) โดย ${syncedBy} ${date}`
}

// ============================================================
// Recalc transport fees after sync (reuses feature 63 logic)
// ============================================================

export interface RecalcResult {
  dnId: string
  newTripFee: number
  newMonthFee?: number
}

/**
 * Recalc transportFeeTrip + transportFeeMonth สำหรับ DN ที่กระทบ
 * - DN ที่ถูก sync → recalc tripFee
 * - DN ใบสุดท้ายของเดือน → recalc monthFee
 *
 * Returns: list ของ updates ที่ต้อง apply
 */
export function recalcTransportAfterSync(
  affectedDn: DeliveryNote,
  customer: Customer,
  allDeliveryNotes: DeliveryNote[],
  quotations: Quotation[],
  linenForms: LinenForm[], // 120: LF-based sort for last-of-month
  adjExtra = 0,    // 112.1/115: existing extra on SD (for accurate threshold)
  adjDiscount = 0, // 112.1/115: existing discount on SD (for accurate threshold)
): RecalcResult[] {
  const results: RecalcResult[] = []

  // Build price map (priority: DN.priceSnapshot → accepted QT → customer.priceList)
  const acceptedQT = quotations.find(q => q.customerId === customer.id && q.status === 'accepted')
  const fallbackPriceMap = acceptedQT
    ? Object.fromEntries(acceptedQT.items.map(i => [i.code, i.pricePerUnit]))
    : Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  const pm = (affectedDn.priceSnapshot && Object.keys(affectedDn.priceSnapshot).length > 0)
    ? affectedDn.priceSnapshot
    : fallbackPriceMap

  // Recalc trip fee for affected DN — use effectiveSubtotal (respects existing extra/discount)
  const itemSubtotal = affectedDn.items.reduce(
    (s, i) => i.isClaim ? s : s + i.quantity * (pm[i.code] || 0),
    0,
  )
  const effectiveSubtotal = Math.max(0, itemSubtotal + adjExtra - adjDiscount)
  const newTripFee = calculateTransportFeeTrip(effectiveSubtotal, customer)
  results.push({ dnId: affectedDn.id, newTripFee })

  // Recalc month fee for last DN of the month (if customer has minPerMonth)
  if (customer.enableMinPerMonth && customer.monthlyFlatRate > 0) {
    const month = affectedDn.date.slice(0, 7)
    const monthDNs = allDeliveryNotes
      .filter(d => d.customerId === customer.id && d.date.startsWith(month))
      .sort(createDNLastOfMonthCompare(linenForms))
    const lastDN = monthDNs[0]
    if (lastDN && !lastDN.isBilled) {
      // Calc month total — use effectiveSubtotal for affectedDn, original for others
      let monthTotal = 0
      for (const d of monthDNs) {
        const isAffected = d.id === affectedDn.id
        const dPm = isAffected ? pm : (d.priceSnapshot && Object.keys(d.priceSnapshot).length > 0 ? d.priceSnapshot : fallbackPriceMap)
        const dSubtotal = d.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (dPm[i.code] || 0), 0)
        const dEffective = isAffected ? effectiveSubtotal : dSubtotal
        const dTripFee = isAffected ? newTripFee : (d.transportFeeTrip || 0)
        monthTotal += dEffective + dTripFee
      }
      const newMonthFee = monthTotal < customer.monthlyFlatRate
        ? customer.monthlyFlatRate - monthTotal
        : 0
      // Update lastDN's month fee (could be affectedDn itself)
      const existing = results.find(r => r.dnId === lastDN.id)
      if (existing) {
        existing.newMonthFee = newMonthFee
      } else {
        results.push({ dnId: lastDN.id, newTripFee: lastDN.transportFeeTrip || 0, newMonthFee })
      }
    }
  }

  return results
}

/**
 * Recalc transportFeeTrip + transportFeeMonth หลังปรับ extra/discount
 *
 * ใช้ (itemSubtotal + adjExtra - adjDiscount) เป็น effective amount สำหรับ threshold check:
 * - extra เพิ่ม → effective สูงขึ้น → ค่ารถครั้งอาจลดเป็น 0
 * - discount เพิ่ม → effective ต่ำลง → ค่ารถครั้งอาจเพิ่ม
 * - month fee: recalc DN ใบสุดท้ายของเดือน (auto, เหมือน recalcTransportAfterSync)
 *
 * Returns: list ของ updates ที่ต้อง apply (อาจมี DN อื่นด้วย ถ้า month fee กระทบ)
 */
export function recalcTransportAfterAdj(
  affectedDn: DeliveryNote,
  customer: Customer,
  allDeliveryNotes: DeliveryNote[],
  quotations: Quotation[],
  linenForms: LinenForm[], // 120: LF-based sort for last-of-month
  adjExtra: number,
  adjDiscount: number,
): RecalcResult[] {
  const results: RecalcResult[] = []

  const acceptedQT = quotations.find(q => q.customerId === customer.id && q.status === 'accepted')
  const fallbackPriceMap = acceptedQT
    ? Object.fromEntries(acceptedQT.items.map(i => [i.code, i.pricePerUnit]))
    : Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  const pm = (affectedDn.priceSnapshot && Object.keys(affectedDn.priceSnapshot).length > 0)
    ? affectedDn.priceSnapshot
    : fallbackPriceMap

  const itemSubtotal = affectedDn.items.reduce(
    (s, i) => i.isClaim ? s : s + i.quantity * (pm[i.code] || 0),
    0,
  )
  // ใช้ effective subtotal (รวม extra/discount) สำหรับ threshold check
  const effectiveSubtotal = Math.max(0, itemSubtotal + adjExtra - adjDiscount)
  const newTripFee = calculateTransportFeeTrip(effectiveSubtotal, customer)
  results.push({ dnId: affectedDn.id, newTripFee })

  // Recalc month fee for last DN of the month
  if (customer.enableMinPerMonth && customer.monthlyFlatRate > 0) {
    const month = affectedDn.date.slice(0, 7)
    const monthDNs = allDeliveryNotes
      .filter(d => d.customerId === customer.id && d.date.startsWith(month))
      .sort(createDNLastOfMonthCompare(linenForms))
    const lastDN = monthDNs[0]
    if (lastDN && !lastDN.isBilled) {
      let monthTotal = 0
      for (const d of monthDNs) {
        const isAffected = d.id === affectedDn.id
        const dPm = isAffected ? pm : (d.priceSnapshot && Object.keys(d.priceSnapshot).length > 0 ? d.priceSnapshot : fallbackPriceMap)
        const dSubtotal = d.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (dPm[i.code] || 0), 0)
        // affectedDn ใช้ effectiveSubtotal (รวม adj), DN อื่นใช้ subtotal ปกติ
        const dEffective = isAffected ? effectiveSubtotal : dSubtotal
        const dTripFee = isAffected ? newTripFee : (d.transportFeeTrip || 0)
        monthTotal += dEffective + dTripFee
      }
      const newMonthFee = monthTotal < customer.monthlyFlatRate
        ? Math.max(0, customer.monthlyFlatRate - monthTotal)
        : 0
      const existing = results.find(r => r.dnId === lastDN.id)
      if (existing) {
        existing.newMonthFee = newMonthFee
      } else {
        results.push({ dnId: lastDN.id, newTripFee: lastDN.transportFeeTrip || 0, newMonthFee })
      }
    }
  }

  return results
}
