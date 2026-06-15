// 449 P2 — สถิติ baseline จาก visit/leg
import { describe, it, expect } from 'vitest'
import { quantile, summarize, minuteOfDay, customerStats, legStats, arrivalVsWindow, minToHHMM } from '@/lib/visit-stats'
import type { GpsVisit, GpsLeg } from '@/types'

const visit = (over: Partial<GpsVisit>): GpsVisit =>
  ({ id: 'v', date: '2026-06-10', vehicleId: 'V1', driverId: 'D1', roundId: 'R1', customerId: 'A',
    arriveTime: '2026-06-10 08:30:00', departTime: '2026-06-10 08:45:00', dwellMin: 15, confidence: 'high', sequence: 0, ...over } as GpsVisit)

const leg = (over: Partial<GpsLeg>): GpsLeg =>
  ({ id: 'l', date: '2026-06-10', vehicleId: 'V1', driverId: 'D1', roundId: 'R1',
    fromKey: 'c:A', fromCustomerId: 'A', fromName: 'A', toKey: 'c:B', toCustomerId: 'B', toName: 'B',
    departTime: '', arriveTime: '', travelMin: 10, km: 3, fuelL: 0.3, score: 80, ...over } as GpsLeg)

describe('quantile + summarize', () => {
  it('median + p25/p75', () => {
    const d = summarize([10, 20, 30, 40, 50])
    expect(d.n).toBe(5)
    expect(d.median).toBe(30)
    expect(d.p25).toBe(20)
    expect(d.p75).toBe(40)
  })
  it('ว่าง → 0', () => expect(summarize([])).toEqual({ n: 0, median: 0, p25: 0, p75: 0 }))
  it('quantile interpolate', () => expect(quantile([0, 10], 0.5)).toBe(5))
})

describe('minuteOfDay + minToHHMM', () => {
  it('08:30 → 510', () => expect(minuteOfDay('2026-06-10 08:30:00')).toBe(510))
  it('510 → 08:30', () => expect(minToHHMM(510)).toBe('08:30'))
  it('ข้ามวัน wrap', () => expect(minToHHMM(1500)).toBe('01:00'))
})

describe('customerStats', () => {
  const visits = [
    visit({ customerId: 'A', arriveTime: '2026-06-10 08:00:00', departTime: '2026-06-10 08:10:00', dwellMin: 10 }),
    visit({ customerId: 'A', arriveTime: '2026-06-11 08:20:00', departTime: '2026-06-11 08:40:00', dwellMin: 20 }),
    visit({ customerId: 'A', arriveTime: '2026-06-12 08:40:00', departTime: '2026-06-12 09:10:00', dwellMin: 30 }),
    visit({ customerId: 'B', arriveTime: '2026-06-10 09:00:00', departTime: '', dwellMin: 0 }), // จุดสุดท้าย — ไม่นับ dwell
  ]
  const stats = customerStats(visits)

  it('เรียงตามจำนวน visit (A=3 ก่อน B=1)', () => {
    expect(stats.map(s => s.customerId)).toEqual(['A', 'B'])
    expect(stats[0].visits).toBe(3)
  })
  it('A เวลาถึง median 08:20 (=500)', () => expect(stats[0].arrive.median).toBe(500))
  it('A dwell median 20 นาที', () => expect(stats[0].dwell.median).toBe(20))
  it('B ไม่มีเวลาออก → dwell n=0', () => expect(stats[1].dwell.n).toBe(0))
})

describe('legStats', () => {
  const legs = [
    leg({ fromCustomerId: 'A', toCustomerId: 'B', travelMin: 8, km: 3, fuelL: 0.3 }),
    leg({ fromCustomerId: 'A', toCustomerId: 'B', travelMin: 12, km: 3.2, fuelL: 0.35 }),
    leg({ fromCustomerId: 'A', toCustomerId: 'C', travelMin: 20, km: 8, fuelL: 0.8 }),
    leg({ fromCustomerId: 'A', toCustomerId: '', travelMin: 5, km: 1 }), // ปลายไม่ใช่ลูกค้า → ข้าม
  ]
  const stats = legStats(legs)

  it('จับคู่เฉพาะลูกค้า→ลูกค้า (2 คู่: A>B, A>C)', () => {
    expect(stats).toHaveLength(2)
    expect(stats[0]).toMatchObject({ fromCustomerId: 'A', toCustomerId: 'B', trips: 2 })
  })
  it('A→B เวลาเดินทาง median 10 นาที', () => expect(stats[0].travel.median).toBe(10))
})

describe('arrivalVsWindow', () => {
  it('ก่อนหน้าต่าง', () => expect(arrivalVsWindow(420, 5, '08:00', '09:00')).toBe('before')) // 07:00 < 08:00
  it('ในหน้าต่าง', () => expect(arrivalVsWindow(510, 5, '08:00', '09:00')).toBe('in'))
  it('หลังหน้าต่าง', () => expect(arrivalVsWindow(600, 5, '08:00', '09:00')).toBe('after')) // 10:00 > 09:00
  it('ไม่มี window → null', () => expect(arrivalVsWindow(510, 5, '', '')).toBeNull())
  it('n=0 → null', () => expect(arrivalVsWindow(510, 0, '08:00', '09:00')).toBeNull())
})
