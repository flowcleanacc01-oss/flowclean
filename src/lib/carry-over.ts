import type { LinenForm } from '@/types'

/**
 * คำนวณผ้าค้างจากรอบก่อน (v3 — 5-column model)
 * ผ้าค้าง = sum(col2_hotelCountIn) - sum(col4_factoryApproved) per item per customer
 * เฉพาะ forms ที่มี date < beforeDate
 */
export function calculateCarryOver(
  forms: LinenForm[],
  customerId: string,
  beforeDate: string
): Record<string, number> {
  const result: Record<string, number> = {}
  const filtered = forms
    .filter(f => f.customerId === customerId && f.date < beforeDate)

  for (const form of filtered) {
    for (const row of form.rows) {
      const diff = row.col2_hotelCountIn - row.col4_factoryApproved
      if (diff > 0) {
        result[row.code] = (result[row.code] || 0) + diff
      }
    }
  }
  return result
}

/**
 * Total carry-over count across all items
 */
export function totalCarryOver(carryOver: Record<string, number>): number {
  return Object.values(carryOver).reduce((sum, v) => sum + v, 0)
}
