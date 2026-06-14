import { describe, it, expect } from 'vitest'
import { buildFractions, posAt } from '@/lib/route-playback'
import type { GpsTrackPoint } from '@/lib/v2x-types'

const P = (lat: number, lng: number, time?: string): GpsTrackPoint => ({ lat, lng, speed: 0, time: time ?? null })

describe('buildFractions', () => {
  it('empty / single', () => {
    expect(buildFractions([])).toEqual([])
    expect(buildFractions([P(0, 0)])).toEqual([0])
  })

  it('no timestamps → เฉลี่ยตาม index (0..1)', () => {
    const fr = buildFractions([P(0, 0), P(1, 1), P(2, 2), P(3, 3)])
    expect(fr).toEqual([0, 1 / 3, 2 / 3, 1])
  })

  it('null time ทุกจุด (เคส V2X ปัจจุบัน) → เฉลี่ยตาม index', () => {
    const fr = buildFractions([P(0, 0), P(1, 1), P(2, 2)])
    expect(fr).toEqual([0, 0.5, 1])
  })

  it('ทุกจุดมี time จริง (เพิ่มขึ้น) → กระจายตามเวลาจริง', () => {
    // 0s, 30s, 120s → fractions 0, .25, 1 (span 120s)
    const fr = buildFractions([
      P(0, 0, '2026-06-12 10:00:00'),
      P(1, 1, '2026-06-12 10:00:30'),
      P(2, 2, '2026-06-12 10:02:00'),
    ])
    expect(fr[0]).toBeCloseTo(0)
    expect(fr[1]).toBeCloseTo(0.25)
    expect(fr[2]).toBeCloseTo(1)
  })

  it('time บางจุดหาย → fallback เฉลี่ยตาม index (ไม่ใช้เวลาบางส่วน)', () => {
    const fr = buildFractions([P(0, 0, '2026-06-12 10:00:00'), P(1, 1), P(2, 2, '2026-06-12 10:01:00')])
    expect(fr).toEqual([0, 0.5, 1])
  })
})

describe('posAt', () => {
  const pts = [P(0, 0), P(10, 0), P(10, 10)] // fractions [0, .5, 1]
  const fr = buildFractions(pts)

  it('f<=0 → จุดแรก', () => {
    expect(posAt(pts, fr, 0)).toEqual({ pos: [0, 0], idx: 0 })
    expect(posAt(pts, fr, -1)).toEqual({ pos: [0, 0], idx: 0 })
  })

  it('f>=1 → จุดสุดท้าย', () => {
    expect(posAt(pts, fr, 1)).toEqual({ pos: [10, 10], idx: 2 })
    expect(posAt(pts, fr, 2)).toEqual({ pos: [10, 10], idx: 2 })
  })

  it('กึ่งกลาง segment แรก (f=0.25) → lerp ครึ่งทาง 0→10 lat', () => {
    const r = posAt(pts, fr, 0.25)
    expect(r.pos[0]).toBeCloseTo(5)
    expect(r.pos[1]).toBeCloseTo(0)
    expect(r.idx).toBe(0)
  })

  it('กึ่งกลาง segment สอง (f=0.75) → lerp ครึ่งทาง 0→10 lng', () => {
    const r = posAt(pts, fr, 0.75)
    expect(r.pos[0]).toBeCloseTo(10)
    expect(r.pos[1]).toBeCloseTo(5)
    expect(r.idx).toBe(1)
  })

  it('จุดต่อพอดี (f=0.5) → ตรงจุดที่ 2', () => {
    const r = posAt(pts, fr, 0.5)
    expect(r.pos[0]).toBeCloseTo(10)
    expect(r.pos[1]).toBeCloseTo(0)
  })

  it('points ว่าง → default กรุงเทพฯ (ไม่ crash)', () => {
    expect(posAt([], [], 0.5).pos).toEqual([13.736, 100.56])
  })
})
