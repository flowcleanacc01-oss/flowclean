import type { LinenForm } from '@/types'

/**
 * ตรวจ discrepancy: col2 (โรงแรมนับ) vs col4 (โรงงาน approved)
 * Returns map of code → difference (positive = factory approved more, negative = less)
 * Only items where col4 > 0 and there's a mismatch
 */
export function calculateDiscrepancies(form: LinenForm): Record<string, number> {
  const result: Record<string, number> = {}
  for (const row of form.rows) {
    const hotelCount = row.col2_hotelCountIn
    const factoryApproved = row.col4_factoryApproved
    if (factoryApproved > 0 && hotelCount !== factoryApproved) {
      result[row.code] = factoryApproved - hotelCount
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
