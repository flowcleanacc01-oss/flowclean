// 428/446 — verify ไมล์ auto จาก GPS: deriveAnchor · estimateOdometer · anchorDayKmAfter · anchorAgeDays
import { describe, it, expect } from 'vitest'
import { deriveAnchor, estimateOdometer, anchorDayKmAfter, anchorAgeDays, ANCHOR_MAX_AGE_DAYS } from '@/lib/odometer'
import type { GpsDailyKm, GpsTrip } from '@/lib/v2x-types'
import type { Vehicle, OdometerLog, FuelLog, MaintenanceRecord } from '@/types'

const veh = (over: Partial<Vehicle>): Vehicle =>
  ({ id: 'veh-c', code: 'C', licensePlate: '4ฒฆ-8053', brand: '', usageType: '', registeredDate: '',
    insuranceCompany: '', insuranceClass: '', insuranceExpiry: '', actExpiry: '', taxExpiry: '', inspectionExpiry: '',
    currentOdometer: 68643, odometerAnchorDate: '', odometerAnchorTime: '', serviceIntervalKm: 8000, nextServiceOdometer: 0,
    isActive: true, note: '', createdAt: '', ...over } as Vehicle)

const oLog = (vehicleId: string, date: string, odometer: number, recordedTime = ''): OdometerLog =>
  ({ id: `o-${date}`, vehicleId, date, recordedTime, odometer, fuelLevel: '', photoPath: '', note: '', createdBy: '', createdAt: '' })

const fLog = (vehicleId: string, date: string, odometer: number): FuelLog =>
  ({ id: `f-${date}`, vehicleId, date, odometer, liters: 10, pricePerLiter: 30, amount: 300 } as FuelLog)

const mRec = (vehicleId: string, date: string, odometer: number): MaintenanceRecord =>
  ({ id: `m-${date}`, vehicleId, date, odometer, type: '', description: '', cost: 0, expenseId: '', nextDueOdometer: 0 } as MaintenanceRecord)

const day = (d: string, km: number, plateNorm = '4ฒฆ-8053'): GpsDailyKm =>
  ({ carId: '1', plate: `C ${plateNorm}`, plateNorm: plateNorm.toLowerCase(), day: d, km })

const trip = (startTime: string, distanceKm: number): GpsTrip =>
  ({ startTime, endTime: startTime, distanceKm, plate: '', plateNorm: '', tripId: '' } as GpsTrip)

describe('deriveAnchor', () => {
  it('odometerAnchorDate ตั้งตรงๆ ชนะทุกอย่าง + คืนเวลาของรถ', () => {
    expect(deriveAnchor(veh({ odometerAnchorDate: '2026-06-08', odometerAnchorTime: '05:30' }), [oLog('veh-c', '2026-06-10', 70000, '07:00')], [], []))
      .toEqual({ date: '2026-06-08', time: '05:30' })
  })

  it('ไม่มี anchor → ใช้ log ล่าสุด (รวม 3 แหล่ง) ที่ odometer > 0 + เวลาจาก odometer log', () => {
    const a = deriveAnchor(veh({}),
      [oLog('veh-c', '2026-06-08', 68643, '05:15'), oLog('veh-x', '2026-06-11', 1)],
      [fLog('veh-c', '2026-06-01', 68000), fLog('veh-c', '2026-06-09', 0)], // odometer 0 = ไม่ระบุ → ข้าม
      [mRec('veh-c', '2026-05-20', 67000)])
    expect(a).toEqual({ date: '2026-06-08', time: '05:15' })
  })

  it('วันเดียวกัน: ตัวที่มีเวลา (odometer log) ชนะตัวไม่มีเวลา (fuel)', () => {
    const a = deriveAnchor(veh({}),
      [oLog('veh-c', '2026-06-10', 70000, '06:00')],
      [fLog('veh-c', '2026-06-10', 70000)], [])
    expect(a).toEqual({ date: '2026-06-10', time: '06:00' })
  })

  it('fuel/maintenance ล่าสุด → ไม่มีเวลา (time="")', () => {
    expect(deriveAnchor(veh({}), [], [fLog('veh-c', '2026-06-09', 68900)], []))
      .toEqual({ date: '2026-06-09', time: '' })
  })

  it('ไม่มีข้อมูลเลย → date/time ว่าง', () => {
    expect(deriveAnchor(veh({}), [], [], [])).toEqual({ date: '', time: '' })
  })
})

