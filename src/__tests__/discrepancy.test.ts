import { describe, it, expect } from 'vitest'
import { calculateCountInDiscrepancies, calculateCountBackDiscrepancies, hasDiscrepancies } from '@/lib/discrepancy'
import type { LinenForm } from '@/types'

function makeForm(rows: Partial<LinenForm['rows'][0]>[]): LinenForm {
  return {
    id: 'form-1',
    formNumber: 'LF-20260301-001',
    customerId: 'cust-1',
    date: '2026-03-01',
    status: 'confirmed',
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

// ============================================================
// Discrepancy Type 1: นับเข้า (col5) ≠ นับส่ง + เคลม (col2 + col3)
// ============================================================
describe('calculateCountInDiscrepancies', () => {
  it('returns empty when factory count-in matches hotel send + claim', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col3_hotelClaimCount: 5, col5_factoryClaimApproved: 105 },
      { code: 'B/H', col2_hotelCountIn: 50, col3_hotelClaimCount: 0, col5_factoryClaimApproved: 50 },
    ])
    expect(calculateCountInDiscrepancies(form)).toEqual({})
  })

  it('detects factory received less than hotel sent (negative diff)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col3_hotelClaimCount: 5, col5_factoryClaimApproved: 100 },
    ])
    const result = calculateCountInDiscrepancies(form)
    expect(result).toEqual({ 'B/T': -5 }) // 100 - (100+5) = -5
  })

  it('detects factory received more than hotel sent (positive diff)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col3_hotelClaimCount: 0, col5_factoryClaimApproved: 103 },
    ])
    const result = calculateCountInDiscrepancies(form)
    expect(result).toEqual({ 'B/T': 3 }) // 103 - 100 = 3
  })

  it('ignores rows where factory has not counted yet (col5=0)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col5_factoryClaimApproved: 0 },
    ])
    expect(calculateCountInDiscrepancies(form)).toEqual({})
  })

  it('handles claim-only items', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 0, col3_hotelClaimCount: 10, col5_factoryClaimApproved: 10 },
    ])
    expect(calculateCountInDiscrepancies(form)).toEqual({}) // 10 = 0+10
  })
})

// ============================================================
// Discrepancy Type 2: นับกลับ (col4) ≠ แพคส่ง (col6)
// ============================================================
describe('calculateCountBackDiscrepancies', () => {
  it('returns empty when customer count-back matches pack send', () => {
    const form = makeForm([
      { code: 'B/T', col6_factoryPackSend: 100, col4_factoryApproved: 100 },
      { code: 'B/H', col6_factoryPackSend: 50, col4_factoryApproved: 50 },
    ])
    expect(calculateCountBackDiscrepancies(form)).toEqual({})
  })

  it('detects customer received less than factory sent (negative diff)', () => {
    const form = makeForm([
      { code: 'B/T', col6_factoryPackSend: 100, col4_factoryApproved: 95 },
    ])
    const result = calculateCountBackDiscrepancies(form)
    expect(result).toEqual({ 'B/T': -5 }) // 95 - 100 = -5
  })

  it('detects customer received more than factory sent (positive diff)', () => {
    const form = makeForm([
      { code: 'B/T', col6_factoryPackSend: 100, col4_factoryApproved: 102 },
    ])
    const result = calculateCountBackDiscrepancies(form)
    expect(result).toEqual({ 'B/T': 2 }) // 102 - 100 = 2
  })

  it('ignores rows where customer has not counted yet (col4=0)', () => {
    const form = makeForm([
      { code: 'B/T', col6_factoryPackSend: 100, col4_factoryApproved: 0 },
    ])
    expect(calculateCountBackDiscrepancies(form)).toEqual({})
  })

  it('detects multiple discrepancies', () => {
    const form = makeForm([
      { code: 'B/T', col6_factoryPackSend: 100, col4_factoryApproved: 98 },
      { code: 'B/H', col6_factoryPackSend: 50, col4_factoryApproved: 50 },
      { code: 'P/C', col6_factoryPackSend: 30, col4_factoryApproved: 32 },
    ])
    const result = calculateCountBackDiscrepancies(form)
    expect(result).toEqual({
      'B/T': -2, // 98 - 100
      'P/C': 2,  // 32 - 30
    })
  })
})

// ============================================================
// hasDiscrepancies (checks both types)
// ============================================================
describe('hasDiscrepancies', () => {
  it('returns false when no discrepancies of any type', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col3_hotelClaimCount: 0, col5_factoryClaimApproved: 100, col6_factoryPackSend: 100, col4_factoryApproved: 100 },
    ])
    expect(hasDiscrepancies(form)).toBe(false)
  })

  it('returns true when count-in discrepancy exists', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col3_hotelClaimCount: 0, col5_factoryClaimApproved: 95 },
    ])
    expect(hasDiscrepancies(form)).toBe(true)
  })

  it('returns true when count-back discrepancy exists', () => {
    const form = makeForm([
      { code: 'B/T', col6_factoryPackSend: 100, col4_factoryApproved: 95 },
    ])
    expect(hasDiscrepancies(form)).toBe(true)
  })

  it('returns false when no data entered yet (all zeros)', () => {
    const form = makeForm([
      { code: 'B/T', col2_hotelCountIn: 100, col5_factoryClaimApproved: 0, col4_factoryApproved: 0 },
    ])
    expect(hasDiscrepancies(form)).toBe(false)
  })
})
