/**
 * FlowClean — End-to-End Business Scenario Tests
 *
 * จำลอง flow จริง: ลูกค้า → ใบรับผ้า → ส่งผ้า → วางบิล → ใบกำกับภาษี
 * ทดสอบ logic ผ่าน pure functions โดยไม่ต้อง React/Browser
 */
import { describe, it, expect } from 'vitest'
import { aggregateDeliveryItems, calculateBillingTotals, createFlatRateBilling } from '@/lib/billing'
import { calculateDiscrepancies, hasDiscrepancies } from '@/lib/discrepancy'
import type {
  Customer, LinenForm, LinenFormRow, DeliveryNote, DeliveryNoteItem,
  BillingStatement, TaxInvoice, LinenItemDef, BillingLineItem,
} from '@/types'

// ============================================================
// Shared Test Data Factory
// ============================================================
const CATALOG: LinenItemDef[] = [
  { code: 'B/F', name: 'Face Towel', nameEn: 'Face Towel', category: 'towel', unit: 'pcs', defaultPrice: 4, sortOrder: 1 },
  { code: 'B/H', name: 'Hand Towel', nameEn: 'Hand Towel', category: 'towel', unit: 'pcs', defaultPrice: 5, sortOrder: 2 },
  { code: 'B/T', name: 'Bath Towel', nameEn: 'Bath Towel', category: 'towel', unit: 'pcs', defaultPrice: 8, sortOrder: 3 },
  { code: 'P/C', name: 'Pillow Case', nameEn: 'Pillow Case', category: 'other', unit: 'pcs', defaultPrice: 5, sortOrder: 4 },
  { code: 'S/K', name: "Bed Sheet 6'", nameEn: 'Bed Sheet 6ft', category: 'bedsheet', unit: 'pcs', defaultPrice: 12, sortOrder: 5 },
  { code: 'D/K', name: "Duvet Cover 6'", nameEn: 'Duvet Cover 6ft', category: 'duvet_cover', unit: 'pcs', defaultPrice: 29, sortOrder: 6 },
  { code: 'B/M', name: 'Bath Mat', nameEn: 'Bath Mat', category: 'other', unit: 'pcs', defaultPrice: 6, sortOrder: 7 },
]

function makeRow(code: string, overrides: Partial<LinenFormRow> = {}): LinenFormRow {
  return {
    code,
    col1_carryOver: 0,
    col2_hotelCountIn: 0,
    col3_hotelClaimCount: 0,
    col4_factoryApproved: 0,
    col5_factoryClaimApproved: 0,
    col6_factoryPackSend: 0,
    note: '',
    ...overrides,
  }
}

/**
 * Simulate carry-over calculation (same logic as store.getCarryOver)
 * Returns: Record<code, carryOverValue>
 * Negative = factory owes hotel (not sent back yet)
 * Positive = factory sent extra
 */