describe('estimateOdometer', () => {
  const rows = [
    day('2026-06-08', 100), // วัน anchor เอง → ไม่นับใน aggregate (partial มาทาง anchorDayKm)
    day('2026-06-09', 130),
    day('2026-06-10', 0), // วันไม่วิ่ง → ไม่นับเป็นวันวิ่ง
    day('2026-06-11', 120.4),
    day('2026-06-12', 50), // วันนี้ (บางส่วน) → นับ
    day('2026-06-13', 999), // อนาคต (เกิน today) → ไม่นับ
    day('2026-06-11', 80, '3ฒพ-5682'), // คันอื่น → ไม่นับ
  ]

  it('นับเฉพาะ day > anchor และ <= today ของคันนั้น (anchorDayKm=0 default)', () => {
    const e = estimateOdometer(veh({}), '2026-06-08', rows, '2026-06-12')
    expect(e.gpsKm).toBeCloseTo(300.4)
    expect(e.days).toBe(3)
    expect(e.estimate).toBe(68943) // 68643 + 300.4 → round
  })

  it('446 — anchorDayKm > 0 → บวกระยะวัน anchor หลังเวลา + นับเป็นอีก 1 วันวิ่ง', () => {
    const e = estimateOdometer(veh({}), '2026-06-08', rows, '2026-06-12', 42.6)
    expect(e.gpsKm).toBeCloseTo(343) // 300.4 + 42.6
    expect(e.days).toBe(4)
    expect(e.estimate).toBe(68986) // 68643 + 343
  })

  it('ทะเบียนมี prefix/ช่องว่าง → normalize ก่อน match', () => {
    const e = estimateOdometer(veh({ licensePlate: 'C 4ฒฆ-8053' }), '2026-06-08', rows, '2026-06-12')
    expect(e.gpsKm).toBeCloseTo(300.4)
  })

  it('ไม่มีแถวของคันนี้ + ไม่มี partial → estimate = ไมล์เดิม', () => {
    const e = estimateOdometer(veh({ licensePlate: '9กก-9999' }), '2026-06-08', rows, '2026-06-12')
    expect(e).toEqual({ gpsKm: 0, days: 0, estimate: 68643 })
  })

  it('anchor=today + partial → เห็นระยะวันนี้ทันที (ไม่ข้ามวันเดียวกัน)', () => {
    // ถ่ายไมล์เช้า 14/6, ยังไม่มีแถว aggregate วันนี้ → partial 35 กม. ต้องโผล่
    const e = estimateOdometer(veh({}), '2026-06-14', [], '2026-06-14', 35)
    expect(e.gpsKm).toBe(35)
    expect(e.days).toBe(1)
    expect(e.estimate).toBe(68678)
  })
})

describe('anchorDayKmAfter (446)', () => {
  const trips = [
    trip('2026-06-14 04:30:00', 10), // ก่อนเวลาที่กรอก (05:00) → ไม่นับ
    trip('2026-06-14 06:15:00', 25), // หลังเวลา → นับ
    trip('2026-06-14 13:40:00', 18), // หลังเวลา → นับ
    trip('2026-06-13 22:00:00', 99), // คนละวัน → ไม่นับ
  ]

  it('รวมเฉพาะเที่ยวของวัน anchor ที่ออกหลังเวลาที่กรอก', () => {
    expect(anchorDayKmAfter(trips, '2026-06-14', '05:00')).toBeCloseTo(43) // 25 + 18
  })

  it('เที่ยวที่เริ่มตรงเวลาพอดี = นับด้วย (>=)', () => {
    expect(anchorDayKmAfter([trip('2026-06-14 05:00:00', 12)], '2026-06-14', '05:00')).toBeCloseTo(12)
  })

  it('ถ่ายตอนเช้ามืดก่อนออกรถ → นับเกือบทั้งวัน', () => {
    expect(anchorDayKmAfter(trips, '2026-06-14', '04:00')).toBeCloseTo(53) // 10 + 25 + 18
  })

  it('ไม่รู้เวลา (anchorTime="") → 0 (ให้ caller ข้ามวัน anchor แบบเดิม)', () => {
    expect(anchorDayKmAfter(trips, '2026-06-14', '')).toBe(0)
  })

  it('ไม่มีเที่ยวของวัน anchor → 0', () => {
    expect(anchorDayKmAfter([trip('2026-06-13 08:00:00', 50)], '2026-06-14', '05:00')).toBe(0)
  })
})

describe('anchorAgeDays', () => {
  it('นับวันแบบ string math (TZ-safe)', () => {
    expect(anchorAgeDays('2026-06-08', '2026-06-12')).toBe(4)
    expect(anchorAgeDays('2026-06-12', '2026-06-12')).toBe(0)
    expect(anchorAgeDays('2026-03-01', '2026-06-12')).toBeGreaterThan(ANCHOR_MAX_AGE_DAYS)
  })

  it('ไม่รู้วัน anchor → Infinity (คำนวณไม่ได้)', () => {
    expect(anchorAgeDays('', '2026-06-12')).toBe(Infinity)
  })
})
