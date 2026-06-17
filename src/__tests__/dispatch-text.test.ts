import { describe, it, expect } from 'vitest'
import { buildDispatchText, customerMarker, roundHeart } from '@/lib/dispatch-text'
import type { Round, Customer } from '@/types'

const round = (over: Partial<Round>): Round =>
  ({ id: 'r1', code: 'AKARA', name: 'รอบ AKARA', startTime: '15:30', endTime: '17:00',
    defaultVehicleId: '', defaultDriverId: '', defaultHelperId: '', color: '#eab308',
    sortOrder: 1, isActive: true, capacityTarget: 0, note: '', createdAt: '' , ...over })

const cust = (over: Partial<Customer>): Customer =>
  ({ id: 'c1', customerCode: 'HT0001', shortName: 'Q50', name: 'Q50', roundId: 'r1', routeSequence: 1,
    isActive: true, scheduleType: 'weekly', ...over } as Customer)

describe('customerMarker — มาร์กเกอร์จาก schedule (445 กติกา)', () => {
  it('ทุกวัน → * (24)', () => expect(customerMarker(cust({ scheduleType: 'daily' }))).toBe('* (24)'))
  it('ทุก 2 วัน (48ชม.) → (48)', () => expect(customerMarker(cust({ scheduleType: 'every_n_days', scheduleEveryNDays: 2 }))).toBe('(48)'))
  it('ทุก 3 วัน → (72)', () => expect(customerMarker(cust({ scheduleType: 'every_n_days', scheduleEveryNDays: 3 }))).toBe('(72)'))
  it('รายสัปดาห์/2สัปดาห์ → * (วัน)', () => {
    expect(customerMarker(cust({ scheduleType: 'weekly' }))).toBe('* (วัน)')
    expect(customerMarker(cust({ scheduleType: 'biweekly' }))).toBe('* (วัน)')
  })
  it('ไม่ตั้งคิว/อื่นๆ → * (24)', () => {
    expect(customerMarker(cust({ scheduleType: 'none' }))).toBe('* (24)')
    expect(customerMarker(cust({ scheduleType: undefined }))).toBe('* (24)')
  })
})

describe('roundHeart — อิโมจิตามสีรอบ', () => {
  it('เหลือง → 💛', () => expect(roundHeart('#eab308')).toBe('💛'))
  it('ชมพู/แดง → 🩷', () => expect(roundHeart('#ec4899')).toBe('🩷'))
  it('สีไม่รู้/ว่าง → 🤍', () => expect(roundHeart('')).toBe('🤍'))
})

describe('buildDispatchText', () => {
  const rounds = [
    round({ id: 'r1', code: 'AKARA', startTime: '15:30', color: '#eab308' }),
    round({ id: 'r2', code: 'SPA', startTime: '08:00', color: '#ec4899' }),       // เช้า → วันถัดไป
    round({ id: 'r3', code: 'NIGHT', startTime: '04:00', color: '#ec4899' }),     // เช้ามืด → วันถัดไป
    round({ id: 'r4', code: 'EMPTY', startTime: '20:00', color: '#3b82f6' }),     // ไม่มีลูกค้า
  ]
  // 2026-06-15 = จันทร์ (dow=1) · AKARA(15:30)→รัน 15 จ. · SPA/NIGHT(<15.30)→รัน 16 อังคาร
  const customers = [
    cust({ id: 'a', shortName: 'TP', roundId: 'r1', routeSequence: 2, scheduleType: 'weekly', scheduleDays: [1] }), // จ.
    cust({ id: 'b', shortName: 'Q50', roundId: 'r1', routeSequence: 1, scheduleType: 'weekly', scheduleDays: [1] }),
    cust({ id: 'c', shortName: 'SU', roundId: 'r2', routeSequence: 1, scheduleType: 'daily' }),
    cust({ id: 'd', shortName: 'TTM', roundId: 'r3', routeSequence: 1, scheduleType: 'daily' }),
    cust({ id: 'e', shortName: 'OFF', roundId: 'r1', routeSequence: 3, isActive: false }), // inactive → ตัด
    cust({ id: 'f', shortName: 'T71', roundId: 'r1', routeSequence: 4, scheduleType: 'weekly', scheduleDays: [3] }), // 466 พุธเท่านั้น → ไม่มีคิวจันทร์
  ]

  const txt = buildDispatchText('2026-06-15', rounds, customers, [])

  it('หัววันที่ = คืนวันจันทร์ที่ 15-6-69 (พ.ศ. ย่อ)', () => {
    expect(txt.split('\n')[0]).toBe('คืนวันจันทร์ที่ 15-6-69')
  })

  it('เรียง work-night: AKARA(15:30) → NIGHT(04:00 เช้ามืดอังคาร) → SPA(08:00 เช้าอังคาร)', () => {
    const iA = txt.indexOf('รอบ AKARA'), iN = txt.indexOf('รอบ NIGHT'), iS = txt.indexOf('รอบ SPA')
    expect(iA).toBeGreaterThan(-1); expect(iA).toBeLessThan(iN); expect(iN).toBeLessThan(iS)
  })

  it('คำนำหน้ารอบ: บ่าย=คืนวันจันทร์ · เช้ามืด/เช้า=วันอังคาร', () => {
    expect(txt).toContain('💛( คืนวันจันทร์ 15.30 รอบ AKARA)')
    expect(txt).toContain('เช้ามืดวันอังคาร 4.00 รอบ NIGHT')
    expect(txt).toContain('เช้าวันอังคาร 8.00 รอบ SPA')
  })

  it('สมาชิกเรียงตามลำดับวิ่ง + มาร์กเกอร์ + ตัด inactive', () => {
    const akaraBlock = txt.slice(txt.indexOf('รอบ AKARA'), txt.indexOf('รอบ NIGHT'))
    expect(akaraBlock.indexOf('- Q50 * (วัน)')).toBeLessThan(akaraBlock.indexOf('- TP * (วัน)')) // weekly · seq 1 ก่อน 2
    expect(akaraBlock).not.toContain('OFF') // inactive ถูกตัด
    expect(txt).toContain('- SU * (24)') // daily
  })

  it('รอบที่ไม่มีลูกค้า (EMPTY) → ไม่แสดง', () => {
    expect(txt).not.toContain('รอบ EMPTY')
  })

  it('466 — ลูกค้าที่ไม่มีคิวจริงวันนั้น (T71 พุธ) ไม่แสดง', () => {
    expect(txt).not.toContain('T71') // weekly พุธ · 15 = จันทร์ → ไม่มี chip → ไม่ขึ้น
  })

  it('466 — skip override ตัดออก · extra override เพิ่มลูกค้าที่ปกติไม่มีคิว', () => {
    // skip Q50 วันจันทร์ → หาย · extra T71 (ปกติพุธ) วันจันทร์ → โผล่
    const ov = [
      { id: 'o1', customerId: 'b', date: '2026-06-15', type: 'skip', reason: '' },
      { id: 'o2', customerId: 'f', date: '2026-06-15', type: 'extra', reason: '' },
    ] as never[]
    const t2 = buildDispatchText('2026-06-15', rounds, customers, ov)
    expect(t2).not.toContain('Q50') // ถูก skip
    expect(t2).toContain('T71')     // extra เพิ่มเข้า
  })

  it('withMarkers=false → โค้ดล้วน', () => {
    const plain = buildDispatchText('2026-06-15', rounds, customers, [], { withMarkers: false })
    expect(plain).toContain('- Q50\n')
    expect(plain).not.toContain('* (24)')
  })
})
