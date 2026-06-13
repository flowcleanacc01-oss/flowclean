// 432.2.2 — verify GPS dashboard aggregator: totals / รายคัน / รายวัน / จุดแวะ
import { describe, it, expect } from 'vitest'
import { buildDashboardStats, type VehicleTrips } from '@/lib/gps-dashboard'
import type { GpsTrip } from '@/lib/v2x-types'
import type { Customer, SavedPlace } from '@/types'

const trip = (over: Partial<GpsTrip>): GpsTrip =>
  ({ tripId: 't', plate: 'C 1', plateNorm: '1', vin: '', startAddress: '', endAddress: '',
    startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00',
    startLat: 0, startLng: 0, endLat: 0, endLng: 0,
    distanceKm: 10, drivingMin: 50, idleMin: 5, maxSpeed: 80, avgSpeed: 40,
    fuelLiters: 1, kmPerLiter: 10, score: 90, overSpeedCount: 0, rapidAccelCount: 0, rapidDecelCount: 0,
    sharpTurnCount: 0, ...over })

const FOOD: SavedPlace = { id: 'p1', name: 'ก๋วยเตี๋ยวไก่', category: 'food', lat: 13.75, lng: 100.50, note: '', createdBy: '', createdAt: '' }

describe('buildDashboardStats', () => {
  it('รวม km/fuel/เที่ยว · ขยับรถไม่นับเป็นเที่ยว', () => {
    const v: VehicleTrips[] = [{
      carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [
        trip({ distanceKm: 20, fuelLiters: 2 }),
        trip({ distanceKm: 0.2, fuelLiters: 0, startTime: '2026-06-10 10:00:00', endTime: '2026-06-10 10:05:00' }), // ขยับรถ
      ],
    }]
    const s = buildDashboardStats(v, [], null, [])
    expect(s.totals.km).toBeCloseTo(20.2)
    expect(s.totals.fuel).toBeCloseTo(2)
    expect(s.totals.trips).toBe(1) // ขยับรถไม่นับ
    expect(s.byVehicle[0].kmPerLiter).toBeCloseTo(10.1)
  })

  it('รายวันแยก bucket ตามวันที่', () => {
    const v: VehicleTrips[] = [{
      carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [
        trip({ startTime: '2026-06-10 08:00:00', distanceKm: 10 }),
        trip({ startTime: '2026-06-11 08:00:00', endTime: '2026-06-11 09:00:00', distanceKm: 15 }),
      ],
    }]
    const s = buildDashboardStats(v, [], null, [])
    expect(s.byDay.map(d => d.day)).toEqual(['2026-06-10', '2026-06-11'])
    expect(s.byDay[1].km).toBeCloseTo(15)
  })

  it('จุดแวะ: gap ดับเครื่องที่ร้านอาหาร → นับ detour + รวมนาที', () => {
    const v: VehicleTrips[] = [{
      carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [
        trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00', endLat: 13.75, endLng: 100.50 }),
        trip({ startTime: '2026-06-10 09:20:00', endTime: '2026-06-10 10:00:00' }), // gap 20 นาที ที่ร้าน
      ],
    }]
    const s = buildDashboardStats(v, [], null, [FOOD])
    expect(s.totals.detourVisits).toBe(1)
    expect(s.totals.detourMin).toBe(20)
    expect(s.detours[0].name).toBe('ก๋วยเตี๋ยวไก่')
    // 440 — รายละเอียดต่อครั้ง (วัน/เวลา/รถ/นาที)
    expect(s.detours[0].occurrences).toEqual([
      { date: '2026-06-10', time: '09:00', carId: 'A', plate: 'C 1', vehicleCode: 'A', minutes: 20 },
    ])
  })

  it('435 — byDriver: attribute idle ต่อคนขับ (ผ่าน driverResolver) เรียง idle มาก→น้อย', () => {
    const v: VehicleTrips[] = [{
      carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [
        trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00', idleMin: 30 }),
        trip({ startTime: '2026-06-10 10:00:00', endTime: '2026-06-10 11:00:00', idleMin: 20 }),
        trip({ startTime: '2026-06-11 08:00:00', endTime: '2026-06-11 09:00:00', idleMin: 10 }),
      ],
    }]
    // 06-10 = สมชาย, 06-11 = สมหญิง
    const resolver = (_car: string, day: string) =>
      day === '2026-06-11' ? { id: 'd2', name: 'สมหญิง' } : { id: 'd1', name: 'สมชาย' }
    const s = buildDashboardStats(v, [], null, [], resolver)
    expect(s.byDriver.map(d => d.name)).toEqual(['สมชาย', 'สมหญิง']) // idle 50 > 10
    expect(s.byDriver[0].idleMin).toBe(50)
    expect(s.byDriver[0].trips).toBe(2)
    expect(s.byDriver[1].idleMin).toBe(10)
  })

  it('435 — ไม่ส่ง driverResolver → byDriver ว่าง', () => {
    const v: VehicleTrips[] = [{ carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [trip({})] }]
    expect(buildDashboardStats(v, [], null, []).byDriver).toEqual([])
  })

  it('จุดแวะ: gap > 120 นาที (จอดค้าง) → ไม่นับ · gap ที่ลูกค้า → ไม่นับ', () => {
    const cust = { id: 'c1', name: 'V', shortName: 'V', isActive: true, gpsLat: 13.75, gpsLng: 100.50 } as Customer
    const longGap: VehicleTrips[] = [{
      carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [
        trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00', endLat: 13.75, endLng: 100.50 }),
        trip({ startTime: '2026-06-10 12:00:00', endTime: '2026-06-10 13:00:00' }), // gap 180 นาที
      ],
    }]
    expect(buildDashboardStats(longGap, [], null, [FOOD]).totals.detourVisits).toBe(0)
    // จุดเดียวกันแต่เป็นลูกค้า → ลูกค้าชนะ ไม่นับ detour
    const atCust: VehicleTrips[] = [{
      carId: 'A', plate: 'C 1', vehicleCode: 'A', trips: [
        trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00', endLat: 13.75, endLng: 100.50 }),
        trip({ startTime: '2026-06-10 09:20:00', endTime: '2026-06-10 10:00:00' }),
      ],
    }]
    expect(buildDashboardStats(atCust, [cust], null, [FOOD]).totals.detourVisits).toBe(0)
  })
})