function calculateCarryOver(forms: LinenForm[], customerId: string, beforeDate: string): Record<string, number> {
  const result: Record<string, number> = {}
  const filtered = forms
    .filter(f => f.customerId === customerId && f.date < beforeDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  for (const form of filtered) {
    for (const row of form.rows) {
      const packSend = row.col6_factoryPackSend || 0
      const approved = row.col4_factoryApproved || 0
      const claimApproved = row.col5_factoryClaimApproved || 0
      const diff = packSend - approved - claimApproved
      if (diff !== 0) {
        result[row.code] = (result[row.code] || 0) + diff
      }
    }
  }
  return result
}

/**
 * Calculate derived values from a linen form row (same as UI logic)
 */
function calcRowDerived(row: LinenFormRow) {
  const mustReturn = row.col4_factoryApproved + row.col5_factoryClaimApproved - row.col1_carryOver
  const stock = mustReturn - row.col6_factoryPackSend
  const billingQty = row.col6_factoryPackSend - row.col5_factoryClaimApproved
  return { mustReturn, stock, billingQty }
}

// ============================================================
// S1: Happy Path — Per-Piece (Single Customer, Single Day)
// ============================================================
describe('S1: Happy Path — Per-Piece Billing', () => {
  const customer: Customer = {
    id: 'cust-hotel-a',
    customerCode: 'HT0001',
    customerType: 'hotel',
    name: 'Grand Hotel A',
    nameEn: 'Grand Hotel A',
    address: '123 Bangkok',
    taxId: '1234567890123',
    branch: 'head',
    contactName: 'Manager A',
    contactPhone: '0812345678',
    contactEmail: 'a@hotel.com',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0,
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
  }

  // Day 1: Hotel sends linen to factory
  const form1: LinenForm = {
    id: 'lf-1',
    formNumber: 'LF-20260301-001',
    customerId: 'cust-hotel-a',
    date: '2026-03-01',
    status: 'draft',
    notes: '',
    createdBy: 'user-1',
    updatedAt: '2026-03-01',
    rows: [
      makeRow('B/T', { col2_hotelCountIn: 200 }),
      makeRow('B/H', { col2_hotelCountIn: 100 }),
      makeRow('P/C', { col2_hotelCountIn: 80 }),
      makeRow('S/K', { col2_hotelCountIn: 60 }),
    ],
  }

  it('Step 1: Draft → hotel sends linen counts (col2)', () => {
    expect(form1.status).toBe('draft')
    expect(form1.rows[0].col2_hotelCountIn).toBe(200) // B/T
    expect(form1.rows[1].col2_hotelCountIn).toBe(100) // B/H
  })

  it('Step 2: Factory receives & approves (col4 = col2, no discrepancy)', () => {
    // Factory auto-fills col4 = col2, then manually adjusts if needed
    const received: LinenForm = {
      ...form1,
      status: 'received',
      rows: form1.rows.map(r => ({
        ...r,
        col4_factoryApproved: r.col2_hotelCountIn, // exact match
        col5_factoryClaimApproved: r.col3_hotelClaimCount,
      })),
    }

    expect(hasDiscrepancies(received)).toBe(false)
  })

  it('Step 3: Factory packs & sends back (col6)', () => {
    const packed: LinenForm = {
      ...form1,
      status: 'packed',
      rows: [
        makeRow('B/T', { col2_hotelCountIn: 200, col4_factoryApproved: 200, col6_factoryPackSend: 200 }),
        makeRow('B/H', { col2_hotelCountIn: 100, col4_factoryApproved: 100, col6_factoryPackSend: 100 }),
        makeRow('P/C', { col2_hotelCountIn: 80, col4_factoryApproved: 80, col6_factoryPackSend: 80 }),
        makeRow('S/K', { col2_hotelCountIn: 60, col4_factoryApproved: 60, col6_factoryPackSend: 60 }),
      ],
    }

    // Verify derived values
    for (const row of packed.rows) {
      const { mustReturn, stock, billingQty } = calcRowDerived(row)
      expect(mustReturn).toBe(row.col4_factoryApproved) // no carryOver, no claim
      expect(stock).toBe(0) // sent everything
      expect(billingQty).toBe(row.col6_factoryPackSend) // no claim deduction
    }
  })

  it('Step 4: Delivery note created from packed linen form', () => {
    const deliveryNote: DeliveryNote = {
      id: 'dn-1',
      noteNumber: 'SD-20260301-001',
      customerId: 'cust-hotel-a',
      linenFormIds: ['lf-1'],
      date: '2026-03-01',
      items: [
        { code: 'B/T', quantity: 200, isClaim: false },
        { code: 'B/H', quantity: 100, isClaim: false },
        { code: 'P/C', quantity: 80, isClaim: false },
        { code: 'S/K', quantity: 60, isClaim: false },
      ],
      driverName: 'Driver A',
      vehiclePlate: 'ABC-1234',
      receiverName: '',
      status: 'pending',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-01',
    }

    expect(deliveryNote.items).toHaveLength(4)
    expect(deliveryNote.items.every(i => !i.isClaim)).toBe(true)
  })

  it('Step 5: Billing from delivery notes — correct totals', () => {
    const deliveryNote: DeliveryNote = {
      id: 'dn-1',
      noteNumber: 'SD-20260301-001',
      customerId: 'cust-hotel-a',
      linenFormIds: ['lf-1'],
      date: '2026-03-01',
      items: [
        { code: 'B/T', quantity: 200, isClaim: false },
        { code: 'B/H', quantity: 100, isClaim: false },
        { code: 'P/C', quantity: 80, isClaim: false },
        { code: 'S/K', quantity: 60, isClaim: false },
      ],
      driverName: 'Driver A',
      vehiclePlate: 'ABC-1234',
      receiverName: '',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-01',
    }

    const lineItems = aggregateDeliveryItems([deliveryNote], customer, CATALOG)
    const totals = calculateBillingTotals(lineItems)

    // B/T: 200*8=1600, B/H: 100*5=500, P/C: 80*5=400, S/K: 60*12=720
    const expectedSubtotal = 1600 + 500 + 400 + 720 // = 3220
    expect(totals.subtotal).toBe(expectedSubtotal)
    expect(totals.vat).toBe(225.4) // 3220 * 0.07
    expect(totals.grandTotal).toBe(3445.4) // 3220 + 225.4
    expect(totals.withholdingTax).toBe(96.6) // 3220 * 0.03
    expect(totals.netPayable).toBe(3348.8) // 3445.4 - 96.6
  })

  it('Step 6: Tax Invoice matches billing totals', () => {
    const deliveryNote: DeliveryNote = {
      id: 'dn-1',
      noteNumber: 'SD-20260301-001',
      customerId: 'cust-hotel-a',
      linenFormIds: ['lf-1'],
      date: '2026-03-01',
      items: [
        { code: 'B/T', quantity: 200, isClaim: false },
        { code: 'B/H', quantity: 100, isClaim: false },
        { code: 'P/C', quantity: 80, isClaim: false },
        { code: 'S/K', quantity: 60, isClaim: false },
      ],
      driverName: 'Driver A',
      vehiclePlate: 'ABC-1234',
      receiverName: '',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-01',
    }

    const lineItems = aggregateDeliveryItems([deliveryNote], customer, CATALOG)
    const billingTotals = calculateBillingTotals(lineItems)

    // Tax Invoice should use same lineItems but only subtotal + VAT (no withholding)
    const taxInvoice: TaxInvoice = {
      id: 'ti-1',
      invoiceNumber: 'IV-202603-001',
      billingStatementId: 'bs-1',
      customerId: 'cust-hotel-a',
      issueDate: '2026-03-31',
      lineItems,
      subtotal: billingTotals.subtotal,
      vat: billingTotals.vat,
      grandTotal: billingTotals.grandTotal,
      notes: '',
    }

    // Tax invoice grandTotal = subtotal + VAT (same as billing grandTotal)
    expect(taxInvoice.grandTotal).toBe(billingTotals.grandTotal)
    expect(taxInvoice.subtotal).toBe(billingTotals.subtotal)
    expect(taxInvoice.vat).toBe(billingTotals.vat)
  })
})

// ============================================================
// S2: Happy Path — Flat-Rate Billing
// ============================================================
describe('S2: Happy Path — Flat-Rate Billing', () => {
  const flatCustomer: Customer = {
    id: 'cust-hotel-b',
    customerCode: 'HT0002',
    customerType: 'hotel',
    name: 'Budget Hotel B',
    nameEn: 'Budget Hotel B',
    address: '456 Bangkok',
    taxId: '9876543210123',
    branch: 'head',
    contactName: 'Manager B',
    contactPhone: '0898765432',
    contactEmail: 'b@hotel.com',
    creditDays: 15,
    billingModel: 'monthly_flat',
    monthlyFlatRate: 45000,
    enabledItems: ['B/T', 'P/C'],
    priceList: [],
    priceHistory: [],
    notes: '',
    createdAt: '2026-01-01',
    isActive: true,
  }

  it('creates flat-rate billing regardless of delivery volume', () => {
    const result = createFlatRateBilling(flatCustomer, '2026-03')

    expect(result.lineItems).toHaveLength(1)
    expect(result.subtotal).toBe(45000)
    expect(result.vat).toBe(3150) // 45000 * 0.07
    expect(result.grandTotal).toBe(48150)
    expect(result.withholdingTax).toBe(1350) // 45000 * 0.03
    expect(result.netPayable).toBe(46800) // 48150 - 1350
  })

  it('flat-rate ignores delivery note quantities', () => {
    // Even with lots of delivery notes, flat-rate still bills the same
    const result1 = createFlatRateBilling(flatCustomer, '2026-03')
    const result2 = createFlatRateBilling(flatCustomer, '2026-04')

    expect(result1.netPayable).toBe(result2.netPayable)
  })
})

// ============================================================
// S3: Claim Items — Must Not Be Billed
// ============================================================
describe('S3: Claim Items — Free, Not Billed', () => {
  const customer: Customer = {
    id: 'cust-hotel-c',
    customerCode: 'HT0003',
    customerType: 'hotel',
    name: 'Luxury Hotel C',
    nameEn: 'Luxury Hotel C',
    address: '789 Bangkok',
    taxId: '1111111111111',
    branch: 'head',
    contactName: 'Manager C',
    contactPhone: '0811111111',
    contactEmail: 'c@hotel.com',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0,
    enabledItems: ['B/T', 'B/H', 'P/C'],
    priceList: [
      { code: 'B/T', price: 10 },
      { code: 'B/H', price: 6 },
      { code: 'P/C', price: 5 },
    ],
    priceHistory: [],
    notes: '',
    createdAt: '2026-01-01',
    isActive: true,
  }

  it('claim items in delivery note are excluded from billing', () => {
    const note: DeliveryNote = {
      id: 'dn-claim-1',
      noteNumber: 'SD-20260305-001',
      customerId: 'cust-hotel-c',
      linenFormIds: ['lf-c1'],
      date: '2026-03-05',
      items: [
        { code: 'B/T', quantity: 100, isClaim: false }, // billable
        { code: 'B/T', quantity: 5, isClaim: true },    // claim — free
        { code: 'B/H', quantity: 50, isClaim: false },  // billable
        { code: 'P/C', quantity: 10, isClaim: true },   // claim — free
      ],
      driverName: 'Driver',
      vehiclePlate: 'XYZ-9999',
      receiverName: '',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-05',
    }

    const lineItems = aggregateDeliveryItems([note], customer, CATALOG)

    // Only non-claim items
    expect(lineItems).toHaveLength(2) // B/T (100) + B/H (50), P/C was all-claim
    const bt = lineItems.find(i => i.code === 'B/T')!
    expect(bt.quantity).toBe(100) // only non-claim B/T
    expect(bt.amount).toBe(1000)  // 100 * 10

    const bh = lineItems.find(i => i.code === 'B/H')!
    expect(bh.quantity).toBe(50)
    expect(bh.amount).toBe(300) // 50 * 6

    // P/C should NOT appear (only had claim items)
    expect(lineItems.find(i => i.code === 'P/C')).toBeUndefined()
  })

  it('linen form row: billing qty = col6 - col5 (pack send minus claim)', () => {
    // Hotel sends 100 B/T + 5 B/T claim
    // Factory approves all, packs 105 total (100 normal + 5 claim replacement)
    const row = makeRow('B/T', {
      col2_hotelCountIn: 100,
      col3_hotelClaimCount: 5,
      col4_factoryApproved: 100,
      col5_factoryClaimApproved: 5,
      col6_factoryPackSend: 105,
    })

    const { billingQty } = calcRowDerived(row)
    // billingQty = col6 - col5 = 105 - 5 = 100 (claim not charged)
    expect(billingQty).toBe(100)
  })
})

// ============================================================
// S4: Carry-Over Across Days
// ============================================================
describe('S4: Carry-Over — Multi-Day Accumulation', () => {
  const customerId = 'cust-hotel-d'

  it('Day 1: factory sends less than approved → negative carry-over (owes hotel)', () => {
    const day1Form: LinenForm = {
      id: 'lf-d1',
      formNumber: 'LF-20260301-001',
      customerId,
      date: '2026-03-01',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-01',
      rows: [
        makeRow('B/T', {
          col1_carryOver: 0,
          col2_hotelCountIn: 100,
          col4_factoryApproved: 100,
          col6_factoryPackSend: 90, // sent only 90 of 100 approved
        }),
        makeRow('P/C', {
          col1_carryOver: 0,
          col2_hotelCountIn: 50,
          col4_factoryApproved: 50,
          col6_factoryPackSend: 50, // sent all
        }),
      ],
    }

    // Carry-over for Day 2 = col6 - col4 - col5
    // B/T: 90 - 100 - 0 = -10 (owes 10)
    // P/C: 50 - 50 - 0 = 0
    const carryOver = calculateCarryOver([day1Form], customerId, '2026-03-02')
    expect(carryOver['B/T']).toBe(-10)
    expect(carryOver['P/C']).toBeUndefined() // 0 diff, not stored
  })

  it('Day 2: carry-over accumulates from Day 1', () => {
    const day1Form: LinenForm = {
      id: 'lf-d1',
      formNumber: 'LF-20260301-001',
      customerId,
      date: '2026-03-01',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-01',
      rows: [
        makeRow('B/T', {
          col4_factoryApproved: 100,
          col6_factoryPackSend: 90, // -10
        }),
      ],
    }

    const day2Form: LinenForm = {
      id: 'lf-d2',
      formNumber: 'LF-20260302-001',
      customerId,
      date: '2026-03-02',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-02',
      rows: [
        makeRow('B/T', {
          col1_carryOver: -10, // carried from day 1
          col2_hotelCountIn: 80,
          col4_factoryApproved: 80,
          col6_factoryPackSend: 95, // sent 95 (80 approved + 15 extra to cover deficit)
        }),
      ],
    }

    // Carry-over for Day 3:
    // Day 1: 90 - 100 = -10
    // Day 2: 95 - 80 = +15
    // Total: -10 + 15 = +5 (factory sent 5 extra overall)
    const carryOver = calculateCarryOver([day1Form, day2Form], customerId, '2026-03-03')
    expect(carryOver['B/T']).toBe(5)
  })

  it('carry-over with claims', () => {
    const form: LinenForm = {
      id: 'lf-d3',
      formNumber: 'LF-20260303-001',
      customerId,
      date: '2026-03-03',
      status: 'delivered',
      notes: '',
      createdBy: 'user-1',
      updatedAt: '2026-03-03',
      rows: [
        makeRow('B/T', {
          col4_factoryApproved: 100,
          col5_factoryClaimApproved: 5,
          col6_factoryPackSend: 100, // sent 100 total (95 normal + 5 claim replacement)
        }),
      ],
    }

    // carryOver = col6 - col4 - col5 = 100 - 100 - 5 = -5
    const carryOver = calculateCarryOver([form], customerId, '2026-03-04')
    expect(carryOver['B/T']).toBe(-5)
  })

  it('carry-over only includes forms before specified date', () => {
    const forms: LinenForm[] = [
      {
        id: 'lf-e1', formNumber: 'LF-20260301-001', customerId,
        date: '2026-03-01', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
        rows: [makeRow('B/T', { col4_factoryApproved: 50, col6_factoryPackSend: 40 })],
      },
      {
        id: 'lf-e2', formNumber: 'LF-20260305-001', customerId,
        date: '2026-03-05', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-05',
        rows: [makeRow('B/T', { col4_factoryApproved: 30, col6_factoryPackSend: 35 })],
      },
    ]

    // Before March 3 — only Day 1 form
    const co1 = calculateCarryOver(forms, customerId, '2026-03-03')
    expect(co1['B/T']).toBe(-10) // 40 - 50

    // Before March 6 — both forms
    const co2 = calculateCarryOver(forms, customerId, '2026-03-06')
    expect(co2['B/T']).toBe(-5) // (-10) + (35-30=5) = -5
  })

  it('carry-over isolates by customer', () => {
    const forms: LinenForm[] = [
      {
        id: 'lf-f1', formNumber: 'LF-20260301-001', customerId: 'cust-A',
        date: '2026-03-01', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
        rows: [makeRow('B/T', { col4_factoryApproved: 50, col6_factoryPackSend: 40 })],
      },
      {
        id: 'lf-f2', formNumber: 'LF-20260301-002', customerId: 'cust-B',
        date: '2026-03-01', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
        rows: [makeRow('B/T', { col4_factoryApproved: 30, col6_factoryPackSend: 35 })],
      },
    ]

    const coA = calculateCarryOver(forms, 'cust-A', '2026-03-02')
    expect(coA['B/T']).toBe(-10)

    const coB = calculateCarryOver(forms, 'cust-B', '2026-03-02')
    expect(coB['B/T']).toBe(5)
  })
})

// ============================================================
// S5: Discrepancy Detection
// ============================================================
describe('S5: Discrepancy — Hotel vs Factory Count', () => {
  it('detects hotel counted more than factory approved (missing items)', () => {
    const form: LinenForm = {
      id: 'lf-disc-1', formNumber: 'LF-20260310-001', customerId: 'cust-1',
      date: '2026-03-10', status: 'received', notes: '', createdBy: 'user-1', updatedAt: '2026-03-10',
      rows: [
        makeRow('B/T', { col2_hotelCountIn: 100, col4_factoryApproved: 95 }),
        makeRow('B/H', { col2_hotelCountIn: 50, col4_factoryApproved: 50 }),
        makeRow('P/C', { col2_hotelCountIn: 30, col4_factoryApproved: 28 }),
      ],
    }

    expect(hasDiscrepancies(form)).toBe(true)

    const disc = calculateDiscrepancies(form)
    expect(disc['B/T']).toBe(-5) // factory received 5 less
    expect(disc['B/H']).toBeUndefined() // match
    expect(disc['P/C']).toBe(-2) // factory received 2 less
  })

  it('no discrepancy when factory has not counted yet (col4=0)', () => {
    const form: LinenForm = {
      id: 'lf-disc-2', formNumber: 'LF-20260310-002', customerId: 'cust-1',
      date: '2026-03-10', status: 'draft', notes: '', createdBy: 'user-1', updatedAt: '2026-03-10',
      rows: [
        makeRow('B/T', { col2_hotelCountIn: 100, col4_factoryApproved: 0 }),
      ],
    }

    expect(hasDiscrepancies(form)).toBe(false)
  })

  it('factory counted MORE than hotel (rare but possible)', () => {
    const form: LinenForm = {
      id: 'lf-disc-3', formNumber: 'LF-20260310-003', customerId: 'cust-1',
      date: '2026-03-10', status: 'received', notes: '', createdBy: 'user-1', updatedAt: '2026-03-10',
      rows: [
        makeRow('B/T', { col2_hotelCountIn: 50, col4_factoryApproved: 55 }),
      ],
    }

    const disc = calculateDiscrepancies(form)
    expect(disc['B/T']).toBe(5) // factory found 5 extra
  })
})

// ============================================================
// S6: Mixed Billing — Multiple Customers, Multiple Deliveries
// ============================================================
describe('S6: Mixed Billing — Multi-Customer, Multi-Delivery', () => {
  const customerA: Customer = {
    id: 'cust-mix-a', customerCode: 'HT0010', customerType: 'hotel',
    name: 'Hotel Alpha', nameEn: 'Hotel Alpha', address: 'A',
    taxId: '1111111111111', branch: 'head', contactName: '', contactPhone: '', contactEmail: '',
    creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0,
    enabledItems: ['B/T', 'B/H'],
    priceList: [{ code: 'B/T', price: 8 }, { code: 'B/H', price: 5 }],
    priceHistory: [], notes: '', createdAt: '2026-01-01', isActive: true,
  }

  const customerB: Customer = {
    id: 'cust-mix-b', customerCode: 'HT0020', customerType: 'hotel',
    name: 'Hotel Beta', nameEn: 'Hotel Beta', address: 'B',
    taxId: '2222222222222', branch: 'head', contactName: '', contactPhone: '', contactEmail: '',
    creditDays: 15, billingModel: 'per_piece', monthlyFlatRate: 0,
    enabledItems: ['B/T', 'P/C'],
    priceList: [{ code: 'B/T', price: 10 }, { code: 'P/C', price: 6 }], // different prices!
    priceHistory: [], notes: '', createdAt: '2026-01-01', isActive: true,
  }

  it('billing aggregates correctly per customer from multiple delivery notes', () => {
    const notesA: DeliveryNote[] = [
      {
        id: 'dn-ma-1', noteNumber: 'SD-20260310-001', customerId: 'cust-mix-a',
        linenFormIds: ['lf-1'], date: '2026-03-10',
        items: [{ code: 'B/T', quantity: 80, isClaim: false }, { code: 'B/H', quantity: 40, isClaim: false }],
        driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
        notes: '', createdBy: 'user-1', updatedAt: '2026-03-10',
      },
      {
        id: 'dn-ma-2', noteNumber: 'SD-20260315-001', customerId: 'cust-mix-a',
        linenFormIds: ['lf-2'], date: '2026-03-15',
        items: [{ code: 'B/T', quantity: 60, isClaim: false }, { code: 'B/H', quantity: 30, isClaim: false }],
        driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
        notes: '', createdBy: 'user-1', updatedAt: '2026-03-15',
      },
    ]

    const notesB: DeliveryNote[] = [
      {
        id: 'dn-mb-1', noteNumber: 'SD-20260312-001', customerId: 'cust-mix-b',
        linenFormIds: ['lf-3'], date: '2026-03-12',
        items: [{ code: 'B/T', quantity: 150, isClaim: false }, { code: 'P/C', quantity: 100, isClaim: false }],
        driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
        notes: '', createdBy: 'user-1', updatedAt: '2026-03-12',
      },
    ]

    // Customer A billing
    const itemsA = aggregateDeliveryItems(notesA, customerA, CATALOG)
    const totalsA = calculateBillingTotals(itemsA)

    // B/T: (80+60)*8 = 1120, B/H: (40+30)*5 = 350, subtotal = 1470
    expect(totalsA.subtotal).toBe(1470)

    // Customer B billing
    const itemsB = aggregateDeliveryItems(notesB, customerB, CATALOG)
    const totalsB = calculateBillingTotals(itemsB)

    // B/T: 150*10 = 1500, P/C: 100*6 = 600, subtotal = 2100
    expect(totalsB.subtotal).toBe(2100)

    // Verify prices are different per customer
    const btA = itemsA.find(i => i.code === 'B/T')!
    const btB = itemsB.find(i => i.code === 'B/T')!
    expect(btA.pricePerUnit).toBe(8)
    expect(btB.pricePerUnit).toBe(10)
  })

  it('delivery notes from wrong customer are not mixed into billing', () => {
    // Mix notes from A and B — but billing should only use notes matching customer
    const allNotes: DeliveryNote[] = [
      {
        id: 'dn-wrong-1', noteNumber: 'SD-1', customerId: 'cust-mix-a',
        linenFormIds: [], date: '2026-03-10',
        items: [{ code: 'B/T', quantity: 50, isClaim: false }],
        driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
        notes: '', createdBy: 'user-1', updatedAt: '2026-03-10',
      },
      {
        id: 'dn-wrong-2', noteNumber: 'SD-2', customerId: 'cust-mix-b',
        linenFormIds: [], date: '2026-03-10',
        items: [{ code: 'B/T', quantity: 200, isClaim: false }],
        driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
        notes: '', createdBy: 'user-1', updatedAt: '2026-03-10',
      },
    ]

    // Filter by customer (this is what the UI should do before calling aggregateDeliveryItems)
    const notesForA = allNotes.filter(n => n.customerId === customerA.id)
    const itemsA = aggregateDeliveryItems(notesForA, customerA, CATALOG)

    expect(itemsA).toHaveLength(1)
    expect(itemsA[0].quantity).toBe(50) // only customer A's notes
    expect(itemsA[0].amount).toBe(400) // 50 * 8
  })
})

// ============================================================
// S7: Edge Cases
// ============================================================
describe('S7: Edge Cases', () => {
  const customer: Customer = {
    id: 'cust-edge', customerCode: 'HT9999', customerType: 'hotel',
    name: 'Edge Hotel', nameEn: 'Edge Hotel', address: 'Edge',
    taxId: '9999999999999', branch: 'head', contactName: '', contactPhone: '', contactEmail: '',
    creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0,
    enabledItems: ['B/T'],
    priceList: [{ code: 'B/T', price: 8 }],
    priceHistory: [], notes: '', createdAt: '2026-01-01', isActive: true,
  }

  it('zero quantity items are filtered out', () => {
    const note: DeliveryNote = {
      id: 'dn-edge-1', noteNumber: 'SD-1', customerId: 'cust-edge',
      linenFormIds: [], date: '2026-03-01',
      items: [
        { code: 'B/T', quantity: 0, isClaim: false }, // zero qty
      ],
      driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
      notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
    }

    const result = aggregateDeliveryItems([note], customer, CATALOG)
    expect(result).toEqual([]) // qty 0 → filtered by qty > 0
  })

  it('delivery with unknown linen code uses price 0', () => {
    const note: DeliveryNote = {
      id: 'dn-edge-2', noteNumber: 'SD-2', customerId: 'cust-edge',
      linenFormIds: [], date: '2026-03-01',
      items: [
        { code: 'UNKNOWN', quantity: 10, isClaim: false },
      ],
      driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
      notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
    }

    const result = aggregateDeliveryItems([note], customer, CATALOG)
    expect(result).toHaveLength(1)
    expect(result[0].pricePerUnit).toBe(0) // not in priceList
    expect(result[0].amount).toBe(0)
  })

  it('carry-over with zero movement forms', () => {
    const forms: LinenForm[] = [{
      id: 'lf-zero', formNumber: 'LF-1', customerId: 'cust-edge',
      date: '2026-03-01', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
      rows: [
        makeRow('B/T', {
          col4_factoryApproved: 0,
          col5_factoryClaimApproved: 0,
          col6_factoryPackSend: 0,
        }),
      ],
    }]

    const co = calculateCarryOver(forms, 'cust-edge', '2026-03-02')
    expect(co).toEqual({}) // no movement, no carry-over
  })

  it('linen form with all rows being zero', () => {
    const form: LinenForm = {
      id: 'lf-allzero', formNumber: 'LF-1', customerId: 'cust-1',
      date: '2026-03-01', status: 'received', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
      rows: [
        makeRow('B/T'),
        makeRow('B/H'),
        makeRow('P/C'),
      ],
    }

    expect(hasDiscrepancies(form)).toBe(false)
    expect(calculateDiscrepancies(form)).toEqual({})
  })

  it('billing formula: netPayable = grandTotal - withholdingTax (identity check)', () => {
    // Test across various subtotals
    const testAmounts = [0, 1, 100, 999, 12345, 100000, 999999.99]

    for (const amount of testAmounts) {
      const items: BillingLineItem[] = [
        { code: 'X', name: 'Test', quantity: 1, pricePerUnit: amount, amount },
      ]
      const t = calculateBillingTotals(items)

      // Identity: netPayable = grandTotal - withholdingTax
      const expectedNet = Math.round((t.grandTotal - t.withholdingTax) * 100) / 100
      expect(t.netPayable).toBe(expectedNet)

      // Identity: grandTotal = subtotal + vat
      const expectedGrand = Math.round((t.subtotal + t.vat) * 100) / 100
      expect(t.grandTotal).toBe(expectedGrand)

      // Identity: vat = subtotal * 0.07 (rounded)
      const expectedVat = Math.round(t.subtotal * 0.07 * 100) / 100
      expect(t.vat).toBe(expectedVat)

      // Identity: withholdingTax = subtotal * 0.03 (rounded)
      const expectedWht = Math.round(t.subtotal * 0.03 * 100) / 100
      expect(t.withholdingTax).toBe(expectedWht)
    }
  })

  it('mustReturn & stock derived values with negative carry-over', () => {
    // Factory owes 10 from yesterday (carry-over = -10)
    // Hotel sends 80 today, factory approves 80, packs 95 (80 + 15 to cover deficit)
    const row = makeRow('B/T', {
      col1_carryOver: -10,
      col2_hotelCountIn: 80,
      col4_factoryApproved: 80,
      col5_factoryClaimApproved: 0,
      col6_factoryPackSend: 95,
    })

    const { mustReturn, stock, billingQty } = calcRowDerived(row)

    // mustReturn = col4 + col5 - col1 = 80 + 0 - (-10) = 90
    expect(mustReturn).toBe(90)

    // stock = mustReturn - col6 = 90 - 95 = -5 (sent more than needed)
    expect(stock).toBe(-5)

    // billingQty = col6 - col5 = 95 - 0 = 95
    expect(billingQty).toBe(95)
  })

  it('mustReturn & stock with positive carry-over (excess from before)', () => {
    // Factory sent 5 extra yesterday (carry-over = +5)
    // Hotel sends 80 today, factory approves 80, packs 75
    const row = makeRow('B/T', {
      col1_carryOver: 5,
      col2_hotelCountIn: 80,
      col4_factoryApproved: 80,
      col5_factoryClaimApproved: 0,
      col6_factoryPackSend: 75,
    })

    const { mustReturn, stock, billingQty } = calcRowDerived(row)

    // mustReturn = col4 + col5 - col1 = 80 + 0 - 5 = 75
    expect(mustReturn).toBe(75)

    // stock = mustReturn - col6 = 75 - 75 = 0 (exact)
    expect(stock).toBe(0)

    // billingQty = col6 - col5 = 75 - 0 = 75
    expect(billingQty).toBe(75)
  })
})

// ============================================================
// S8: Full Lifecycle — Multi-Day Realistic Scenario
// ============================================================
describe('S8: Full Lifecycle — Realistic 3-Day Operation', () => {
  const customerId = 'cust-lifecycle'
  const customer: Customer = {
    id: customerId, customerCode: 'HT0050', customerType: 'hotel',
    name: 'Riverside Resort', nameEn: 'Riverside Resort', address: 'Riverside',
    taxId: '5555555555555', branch: 'head', contactName: '', contactPhone: '', contactEmail: '',
    creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0,
    enabledItems: ['B/T', 'B/H', 'P/C'],
    priceList: [
      { code: 'B/T', price: 8 },
      { code: 'B/H', price: 5 },
      { code: 'P/C', price: 5 },
    ],
    priceHistory: [], notes: '', createdAt: '2026-01-01', isActive: true,
  }

  // Day 1: Normal operation, factory sends 10 less B/T
  const day1: LinenForm = {
    id: 'lf-life-1', formNumber: 'LF-20260301-001', customerId,
    date: '2026-03-01', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
    rows: [
      makeRow('B/T', { col2_hotelCountIn: 100, col4_factoryApproved: 100, col6_factoryPackSend: 90 }),
      makeRow('B/H', { col2_hotelCountIn: 50, col4_factoryApproved: 50, col6_factoryPackSend: 50 }),
      makeRow('P/C', { col2_hotelCountIn: 30, col4_factoryApproved: 30, col6_factoryPackSend: 30 }),
    ],
  }

  // Day 2: Hotel sends linen + 3 claim P/C. Factory sends extra B/T to cover Day 1 deficit
  const day2: LinenForm = {
    id: 'lf-life-2', formNumber: 'LF-20260302-001', customerId,
    date: '2026-03-02', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-02',
    rows: [
      makeRow('B/T', {
        col1_carryOver: -10, // from Day 1: 90-100=-10
        col2_hotelCountIn: 80,
        col4_factoryApproved: 80,
        col6_factoryPackSend: 95, // sending 15 extra to cover deficit
      }),
      makeRow('B/H', { col2_hotelCountIn: 40, col4_factoryApproved: 40, col6_factoryPackSend: 40 }),
      makeRow('P/C', {
        col2_hotelCountIn: 25,
        col3_hotelClaimCount: 3,
        col4_factoryApproved: 25,
        col5_factoryClaimApproved: 3,
        col6_factoryPackSend: 28, // 25 normal + 3 claim replacement
      }),
    ],
  }

  // Day 3: Normal day, all balanced
  const day3: LinenForm = {
    id: 'lf-life-3', formNumber: 'LF-20260303-001', customerId,
    date: '2026-03-03', status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-03',
    rows: [
      makeRow('B/T', {
        col1_carryOver: 5, // Day1(-10) + Day2(95-80=15) = 5
        col2_hotelCountIn: 90,
        col4_factoryApproved: 90,
        col6_factoryPackSend: 85, // send 85 (need only 90-5=85 to balance)
      }),
      makeRow('B/H', { col2_hotelCountIn: 45, col4_factoryApproved: 45, col6_factoryPackSend: 45 }),
      makeRow('P/C', { col2_hotelCountIn: 35, col4_factoryApproved: 35, col6_factoryPackSend: 35 }),
    ],
  }

  const allForms = [day1, day2, day3]

  it('carry-over progression is correct across 3 days', () => {
    // After Day 1 (before Day 2):
    const co1 = calculateCarryOver(allForms, customerId, '2026-03-02')
    expect(co1['B/T']).toBe(-10)  // 90-100 = -10
    expect(co1['B/H']).toBeUndefined() // 50-50 = 0
    expect(co1['P/C']).toBeUndefined() // 30-30 = 0

    // After Day 2 (before Day 3):
    const co2 = calculateCarryOver(allForms, customerId, '2026-03-03')
    expect(co2['B/T']).toBe(5)    // -10 + (95-80) = -10+15 = 5
    // P/C Day2: col6(28) - col4(25) - col5(3) = 0 — claim replacement included in pack
    expect(co2['P/C']).toBeUndefined() // 0 + 0 = 0, not stored

    // After Day 3 (before Day 4):
    const co3 = calculateCarryOver(allForms, customerId, '2026-03-04')
    expect(co3['B/T']).toBe(0)    // 5 + (85-90) = 5-5 = 0 — fully balanced!
    expect(co3['P/C']).toBeUndefined() // 0 + (35-35) = 0
  })

  it('delivery notes for billing — correct quantities across 3 days', () => {
    // Delivery notes should reflect col6 (what was actually sent) minus claims
    const deliveryNotes: DeliveryNote[] = [
      {
        id: 'dn-life-1', noteNumber: 'SD-1', customerId, linenFormIds: ['lf-life-1'],
        date: '2026-03-01', driverName: '', vehiclePlate: '', receiverName: '',
        status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-01',
        items: [
          { code: 'B/T', quantity: 90, isClaim: false },
          { code: 'B/H', quantity: 50, isClaim: false },
          { code: 'P/C', quantity: 30, isClaim: false },
        ],
      },
      {
        id: 'dn-life-2', noteNumber: 'SD-2', customerId, linenFormIds: ['lf-life-2'],
        date: '2026-03-02', driverName: '', vehiclePlate: '', receiverName: '',
        status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-02',
        items: [
          { code: 'B/T', quantity: 95, isClaim: false },
          { code: 'B/H', quantity: 40, isClaim: false },
          { code: 'P/C', quantity: 25, isClaim: false },
          { code: 'P/C', quantity: 3, isClaim: true }, // claim — free
        ],
      },
      {
        id: 'dn-life-3', noteNumber: 'SD-3', customerId, linenFormIds: ['lf-life-3'],
        date: '2026-03-03', driverName: '', vehiclePlate: '', receiverName: '',
        status: 'delivered', notes: '', createdBy: 'user-1', updatedAt: '2026-03-03',
        items: [
          { code: 'B/T', quantity: 85, isClaim: false },
          { code: 'B/H', quantity: 45, isClaim: false },
          { code: 'P/C', quantity: 35, isClaim: false },
        ],
      },
    ]

    const lineItems = aggregateDeliveryItems(deliveryNotes, customer, CATALOG)
    const totals = calculateBillingTotals(lineItems)

    // B/T: 90+95+85 = 270, price 8 → 2160
    const bt = lineItems.find(i => i.code === 'B/T')!
    expect(bt.quantity).toBe(270)
    expect(bt.amount).toBe(2160)

    // B/H: 50+40+45 = 135, price 5 → 675
    const bh = lineItems.find(i => i.code === 'B/H')!
    expect(bh.quantity).toBe(135)
    expect(bh.amount).toBe(675)

    // P/C: 30+25+35 = 90 (claims excluded), price 5 → 450
    const pc = lineItems.find(i => i.code === 'P/C')!
    expect(pc.quantity).toBe(90) // 3 claim items excluded
    expect(pc.amount).toBe(450)

    // Total billing: 2160 + 675 + 450 = 3285
    expect(totals.subtotal).toBe(3285)
    expect(totals.vat).toBe(229.95) // 3285 * 0.07
    expect(totals.grandTotal).toBe(3514.95)
    expect(totals.withholdingTax).toBe(98.55) // 3285 * 0.03
    expect(totals.netPayable).toBe(3416.4) // 3514.95 - 98.55
  })
})
