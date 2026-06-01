// 396.2 — fit-to-page metrics tests
import { describe, it, expect } from 'vitest'
import { computeFormMetrics, pageBoxPx, FINE_MIN, FINE_MAX } from '@/lib/form-fit'

describe('computeFormMetrics — fit mode', () => {
  it('N น้อย → แถวสูง (clamp max) ฟอนต์ใหญ่สุด', () => {
    const m = computeFormMetrics(5, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    expect(m.rowHeightPx).toBe(58)       // hit ROW_H_MAX.full
    expect(m.fontPx).toBe(15)            // hit FONT_MAX.full
  })

  it('N มาก → แถวเตี้ย (clamp min) ฟอนต์เล็กสุด', () => {
    const m = computeFormMetrics(60, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    expect(m.rowHeightPx).toBe(22)       // hit ROW_H_MIN.full
    expect(m.fontPx).toBe(10)            // hit FONT_MIN.full
  })

  it('N กลาง (23) → แถวพอดี ไม่ชน clamp · ฟอนต์อ่านออก', () => {
    const m = computeFormMetrics(23, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    expect(m.rowHeightPx).toBeGreaterThan(22)
    expect(m.rowHeightPx).toBeLessThan(58)
    expect(m.fontPx).toBeGreaterThanOrEqual(10)
    expect(m.fontPx).toBeLessThanOrEqual(15)
  })

  it('N เท่ากัน แต่ N มากกว่า → แถวเตี้ยกว่า (monotonic)', () => {
    const a = computeFormMetrics(16, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    const b = computeFormMetrics(27, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    expect(a.rowHeightPx).toBeGreaterThan(b.rowHeightPx)
  })

  it('fit: N แถว × rowHeight ≤ พื้นที่ตาราง (ไม่ล้น 1 หน้า)', () => {
    // 405: a4 portrait content ~1085, overhead LF full 265 + safety 24 → tableH ~796
    for (const n of [16, 19, 21, 23, 25, 27]) {
      const m = computeFormMetrics(n, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
      expect(m.rowHeightPx * n).toBeLessThanOrEqual(796)   // floor → ไม่เกิน tableH
    }
  })

  it('checklist overhead น้อยกว่า LF → แถวสูงกว่าที่ N เท่ากัน', () => {
    const lf = computeFormMetrics(23, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    const ck = computeFormMetrics(23, { kind: 'checklist', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    expect(ck.rowHeightPx).toBeGreaterThanOrEqual(lf.rowHeightPx)
  })

  it('2-up (compact) → แถว/ฟอนต์เล็กกว่า a4 เดี่ยว', () => {
    const single = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    const twoUp = computeFormMetrics(20, { kind: 'lf', printMode: 'a4-2up', fitMode: 'fit', fineLevel: 0 })
    expect(twoUp.rowHeightPx).toBeLessThan(single.rowHeightPx)
    expect(twoUp.fontPx).toBeLessThanOrEqual(single.fontPx)
  })
})

describe('computeFormMetrics — fine adjust', () => {
  it('+fine → สูงขึ้น, −fine → เตี้ยลง', () => {
    const base = computeFormMetrics(30, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: 0 })
    const up = computeFormMetrics(30, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: 2 })
    const down = computeFormMetrics(30, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: -2 })
    expect(up.rowHeightPx).toBeGreaterThan(base.rowHeightPx)
    expect(down.rowHeightPx).toBeLessThan(base.rowHeightPx)
  })

  it('fine เกินช่วง → clamp ไม่พัง', () => {
    const lo = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: -99 })
    const hi = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: 99 })
    const atMin = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: FINE_MIN })
    const atMax = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: FINE_MAX })
    expect(lo.rowHeightPx).toBe(atMin.rowHeightPx)
    expect(hi.rowHeightPx).toBe(atMax.rowHeightPx)
  })
})

describe('computeFormMetrics — preset modes', () => {
  it('โปร่ง > ปกติ > แน่น (row height)', () => {
    const o = { kind: 'lf' as const, printMode: 'a4' as const, fineLevel: 0 }
    const loose = computeFormMetrics(20, { ...o, fitMode: 'loose' })
    const normal = computeFormMetrics(20, { ...o, fitMode: 'normal' })
    const dense = computeFormMetrics(20, { ...o, fitMode: 'dense' })
    expect(loose.rowHeightPx).toBeGreaterThan(normal.rowHeightPx)
    expect(normal.rowHeightPx).toBeGreaterThan(dense.rowHeightPx)
  })

  it('preset ไม่ขึ้นกับ N (fixed)', () => {
    const a = computeFormMetrics(5, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: 0 })
    const b = computeFormMetrics(40, { kind: 'lf', printMode: 'a4', fitMode: 'normal', fineLevel: 0 })
    expect(a.rowHeightPx).toBe(b.rowHeightPx)
  })
})

