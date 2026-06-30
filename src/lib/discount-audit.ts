// 473 — รายงานส่วนลด/ชดเชย (Discount & Claim Audit)
//   จุดประสงค์: track "ส่วนลด/ชดเชยค่าเสียหาย" ที่ให้ลูกค้า — รายไหน เดือนไหน เท่าไร เกิดที่เอกสารใบไหน
//   และไล่รอยว่ายอดเดียวกันไหลจาก SD → WB → IV ครบไหม (audit)
//
// แหล่งของ "ส่วนลด/ชดเชย" (เงิน) ในระบบ:
//   1. เคลม (claim) — DeliveryNote.items ที่ isClaim=true → ชดเชยผ้าเสียหาย/หาย (Feat 266 = ส่วนลดทางบัญชี)
//      มูลค่า = Σ qty × ราคา (priceSnapshot ของ SD → fallback QT ปัจจุบัน) · ติดลบในบิล
//   2. ส่วนลดพิเศษ — DeliveryNote.discount (+ discountNote)
// LF เก็บ "จำนวนชิ้นเคลม" (col5_factoryClaimApproved) = ที่มาเชิงกายภาพ ไม่ใช่เงิน → แสดงเป็น reference
// WB/IV = สร้างจาก SD → ส่วนลดไหลผ่าน lineItems (by_date/by_total mode เคลมถูก net เข้ายอดรวม)
//   ดังนั้น "ยอดจริง" คำนวณจาก SD (source of truth) แล้วไล่รอยว่า SD นั้นถูกวางบิล (WB) + ออกใบกำกับ (IV) แล้วหรือยัง

import type { DeliveryNote, BillingStatement, TaxInvoice, LinenForm, Quotation } from '@/types'
import { buildPriceMapFromQT } from './utils'

/** ส่วนลด/ชดเชย 1 รายการ = SD 1 ใบ ที่มีเคลม/ส่วนลด พร้อมรอยไล่ไป WB/IV */
export interface DiscountEntry {
  dnId: string
  dnNumber: string
  customerId: string
  date: string          // วันที่ SD (ISO)
  month: string         // YYYY-MM (จากวันที่ SD)
  claimValue: number    // ชดเชยเคลม (เงิน) = Σ isClaim qty × ราคา
  claimPieces: number   // จำนวนชิ้นเคลมใน SD (Σ isClaim qty)
  specialDiscount: number  // ส่วนลดพิเศษ (DeliveryNote.discount)
  discountNote: string  // หมายเหตุส่วนลดพิเศษ
  total: number         // claimValue + specialDiscount
  lfClaimPieces: number // จำนวนชิ้นเคลม approved จาก LF ที่ผูก (col5) — ที่มา/อ้างอิง
  // ── รอยไล่เอกสาร (เป็นยอดเดียวกันที่ไหลต่อ ไม่ใช่ยอดใหม่) ──
  wbId: string
  wbNumber: string      // '' = ยังไม่วางบิล
  ivId: string
  ivNumber: string      // '' = ยังไม่ออกใบกำกับ
  billed: boolean       // มี WB ผูก (ส่วนลดถึงชั้นวางบิลแล้ว)
}

/** สรุปส่วนลด/ชดเชยต่อ ลูกค้า × เดือน */
export interface CustomerMonthDiscount {
  customerId: string
  month: string         // YYYY-MM
  entries: DiscountEntry[]
  claimValue: number
  specialDiscount: number
  total: number
  sdCount: number
  claimPieces: number
  lfClaimPieces: number
  unbilledCount: number // SD ที่มีส่วนลด แต่ยังไม่วางบิล (= ส่วนลดยังไม่ถึงบิล → ต้องตรวจ)
}

/** ราคา/หน่วยที่ใช้คิดมูลค่าเคลม: priceSnapshot ของ SD (ล็อค ณ วันสร้าง) → fallback QT ปัจจุบัน */
function priceMapForDN(dn: DeliveryNote, quotations: Quotation[]): Record<string, number> {
  if (dn.priceSnapshot && Object.keys(dn.priceSnapshot).length > 0) return dn.priceSnapshot
  return buildPriceMapFromQT(dn.customerId, quotations)
}

