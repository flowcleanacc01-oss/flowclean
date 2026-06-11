// 428 — verify ไมล์ auto จาก GPS: deriveAnchorDate · estimateOdometer · anchorAgeDays
import { describe, it, expect } from 'vitest'
import { deriveAnchorDate, estimateOdometer, anchorAgeDays, ANCHOR_MAX_AGE_DAYS } from '@/lib/odometer'
import type { GpsDailyKm } from '@/lib/v2x-types'
import type { Vehicle, OdometerLog, FuelLog, MaintenanceRecord } from '@/types'

const veh = (over: Partial<Vehicle>): Vehicle =>
  ({ id: 'veh-c', code: 'C', licensePlate: '4ฒฆ-8053', brand: '', usageType: '', registeredDate: '',
    insuranceCompany: '', insuranceClass: '', insuranceExpiry: '', actExpiry: '', taxExpiry: '', inspectionExpiry: '',
    currentOdometer: 68643, odometerAnchorDate: '', serviceIntervalKm: 8000, nextServiceOdometer: 0,
    isActive: true, note: '', createdAt: '', ...over } as Vehicle)

const oLog = (vehicleId: string, date: string, odometer: number): OdometerLog =>
  ({ id: `o-${date}`, vehicleId, date, odometer, fuelLevel: '', photoPath: '', note: '', createdBy: '', createdAt: '' })

const fLog = (vehicleId: string, date: string, odometer: number): FuelLog =>
  ({ id: `f-${date}`, vehicleId, date, odometer, liters: 10, pricePerLiter: 30, amount: 300 } as FuelLog)

const mRec = (vehicleId: string, date: string, odometer: number): MaintenanceRecord =>
  ({ id: `m-${date}`, vehicleId, date, odometer, type: '', description: '', cost: 0, expenseId: '', nextDueOdometer: 0 } as MaintenanceRecord)

const day = (d: string, km: number, plateNorm = '4ฒฆ-8053'): GpsDailyKm =>
  ({ carId: '1', plate: `C ${plateNorm}`, plateNorm: plateNorm.toLowerCase(), day: d, km })

describe('deriveAnchorDate', () => {
  it('odometerAnchorDate ตั้งตรงๆ ชนะทุกอย่าง', () => {
    expect(deriveAnchorDate(veh({ odometerAnchorDate: '2026-06-08' }), [oLog('veh-c', '2026-06-10', 70000)], [], [])).toBe('2026-06-08')
  })

  it('ไม่มี anchor → ใช้ log ล่าสุด (รวม 3 แหล่ง) ที่ odometer > 0 ของคันนั้น', () => {
    const d = deriveAnchorDate(veh({}),
      [oLog('veh-c', '2026-06-01', 68000), oLog('veh-x', '2026-06-11', 1)],
      [fLog('veh-c', '2026-06-08', 68643), fLog('veh-c', '2026-06-09', 0)], // odometer 0 = ไม่ระบุ → ข้าม
      [mRec('veh-c', '2026-05-20', 67000)])
    expect(d).toBe('2026-06-08')
  })

  it('ไม่มีข้อมูลเลย → ""', () => {
    expect(deriveAnchorDate(veh({}), [], [], [])).toBe('')
  })
})

describe('estimateOdometer', () => {
  const rows = [
    day('2026-06-08', 100), // วัน anchor เอง → ไม่นับ
    day('2026-06-09', 130),
    day('2026-06-10', 0), // วันไม่วิ่ง → ไม่นับเป็นวันวิ่ง
    day('2026-06-11', 120.4),
    day('2026-06-12', 50), // วันนี้ (บางส่วน) → นับ
    day('2026-06-13', 999), // อนาคต (เกิน today) → ไม่นับ
    day('2026-06-11', 80, '3ฒพ-5682'), // คันอื่น → ไม่นับ
  ]

  it('นับเฉพาะ day > anchor และ <= today ของคันนั้น', () => {
    const e = estimateOdometer(veh({}), '2026-06-08', rows, '2026-06-12')
    expect(e.gpsKm).toBeCloseTo(300.4)
    expect(e.days).toBe(3)
    expect(e.estimate).toBe(68943) // 68643 + 300.4 → round
  })

  it('ทะเบียนมี prefix/ช่องว่าง → normalize ก่อน match', () => {
    const e = estimateOdometer(veh({ licensePlate: 'C 4ฒฆ-8053' }), '2026-06-08', rows, '2026-06-12')
    expect(e.gpsKm).toBeCloseTo(300.4)
  })

  it('ไม่มีแถวของคันนี้ → estimate = ไมล์เดิม', () => {
    const e = estimateOdometer(veh({ licensePlate: '9กก-9999' }), '2026-06-08', rows, '2026-06-12')
    expect(e).toEqual({ gpsKm: 0, days: 0, estimate: 68643 })
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
