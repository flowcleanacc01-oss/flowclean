import { describe, it, expect } from 'vitest'
import { calculateDiscrepancies, hasDiscrepancies } from '@/lib/discrepancy'
import type { LinenForm } from '@/types'

function makeForm(rows: Partial<LinenForm['rows'][0]>[]): LinenForm {
  return {
    id: 'form-1',
    formNumber: 'LF-20260301-001',
    customerId: 'cust-1',
    date: '2026-03-01',
    status: 'received',
    notes: '',
    createdBy: 'user-1',
    updatedAt: '2026-03-01',
    rows: rows.map(r => ({
      code: r.code || 'B/T',
      col1_carryOver: r.col1_carryOver || 0,
      col2_hotelCountIn: r.col2_hotelCountIn || 0,
      col3_hotelClaimCount: r.col3_hotelClaimCount || 0,
      col4_factoryApproved: r.col4_factoryApproved || 0,
      col5_factoryClaimApproved: r.col5_factoryClaimApproved || 0,
      col6_factoryPackSend: r.col6_factoryPackSend || 0,
      note: r.note || '',
    })),
  }
}

describe('calculateDiscrepancies', () => {
  it('returns empty when hotel count matches factory approved', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 100 },
      { code: 'B/H', col2_hotelCountIn: 50, col4_factoryApproved: 50 },
    ])

    expect(calculateDiscrepancies(form)).toEqual({})
  })

  it('detects factory approved less than hotel count (negative diff)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 95 },
    ])

    const result = calculateDiscrepancies(form)
    expect(result).toEqual({ 'B/T': -5 }) // 95 - 100 = -5
  })

  it('detects factory approved more than hotel count (positive diff)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 105 },
    ])

    const result = calculateDiscrepancies(form)
    expect(result).toEqual({ 'B/T': 5 }) // 105 - 100 = 5
  })

  it('ignores rows where factory approved is 0 (not yet counted)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 0 },
    ])

    expect(calculateDiscrepancies(form)).toEqual({})
  })

  it('detects multiple discrepancies', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 98 },
      { code: 'B/H', col2_hotelCountIn: 50, col4_factoryApproved: 50 }, // match — no discrepancy
      { code: 'P/C', col2_hotelCountIn: 30, col4_factoryApproved: 32 },
    ])

    const result = calculateDiscrepancies(form)
    expect(result).toEqual({
      'B/T': -2, // 98 - 100
      'P/C': 2,  // 32 - 30
    })
  })
})

describe('hasDiscrepancies', () => {
  it('returns false when no discrepancies', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 100 },
    ])
    expect(hasDiscrepancies(form)).toBe(false)
  })

  it('returns true when discrepancies exist', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 95 },
    ])
    expect(hasDiscrepancies(form)).toBe(true)
  })

  it('returns false when factory has not counted yet (col4=0)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col4_factoryApproved: 0 },
    ])
    expect(hasDiscrepancies(form)).toBe(false)
  })
})
