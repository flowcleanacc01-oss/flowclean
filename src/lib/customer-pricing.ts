/**
 * 226.B — Customer pricing/items helpers (QT = single source of truth)
 *
 * ทำหน้าที่แทนที่ legacy fallback เดิม:
 *   ❌ customer.enabledItems → ✅ getCustomerEnabledCodes(customerId, quotations)
 *   ❌ customer.priceList    → ✅ getCustomerPriceMap(customerId, quotations)
 *
 * Pattern: หา accepted QT ล่าสุดของลูกค้า → ดึง items + prices
 * ถ้าไม่มี accepted QT → return empty (caller ต้อง handle UX เช่น "กรุณาสร้าง QT ก่อน")
 */
import type { Customer, Quotation } from '@/types'

/**
 * 237 — True flat-rate (เหมาเดือน, ไม่มีราคา/ชิ้น)
 *
 * = ลูกค้าที่ "ไม่คิดตามหน่วย" + "เหมาเดือน"
 *   → billing ใช้ monthlyFlatRate ตรงๆ ไม่มีราคา/ชิ้นให้เทียบ
 *   → audit/analytics ตัดออก (ไม่มีอะไรให้ audit)
 *
 * ⚠️ ห้ามสับสนกับ "per-piece + min/month floor":
 *   `enablePerPiece + enableMinPerMonth` = คิดตามชิ้นปกติ + มี floor เดือน
 *   → ยังเป็น per-piece, ไม่ใช่ flat-rate, ต้อง audit ราคา/ชิ้นปกติ
 */
export function isFlatRateCustomer(
  c: Pick<Customer, 'enablePerPiece' | 'enableMinPerMonth'>
): boolean {
  return !(c.enablePerPiece ?? true) && (c.enableMinPerMonth ?? false)
}

/** หา accepted QT ล่าสุดของลูกค้า (ตาม date desc) */
export function getLatestAcceptedQT(customerId: string, quotations: Quotation[]): Quotation | null {
  if (!customerId) return null
  let latest: Quotation | null = null
  for (const q of quotations) {
    if (q.customerId !== customerId) continue
    if (q.status !== 'accepted') continue
    if (!latest || q.date > latest.date) latest = q
  }
  return latest
}

/** Codes ที่ enabled สำหรับลูกค้า (จาก accepted QT) */
export function getCustomerEnabledCodes(customerId: string, quotations: Quotation[]): string[] {
  const qt = getLatestAcceptedQT(customerId, quotations)
  if (!qt) return []
  return qt.items.map(i => i.code)
}

/** Price map { code: price } สำหรับลูกค้า (จาก accepted QT) */
export function getCustomerPriceMap(customerId: string, quotations: Quotation[]): Record<string, number> {
  const qt = getLatestAcceptedQT(customerId, quotations)
  if (!qt) return {}
  return Object.fromEntries(qt.items.map(i => [i.code, i.pricePerUnit]))
}
