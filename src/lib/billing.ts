import type { Customer, DeliveryNote, BillingLineItem, LinenItemDef, QuotationItem } from '@/types'
import { formatDate } from './utils'

/**
 * Get the effective priceMap for a DN (226.B):
 * 1. DN.priceSnapshot (ล็อคราคา ณ วันสร้าง)
 * 2. fallback → qtItems (from current accepted QT)
 * — ลบ customer.priceList legacy fallback ออก (QT = single source of truth)
 */
function getDNPriceMap(
  note: DeliveryNote,
  fallbackPriceMap: Record<string, number>
): Record<string, number> {
  if (note.priceSnapshot && Object.keys(note.priceSnapshot).length > 0) {
    return note.priceSnapshot
  }
  return fallbackPriceMap
}

/**
 * Aggregate delivery note items into billing line items with pricing (by_item mode)
 * ราคาใช้จาก DN.priceSnapshot → ถ้าราคาเปลี่ยนกลางเดือน จะแยก line item ตาม tier
 */
export function aggregateDeliveryItems(
  notes: DeliveryNote[],
  _customer: Customer,
  catalog: LinenItemDef[] = [],
  qtItems?: QuotationItem[]
): BillingLineItem[] {
  // ใช้ชื่อจาก QT ถ้ามี, fallback ไป catalog
  const itemNameMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.name]))
    : Object.fromEntries(catalog.map(i => [i.code, i.name]))

  // 226.B: Fallback priceMap จาก QT only — legacy customer.priceList ตัดออก
  const fallbackPriceMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.pricePerUnit]))
    : {}

  // Feat 266: aggregate billable + claim แยก (claim = ส่วนลดทางบัญชี = negative line)
  // Aggregate by (code, price) — handles price changes mid-month
  // Layer 3: Ad-hoc items aggregate by (adhoc-{name}, price) แยกจาก code ปกติ
  type Tier = { code: string; qty: number; price: number; displayName?: string }
  const billableTierMap: Record<string, Tier> = {}
  const claimTierMap: Record<string, Tier> = {}
  for (const note of notes) {
    const pm = getDNPriceMap(note, fallbackPriceMap)
    for (const item of note.items) {
      let key: string, code: string, price: number, displayName: string | undefined
      if (item.isAdhoc) {
        const adhocName = item.adhocName || '(รายการพิเศษ)'
        price = item.adhocPrice ?? 0
        code = `ADHOC:${adhocName}`
        key = `${code}@${price}`
        displayName = adhocName
      } else {
        price = pm[item.code] ?? 0
        code = item.code
        key = `${code}@${price}`
      }
      const target = item.isClaim ? claimTierMap : billableTierMap
      if (!target[key]) target[key] = { code, qty: 0, price, displayName }
      target[key].qty += item.quantity
    }
  }

  // Check which codes have multiple price tiers (across billable+claim, same code)
  const codePriceCount: Record<string, number> = {}
  for (const t of [...Object.values(billableTierMap), ...Object.values(claimTierMap)]) {
    const seenKey = `${t.code}@${t.price}`
    codePriceCount[t.code] = (codePriceCount[t.code] || 0)
    // count distinct prices per code (across billable+claim)
    if (!codePriceCount[seenKey]) {
      codePriceCount[seenKey] = 1
      codePriceCount[t.code] += 1
    }
  }

  const billableLines: BillingLineItem[] = Object.values(billableTierMap)
    .filter(t => t.qty > 0)
    .map(t => {
      // Layer 3: Ad-hoc items ใช้ adhocName ตรงๆ ไม่อ้าง itemNameMap
      if (t.code.startsWith('ADHOC:')) {
        return {
          code: t.code,
          name: t.displayName || '(รายการพิเศษ)',
          quantity: t.qty,
          pricePerUnit: t.price,
          amount: t.qty * t.price,
        }
      }
      const hasTiers = codePriceCount[t.code] > 1
      const name = 'ค่าบริการซัก ' + (itemNameMap[t.code] || t.code)
        + (hasTiers ? ` (@${t.price.toLocaleString()})` : '')
      return {
        code: hasTiers ? `${t.code}@${t.price}` : t.code,
        name,
        quantity: t.qty,
        pricePerUnit: t.price,
        amount: t.qty * t.price,
      }
    })

  // Feat 266: claim → negative line "ส่วนลด {item} (เคลม)"
  const claimLines: BillingLineItem[] = Object.values(claimTierMap)
    .filter(t => t.qty > 0)
    .map(t => {
      if (t.code.startsWith('ADHOC:')) {
        return {
          code: `CLAIM:${t.code}`,
          name: 'ส่วนลด ' + (t.displayName || '(รายการพิเศษ)') + ' (เคลม)',
          quantity: t.qty,
          pricePerUnit: t.price,
          amount: -(t.qty * t.price),
        }
      }
      const hasTiers = codePriceCount[t.code] > 1
      const name = 'ส่วนลด ' + (itemNameMap[t.code] || t.code) + ' (เคลม)'
        + (hasTiers ? ` (@${t.price.toLocaleString()})` : '')
      return {
        code: `CLAIM:${hasTiers ? `${t.code}@${t.price}` : t.code}`,
        name,
        quantity: t.qty,
        pricePerUnit: t.price,
        amount: -(t.qty * t.price),
      }
    })

  const result: BillingLineItem[] = [...billableLines, ...claimLines]
    .sort((a, b) => {
      const orderSource = qtItems || catalog
      const isClaimA = a.code.startsWith('CLAIM:')
      const isClaimB = b.code.startsWith('CLAIM:')
      const aRaw = isClaimA ? a.code.slice('CLAIM:'.length) : a.code
      const bRaw = isClaimB ? b.code.slice('CLAIM:'.length) : b.code
      const aCode = aRaw.split('@')[0]
      const bCode = bRaw.split('@')[0]
      const aIdx = orderSource.findIndex(i => i.code === aCode)
      const bIdx = orderSource.findIndex(i => i.code === bCode)
      if (aIdx !== bIdx) return aIdx - bIdx
      if (a.pricePerUnit !== b.pricePerUnit) return a.pricePerUnit - b.pricePerUnit
      // same item+price: billable ก่อน claim (Feat 266)
      return (isClaimA ? 1 : 0) - (isClaimB ? 1 : 0)
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
 * Each DN uses its own priceSnapshot for correct historical pricing
 * 92.1.1: DN-level discount/extraCharge แยกออกมาเป็นบรรทัดต่างหาก
 * (ไม่ฝังใน DATE_xxx เพื่อให้ collapse ใน IV เห็นชัดเจน + consistent กับ by_item/by_total)
 */
export function aggregateDeliveryItemsByDate(
  notes: DeliveryNote[],
  _customer: Customer,
  qtItems?: QuotationItem[],
): BillingLineItem[] {
  // 226.B: priceMap จาก QT only — legacy customer.priceList ตัดออก
  const fallbackPriceMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.pricePerUnit]))
    : {}
  const result: BillingLineItem[] = []
  const sortedNotes = [...notes].sort((a, b) => a.date.localeCompare(b.date))

  let totalDiscount = 0
  let totalExtraCharge = 0
  const discountNotes: string[] = []
  const extraChargeNotes: string[] = []

  for (const note of sortedNotes) {
    const pm = getDNPriceMap(note, fallbackPriceMap)
    let total = 0
    for (const item of note.items) {
      // Feat 266: claim = discount (subtract)
      const amt = item.quantity * (pm[item.code] ?? 0)
      total += item.isClaim ? -amt : amt
    }
    // ค่ารถถูก add ไปใน SD แต่ละวันแล้ว → รวมใน DATE_xxx total
    total += note.transportFeeTrip || 0
    total += note.transportFeeMonth || 0
    // DN-level discount/extra → สะสมแยก ไม่ฝังใน DATE_xxx
    totalDiscount += note.discount || 0
    totalExtraCharge += note.extraCharge || 0
    if ((note.discount || 0) > 0 && note.discountNote) discountNotes.push(note.discountNote)
    if ((note.extraCharge || 0) > 0 && note.extraChargeNote) extraChargeNotes.push(note.extraChargeNote)

    result.push({
      code: `DATE_${note.id}`,
      name: `ค่าบริการซักวันที่ ${formatDate(note.date)}`,
      quantity: 1,
      pricePerUnit: total,
      amount: total,
    })
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
 * Aggregate delivery notes into single "ค่าบริการซักวันที่ X-Y" line (by_total mode, 66 + 76)
 * 85: ค่าบริการ + ค่ารถ รวมเป็น 1 บรรทัด, แต่ DN-level discount/extraCharge แยกออกมาเป็นบรรทัดต่างหาก
 * เพื่อให้ user เห็นการชี้แจงชัดเจนในใบวางบิล
 */
export function aggregateDeliveryItemsByTotal(
  notes: DeliveryNote[],
  _customer: Customer,
  qtItems?: QuotationItem[],
): BillingLineItem[] {
  // 226.B: priceMap จาก QT only — legacy customer.priceList ตัดออก
  const fallbackPriceMap = qtItems
    ? Object.fromEntries(qtItems.map(i => [i.code, i.pricePerUnit]))
    : {}

  let serviceTotal = 0
  let totalDiscount = 0
  let totalExtraCharge = 0
  const discountNotes: string[] = []
  const extraChargeNotes: string[] = []

  for (const note of notes) {
    const pm = getDNPriceMap(note, fallbackPriceMap)
    for (const item of note.items) {
      // Feat 266: claim = discount (subtract)
      const amt = item.quantity * (pm[item.code] ?? 0)
      serviceTotal += item.isClaim ? -amt : amt
    }
    serviceTotal += note.transportFeeTrip || 0
    serviceTotal += note.transportFeeMonth || 0
    totalDiscount += note.discount || 0
    totalExtraCharge += note.extraCharge || 0
    if ((note.discount || 0) > 0 && note.discountNote) discountNotes.push(note.discountNote)
    if ((note.extraCharge || 0) > 0 && note.extraChargeNote) extraChargeNotes.push(note.extraChargeNote)
  }

  // Date range label
  const sortedDates = notes.map(n => n.date).sort()
  const dateLabel = sortedDates.length === 0
    ? ''
    : sortedDates[0] === sortedDates[sortedDates.length - 1]
      ? formatDate(sortedDates[0])
      : `${formatDate(sortedDates[0])} - ${formatDate(sortedDates[sortedDates.length - 1])}`

  const result: BillingLineItem[] = []
  if (serviceTotal > 0) {
    result.push({
      code: 'SERVICE',
      name: `ค่าบริการซักวันที่ ${dateLabel}`,
      quantity: 1,
      pricePerUnit: serviceTotal,
      amount: serviceTotal,
    })
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
