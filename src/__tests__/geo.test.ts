// 427 — verify geo helpers: parse ลิงก์ Google Maps · haversine · จับคู่สถานที่ · ช่วงดับเครื่องจอด
import { describe, it, expect } from 'vitest'
import { parseLatLng, haversineM, matchPlace, engineOffGaps, isShuffleTrip } from '@/lib/geo'
import type { GpsTrip } from '@/lib/v2x-types'
import type { Customer } from '@/types'

const trip = (over: Partial<GpsTrip>): GpsTrip =>
  ({ tripId: 't1', plate: 'C 4ฒฆ-8053', plateNorm: '4ฒฆ-8053', vin: '', startAddress: '', endAddress: 'addr',
    startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00',
    startLat: 0, startLng: 0, endLat: 13.7556, endLng: 100.4768,
    distanceKm: 20, drivingMin: 45, idleMin: 0, maxSpeed: 80, avgSpeed: 40,
    fuelLiters: 2, kmPerLiter: 10, score: 95, overSpeedCount: 0, rapidAccelCount: 0, rapidDecelCount: 0,
    sharpTurnCount: 0, ...over })

const cust = (over: Partial<Customer>): Customer =>
  ({ id: 'c1', name: 'SEN Hotel', shortName: 'SEN', isActive: true, gpsLat: 13.7556, gpsLng: 100.4768, ...over } as Customer)

describe('parseLatLng — รูปแบบลิงก์ Google Maps', () => {
  it('ลิงก์ place เต็ม !3d!4d (พิกัดหมุดจริง — ชนะ @)', () => {
    expect(parseLatLng('https://www.google.com/maps/place/X/@13.70,100.40,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.755712!4d100.476812!16s'))
      .toEqual({ lat: 13.755712, lng: 100.476812 })
  })
  it('?q= / ll=', () => {
    expect(parseLatLng('https://maps.google.com/?q=13.7563,100.5018')).toEqual({ lat: 13.7563, lng: 100.5018 })
    expect(parseLatLng('https://maps.google.com/maps?ll=13.7563,100.5018&z=17')).toEqual({ lat: 13.7563, lng: 100.5018 })
  })
  it('@lat,lng', () => {
    expect(parseLatLng('https://www.google.com/maps/@13.7563,100.5018,17z')).toEqual({ lat: 13.7563, lng: 100.5018 })
  })
  it('พิกัดดิบ "lat, lng"', () => {
    expect(parseLatLng('13.7563, 100.5018')).toEqual({ lat: 13.7563, lng: 100.5018 })
    expect(parseLatLng('  13.7563,100.5018  ')).toEqual({ lat: 13.7563, lng: 100.5018 })
  })
  it('อ่านไม่ได้ / นอกช่วง → null', () => {
    expect(parseLatLng('https://maps.app.goo.gl/AbCdEf')).toBeNull() // ลิงก์สั้น ไม่มีพิกัดในตัว
    expect(parseLatLng('สวัสดี')).toBeNull()
    expect(parseLatLng('')).toBeNull()
    expect(parseLatLng('99.9, 200.5')).toBeNull() // lat เกิน 90
  })
})

describe('haversineM / matchPlace', () => {
  it('ระยะใกล้เคียงจริง (~111 กม./องศา lat)', () => {
    const d = haversineM(13.0, 100.0, 13.01, 100.0)
    expect(d).toBeGreaterThan(1080)
    expect(d).toBeLessThan(1140)
  })

  it('จุดในรัศมี 150ม. → match ลูกค้า · เกิน → ไม่ match', () => {
    const customers = [cust({})]
    // ~100ม. เหนือจุดลูกค้า (0.0009 องศา lat)
    const near = matchPlace(13.7565, 100.4768, customers, null)
    expect(near?.type).toBe('customer')
    expect(near?.customer?.shortName).toBe('SEN')
    // ~500ม. → ไม่ match
    expect(matchPlace(13.7601, 100.4768, customers, null)).toBeNull()
  })

  it('ลูกค้าใกล้สุดชนะ · ไม่เจอลูกค้าค่อย match โรงงาน (รัศมีกว้างกว่า)', () => {
    const customers = [cust({}), cust({ id: 'c2', shortName: 'FAR', gpsLat: 13.7560, gpsLng: 100.4768 })]
    const m = matchPlace(13.7559, 100.4768, customers, null)
    expect(m?.customer?.id).toBe('c2') // ใกล้กว่า
    const f = matchPlace(13.6237, 100.5102, [cust({})], { lat: 13.6240, lng: 100.5100 })
    expect(f?.type).toBe('factory')
  })

  it('ลูกค้าไม่มีพิกัด (0,0) → ข้าม · จุด 0,0 → null', () => {
    expect(matchPlace(13.75, 100.47, [cust({ gpsLat: 0, gpsLng: 0 })], null)).toBeNull()
    expect(matchPlace(0, 0, [cust({})], null)).toBeNull()
  })
})

describe('engineOffGaps — ช่วงดับเครื่องจอดระหว่างเที่ยว', () => {
  it('gap ≥ 5 นาที → คืนช่วง พร้อมจุดจบของเที่ยวก่อนหน้า', () => {
    const trips = [
      trip({ startTime: '2026-06-10 08:00:00', endTime: '2026-06-10 09:00:00', endLat: 13.75, endLng: 100.47, endAddress: 'จุด A' }),
      trip({ startTime: '2026-06-10 09:42:00', endTime: '2026-06-10 10:00:00' }), // gap 42 นาที
      trip({ startTime: '2026-06-10 10:02:00', endTime: '2026-06-10 11:00:00' }), // gap 2 นาที → ไม่นับ
    ]
    const gaps = engineOffGaps(trips)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ afterIndex: 0, minutes: 42, lat: 13.75, lng: 100.47, address: 'จุด A' })
  })

  it('เที่ยวเดียว/ไม่มี gap → ว่าง', () => {
    expect(engineOffGaps([trip({})])).toEqual([])
  })
})

describe('isShuffleTrip — ขยับรถระยะสั้น', () => {
  it('< 0.5 กม. = ขยับรถ (ติ๊ดให้เก็บไว้ ไม่กรองทิ้ง)', () => {
    expect(isShuffleTrip(trip({ distanceKm: 0.02 }))).toBe(true)
    expect(isShuffleTrip(trip({ distanceKm: 0.6 }))).toBe(false)
  })
})
