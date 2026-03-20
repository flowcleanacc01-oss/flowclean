import { describe, it, expect } from 'vitest'
import { calculateTransportFeeTrip, calculateTransportFeeMonth, calculateDNSubtotal } from '@/lib/transport-fee'
import type { Customer, DeliveryNote } from '@/types'

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1', customerCode: 'HT0001', customerType: 'hotel', shortName: '',
    name: 'Test Hotel', nameEn: 'Test Hotel', address: '', taxId: '', branch: '',
    contactName: '', contactPhone: '', contactEmail: '',
    creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0,
    minPerTrip: 0, selectedBankAccountId: '',
    enablePerPiece: true, enableMinPerTrip: false, enableWaive: false,
    minPerTripThreshold: 0, enableMinPerMonth: false,
    enabledItems: ['B/T', 'B/H'], priceList: [{ code: 'B/T', price: 8 }, { code: 'B/H', price: 5 }],
    priceHistory: [], notes: '', createdAt: '2026-01-01', isActive: true,
    ...overrides,
  }
}

function makeDN(overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn-1', noteNumber: 'SD-1', customerId: 'cust-1', linenFormIds: [],
    date: '2026-03-15', items: [], driverName: '', vehiclePlate: '', receiverName: '',
    status: 'pending', isPrinted: false, isBilled: false,
    transportFeeTrip: 0, transportFeeMonth: 0,
    notes: '', createdBy: 'user-1', updatedAt: '2026-03-15',
    ...overrides,
  }
}

// ============================================================
// ตัวอย่างที่ 1-7 จากพี่จ๊อบ
// ============================================================
describe('Transport Fee Per Trip (ค่ารถ ครั้ง)', () => {
  // ตัวอย่าง 1: subtotal=450, waive=450 → เวฟให้ (450 >= 450)
  it('example 1: subtotal=450 >= waiveThreshold=450 → no fee (waived)', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: true, minPerTripThreshold: 450 })
    expect(calculateTransportFeeTrip(450, customer)).toBe(0)
  })

  // ตัวอย่าง 2: subtotal=475, waive=450 → เวฟให้ (475 >= 450)
  it('example 2: subtotal=475 >= waiveThreshold=450 → no fee (waived)', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: true, minPerTripThreshold: 450 })
    expect(calculateTransportFeeTrip(475, customer)).toBe(0)
  })

  // ตัวอย่าง 3: subtotal=449, waive=450 → เข้าเงื่อนไขขั้นต่ำ → fee=51
  it('example 3: subtotal=449 < waiveThreshold=450 → fee=51', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: true, minPerTripThreshold: 450 })
    expect(calculateTransportFeeTrip(449, customer)).toBe(51)
  })

  // ตัวอย่าง 4: subtotal=501, waive=450 → ไม่เข้าเงื่อนไข (501 >= 500)
  it('example 4: subtotal=501 >= minPerTrip=500 → no fee', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: true, minPerTripThreshold: 450 })
    expect(calculateTransportFeeTrip(501, customer)).toBe(0)
  })

  // ตัวอย่าง 5: waive disabled, subtotal=449 → fee=51
  it('example 5: waive disabled, subtotal=449 → fee=51', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: false, minPerTripThreshold: 0 })
    expect(calculateTransportFeeTrip(449, customer)).toBe(51)
  })

  // ตัวอย่าง 6: waive disabled (threshold=450 but ignored), subtotal=449 → fee=51
  it('example 6: waive disabled even with threshold=450, subtotal=449 → fee=51', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: false, minPerTripThreshold: 450 })
    expect(calculateTransportFeeTrip(449, customer)).toBe(51)
  })

  // ตัวอย่าง 7: waive disabled (threshold=500), subtotal=449 → fee=51
  it('example 7: waive disabled even with threshold=500, subtotal=449 → fee=51', () => {
    const customer = makeCustomer({ enableMinPerTrip: true, minPerTrip: 500, enableWaive: false, minPerTripThreshold: 500 })
    expect(calculateTransportFeeTrip(449, customer)).toBe(51)
  })

  it('enableMinPerTrip=false → always 0', () => {
    const customer = makeCustomer({ enableMinPerTrip: false, minPerTrip: 500 })
    expect(calculateTransportFeeTrip(100, customer)).toBe(0)
  })
})

