// 362 / 364.1 — เติมผลสกัดจาก AI ลง LF rows (pure + testable)
//
// เติม col2/col3/col5/col6 ตาม code ที่ AI จับคู่ได้ (clamp ≥0)
// + consolidate กลุ่ม aggregate ที่ anchor:
//   - col2 ตาม col2Mode · col5 ตาม col5Mode (default aggregate)
//   - col3 (เคลม) + col6 (แพคส่ง) = per-row เสมอ
//
// customer config = source of truth → ทนทานแม้ AI อ่านปีกกาไม่ออก / ลงเลขผิดแถว / ลืมเขียนปีกกา

import type { Customer, LinenItemDef, LinenFormRow } from '@/types'
import type { AiFillMap } from './ai-extract-types'
import { getOptInGroupsForCustomer, applyAggregateTotal } from './aggregate-groups'

export function applyAiFillToRows(
  rows: LinenFormRow[],
  fill: AiFillMap,
  customer: Pick<Customer, 'aggregateSizeGroups'>,
  catalog: LinenItemDef[],
): LinenFormRow[] {
  // 1) เติมตาม code (clamp ≥0 — กันหัวปีกกาถูกอ่านเป็นเครื่องหมายลบ)
  let next = rows.map(r => {
    const f = fill[r.code]
    if (!f) return r
    return {
      ...r,
      col2_hotelCountIn: Math.max(0, f.col2),
      col3_hotelClaimCount: Math.max(0, f.col3),
      col5_factoryClaimApproved: Math.max(0, f.col5),
      col6_factoryPackSend: Math.max(0, f.col6),
    }
  })

  // 2) consolidate aggregate group ที่ anchor (เฉพาะ col2 + col5)
  const groups = getOptInGroupsForCustomer(customer, catalog, next.map(r => r.code))
  for (const g of groups) {
    if (!g.items.some(i => fill[i.code])) continue   // เฉพาะกลุ่มที่ AI อ่านเจอ — ไม่แตะกลุ่มที่ไม่ได้นำเข้า
    const memberCodes = new Set(g.items.map(i => i.code))
    if (g.config.col2Mode === 'aggregate') {
      const total = next.reduce((s, r) => (memberCodes.has(r.code) ? s + (r.col2_hotelCountIn || 0) : s), 0)
      next = applyAggregateTotal(next, g.items, g.anchorCode, 'col2_hotelCountIn', total)
    }
    if ((g.config.col5Mode ?? 'aggregate') === 'aggregate') {
      const total = next.reduce((s, r) => (memberCodes.has(r.code) ? s + (r.col5_factoryClaimApproved || 0) : s), 0)
      next = applyAggregateTotal(next, g.items, g.anchorCode, 'col5_factoryClaimApproved', total)
    }
  }

  return next
}
