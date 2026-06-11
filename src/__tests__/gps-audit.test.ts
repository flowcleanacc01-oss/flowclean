// 423 C-3 + 426 — verify GPS audit logic
//   buildRoundAudit (3 มิติ + รอบข้ามเที่ยงคืน) · roundWindowOverlapMin · guessVehiclesForRound · buildVehicleAudit
import { describe, it, expect } from 'vitest'
import {
  summarizeTrips, medianDailyKm, buildRoundAudit, buildVehicleAudit,
  roundWindowOverlapMin, guessVehiclesForRound,
} from '@/lib/gps-audit'
import { normalizePlate, type GpsCar, type GpsTrip } from '@/lib/v2x-types'
import type { Round, TripStop } from '@/types'

const round = (over: Partial<Round>): Round =>
  ({ id: 'round-v', code: 'V', name: 'รอบ V', startTime: '04:00', endTime: '13:00',
    defaultVehicleId: '', defaultDriverId: '', defaultHelperId: '',
    color: '#0ea5e9', sortOrder: 1, isActive: true, note: '', createdAt: '', ...over } as Round)

const trip = (startTime: string, endTime: string, km = 10, fuel = 1): GpsTrip =>
  ({ plate: 'C 4ฒฆ-8053', plateNorm: '4ฒฆ-8053', vin: '', startAddress: '', endAddress: '',
    startTime, endTime, distanceKm: km, drivingMin: 30, idleMin: 0,
    maxSpeed: 80, avgSpeed: 40, fuelLiters: fuel, kmPerLiter: fuel > 0 ? km / fuel : 0 })

const car = (carId: string, plate: string): GpsCar =>
  ({ carId, plate, plateNorm: normalizePlate(plate), vin: '', sim: '', model: '', fuelType: '' })

const stop = (bagCount = 0): TripStop =>
  ({ customerId: 'c1', sequence: 1, source: 'regular', bagCount, status: 'pending', note: '',
    timeWindowStart: '', timeWindowEnd: '' })

describe('summarizeTrips / medianDailyKm', () => {
  it('รวมยอด + first/last ตามเวลา', () => {
    const s = summarizeTrips([
      trip('2026-06-10 08:00:00', '2026-06-10 09:00:00', 20, 2),
      trip('2026-06-10 05:00:00', '2026-06-10 06:00:00', 10, 1),
    ])
    expect(s.count).toBe(2)
    expect(s.km).toBe(30)
    expect(s.fuel).toBe(3)
    expect(s.kmPerLiter).toBe(10)
    expect(s.firstTime).toBe('2026-06-10 05:00:00')
    expect(s.lastTime).toBe('2026-06-10 09:00:00')
  })

  it('median รายวัน — ตัดวันที่ audit ออก', () => {
    const hist = [
      trip('2026-06-07 08:00:00', '2026-06-07 09:00:00', 40),
      trip('2026-06-08 08:00:00', '2026-06-08 09:00:00', 50),
      trip('2026-06-08 10:00:00', '2026-06-08 11:00:00', 10), // วันเดียวกัน → รวม 60
      trip('2026-06-09 08:00:00', '2026-06-09 09:00:00', 80),
      trip('2026-06-10 08:00:00', '2026-06-10 09:00:00', 999), // วัน audit → ตัดทิ้ง
    ]
    expect(medianDailyKm(hist, '2026-06-10')).toBe(60) // median(40, 60, 80)
    expect(medianDailyKm([], '2026-06-10')).toBeNull()
  })
})

describe('buildRoundAudit — มิติเวลา (รอบข้ามเที่ยงคืน)', () => {
  const akara = round({ id: 'round-ak', code: 'AKARA', startTime: '15:30', endTime: '01:30' })

  it('รอบข้ามคืน: เลิกก่อนเที่ยงคืน → ไม่ flag เลิกเกิน (เดิม flag ผิดเสมอ)', () => {
    const a = buildRoundAudit(akara, 'C', '4ฒฆ-8053', true, [stop(5)],
      [trip('2026-06-10 16:00:00', '2026-06-10 23:50:00')], null)
    expect(a.flags.some(f => f.message.includes('เลิกงานเกิน'))).toBe(false)
  })

  it('รอบข้ามคืน: เลิกหลังเที่ยงคืนแต่ก่อนรอบจบ → ไม่ flag', () => {
    const a = buildRoundAudit(akara, 'C', '4ฒฆ-8053', true, [stop(5)],
      [trip('2026-06-10 16:00:00', '2026-06-11 00:40:00')], null)
    expect(a.flags.some(f => f.message.includes('เลิกงานเกิน'))).toBe(false)
  })

  it('รอบข้ามคืน: เลิกหลังรอบจบจริง → flag', () => {
    const a = buildRoundAudit(akara, 'C', '4ฒฆ-8053', true, [stop(5)],
      [trip('2026-06-10 16:00:00', '2026-06-11 02:10:00')], null)
    expect(a.flags.some(f => f.message.includes('เลิกงานเกิน'))).toBe(true)
  })

  it('รอบปกติ: เลิกเกินเวลารอบ → flag (พฤติกรรมเดิมคงอยู่)', () => {
    const a = buildRoundAudit(round({}), 'A', '3ฒพ-5682', true, [stop(5)],
      [trip('2026-06-10 04:10:00', '2026-06-10 14:20:00')], null)
    expect(a.flags.some(f => f.message.includes('เลิกงานเกิน'))).toBe(true)
  })

  it('ไม่มีรถผูกรอบ → message ชี้ทางแก้ (ไม่พูดถึง terminal)', () => {
    const a = buildRoundAudit(round({}), null, null, false, [stop(5)], [], null)
    expect(a.flags[0].message).toContain('ยังไม่ผูกรถ')
    const b = buildRoundAudit(round({}), 'D', null, false, [stop(5)], [], null)
    expect(b.flags[0].message).toContain('terminal')
  })
})