/**
 * รวมส่วนลด/ชดเชยจาก SD ทุกใบ (source of truth) + ไล่รอยไป WB/IV + อ้างอิงจำนวนชิ้นเคลมจาก LF
 * คืนเฉพาะ SD ที่มี total > 0 (มีเคลมหรือส่วนลดพิเศษ)
 */
export function buildDiscountEntries(
  deliveryNotes: DeliveryNote[],
  billingStatements: BillingStatement[],
  taxInvoices: TaxInvoice[],
  linenForms: LinenForm[],
  quotations: Quotation[],
): DiscountEntry[] {
  // dnId → WB ที่วางบิลใบนี้ (SD 1 ใบควรอยู่ใน WB เดียว)
  const wbByDnId = new Map<string, BillingStatement>()
  for (const wb of billingStatements) {
    for (const dnId of wb.deliveryNoteIds) {
      if (!wbByDnId.has(dnId)) wbByDnId.set(dnId, wb)
    }
  }
  // wbId → IV
  const ivByWbId = new Map<string, TaxInvoice>()
  for (const iv of taxInvoices) {
    if (!ivByWbId.has(iv.billingStatementId)) ivByWbId.set(iv.billingStatementId, iv)
  }
  const lfById = new Map<string, LinenForm>(linenForms.map(lf => [lf.id, lf]))

  const out: DiscountEntry[] = []
  for (const dn of deliveryNotes) {
    const priceMap = priceMapForDN(dn, quotations)
    let claimValue = 0, claimPieces = 0
    for (const item of dn.items) {
      if (!item.isClaim) continue
      const price = item.isAdhoc ? (item.adhocPrice || 0) : (priceMap[item.code] || 0)
      claimValue += item.quantity * price
      claimPieces += item.quantity
    }
    const specialDiscount = dn.discount || 0
    const total = claimValue + specialDiscount
    if (total <= 0) continue   // ไม่มีส่วนลด/ชดเชย

    // จำนวนชิ้นเคลม approved จาก LF ที่ผูก (อ้างอิงที่มา)
    let lfClaimPieces = 0
    for (const lfId of dn.linenFormIds) {
      const lf = lfById.get(lfId)
      if (!lf) continue
      for (const r of lf.rows) lfClaimPieces += r.col5_factoryClaimApproved || 0
    }

    const wb = wbByDnId.get(dn.id)
    const iv = wb ? ivByWbId.get(wb.id) : undefined

    out.push({
      dnId: dn.id,
      dnNumber: dn.noteNumber,
      customerId: dn.customerId,
      date: dn.date,
      month: (dn.date || '').slice(0, 7),
      claimValue,
      claimPieces,
      specialDiscount,
      discountNote: dn.discountNote || '',
      total,
      lfClaimPieces,
      wbId: wb?.id || '',
      wbNumber: wb?.billingNumber || '',
      ivId: iv?.id || '',
      ivNumber: iv?.invoiceNumber || '',
      billed: !!wb,
    })
  }
  return out
}

/** จัดกลุ่มเป็น ลูกค้า × เดือน + รวมยอด */
export function groupDiscountByCustomerMonth(entries: DiscountEntry[]): CustomerMonthDiscount[] {
  const by = new Map<string, CustomerMonthDiscount>()
  for (const e of entries) {
    const key = `${e.customerId}|${e.month}`
    let g = by.get(key)
    if (!g) {
      g = { customerId: e.customerId, month: e.month, entries: [], claimValue: 0, specialDiscount: 0, total: 0, sdCount: 0, claimPieces: 0, lfClaimPieces: 0, unbilledCount: 0 }
      by.set(key, g)
    }
    g.entries.push(e)
    g.claimValue += e.claimValue
    g.specialDiscount += e.specialDiscount
    g.total += e.total
    g.claimPieces += e.claimPieces
    g.lfClaimPieces += e.lfClaimPieces
    g.sdCount += 1
    if (!e.billed) g.unbilledCount += 1
  }
  // เรียงรายการในกลุ่มตามวันที่
  for (const g of by.values()) g.entries.sort((a, b) => a.date.localeCompare(b.date) || a.dnNumber.localeCompare(b.dnNumber))
  return [...by.values()]
}
