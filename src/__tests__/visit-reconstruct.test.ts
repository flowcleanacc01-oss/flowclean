// 449 P1 — reconstruct visit/leg จาก GPS trips
import { describe, it, expect } from 'vitest'
import { reconstructVisitsLegs, resolveRoundDriver, type RoundWindow } from '@/lib/visit-reconstruct'
import type { LatLng } from '@/lib/geo'
import type { GpsTrip } from '@/lib/v2x-types'
import type { Customer } from '@/types'

const factory: LatLng = { lat: 13.50, lng: 100.50 }
const A = { lat: 13.60, lng: 100.60 }
const B = { lat: 13.70, lng: 100.70 }

const cust = (id: string, lat: number, lng: number, shortName: string): Customer =>
  ({ id, shortName, name: shortName, gpsLat: lat, gpsLng: lng, isActive: true } as Customer)

const customers = [cust('A', A.lat, A.lng, 'ลูกค้าA'), cust('B', B.lat, B.lng, 'ลูกค้าB')]

const trip = (over: Partial<GpsTrip>): GpsTrip =>
  ({ tripId: 't', startTime: '', endTime: '', startLat: 0, startLng: 0, endLat: 0, endLng: 0,
    distanceKm: 5, fuelLiters: 0.5, score: 80, plate: '', plateNorm: '', ...over } as GpsTrip)

const ctx1 = { date: '2026-06-10', vehicleId: 'V1', roundWindows: [{ roundId: 'R1', driverId: 'D1', start: '07:00', end: '12:00' }] as RoundWindow[] }

describe('reconstructVisitsLegs', () => {
  const trips = [
    trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 08:40:00', startLat: factory.lat, startLng: factory.lng, endLat: A.lat, endLng: A.lng, distanceKm: 16, fuelLiters: 1.6 }),
    trip({ startTime: '2026-06-10 08:52:00', endTime: '2026-06-10 09:01:00', startLat: A.lat, startLng: A.lng, endLat: B.lat, endLng: B.lng, distanceKm: 3.2, fuelLiters: 0.3 }),
    trip({ startTime: '2026-06-10 09:30:00', endTime: '2026-06-10 10:00:00', startLat: B.lat, startLng: B.lng, endLat: factory.lat, endLng: factory.lng, distanceKm: 18, fuelLiters: 1.8 }),
    trip({ startTime: '2026-06-10 10:05:00', endTime: '2026-06-10 10:06:00', startLat: factory.lat, startLng: factory.lng, endLat: factory.lat, endLng: factory.lng, distanceKm: 0.3 }), // shuffle
  ]
  const { visits, legs } = reconstructVisitsLegs(trips, customers, factory, [], ctx1)

  it('ตัด shuffle trip ออกจาก leg (เหลือ 3 leg)', () => {
    expect(legs).toHaveLength(3)
  })

  it('leg แรก โรงงาน→ลูกค้าA พร้อม travelMin/km', () => {
    expect(legs[0]).toMatchObject({ fromKey: 'factory', toKey: 'c:A', toCustomerId: 'A', toName: 'ลูกค้าA', travelMin: 40, km: 16, roundId: 'R1', driverId: 'D1' })
  })

  it('leg A→B ระบุต้นทางเป็นลูกค้า', () => {
    expect(legs[1]).toMatchObject({ fromKey: 'c:A', fromCustomerId: 'A', toKey: 'c:B', toCustomerId: 'B', travelMin: 9, km: 3.2 })
  })

  it('visit = เที่ยวที่จบที่ลูกค้า (2 visit: A, B) · เที่ยวจบโรงงานไม่นับ', () => {
    expect(visits).toHaveLength(2)
    expect(visits.map(v => v.customerId)).toEqual(['A', 'B'])
  })

  it('visit A: ถึง 08:40 · ออก 08:52 · dwell 12 นาที', () => {
    expect(visits[0]).toMatchObject({ customerId: 'A', arriveTime: '2026-06-10 08:40:00', departTime: '2026-06-10 08:52:00', dwellMin: 12, confidence: 'high', sequence: 0 })
  })

  it('visit B: ถึง 09:01 · ออก 09:30 · dwell 29 นาที', () => {
    expect(visits[1]).toMatchObject({ customerId: 'B', dwellMin: 29, sequence: 1 })
  })

  it('id เป็น deterministic (idempotent backfill)', () => {
    expect(legs[0].id).toBe('lgt_2026-06-10_V1_0')
    expect(visits[0].id).toBe('vmt_2026-06-10_V1_0')
  })
})

describe('reconstructVisitsLegs — เที่ยวสุดท้ายจบที่ลูกค้า (ไม่มีออก)', () => {
  const trips = [
    trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 08:40:00', startLat: factory.lat, startLng: factory.lng, endLat: A.lat, endLng: A.lng }),
  ]
  const { visits } = reconstructVisitsLegs(trips, customers, factory, [], ctx1)
  it('departTime ว่าง + dwell 0', () => {
    expect(visits[0]).toMatchObject({ customerId: 'A', departTime: '', dwellMin: 0 })
  })
})

describe('reconstructVisitsLegs — จุดที่ไม่รู้จัก', () => {
  const trips = [
    trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 08:40:00', startLat: factory.lat, startLng: factory.lng, endLat: 14.99, endLng: 101.99 }),
  ]
  const { visits, legs } = reconstructVisitsLegs(trips, customers, factory, [], ctx1)
  it('ปลายทางไม่รู้จัก → key unknown + ไม่สร้าง visit', () => {
    expect(legs[0].toKey).toBe('unknown')
    expect(visits).toHaveLength(0)
  })
})

describe('resolveRoundDriver', () => {
  const windows: RoundWindow[] = [
    { roundId: 'DAY', driverId: 'D1', start: '08:00', end: '12:00' },
    { roundId: 'NIGHT', driverId: 'D2', start: '22:00', end: '02:00' }, // ข้ามเที่ยงคืน
  ]
  it('เวลากลางวัน → รอบ DAY', () => expect(resolveRoundDriver('2026-06-10 09:30:00', windows)).toEqual({ roundId: 'DAY', driverId: 'D1' }))
  it('เวลาก่อนเที่ยงคืน → รอบ NIGHT', () => expect(resolveRoundDriver('2026-06-10 23:15:00', windows)).toEqual({ roundId: 'NIGHT', driverId: 'D2' }))
  it('เวลาหลังเที่ยงคืน (01:00) → ยังเป็นรอบ NIGHT (ข้ามคืน)', () => expect(resolveRoundDriver('2026-06-11 01:00:00', windows)).toEqual({ roundId: 'NIGHT', driverId: 'D2' }))
  it('ไม่เข้า window ใด + มีหลายรอบ → ไม่ทราบ', () => expect(resolveRoundDriver('2026-06-10 05:00:00', windows)).toEqual({ roundId: '', driverId: '' }))
  it('มีรอบเดียว → ใช้รอบนั้นเสมอ', () => expect(resolveRoundDriver('2026-06-10 05:00:00', [windows[0]])).toEqual({ roundId: 'DAY', driverId: 'D1' }))
})
