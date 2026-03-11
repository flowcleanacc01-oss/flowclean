import type { LinenForm } from '@/types'

/**
 * Discrepancy Type 1: โรงซักนับเข้า ≠ (ลูกค้านับส่ง + เคลม)
 * col5 (นับเข้า) vs col2 + col3 (นับส่ง + เคลม)
 * แสดง ⚠ ที่ Col4 (UI: โรงซักนับเข้า)
 */
export function calculateCountInDiscrepancies(form: LinenForm): Record<string, number> {
  const result: Record<string, number> = {}
  for (const row of form.rows) {
    const expected = row.col2_hotelCountIn + row.col3_hotelClaimCount
    const actual = row.col5_factoryClaimApproved
    if (actual > 0 && actual !== expected) {
      result[row.code] = actual - expected
    }
  }
  return result
}

/**
 * Discrepancy Type 2: ลูกค้านับกลับ ≠ โรงซักแพคส่ง
 * col4 (นับกลับ) vs col6 (แพคส่ง)
 * แสดง ⚠ ที่ Col8 (UI: ลูกค้านับกลับ)
 */
export function calculateCountBackDiscrepancies(form: LinenForm): Record<string, number> {
  const result: Record<string, number> = {}
  for (const row of form.rows) {
    const packSend = row.col6_factoryPackSend || 0
    const countBack = row.col4_factoryApproved
    if (countBack > 0 && countBack !== packSend) {
      result[row.code] = countBack - packSend
    }
  }
  return result
}

/**
 * Check if a form has any discrepancies (either type)
 * Type 2 (col4 vs col6) only relevant at delivered/confirmed
 * (before that, col4 is used for เคลมOK, not ลูกค้านับผ้ากลับ)
 */
/** Type 1 only: โรงซักนับเข้า ≠ นับส่ง+เคลม */
export function hasType1Discrepancy(form: LinenForm): boolean {
  return Object.keys(calculateCountInDiscrepancies(form)).length > 0
}

/** Type 2 only: ลูกค้านับกลับ ≠ แพคส่ง (only at delivered/confirmed) */
export function hasType2Discrepancy(form: LinenForm): boolean {
  return ['delivered', 'confirmed'].includes(form.status) &&
    Object.keys(calculateCountBackDiscrepancies(form)).length > 0
}

/**
 * Check if a form has any discrepancies (either type)
 * Type 2 (col4 vs col6) only relevant at delivered/confirmed
 */
export function hasDiscrepancies(form: LinenForm): boolean {
  return hasType1Discrepancy(form) || hasType2Discrepancy(form)
}