// 398.2 — CK ส่วนมาก 5-10 แถว (2-up = compact): เดิม fit ชน cap 38 + presets < fit → 3 ปุ่มเป็นแค่ระดับบีบ
describe('computeFormMetrics — 398.2 CK 2-up few rows', () => {
  it('CK 8 แถว fit → เติมเกือบเต็มหน้า (rowH ใหญ่ ~69 + ฟอนต์ใหญ่สุด) · 405 overhead เพิ่มกันล้นหน้า 2', () => {
    const m = computeFormMetrics(8, { kind: 'checklist', printMode: 'a4-2up', fitMode: 'fit', fineLevel: 0 })
    expect(m.rowHeightPx).toBe(69)       // 405: tableH (756−180−24)=552 ÷ 8 = 69 (เดิม 72 ชน cap · overhead น้อยไป → ล้น)
    expect(m.fontPx).toBe(15)            // ยังชน FONT_MAX.compact
  })
  it('CK presets โปร่ง/ปกติ/แน่น = 56/40/28 (span ใช้ได้จริง ไม่ใช่ไล่บีบอย่างเดียว)', () => {
    const o = { kind: 'checklist' as const, printMode: 'a4-2up' as const, fineLevel: 0 }
    expect(computeFormMetrics(8, { ...o, fitMode: 'loose' }).rowHeightPx).toBe(56)
    expect(computeFormMetrics(8, { ...o, fitMode: 'normal' }).rowHeightPx).toBe(40)
    expect(computeFormMetrics(8, { ...o, fitMode: 'dense' }).rowHeightPx).toBe(28)
  })
})

describe('pageBoxPx', () => {
  it('a4 เดี่ยว = portrait (สูง > กว้าง)', () => {
    const p = pageBoxPx('a4')
    expect(p.h).toBeGreaterThan(p.w)
    expect(p.halfW).toBe(0)
  })
  it('2-up = landscape (กว้าง > สูง) + halfW ≈ ครึ่ง', () => {
    const p = pageBoxPx('a4-2up')
    expect(p.w).toBeGreaterThan(p.h)
    expect(Math.abs(p.halfW - p.w / 2)).toBeLessThanOrEqual(1)
  })
})

// 408 — orientation/paperSize/margin-aware (AKARA landscape เดี่ยว + save ค่าใน template)
describe('408 — orientation / margin / paper aware', () => {
  it('a4 เดี่ยว landscape → พื้นที่สูงน้อยกว่า portrait → rowH เล็กกว่า (N เท่ากัน)', () => {
    const portrait = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0, orientation: 'portrait' })
    const landscape = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0, orientation: 'landscape' })
    expect(landscape.rowHeightPx).toBeLessThan(portrait.rowHeightPx)
  })
  it('a4 เดี่ยว default = portrait (ไม่ส่ง orientation = ค่าเดิม)', () => {
    const def = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0 })
    const portrait = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0, orientation: 'portrait' })
    expect(def.rowHeightPx).toBe(portrait.rowHeightPx)
  })
  it('margin กว้าง → พื้นที่น้อยลง → rowH เล็กกว่า narrow', () => {
    const narrow = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0, margin: 'narrow' })
    const wide = computeFormMetrics(20, { kind: 'lf', printMode: 'a4', fitMode: 'fit', fineLevel: 0, margin: 'wide' })
    expect(wide.rowHeightPx).toBeLessThan(narrow.rowHeightPx)
  })
  it('pageBoxPx a4 landscape = กว้าง > สูง (สลับจาก portrait)', () => {
    const p = pageBoxPx('a4', 'landscape')
    expect(p.w).toBeGreaterThan(p.h)
  })
  it('a4-2up บังคับ landscape เสมอ (ส่ง portrait ก็ไม่เปลี่ยน)', () => {
    const a = computeFormMetrics(10, { kind: 'checklist', printMode: 'a4-2up', fitMode: 'fit', fineLevel: 0, orientation: 'portrait' })
    const b = computeFormMetrics(10, { kind: 'checklist', printMode: 'a4-2up', fitMode: 'fit', fineLevel: 0, orientation: 'landscape' })
    expect(a.rowHeightPx).toBe(b.rowHeightPx)
  })
})
