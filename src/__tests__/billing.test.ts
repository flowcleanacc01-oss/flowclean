import { describe, it, expect } from 'vitest'
import { aggregateDeliveryItems, calculateBillingTotals, createFlatRateBilling } from '@/lib/billing'
import type { Customer, DeliveryNote, LinenItemDef, BillingLineItem } from '@/types'

// ============================================================
// Test Helpers
// ============================================================
function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    customerCode: 'HT0001',
    customerType: 'hotel',
    name: 'Test Hotel',
    nameEn: 'Test Hotel',
    address: '123 Test',
    taxId: '1234567890123',
    branch: 'head',
    contactName: 'John',
    contactPhone: '0812345678',
    contactEmail: 'test@test.com',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
    enablePerPiece: true, enableMinPerTrip: false, enableWaive: false, minPerTripThreshold: 0, enableMinPerMonth: false,
    enabledItems: ['B/T', 'B/H', 'P/C', 'S/K'],
    priceList: [
      { code: 'B/T', price: 8 },
      { code: 'B/H', price: 5 },
      { code: 'P/C', price: 5 },
      { code: 'S/K', price: 12 },
    ],
    priceHistory: [],
    notes: '',
    createdAt: '2026-01-01',
    isActive: true,
    ...overrides,
  }
}

function makeDeliveryNote(overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn-1',
    noteNumber: 'SD-20260301-001',
    customerId: 'cust-1',
    linenFormIds: ['lf-1'],
    date: '2026-03-01',
    items: [],
    driverName: 'Driver',
    vehiclePlate: 'ABC-1234',
    receiverName: 'Receiver',
    status: 'delivered',
    notes: '',
    createdBy: 'user-1',
    updatedAt: '2026-03-01',
    ...overrides,
  }
}

const CATALOG: LinenItemDef[] = [
  { code: 'B/T', name: 'Bath Towel', nameEn: 'Bath Towel', category: 'towel', unit: 'pcs', defaultPrice: 8, sortOrder: 1 },
  { code: 'B/H', name: 'Hand Towel', nameEn: 'Hand Towel', category: 'towel', unit: 'pcs', defaultPrice: 5, sortOrder: 2 },
  { code: 'P/C', name: 'Pillow Case', nameEn: 'Pillow Case', category: 'other', unit: 'pcs', defaultPrice: 5, sortOrder: 3 },
  { code: 'S/K', name: 'Bed Sheet 6ft', nameEn: 'Bed Sheet 6ft', category: 'bedsheet', unit: 'pcs', defaultPrice: 12, sortOrder: 4 },
]

// ============================================================
// Unit Tests: aggregateDeliveryItems
// ============================================================
describe('aggregateDeliveryItems', () => {
  it('aggregates items from single delivery note', () => {
    const customer = makeCustomer()
    const notes = [
      makeDeliveryNote({
        items: [
          { code: 'B/T', quantity: 100, isClaim: false },
          { code: 'B/H', quantity: 50, isClaim: false },
        ],
      }),
    ]

    const result = aggregateDeliveryItems(notes, customer, CATALOG)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ code: 'B/T', name: 'Bath Towel', quantity: 100, pricePerUnit: 8, amount: 800 })
    expect(result[1]).toEqual({ code: 'B/H', name: 'Hand Towel', quantity: 50, pricePerUnit: 5, amount: 250 })
  })

  it('aggregates items from multiple delivery notes', () => {
    const customer = makeCustomer()
    const notes = [
      makeDeliveryNote({
        id: 'dn-1',
        items: [
          { code: 'B/T', quantity: 100, isClaim: false },
          { code: 'P/C', quantity: 30, isClaim: false },
        ],
      }),
      makeDeliveryNote({
        id: 'dn-2',
        items: [
          { code: 'B/T', quantity: 50, isClaim: false },
          { code: 'S/K', quantity: 20, isClaim: false },
        ],
      }),
    ]

    const result = aggregateDeliveryItems(notes, customer, CATALOG)

    expect(result).toHaveLength(3)
    const bt = result.find(r => r.code === 'B/T')!
    expect(bt.quantity).toBe(150) // 100 + 50
    expect(bt.amount).toBe(1200) // 150 * 8

    const pc = result.find(r => r.code === 'P/C')!
    expect(pc.quantity).toBe(30)
    expect(pc.amount).toBe(150) // 30 * 5

    const sk = result.find(r => r.code === 'S/K')!
    expect(sk.quantity).toBe(20)
    expect(sk.amount).toBe(240) // 20 * 12
  })

  it('excludes claim items (isClaim = true)', () => {
    const customer = makeCustomer()
    const notes = [
      makeDeliveryNote({
        items: [
          { code: 'B/T', quantity: 100, isClaim: false },
          { code: 'B/T', quantity: 10, isClaim: true }, // claim — should be excluded
          { code: 'P/C', quantity: 20, isClaim: true },  // all claim — should not appear
        ],
      }),
    ]

    const result = aggregateDeliveryItems(notes, customer, CATALOG)

    expect(result).toHaveLength(1) // Only B/T non-claim
    expect(result[0].code).toBe('B/T')
    expect(result[0].quantity).toBe(100)
    expect(result[0].amount).toBe(800)
  })

  it('uses price 0 for items not in customer priceList', () => {
    const customer = makeCustomer({ priceList: [{ code: 'B/T', price: 8 }] }) // only B/T has price
    const notes = [
      makeDeliveryNote({
        items: [
          { code: 'B/T', quantity: 10, isClaim: false },
          { code: 'S/K', quantity: 5, isClaim: false }, // S/K not in priceList
        ],
      }),
    ]

    const result = aggregateDeliveryItems(notes, customer, CATALOG)

    const sk = result.find(r => r.code === 'S/K')!
    expect(sk.pricePerUnit).toBe(0)
    expect(sk.amount).toBe(0) // 5 * 0
  })

  it('returns empty array when no delivery notes', () => {
    const customer = makeCustomer()
    const result = aggregateDeliveryItems([], customer, CATALOG)
    expect(result).toEqual([])
  })

  it('returns empty array when all items are claims', () => {
    const customer = makeCustomer()
    const notes = [
      makeDeliveryNote({
        items: [
          { code: 'B/T', quantity: 10, isClaim: true },
          { code: 'B/H', quantity: 5, isClaim: true },
        ],
      }),
    ]

    const result = aggregateDeliveryItems(notes, customer, CATALOG)
    expect(result).toEqual([])
  })

  it('sorts results by catalog sortOrder', () => {
    const customer = makeCustomer()
    const notes = [
      makeDeliveryNote({
        items: [
          { code: 'S/K', quantity: 10, isClaim: false }, // sortOrder 4
          { code: 'B/T', quantity: 20, isClaim: false }, // sortOrder 1
          { code: 'P/C', quantity: 5, isClaim: false },  // sortOrder 3
        ],
      }),
    ]

    const result = aggregateDeliveryItems(notes, customer, CATALOG)

    expect(result[0].code).toBe('B/T')  // sortOrder 1
    expect(result[1].code).toBe('P/C')  // sortOrder 3
    expect(result[2].code).toBe('S/K')  // sortOrder 4
  })
})

