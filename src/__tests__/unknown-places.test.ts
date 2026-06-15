// 452 — ค้นหาจุดที่ยังไม่รู้จัก: trip-end → จุดจอด → cluster เฉพาะที่ยังไม่ match
import { describe, it, expect } from 'vitest'
import { tripsToStops, clusterUnknownStops, type RawStop } from '@/lib/unknown-places'
import type { GpsTrip } from '@/lib/v2x-types'
import type { Customer } from '@/types'

const trip = (o: Partial<GpsTrip>): GpsTrip => ({
  tripId: '', plate: 'C 1', plateNorm: '1', vin: '',
  startAddress: '', endAddress: '', startTime: '2026-05-16 08:00:00', endTime: '2026-05-16 08:30:00',
  startLat: 13.70, startLng: 100.50, endLat: 13.75, endLng: 100.50,
  distanceKm: 5, drivingMin: 30, idleMin: 0, maxSpeed: 60, avgSpeed: 30,
  fuelLiters: 0, kmPerLiter: 0, score: 0, overSpeedCount: 0, rapidAccelCount: 0, rapidDecelCount: 0, sharpTurnCount: 0,
  ...o,
})
const cust = (id: string, lat: number, lng: number): Customer => ({ id, gpsLat: lat, gpsLng: lng } as Customer)
const stop = (o: Partial<RawStop>): RawStop =>
  ({ lat: 13.75, lng: 100.50, address: '', date: '2026-05-16', vehicleCode: 'A', time: '08:30', dwellMin: 10, ...o })

describe('tripsToStops (452)', () => {
  it('ปลายเที่ยว=จุดจอด · ตัด shuffle (<0.5km) · dwell=ถึงเที่ยวถัดไปวันเดียวกัน', () => {
    const stops = tripsToStops([
      trip({ startTime: '2026-05-16 08:30:00', endTime: '2026-05-16 09:00:00', endLat: 13.75, endLng: 100.50 }),
      trip({ startTime: '2026-05-16 09:20:00', endTime: '2026-05-16 09:50:00', endLat: 13.76, endLng: 100.51 }),
      trip({ startTime: '2026-05-16 10:00:00', endTime: '2026-05-16 10:05:00', distanceKm: 0.1 }), // shuffle → ตัด
    ], 'A')
    expect(stops.length).toBe(2)
    expect(stops[0].dwellMin).toBe(20)        // 09:00 → 09:20
    expect(stops[0].date).toBe('2026-05-16')
    expect(stops[0].vehicleCode).toBe('A')
    expect(stops[1].dwellMin).toBe(0)         // เที่ยวสุดท้าย ไม่มีถัดไป
  })

  it('ข้ามจุดพิกัด 0,0 (ไม่มีพิกัดปลาย)', () => {
    expect(tripsToStops([trip({ endLat: 0, endLng: 0 })], 'A').length).toBe(0)
  })

  it('dwell ไม่ข้ามวัน', () => {
    const stops = tripsToStops([
      trip({ startTime: '2026-05-16 22:00:00', endTime: '2026-05-16 23:00:00' }),
      trip({ startTime: '2026-05-17 06:00:00', endTime: '2026-05-17 07:00:00' }), // คนละวัน
    ], 'A')
    expect(stops[0].dwellMin).toBe(0) // ข้ามวัน → ไม่นับ dwell
  })
})

describe('clusterUnknownStops (452)', () => {
  it('ตัดจุดที่ match ลูกค้า + รวมจุดใกล้กัน + เรียงตามจำนวนครั้ง', () => {
    const customers = [cust('c1', 13.7600, 100.5100)] // จุดนี้ = ลูกค้า → ต้องถูกตัด
    const clusters = clusterUnknownStops([
      stop({ lat: 13.7500, lng: 100.5000, address: 'ร้าน A' }),  // unknown #1
      stop({ lat: 13.7503, lng: 100.5001, address: 'ร้าน A' }),  // ~33ม. → รวมกับ #1
      stop({ lat: 13.7600, lng: 100.5100, address: 'ลูกค้า' }),  // match ลูกค้า → ตัด
      stop({ lat: 13.8000, lng: 100.6000, address: 'ไกล' }),     // unknown #2 (แยกกลุ่ม)
    ], customers, null, [])
    expect(clusters.length).toBe(2)
    expect(clusters[0].count).toBe(2)          // กลุ่มที่จอดบ่อยสุดมาก่อน
    expect(clusters[0].address).toBe('ร้าน A') // address ที่พบบ่อยสุด
    expect(clusters[1].count).toBe(1)
  })

  it('dwellMedian + รถ distinct เรียงชื่อ', () => {
    const c = clusterUnknownStops([
      stop({ vehicleCode: 'A', dwellMin: 10 }),
      stop({ vehicleCode: 'B', dwellMin: 20 }),
      stop({ vehicleCode: 'A', dwellMin: 30 }),
    ], [], null, [])
    expect(c.length).toBe(1)
    expect(c[0].dwellMedian).toBe(20)
    expect(c[0].vehicleCodes).toEqual(['A', 'B'])
  })

  it('savedPlace ที่บันทึกแล้ว → ไม่ขึ้นเป็นจุดไม่รู้จัก', () => {
    const saved = [{ id: 'p1', name: 'ปั๊ม', category: 'fuel', lat: 13.7500, lng: 100.5000, note: '' } as never]
    const c = clusterUnknownStops([stop({ lat: 13.7500, lng: 100.5000 })], [], null, saved)
    expect(c.length).toBe(0)
  })
})
