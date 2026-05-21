// 317 Phase 1 — Carry-over by Size Group (read-only view)
//
// รวม carry-over per-code → per-group สำหรับลูกค้าที่ opt-in size groups
//
// Logic:
//   group_carry = Σ (carry[code]) ของทุก code ที่ sizeGroup ตรงกับ groupKey
//
// ทำไม sum (ไม่ใช่ abs)?
//   - ตอนรับเข้านับรวม → ใส่ค่าที่ row กลาง → row นั้นจะมี carry ติดลบ (col5 มี, col6 ไม่มี)
//   - row อื่นๆ ของ group เดียวกัน → carry เป็นบวก (col6 แพคส่งจริง)
//   - sum รวมจะหักล้างกัน → ได้ค่า "ค้าง/คืน" จริงของ group นั้น
//
// ตัวอย่าง KAYA BEDSHEET:
//   ผ้าปู 3.5: +219 (col6 มี, col5=0)
//   ผ้าปู 5:   -576 (col5 มี, col6=0)  ← row กลาง รับยอดรวม
//   ผ้าปู 6:   +372 (col6 มี, col5=0)
//   sum = +15  ← carry จริง (เกินส่งคืน 15 ผืน)

import type { LinenItemDef, Customer } from '@/types'

export interface CarryOverByGroupRow {
  /** Group key (จาก LinenItemDef.sizeGroup) */
  groupKey: string
  /** Net carry-over ของทั้ง group (sum, ไม่ใช่ abs) */
  netCarry: number
  /** Items ใน group + carry-over แต่ละตัว */
  items: { code: string; name: string; carry: number }[]
  /** Customer config (col2Mode) — null ถ้าลูกค้าไม่ opt-in */
  col2Mode: 'aggregate' | 'per_row' | null
}

export interface CarryOverUngroupedRow {
  code: string
  name: string
  carry: number
}

export interface CarryOverGroupedResult {
  /** Groups ที่ customer opt-in — แสดงเป็นกลุ่ม */
  groups: CarryOverByGroupRow[]
  /** Items ที่ไม่อยู่ใน opt-in group — แสดงเป็นรายการแยก (เหมือนเดิม) */
  ungrouped: CarryOverUngroupedRow[]
}

/**
 * จัดกลุ่ม carry-over per code → per group + ungrouped list
 *
 * @param carryOver  Output จาก getCarryOver — { [code]: qty }
 * @param customer   Customer record (ใช้ aggregateSizeGroups)
 * @param catalog    Linen catalog (ใช้ sizeGroup mapping)
 */
export function groupCarryOver(
  carryOver: Record<string, number>,
  customer: Pick<Customer, 'aggregateSizeGroups'>,
  catalog: LinenItemDef[],
): CarryOverGroupedResult {
  const optIn = customer.aggregateSizeGroups ?? []
  const optInKeys = new Set(optIn.map(c => c.groupKey))
  const catalogMap = new Map(catalog.map(i => [i.code, i]))

  const groupMap = new Map<string, CarryOverByGroupRow>()
  const ungrouped: CarryOverUngroupedRow[] = []

  for (const [code, qty] of Object.entries(carryOver)) {
    if (qty === 0) continue
    const item = catalogMap.get(code)
    const groupKey = item?.sizeGroup
    const itemName = item?.name || code

    if (groupKey && optInKeys.has(groupKey)) {
      // ผูกเข้ากลุ่ม
      if (!groupMap.has(groupKey)) {
        const cfg = optIn.find(c => c.groupKey === groupKey)
        groupMap.set(groupKey, {
          groupKey,
          netCarry: 0,
          items: [],
          col2Mode: cfg?.col2Mode ?? null,
        })
      }
      const grp = groupMap.get(groupKey)!
      grp.netCarry += qty
      grp.items.push({ code, name: itemName, carry: qty })
    } else {
      ungrouped.push({ code, name: itemName, carry: qty })
    }
  }

  // Sort items ใน group ตาม catalog sortOrder
  for (const grp of groupMap.values()) {
    grp.items.sort((a, b) => {
      const aOrder = catalogMap.get(a.code)?.sortOrder ?? 9999
      const bOrder = catalogMap.get(b.code)?.sortOrder ?? 9999
      return aOrder - bOrder
    })
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.groupKey.localeCompare(b.groupKey))
  ungrouped.sort((a, b) => {
    const aOrder = catalogMap.get(a.code)?.sortOrder ?? 9999
    const bOrder = catalogMap.get(b.code)?.sortOrder ?? 9999
    return aOrder - bOrder
  })

  return { groups, ungrouped }
}

/**
 * Customer ใช้ aggregate groups ไหม — helper เพื่อตัดสินใจ default view
 */
export function customerUsesAggregateGroups(customer: Pick<Customer, 'aggregateSizeGroups'>): boolean {
  return (customer.aggregateSizeGroups?.length ?? 0) > 0
}