// ============================================================
// ตัวอย่างที่ 8 — ค่ารถ (เดือน)
// ============================================================
describe('Transport Fee Per Month (ค่ารถ เดือน)', () => {
  // ตัวอย่าง 8: monthTotal=5500, minPerMonth=6000 → monthFee=500
  it('example 8: monthTotal=5500 < 6000 → monthFee=500', () => {
    const customer = makeCustomer({ enableMinPerMonth: true, monthlyFlatRate: 6000 })
    // 10 existing DNs each with subtotal=500 + tripFee=50 = 550 each → total 5500
    const existingDNs = Array.from({ length: 10 }, (_, i) => makeDN({
      id: `dn-${i}`,
      items: [{ code: 'B/T', quantity: 50, isClaim: false }], // 50*8=400 subtotal
      transportFeeTrip: 50,
    }))
    // Current DN: subtotal + tripFee already counted in monthTotal
    // monthTotal = existingDNs + currentDN = 5500
    // existingDNs: 10 * (400+50) = 4500 → wait, that doesn't add up
    // Let me simplify: make monthTotal = 5500
    // 11 DNs total: 10 existing with (500+0) each = 5000, current=500+0
    const simpleDNs = Array.from({ length: 10 }, (_, i) => makeDN({
      id: `dn-${i}`,
      items: [{ code: 'B/T', quantity: 62, isClaim: false }, { code: 'B/H', quantity: 4, isClaim: false }], // 62*8+4*5=516
      transportFeeTrip: 0,
    }))
    // Each DN subtotal = 62*8 + 4*5 = 516, 10 DNs = 5160
    // Current DN subtotal=300, tripFee=40 → monthTotal = 5160 + 300 + 40 = 5500
    const fee = calculateTransportFeeMonth(simpleDNs, customer, 300, 40)
    expect(fee).toBe(500)
  })

  it('enableMinPerMonth=false → always 0', () => {
    const customer = makeCustomer({ enableMinPerMonth: false, monthlyFlatRate: 6000 })
    expect(calculateTransportFeeMonth([], customer, 100, 0)).toBe(0)
  })

  it('monthTotal >= monthlyFlatRate → 0', () => {
    const customer = makeCustomer({ enableMinPerMonth: true, monthlyFlatRate: 1000 })
    expect(calculateTransportFeeMonth([], customer, 1000, 0)).toBe(0)
    expect(calculateTransportFeeMonth([], customer, 1001, 0)).toBe(0)
  })

  it('empty month → monthFee = monthlyFlatRate - currentDN', () => {
    const customer = makeCustomer({ enableMinPerMonth: true, monthlyFlatRate: 1000 })
    expect(calculateTransportFeeMonth([], customer, 300, 50)).toBe(650)
  })
})

// ============================================================
// calculateDNSubtotal
// ============================================================
describe('calculateDNSubtotal', () => {
  it('calculates item subtotal correctly', () => {
    const customer = makeCustomer()
    const dn = makeDN({ items: [{ code: 'B/T', quantity: 10, isClaim: false }, { code: 'B/H', quantity: 5, isClaim: false }] })
    expect(calculateDNSubtotal(dn, customer)).toBe(10 * 8 + 5 * 5) // 105
  })

  it('excludes claim items', () => {
    const customer = makeCustomer()
    const dn = makeDN({ items: [{ code: 'B/T', quantity: 10, isClaim: false }, { code: 'B/H', quantity: 5, isClaim: true }] })
    expect(calculateDNSubtotal(dn, customer)).toBe(80) // only B/T
  })
})
