import type { Customer, DeliveryNote } from '@/types'

/**
 * Calculate DN item subtotal (before VAT, excluding transport fees)
 */
export function calculateDNSubtotal(dn: DeliveryNote, customer: Customer): number {
  const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  return dn.items.reduce((sum, item) => {
    if (item.isClaim) return sum
    return sum + item.quantity * (priceMap[item.code] || 0)
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
): number {
  if (!customer.enableMinPerMonth) return 0

  // Sum existing DNs (excluding any existing month fee — we're recalculating)
  const existingTotal = allDNsForMonth.reduce((sum, dn) => {
    const itemSubtotal = calculateDNSubtotal(dn, customer)
    return sum + itemSubtotal + (dn.transportFeeTrip || 0)
  }, 0)

  const monthTotal = existingTotal + currentDNSubtotal + currentDNTripFee
  if (monthTotal >= customer.monthlyFlatRate) return 0
  return Math.max(0, customer.monthlyFlatRate - monthTotal)
}
