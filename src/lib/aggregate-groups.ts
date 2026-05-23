// 317 Phase 2 — Aggregate Group Helpers
//
// Option X: เก็บค่า "รวม" ที่ row anchor (median sortOrder ของ group)
// ตรงกับ workflow บน paper ของติ๊ด — เขียน col5 ที่ row 5ft (กลาง)
//
// Anchor logic:
//   - Sort items ใน group ตาม sortOrder
//   - เลือก median index (floor((n-1)/2))
//   - เช่น BEDSHEET = [S/T, S/Q, S/K] → anchor = S/Q (index 1)
//   - เช่น 2 items → anchor = item แรก
//   - เช่น 4 items → anchor = item ที่ 2

import type { Customer, LinenItemDef, LinenFormRow, AggregateSizeGroupConfig } from '@/types'

export interface GroupContext {
  /** Group key (จาก LinenItemDef.sizeGroup) */
  groupKey: string
  /** Config ของ customer สำหรับ group นี้ */
  config: AggregateSizeGroupConfig
  /** Items ใน group (sorted by sortOrder) */
  items: LinenItemDef[]
  /** Anchor code (median sortOrder) — ที่เก็บค่า aggregate */
  anchorCode: string
}

/**
 * หา anchor code ของ group
 *
 * Priority:
 *   1. configAnchor (manual override จาก customer config) — ถ้าอยู่ใน items
 *   2. median sortOrder (default automatic)
 *
 * 335: user เลือก anchor เองได้ผ่าน AggregateGroupsModal
 */
export function getGroupAnchorCode(items: LinenItemDef[], configAnchor?: string): string {
  if (items.length === 0) return ''
  // Manual override: ใช้ถ้าอยู่ใน items
  if (configAnchor && items.some(i => i.code === configAnchor)) {
    return configAnchor
  }
  // Default: median sortOrder
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  const medianIdx = Math.floor((sorted.length - 1) / 2)
  return sorted[medianIdx].code
}

/**
 * รวบรวม groups ที่ customer opt-in + items + anchor — สำหรับ LF UI
 *
 * @param customer  Customer record
 * @param catalog   Linen catalog (ใช้ดูว่า code ไหนอยู่ใน group ไหน)
 * @param itemCodes Codes ที่ LF นี้ใช้ (จาก QT หรือ enabledItems) — filter เฉพาะที่ relevant
 */
export function getOptInGroupsForCustomer(
  customer: Pick<Customer, 'aggregateSizeGroups'>,
  catalog: LinenItemDef[],
  itemCodes?: string[],
): GroupContext[] {
  const optIn = customer.aggregateSizeGroups ?? []
  if (optIn.length === 0) return []

  const relevantCodes = itemCodes ? new Set(itemCodes) : null

  const result: GroupContext[] = []
  for (const cfg of optIn) {
    const items = catalog
      .filter(it => it.sizeGroup === cfg.groupKey)
      .filter(it => !relevantCodes || relevantCodes.has(it.code))
    if (items.length === 0) continue
    result.push({
      groupKey: cfg.groupKey,
      config: cfg,
      items: items.sort((a, b) => a.sortOrder - b.sortOrder),
      anchorCode: getGroupAnchorCode(items, cfg.anchorCode),
    })
  }

  return result.sort((a, b) => a.groupKey.localeCompare(b.groupKey))
}

/**
 * คำนวณ aggregate sum ของ field ใน group (ใช้แสดงค่าปัจจุบันใน group input)
 */
export function sumGroupField(
  rows: LinenFormRow[],
  groupItems: LinenItemDef[],
  field: 'col2_hotelCountIn' | 'col5_factoryClaimApproved',
): number {
  let sum = 0
  const codes = new Set(groupItems.map(i => i.code))
  for (const r of rows) {
    if (!codes.has(r.code)) continue
    sum += r[field] || 0
  }
  return sum
}

/**
 * Apply ยอดรวมที่ anchor row — set anchor[field]=total, rows อื่นในกลุ่ม [field]=0
 *
 * @param rows       Current rows
 * @param groupItems Items ใน group (กำหนดว่า rows ไหนใน group)
 * @param anchorCode Code ของ row anchor
 * @param field      Column ที่จะ apply (col2 หรือ col5)
 * @param total      ค่ารวมที่ user กรอก
 */
export function applyAggregateTotal(
  rows: LinenFormRow[],
  groupItems: LinenItemDef[],
  anchorCode: string,
  field: 'col2_hotelCountIn' | 'col5_factoryClaimApproved',
  total: number,
): LinenFormRow[] {
  const codes = new Set(groupItems.map(i => i.code))
  // อัปเดต rows ที่มี code อยู่ใน group
  const updated = rows.map(r => {
    if (!codes.has(r.code)) return r
    if (r.code === anchorCode) return { ...r, [field]: total }
    return { ...r, [field]: 0 }
  })
  // ถ้า anchor row ยังไม่มี (ไม่เคยกรอกเลย) → push ใหม่
  if (!updated.some(r => r.code === anchorCode) && total > 0) {
    updated.push({
      code: anchorCode,
      col1_carryOver: 0,
      col2_hotelCountIn: 0,
      col3_hotelClaimCount: 0,
      col4_factoryApproved: 0,
      col5_factoryClaimApproved: 0,
      col6_factoryPackSend: 0,
      note: '',
      [field]: total,
    })
  }
  return updated
}
