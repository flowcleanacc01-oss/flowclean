import type { Customer, DeliveryNote, BillingLineItem, LinenItemDef } from '@/types'

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
      qtyMap[item.code] = (qtyMap[item.code] || 0) + item.quantity
    }
  }

  const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))

  return Object.entries(qtyMap)
    .filter(([, qty]) => qty > 0)
    .map(([code, quantity]) => {
      const pricePerUnit = priceMap[code] ?? 0
      return {
        code,
        name: itemNameMap[code] || code,
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
