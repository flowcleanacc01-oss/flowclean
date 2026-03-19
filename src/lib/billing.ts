import type { Customer, DeliveryNote, BillingLineItem, LinenItemDef } from '@/types'
import { formatDate } from './utils'

/**
 * Aggregate delivery note items into billing line items with pricing
 */
export function aggregateDeliveryItems(
  notes: DeliveryNote[],
  customer: Customer,
  catalog: LinenItemDef[] = []
): BillingLineItem[] {
  const itemNameMap = Object.fromEntries(catalog.map(i => [i.code, i.name]))
  const qtyMap: Record<string, number> = {}

  for (const note of notes) {
    for (const item of note.items) {
      if (item.isClaim) continue // Claim items are free — skip for billing
      qtyMap[item.code] = (qtyMap[item.code] || 0) + item.quantity
    }
  }

  const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))

  const result = Object.entries(qtyMap)
    .filter(([, qty]) => qty > 0)
    .map(([code, quantity]) => {
      const pricePerUnit = priceMap[code] ?? 0
      return {
        code,
        name: 'ค่าบริการซัก ' + (itemNameMap[code] || code),
        quantity,
        pricePerUnit,
        amount: quantity * pricePerUnit,
      }
    })
    .sort((a, b) => {
      const aIdx = catalog.findIndex(i => i.code === a.code)
      const bIdx = catalog.findIndex(i => i.code === b.code)
      return aIdx - bIdx
    })

  // Aggregate transport fees from delivery notes
  let totalTransportTrip = 0
  let totalTransportMonth = 0
  for (const note of notes) {
    totalTransportTrip += note.transportFeeTrip || 0
    totalTransportMonth += note.transportFeeMonth || 0
  }
  if (totalTransportTrip > 0) {
    result.push({
      code: 'TRANSPORT_TRIP',
      name: 'ค่ารถ (ครั้ง)',
      quantity: 1,
      pricePerUnit: totalTransportTrip,
      amount: totalTransportTrip,
    })
  }
  if (totalTransportMonth > 0) {
    result.push({
      code: 'TRANSPORT_MONTH',
      name: 'ค่ารถ (เดือน)',
      quantity: 1,
      pricePerUnit: totalTransportMonth,
      amount: totalTransportMonth,
    })
  }

  return result
}

/**
 * Aggregate delivery notes into billing line items grouped by DN (by_date mode)
 * Each DN = one line: "ค่าบริการซักวันที่ {date}" with total = item costs + transport fees
 * Transport fees (trip + month) are embedded in each DN's total — no separate rows.
 */
export function aggregateDeliveryItemsByDate(
  notes: DeliveryNote[],
  customer: Customer,
): BillingLineItem[] {
  const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  const result: BillingLineItem[] = []

  for (const note of notes) {
    let total = 0
    for (const item of note.items) {
      if (item.isClaim) continue
      total += item.quantity * (priceMap[item.code] ?? 0)
    }
    // Include transport fees in each DN's total (trip fee per trip; month fee on last DN)
    total += note.transportFeeTrip || 0
    total += note.transportFeeMonth || 0
    result.push({
      code: `DATE_${note.id}`,  // use id for uniqueness (avoids duplicate-key bug on same-date DNs)
      name: `ค่าบริการซักวันที่ ${formatDate(note.date)}`,
      quantity: 1,
      pricePerUnit: total,
      amount: total,
    })
  }

  return result
}

/**
 * Calculate billing totals from line items
 */
export function calculateBillingTotals(lineItems: BillingLineItem[]) {
  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0)
  const vat = Math.round(subtotal * 0.07 * 100) / 100
  const grandTotal = Math.round((subtotal + vat) * 100) / 100
  const withholdingTax = Math.round(subtotal * 0.03 * 100) / 100
  const netPayable = Math.round((grandTotal - withholdingTax) * 100) / 100

  return { subtotal, vat, grandTotal, withholdingTax, netPayable }
}

/**
 * For flat-rate billing
 */
export function createFlatRateBilling(customer: Customer, month: string): {
  lineItems: BillingLineItem[]
  subtotal: number
  vat: number
  grandTotal: number
  withholdingTax: number
  netPayable: number
} {
  const lineItems: BillingLineItem[] = [{
    code: 'FLAT',
    name: `ค่าบริการซักรีดรายเดือน (${month})`,
    quantity: 1,
    pricePerUnit: customer.monthlyFlatRate,
    amount: customer.monthlyFlatRate,
  }]

  return { lineItems, ...calculateBillingTotals(lineItems) }
}
