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
  // 1) เติมตาม code — เขียนเฉพาะคอลัมน์ที่ AI เห็น (≠ null) · clamp ≥0 (กันหัวปีกกาอ่านเป็นลบ)
  //    null = สแกนไม่เห็นคอลัมน์นั้น → คงค่าเดิม (กัน data loss ตอนเอกสารมีไม่ครบช่อง)
  let next = rows.map(r => {
    const f = fill[r.code]
    if (!f) return r
    return {
      ...r,
      ...(f.col2 != null ? { col2_hotelCountIn: Math.max(0, f.col2) } : {}),
      ...(f.col3 != null ? { col3_hotelClaimCount: Math.max(0, f.col3) } : {}),
      ...(f.col5 != null ? { col5_factoryClaimApproved: Math.max(0, f.col5) } : {}),
      ...(f.col6 != null ? { col6_factoryPackSend: Math.max(0, f.col6) } : {}),
    }
  })

  // 2) consolidate aggregate group ที่ anchor (เฉพาะ col2 + col5) — ใช้ค่าจากสแกน (replace ทั้งกลุ่ม)
  //    ทำเฉพาะคอลัมน์ที่สแกนเห็น (มี member ≠ null) → ไม่ wipe ค่าเดิมถ้าเอกสารไม่มีคอลัมน์นั้น
  const groups = getOptInGroupsForCustomer(customer, catalog, next.map(r => r.code))
  for (const g of groups) {
    const members = g.items.filter(i => fill[i.code])   // members ที่ AI อ่านเจอ
    if (members.length === 0) continue
    if (g.config.col2Mode === 'aggregate') {
      const vals = members.map(i => fill[i.code].col2).filter((v): v is number => v != null)
      if (vals.length > 0) {
        const total = vals.reduce((s, v) => s + Math.max(0, v), 0)
        next = applyAggregateTotal(next, g.items, g.anchorCode, 'col2_hotelCountIn', total)
      }
    }
    if ((g.config.col5Mode ?? 'aggregate') === 'aggregate') {
      const vals = members.map(i => fill[i.code].col5).filter((v): v is number => v != null)
      if (vals.length > 0) {
        const total = vals.reduce((s, v) => s + Math.max(0, v), 0)
        next = applyAggregateTotal(next, g.items, g.anchorCode, 'col5_factoryClaimApproved', total)
      }
    }
  }

  return next
}
