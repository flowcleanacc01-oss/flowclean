import type { Customer, DeliveryNote, LinenForm } from '@/types'

/**
 * Operational date ของ DN — อิงกับ LF.date ล่าสุดที่ DN ผูกอยู่ (Feature 120)
 *
 * เหตุผล: LF = หลักฐานงานจริง, SD = paperwork ที่สร้างใหม่ได้
 * การจัดลำดับ "ใบสุดท้ายของเดือน" ควรอิง operational (LF) ไม่ใช่ paperwork (SD.date)
 *
 * Fallback → SD.date ในเคสพิเศษ:
 * - SD ไม่มี LF (linenFormIds ว่าง)
 * - LF ที่ผูกถูกลบหมด (orphaned linenFormIds)
 */
export function getOperationalDate(dn: DeliveryNote, linenForms: LinenForm[]): string {
  if (!dn.linenFormIds || dn.linenFormIds.length === 0) return dn.date
  const linked = linenForms.filter(lf => dn.linenFormIds.includes(lf.id))
  if (linked.length === 0) return dn.date
  return linked.reduce((max, lf) => (lf.date > max ? lf.date : max), linked[0].date)
}

/**
 * Comparator factory สำหรับเรียง DN "ใบสุดท้ายของเดือน" ก่อน (Feature 120)
 * - Operational date (max LF.date) desc เป็นหลัก
 * - noteNumber desc เป็น tiebreaker
 *
 * ใช้กับทุกจุดที่เลือก "ใบสุดท้ายของเดือน" สำหรับ month fee recalc
 */
export function createDNLastOfMonthCompare(linenForms: LinenForm[]) {
  return (a: DeliveryNote, b: DeliveryNote): number => {
    const aDate = getOperationalDate(a, linenForms)
    const bDate = getOperationalDate(b, linenForms)
    return bDate.localeCompare(aDate) || b.noteNumber.localeCompare(a.noteNumber)
  }
}

/**
 * Calculate DN item subtotal (before VAT, excluding transport fees)
 */
export function calculateDNSubtotal(dn: DeliveryNote, customer: Customer, priceMap?: Record<string, number>): number {
  const pm = priceMap ?? Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  return dn.items.reduce((sum, item) => {
    if (item.isClaim) return sum
    return sum + item.quantity * (pm[item.code] || 0)
  }, 0)
}

/**
 * Calculate transport fee per trip (ค่ารถ ครั้ง)
 *
 * Logic:
 * - subtotal >= minPerTrip → 0
 * - enableWaive AND subtotal >= waiveThreshold → 0 (เวฟให้)
 * - otherwise → minPerTrip - subtotal
 */
export function calculateTransportFeeTrip(
  dnSubtotal: number,
  customer: Customer
): number {
  if (!customer.enableMinPerTrip) return 0
  if (dnSubtotal >= customer.minPerTrip) return 0
  if (customer.enableWaive && customer.minPerTripThreshold > 0 && dnSubtotal >= customer.minPerTripThreshold) return 0
  return Math.max(0, customer.minPerTrip - dnSubtotal)
}

/**
 * Calculate transport fee per month (ค่ารถ เดือน)
 * Goes on the last DN of the month.
 *
 * monthTotal = sum of (item subtotal + transportFeeTrip) for all DNs in the month
 * If monthTotal < monthlyFlatRate → fee = monthlyFlatRate - monthTotal
 */
export function calculateTransportFeeMonth(
  allDNsForMonth: DeliveryNote[],
  customer: Customer,
  currentDNSubtotal: number,
  currentDNTripFee: number,
  priceMap?: Record<string, number>,
): number {
  if (!customer.enableMinPerMonth) return 0

  // Sum existing DNs (excluding any existing month fee — we're recalculating)
  const existingTotal = allDNsForMonth.reduce((sum, dn) => {
    const itemSubtotal = calculateDNSubtotal(dn, customer, priceMap)
    return sum + itemSubtotal + (dn.transportFeeTrip || 0)
  }, 0)

  const monthTotal = existingTotal + currentDNSubtotal + currentDNTripFee
  if (monthTotal >= customer.monthlyFlatRate) return 0
  return Math.max(0, customer.monthlyFlatRate - monthTotal)
}
