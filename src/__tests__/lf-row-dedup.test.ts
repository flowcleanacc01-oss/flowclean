// 413 — collapseDuplicateRows: ลบเฉพาะ row ว่างซ้ำ, ไม่แตะค่า, กัน doubled
import { describe, it, expect } from 'vitest'
import { collapseDuplicateRows, isRowEmpty } from '../lib/lf-row-dedup'
import type { LinenFormRow } from '../types'

const row = (code: string, col6 = 0, extra: Partial<LinenFormRow> = {}): LinenFormRow => ({
  code, col1_carryOver: 0, col2_hotelCountIn: 0, col3_hotelClaimCount: 0,
  col4_factoryApproved: 0, col5_factoryClaimApproved: 0, col6_factoryPackSend: col6,
  note: '', ...extra,
})

describe('isRowEmpty', () => {
  it('row col2-6 = 0 → empty (col1 carry-over ไม่นับ)', () => {
    expect(isRowEmpty(row('H07'))).toBe(true)
    expect(isRowEmpty(row('H07', 0, { col1_carryOver: 5 }))).toBe(true)
    expect(isRowEmpty(row('H07', 35))).toBe(false)
    expect(isRowEmpty(row('H07', 0, { col2_hotelCountIn: 1 }))).toBe(false)
  })
})

describe('collapseDuplicateRows', () => {
  it('no dup → removed 0, rows เดิม', () => {
    const rows = [row('H03', 88), row('H07', 17)]
    const res = collapseDuplicateRows(rows)
    expect(res).not.toBeNull()
    expect(res!.removed).toBe(0)
    expect(res!.rows).toBe(rows)
  })

  it('ghost [0,35] → เก็บแถวค่า 35, ลบ row ว่าง 1, ไม่แตะค่า', () => {
    const rows = [row('H07', 0), row('H07', 35)]
    const res = collapseDuplicateRows(rows)
    expect(res).not.toBeNull()
    expect(res!.removed).toBe(1)
    expect(res!.rows).toHaveLength(1)
    expect(res!.rows[0].col6_factoryPackSend).toBe(35)
  })

  it('ghost ลำดับสลับ [35,0] → เก็บ 35', () => {
    const res = collapseDuplicateRows([row('H07', 35), row('H07', 0)])
    expect(res!.rows).toHaveLength(1)
    expect(res!.rows[0].col6_factoryPackSend).toBe(35)
  })

  it('latent [0,0] → เก็บ 1 ลบ 1', () => {
    const res = collapseDuplicateRows([row('H02', 0), row('H02', 0)])
    expect(res!.removed).toBe(1)
    expect(res!.rows).toHaveLength(1)
  })

  it('doubled [17,17] (non-empty ≥ 2) → null (ห้าม auto)', () => {
    const res = collapseDuplicateRows([row('H07', 17), row('H07', 17)])
    expect(res).toBeNull()
  })

  it('doubled ผสม dup อื่น → null ทั้งใบ (กันแตะ LF ที่มีจุดต้องคนตัดสิน)', () => {
    const res = collapseDuplicateRows([row('H02', 0), row('H02', 0), row('H07', 17), row('H07', 17)])
    expect(res).toBeNull()
  })

  it('หลาย code + รักษาลำดับเดิม', () => {
    const rows = [row('H03', 88), row('H02', 0), row('H07', 0), row('H07', 17), row('H02', 0)]
    const res = collapseDuplicateRows(rows)
    expect(res).not.toBeNull()
    expect(res!.removed).toBe(2) // H02 ลบ 1, H07 ลบ 1
    expect(res!.rows.map(r => r.code)).toEqual(['H03', 'H02', 'H07'])
    expect(res!.rows.find(r => r.code === 'H07')!.col6_factoryPackSend).toBe(17)
  })

  it('คืนค่าเดิม referential เมื่อไม่มีอะไรลบ', () => {
    const rows = [row('A30', 5)]
    expect(collapseDuplicateRows(rows)!.rows).toBe(rows)
  })
})
