import type { LinenForm } from '@/types'

/**
 * ตรวจ discrepancy: col1 + col2 (ส่งซัก) vs col4 (โรงงานนับเข้า)
 * Returns map of code → difference (positive = counted more, negative = counted less)
 * Only items where col4 > 0 and there's a mismatch
 */
export function calculateDiscrepancies(form: LinenForm): Record<string, number> {
  const result: Record<string, number> = {}
  for (const row of form.rows) {
    const sent = row.col1_normalSend + row.col2_claimSend
    const counted = row.col4_factoryCountIn
    if (counted > 0 && sent !== counted) {
      result[row.code] = counted - sent
    }
  }
  return result
}

/**
 * Check if a form has any discrepancies
 */
export function hasDiscrepancies(form: LinenForm): boolean {
  return Object.keys(calculateDiscrepancies(form)).length > 0
}
