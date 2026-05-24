import { describe, it, expect } from 'vitest'
import { applyAiFillToRows } from '@/lib/ai-fill'
import type { LinenFormRow, LinenItemDef, Customer, AggregateSizeGroupConfig } from '@/types'
import type { AiFillMap } from '@/lib/ai-extract-types'

// ── fixtures ──────────────────────────────────────────────
function row(code: string, partial: Partial<LinenFormRow> = {}): LinenFormRow {
  return {
    code,
    col1_carryOver: 0,
    col2_hotelCountIn: 0,
    col3_hotelClaimCount: 0,
    col4_factoryApproved: 0,
    col5_factoryClaimApproved: 0,
    col6_factoryPackSend: 0,
    note: '',
    ...partial,
  }
}
function item(code: string, sortOrder: number, sizeGroup?: string): LinenItemDef {
  return { code, name: code, nameEn: code, category: 'linen', unit: 'ชิ้น', defaultPrice: 0, sortOrder, sizeGroup }
}
function cust(groups: AggregateSizeGroupConfig[]): Pick<Customer, 'aggregateSizeGroups'> {
  return { aggregateSizeGroups: groups }
}
const f = (col2: number, col3 = 0, col5 = 0, col6 = 0) => ({ col2, col3, col5, col6 })

// BEDSHEET group [S/T(1), S/Q(2), S/K(3)] — anchor = median = S/Q
const BED = [item('S/T', 1, 'BED'), item('S/Q', 2, 'BED'), item('S/K', 3, 'BED')]
const bedRows = () => [row('S/T'), row('S/Q'), row('S/K')]
const get = (rows: LinenFormRow[], code: string) => rows.find(r => r.code === code)!

describe('applyAiFillToRows', () => {
  it('per_row customer: fills all 4 cols as-is, untouched rows unchanged', () => {
    const fill: AiFillMap = { A: f(10, 1, 9, 8) }
    const out = applyAiFillToRows([row('A'), row('B')], fill, cust([]), [item('A', 1), item('B', 2)])
    expect(out[0]).toMatchObject({
      col2_hotelCountIn: 10, col3_hotelClaimCount: 1, col5_factoryClaimApproved: 9, col6_factoryPackSend: 8,
    })
    expect(out[1].col2_hotelCountIn).toBe(0)
  })

  it('clamps negatives to 0 (หัวปีกกาถูกอ่านเป็นลบ)', () => {
    const out = applyAiFillToRows([row('A')], { A: f(-19, -2) }, cust([]), [item('A', 1)])
    expect(out[0].col2_hotelCountIn).toBe(0)
    expect(out[0].col3_hotelClaimCount).toBe(0)
  })

  it('aggregate col2: value on anchor stays at anchor, others 0', () => {
    const customer = cust([{ groupKey: 'BED', col2Mode: 'aggregate' }])
    const out = applyAiFillToRows(bedRows(), { 'S/Q': f(19) }, customer, BED)
    expect(get(out, 'S/Q').col2_hotelCountIn).toBe(19)
    expect(get(out, 'S/T').col2_hotelCountIn).toBe(0)
    expect(get(out, 'S/K').col2_hotelCountIn).toBe(0)
  })

  it('aggregate col2: value on WRONG row → consolidated to anchor (เขียนเลขผิดแถว)', () => {
    const customer = cust([{ groupKey: 'BED', col2Mode: 'aggregate' }])
    const out = applyAiFillToRows(bedRows(), { 'S/T': f(19) }, customer, BED)
    expect(get(out, 'S/Q').col2_hotelCountIn).toBe(19) // moved to anchor
    expect(get(out, 'S/T').col2_hotelCountIn).toBe(0)
  })

  it('aggregate col2: per-size numbers summed to anchor (ลืมเขียนปีกกา)', () => {
    const customer = cust([{ groupKey: 'BED', col2Mode: 'aggregate' }])
    const out = applyAiFillToRows(bedRows(), { 'S/T': f(5), 'S/Q': f(8), 'S/K': f(6) }, customer, BED)
    expect(get(out, 'S/Q').col2_hotelCountIn).toBe(19) // 5+8+6
    expect(get(out, 'S/T').col2_hotelCountIn).toBe(0)
    expect(get(out, 'S/K').col2_hotelCountIn).toBe(0)
  })

  it('col5Mode default=aggregate consolidates; col6 stays per-row; per_row col2 untouched', () => {
    const customer = cust([{ groupKey: 'BED', col2Mode: 'per_row' }]) // col5Mode unset → default aggregate
    const fill: AiFillMap = { 'S/T': f(0, 0, 0, 5), 'S/Q': f(0, 0, 13, 8), 'S/K': f(0, 0, 0, 6) }
    const out = applyAiFillToRows(bedRows(), fill, customer, BED)
    // col5 aggregate → at anchor
    expect(get(out, 'S/Q').col5_factoryClaimApproved).toBe(13)
    expect(get(out, 'S/T').col5_factoryClaimApproved).toBe(0)
    // col6 per-row → unchanged
    expect(get(out, 'S/T').col6_factoryPackSend).toBe(5)
    expect(get(out, 'S/Q').col6_factoryPackSend).toBe(8)
    expect(get(out, 'S/K').col6_factoryPackSend).toBe(6)
  })

  it('untouched group preserved (ไม่แตะกลุ่มที่ AI ไม่ได้อ่าน)', () => {
    const customer = cust([
      { groupKey: 'BED', col2Mode: 'aggregate' },
      { groupKey: 'TOWEL', col2Mode: 'aggregate' },
    ])
    const catalog = [...BED, item('T/1', 4, 'TOWEL'), item('T/2', 5, 'TOWEL')]
    const rows = [...bedRows(), row('T/1', { col2_hotelCountIn: 5 }), row('T/2', { col2_hotelCountIn: 7 })]
    const out = applyAiFillToRows(rows, { 'S/Q': f(19) }, customer, catalog) // only BED touched
    expect(get(out, 'S/Q').col2_hotelCountIn).toBe(19)
    expect(get(out, 'T/1').col2_hotelCountIn).toBe(5) // preserved
    expect(get(out, 'T/2').col2_hotelCountIn).toBe(7) // preserved
  })
})
