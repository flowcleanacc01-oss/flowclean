import { describe, it, expect } from 'vitest'
import { buildDiscountEntries, groupDiscountByCustomerMonth } from '@/lib/discount-audit'
import type { DeliveryNote, BillingStatement, TaxInvoice, LinenForm, Quotation } from '@/types'

const dn = (o: Partial<DeliveryNote>): DeliveryNote => ({
  id: 'd', noteNumber: 'SD-1', customerId: 'C1', linenFormIds: [], date: '2026-06-10',
  items: [], driverName: '', vehiclePlate: '', receiverName: '', status: 'delivered',
  isPrinted: false, isBilled: false, transportFeeTrip: 0, transportFeeMonth: 0,
  notes: '', createdBy: '', updatedAt: '', ...o,
} as DeliveryNote)

const wb = (o: Partial<BillingStatement>): BillingStatement => ({
  id: 'w', billingNumber: 'WB-1', customerId: 'C1', deliveryNoteIds: [], billingMonth: '2026-06',
  issueDate: '2026-06-30', dueDate: '', lineItems: [], subtotal: 0, vat: 0, grandTotal: 0,
  withholdingTax: 0, netPayable: 0, status: 'sent', paidDate: null, paidAmount: 0, notes: '', ...o,
} as BillingStatement)

const iv = (o: Partial<TaxInvoice>): TaxInvoice => ({
  id: 'i', invoiceNumber: 'IV-1', billingStatementId: 'w', customerId: 'C1', issueDate: '2026-06-30',
  lineItems: [], subtotal: 0, vat: 0, grandTotal: 0, notes: '', ...o,
} as TaxInvoice)

const QT: Quotation[] = [{
  id: 'q', customerId: 'C1', status: 'accepted',
  items: [{ code: 'B/T', pricePerUnit: 20 } as Quotation['items'][number]],
} as Quotation]

describe('buildDiscountEntries — มูลค่าเคลม + ส่วนลดพิเศษ', () => {
  it('คิดมูลค่าเคลมจาก priceSnapshot (ล็อคราคา)', () => {
    const e = buildDiscountEntries([dn({
      items: [
        { code: 'B/T', quantity: 50, isClaim: false },
        { code: 'B/T', quantity: 3, isClaim: true },
      ],
      priceSnapshot: { 'B/T': 25 },
    })], [], [], [], QT)
    expect(e).toHaveLength(1)
    expect(e[0].claimValue).toBe(75)   // 3 × 25 (snapshot ชนะ QT 20)
    expect(e[0].claimPieces).toBe(3)
    expect(e[0].total).toBe(75)
  })

  it('fallback ราคา QT เมื่อไม่มี priceSnapshot', () => {
    const e = buildDiscountEntries([dn({ items: [{ code: 'B/T', quantity: 2, isClaim: true }] })], [], [], [], QT)
    expect(e[0].claimValue).toBe(40)   // 2 × 20 (QT)
  })

  it('รวมส่วนลดพิเศษ (DN.discount) + เคลม', () => {
    const e = buildDiscountEntries([dn({
      items: [{ code: 'B/T', quantity: 1, isClaim: true }],
      priceSnapshot: { 'B/T': 20 }, discount: 100, discountNote: 'ชดเชยจาน',
    })], [], [], [], QT)
    expect(e[0].claimValue).toBe(20)
    expect(e[0].specialDiscount).toBe(100)
    expect(e[0].total).toBe(120)
    expect(e[0].discountNote).toBe('ชดเชยจาน')
  })

  it('เคลม adhoc ใช้ adhocPrice', () => {
    const e = buildDiscountEntries([dn({
      items: [{ code: 'X', quantity: 2, isClaim: true, isAdhoc: true, adhocName: 'จานแตก', adhocPrice: 50 }],
    })], [], [], [], QT)
    expect(e[0].claimValue).toBe(100)
  })

  it('SD ที่ไม่มีเคลม/ส่วนลด → ไม่อยู่ในรายงาน', () => {
    const e = buildDiscountEntries([dn({ items: [{ code: 'B/T', quantity: 10, isClaim: false }] })], [], [], [], QT)
    expect(e).toHaveLength(0)
  })
})

describe('buildDiscountEntries — ไล่รอย SD → WB → IV', () => {
  const d = dn({ id: 'd1', noteNumber: 'SD-9', items: [{ code: 'B/T', quantity: 1, isClaim: true }], priceSnapshot: { 'B/T': 20 } })

  it('SD วางบิลแล้ว → ผูก WB + IV (ยอดเดียวกันไหลต่อ)', () => {
    const w = wb({ id: 'w1', billingNumber: 'WB-7', deliveryNoteIds: ['d1'] })
    const v = iv({ id: 'i1', invoiceNumber: 'IV-7', billingStatementId: 'w1' })
    const e = buildDiscountEntries([d], [w], [v], [], QT)
    expect(e[0]).toMatchObject({ billed: true, wbNumber: 'WB-7', ivNumber: 'IV-7' })
  })

  it('SD ยังไม่วางบิล → billed=false, ไม่มี WB/IV (ต้องตรวจ)', () => {
    const e = buildDiscountEntries([d], [], [], [], QT)
    expect(e[0]).toMatchObject({ billed: false, wbNumber: '', ivNumber: '' })
  })

  it('วางบิลแล้วแต่ยังไม่ออกใบกำกับ → มี WB ไม่มี IV', () => {
    const w = wb({ id: 'w1', billingNumber: 'WB-7', deliveryNoteIds: ['d1'] })
    const e = buildDiscountEntries([d], [w], [], [], QT)
    expect(e[0]).toMatchObject({ billed: true, wbNumber: 'WB-7', ivNumber: '' })
  })
})

describe('buildDiscountEntries — อ้างอิงชิ้นเคลมจาก LF', () => {
  it('รวม col5_factoryClaimApproved จาก LF ที่ผูก', () => {
    const lf = { id: 'lf1', rows: [
      { col5_factoryClaimApproved: 2 }, { col5_factoryClaimApproved: 1 },
    ] } as unknown as LinenForm
    const e = buildDiscountEntries(
      [dn({ linenFormIds: ['lf1'], items: [{ code: 'B/T', quantity: 3, isClaim: true }], priceSnapshot: { 'B/T': 10 } })],
      [], [], [lf], QT)
    expect(e[0].lfClaimPieces).toBe(3)
  })
})

describe('groupDiscountByCustomerMonth', () => {
  it('รวมยอดต่อ ลูกค้า×เดือน + นับ unbilled', () => {
    const entries = buildDiscountEntries([
      dn({ id: 'a', customerId: 'C1', date: '2026-06-05', items: [{ code: 'B/T', quantity: 2, isClaim: true }], priceSnapshot: { 'B/T': 10 } }),
      dn({ id: 'b', customerId: 'C1', date: '2026-06-20', discount: 50, items: [] }),
      dn({ id: 'c', customerId: 'C1', date: '2026-07-01', items: [{ code: 'B/T', quantity: 1, isClaim: true }], priceSnapshot: { 'B/T': 10 } }),
    ], [wb({ id: 'w', deliveryNoteIds: ['a'], billingNumber: 'WB-1' })], [], [], QT)
    const g = groupDiscountByCustomerMonth(entries)
    const jun = g.find(x => x.month === '2026-06')!
    expect(jun.total).toBe(70)        // 20 + 50
    expect(jun.sdCount).toBe(2)
    expect(jun.unbilledCount).toBe(1) // 'b' ยังไม่วางบิล ('a' วางแล้ว)
    expect(g.find(x => x.month === '2026-07')!.total).toBe(10)
  })
})
