import type { Customer, DeliveryNote, BillingLineItem, LinenItemDef, QuotationItem } from '@/types'
import { formatDate } from './utils'

/**
 * Aggregate delivery note items into billing line items with pricing
 * ถ้ามี qtItems → ใช้ชื่อ + ลำดับจาก QT, fallback ไป catalog
 */
export function aggregateDeliveryItems(
  notes: DeliveryNote[],
  customer: Customer,
  catalog: LinenItemDef[] = [],
  qtItems?: QuotationItem[]
): BillingLineItem[] {
  // ใช้ชื่อจาก QT ถ้ามี, fallback ไป catalog
  const itemNameMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.name]))
    : Object.fromEntries(catalog.map(i => [i.code, i.name]))
  const qtyMap: Record<string, number> = {}

  for (const note of notes) {
    for (const item of note.items) {
      if (item.isClaim) continue // Claim items are free — skip for billing
      qtyMap[item.code] = (qtyMap[item.code] || 0) + item.quantity
    }
  }

  const priceMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.pricePerUnit]))
    : Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))

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
      // เรียงตาม QT order ถ้ามี, fallback ไป catalog order
      const orderSource = qtItems || catalog
      const aIdx = orderSource.findIndex(i => i.code === a.code)
      const bIdx = orderSource.findIndex(i => i.code === b.code)
      return aIdx - bIdx
    })

  // Aggregate transport fees + adjustments from delivery notes
  let totalTransportTrip = 0
  let totalTransportMonth = 0
  let totalDiscount = 0
  let totalExtraCharge = 0
  const discountNotes: string[] = []
  const extraChargeNotes: string[] = []
  for (const note of notes) {
    totalTransportTrip += note.transportFeeTrip || 0
    totalTransportMonth += note.transportFeeMonth || 0
    totalDiscount += note.discount || 0
    totalExtraCharge += note.extraCharge || 0
    if ((note.discount || 0) > 0 && note.discountNote) discountNotes.push(note.discountNote)
    if ((note.extraCharge || 0) > 0 && note.extraChargeNote) extraChargeNotes.push(note.extraChargeNote)
  }
  if (totalTransportTrip > 0) {
    result.push({ code: 'TRANSPORT_TRIP', name: 'ค่ารถ (ครั้ง)', quantity: 1, pricePerUnit: totalTransportTrip, amount: totalTransportTrip })
  }
  if (totalTransportMonth > 0) {
    result.push({ code: 'TRANSPORT_MONTH', name: 'ค่ารถ (เดือน)', quantity: 1, pricePerUnit: totalTransportMonth, amount: totalTransportMonth })
  }
  if (totalExtraCharge > 0) {
    const note = extraChargeNotes.length > 0 ? ` (${extraChargeNotes.join(', ')})` : ''
    result.push({ code: 'EXTRA_CHARGE', name: `ค่าใช้จ่ายเพิ่มเติม${note}`, quantity: 1, pricePerUnit: totalExtraCharge, amount: totalExtraCharge })
  }
  if (totalDiscount > 0) {
    const note = discountNotes.length > 0 ? ` (${discountNotes.join(', ')})` : ''
    result.push({ code: 'DISCOUNT', name: `ส่วนลด${note}`, quantity: 1, pricePerUnit: -totalDiscount, amount: -totalDiscount })
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
  qtItems?: QuotationItem[],
): BillingLineItem[] {
  const priceMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.pricePerUnit]))
    : Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  const result: BillingLineItem[] = []
  const sortedNotes = [...notes].sort((a, b) => a.date.localeCompare(b.date))

  for (const note of sortedNotes) {
    let total = 0
    for (const item of note.items) {
      if (item.isClaim) continue
      total += item.quantity * (priceMap[item.code] ?? 0)
    }
    // Include transport fees + adjustments in each DN's total
    total += note.transportFeeTrip || 0
    total += note.transportFeeMonth || 0
    total += note.extraCharge || 0
    total -= note.discount || 0
    const adjNotes: string[] = []
    if ((note.extraCharge || 0) > 0 && note.extraChargeNote) adjNotes.push(`+${note.extraChargeNote}`)
    if ((note.discount || 0) > 0 && note.discountNote) adjNotes.push(`-${note.discountNote}`)
    const nameSuffix = adjNotes.length > 0 ? ` [${adjNotes.join(', ')}]` : ''
    result.push({
      code: `DATE_${note.id}`,  // use id for uniqueness (avoids duplicate-key bug on same-date DNs)
      name: `ค่าบริการซักวันที่ ${formatDate(note.date)}${nameSuffix}`,
      quantity: 1,
      pricePerUnit: total,
      amount: total,
    })
  }

  return result
}

/**
 * Calculate billing totals from line items
 * vatRate / whtRate: percent (e.g. 7, 3). Pass 0 to disable.
 */
export function calculateBillingTotals(lineItems: BillingLineItem[], vatRate = 7, whtRate = 3) {
  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0)
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100
  const grandTotal = Math.round((subtotal + vat) * 100) / 100
  const withholdingTax = Math.round(subtotal * (whtRate / 100) * 100) / 100
  const netPayable = Math.round((grandTotal - withholdingTax) * 100) / 100

  return { subtotal, vat, grandTotal, withholdingTax, netPayable }
}

/**
 * For flat-rate billing
 */
export function createFlatRateBilling(customer: Customer, month: string, vatRate = 7, whtRate = 3): {
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

  return { lineItems, ...calculateBillingTotals(lineItems, vatRate, whtRate) }
}
