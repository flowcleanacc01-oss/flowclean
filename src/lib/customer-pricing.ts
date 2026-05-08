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
import type { Quotation } from '@/types'

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