// ============================================================
// Unit Tests: calculateBillingTotals
// ============================================================
describe('calculateBillingTotals', () => {
  it('calculates VAT 7%, withholding 3%, netPayable correctly', () => {
    const lineItems: BillingLineItem[] = [
      { code: 'B/T', name: 'Bath Towel', quantity: 100, pricePerUnit: 8, amount: 800 },
      { code: 'P/C', name: 'Pillow Case', quantity: 50, pricePerUnit: 5, amount: 250 },
    ]

    const result = calculateBillingTotals(lineItems)

    expect(result.subtotal).toBe(1050)
    expect(result.vat).toBe(73.5) // 1050 * 0.07
    expect(result.grandTotal).toBe(1123.5) // 1050 + 73.5
    expect(result.withholdingTax).toBe(31.5) // 1050 * 0.03
    expect(result.netPayable).toBe(1092) // 1123.5 - 31.5
  })

  it('handles zero subtotal', () => {
    const result = calculateBillingTotals([])

    expect(result.subtotal).toBe(0)
    expect(result.vat).toBe(0)
    expect(result.grandTotal).toBe(0)
    expect(result.withholdingTax).toBe(0)
    expect(result.netPayable).toBe(0)
  })

  it('handles single item', () => {
    const lineItems: BillingLineItem[] = [
      { code: 'B/T', name: 'Bath Towel', quantity: 1, pricePerUnit: 100, amount: 100 },
    ]

    const result = calculateBillingTotals(lineItems)

    expect(result.subtotal).toBe(100)
    expect(result.vat).toBe(7)
    expect(result.grandTotal).toBe(107)
    expect(result.withholdingTax).toBe(3)
    expect(result.netPayable).toBe(104)
  })

  it('rounds to 2 decimal places', () => {
    // Subtotal = 333 => VAT = 23.31, grandTotal = 356.31, WHT = 9.99, net = 346.32
    const lineItems: BillingLineItem[] = [
      { code: 'B/T', name: 'Bath Towel', quantity: 333, pricePerUnit: 1, amount: 333 },
    ]

    const result = calculateBillingTotals(lineItems)

    expect(result.vat).toBe(23.31)
    expect(result.grandTotal).toBe(356.31)
    expect(result.withholdingTax).toBe(9.99)
    expect(result.netPayable).toBe(346.32)
  })

  it('handles large amounts', () => {
    const lineItems: BillingLineItem[] = [
      { code: 'B/T', name: 'Bath Towel', quantity: 10000, pricePerUnit: 35, amount: 350000 },
    ]

    const result = calculateBillingTotals(lineItems)

    expect(result.subtotal).toBe(350000)
    expect(result.vat).toBe(24500) // 350000 * 0.07
    expect(result.grandTotal).toBe(374500)
    expect(result.withholdingTax).toBe(10500) // 350000 * 0.03
    expect(result.netPayable).toBe(364000) // 374500 - 10500
  })
})

// ============================================================
// Unit Tests: createFlatRateBilling
// ============================================================
describe('createFlatRateBilling', () => {
  it('creates billing with flat rate amount', () => {
    const customer = makeCustomer({
      billingModel: 'monthly_flat',
      monthlyFlatRate: 50000,
    })

    const result = createFlatRateBilling(customer, '2026-03')

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].code).toBe('FLAT')
    expect(result.lineItems[0].quantity).toBe(1)
    expect(result.lineItems[0].pricePerUnit).toBe(50000)
    expect(result.lineItems[0].amount).toBe(50000)

    expect(result.subtotal).toBe(50000)
    expect(result.vat).toBe(3500)
    expect(result.grandTotal).toBe(53500)
    expect(result.withholdingTax).toBe(1500)
    expect(result.netPayable).toBe(52000)
  })

  it('handles zero flat rate', () => {
    const customer = makeCustomer({
      billingModel: 'monthly_flat',
      monthlyFlatRate: 0,
    })

    const result = createFlatRateBilling(customer, '2026-03')

    expect(result.subtotal).toBe(0)
    expect(result.netPayable).toBe(0)
  })

  it('includes month in line item name', () => {
    const customer = makeCustomer({ monthlyFlatRate: 10000 })
    const result = createFlatRateBilling(customer, '2026-03')

    expect(result.lineItems[0].name).toContain('2026-03')
  })
})
