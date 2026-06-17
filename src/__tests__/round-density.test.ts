// 465.2 (B) — ความหนาแน่น รอบ × วัน
import { describe, it, expect } from 'vitest'
import { buildDensity } from '@/lib/round-density'

describe('buildDensity (465.2 B)', () => {
  it('นับคิวต่อรอบต่อวัน + รวม + max + เรียงตาม roundOrder', () => {
    const rows = [
      { roundId: 'rV', cellActive: [true, false, true] },   // V: วัน0,2
      { roundId: 'rV', cellActive: [true, false, false] },  // V: วัน0
      { roundId: 'rS', cellActive: [false, true, true] },   // S: วัน1,2
      { roundId: '', cellActive: [true, false, false] },    // ไม่มีรอบ: วัน0
    ]
    const out = buildDensity(rows, 3, ['rS', 'rV']) // order: rS ก่อน rV
    expect(out.rounds.map(r => r.roundId)).toEqual(['rS', 'rV', '']) // '' ต่อท้าย
    const rV = out.rounds.find(r => r.roundId === 'rV')!
    expect(rV.perDay).toEqual([2, 0, 1])  // วัน0=2 chip, วัน2=1
    expect(rV.total).toBe(3)
    expect(out.perDayTotal).toEqual([3, 1, 2]) // รวมทุกรอบต่อวัน
    expect(out.grandTotal).toBe(6)
    expect(out.max).toBe(2)               // cell สูงสุด (rV วัน0)
  })

  it('ว่าง → ศูนย์', () => {
    const out = buildDensity([], 7, [])
    expect(out.rounds).toEqual([])
    expect(out.grandTotal).toBe(0)
    expect(out.max).toBe(0)
  })
})