describe('roundWindowOverlapMin', () => {
  it('รอบปกติ: นับเฉพาะส่วนที่ทับหน้าต่าง', () => {
    const min = roundWindowOverlapMin('04:00', '13:00', [
      trip('2026-06-10 03:30:00', '2026-06-10 04:30:00'), // ทับ 30
      trip('2026-06-10 12:50:00', '2026-06-10 13:40:00'), // ทับ 10
      trip('2026-06-10 14:00:00', '2026-06-10 15:00:00'), // ไม่ทับ
    ])
    expect(min).toBe(40)
  })

  it('รอบข้ามคืน: เที่ยวก่อน/หลังเที่ยงคืน + เที่ยวคร่อมเที่ยงคืน', () => {
    expect(roundWindowOverlapMin('19:30', '05:30', [trip('2026-06-10 20:00:00', '2026-06-10 21:00:00')])).toBe(60)
    expect(roundWindowOverlapMin('19:30', '05:30', [trip('2026-06-11 00:10:00', '2026-06-11 01:00:00')])).toBe(50)
    expect(roundWindowOverlapMin('19:30', '05:30', [trip('2026-06-10 23:30:00', '2026-06-11 00:30:00')])).toBe(60)
    expect(roundWindowOverlapMin('19:30', '05:30', [trip('2026-06-10 06:00:00', '2026-06-10 07:00:00')])).toBe(0)
  })
})

describe('guessVehiclesForRound', () => {
  it('เรียง overlap มาก→น้อย + ตัดคันที่ไม่ทับเลย', () => {
    const cars = [car('1', 'A 3ฒพ-5682'), car('2', 'B 3ฒอ-1972'), car('3', 'C 4ฒฆ-8053')]
    const tripsByCar = new Map<string, GpsTrip[]>([
      ['1', [trip('2026-06-10 04:10:00', '2026-06-10 06:00:00')]], // ทับ 110
      ['2', [trip('2026-06-10 12:30:00', '2026-06-10 13:30:00')]], // ทับ 30
      ['3', [trip('2026-06-10 20:00:00', '2026-06-10 22:00:00')]], // ไม่ทับ
    ])
    const guesses = guessVehiclesForRound(round({}), cars, tripsByCar)
    expect(guesses.map(g => g.carId)).toEqual(['1', '2'])
    expect(guesses[0].overlapMin).toBe(110)
    expect(guesses[0].plateNorm).toBe(normalizePlate('A 3ฒพ-5682'))
  })
})

describe('buildVehicleAudit (มุมมองรายคัน)', () => {
  const c = car('1', 'C 4ฒฆ-8053')

  it('ไม่มีเที่ยว → info', () => {
    const a = buildVehicleAudit(c, 'C', [], null)
    expect(a.flags).toEqual([{ level: 'info', message: 'GPS ไม่พบการวิ่งในวันนี้' }])
  })

  it('สิ้นเปลืองผิดปกติ (<7 กม./ล.) → warn', () => {
    const a = buildVehicleAudit(c, 'C', [trip('2026-06-10 08:00:00', '2026-06-10 09:00:00', 10, 2)], null)
    expect(a.flags.some(f => f.level === 'warn' && f.message.includes('สิ้นเปลือง'))).toBe(true)
  })

  it('ระยะทางเกิน 1.5×median → warn', () => {
    const a = buildVehicleAudit(c, 'C', [trip('2026-06-10 08:00:00', '2026-06-10 09:00:00', 100, 10)], 50)
    expect(a.flags.some(f => f.level === 'warn' && f.message.includes('ระยะทางสูง'))).toBe(true)
  })

  it('ปกติ → ok + เก็บ vehicleCode/medianKm', () => {
    const a = buildVehicleAudit(c, 'C', [trip('2026-06-10 08:00:00', '2026-06-10 09:00:00', 50, 4)], 48)
    expect(a.flags).toEqual([{ level: 'ok', message: 'ปกติ' }])
    expect(a.vehicleCode).toBe('C')
    expect(a.medianKm).toBe(48)
  })
})
