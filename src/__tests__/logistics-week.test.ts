// 360 — verify P5 Logistic Calendar logic (schedule expansion + status + override + reschedule)
// 378.1 — week เริ่มวันอาทิตย์ (Sunday-first) · 377 — buildLogisticsWeek filter isActive
import { describe, it, expect } from 'vitest'
import { buildLogisticsWeek, getWeekStart, addDays, isDraggableStatus } from '@/lib/logistics-week'
import { isScheduledDay, nthOccurrenceDate } from '@/lib/schedule-audit'
import type { Customer, DeliveryNote, ScheduleOverride } from '@/types'

// minimal mocks (cast — buildLogisticsWeek อ่านแค่ schedule fields + isActive + dn.date/isExtraRound/customerId)
const cust = (over: Partial<Customer>): Customer => ({ id: 'c1', name: 'KAYA', shortName: 'KAYA', scheduleType: 'daily', isActive: true, ...over } as Customer)
const dn = (id: string, customerId: string, date: string, isExtraRound = false): DeliveryNote =>
  ({ id, customerId, date, isExtraRound } as DeliveryNote)
const ov = (customerId: string, date: string, type: ScheduleOverride['type']): ScheduleOverride =>
  ({ id: `o-${date}-${type}`, customerId, date, type, reason: 't', createdAt: '', createdBy: 't' } as ScheduleOverride)

// 378.1 — derive a known SUNDAY + weekday offsets (ไม่ hardcode วันในสัปดาห์)
const SUN = getWeekStart('2026-05-20')
const MON = addDays(SUN, 1), TUE = addDays(SUN, 2), WED = addDays(SUN, 3), THU = addDays(SUN, 4), FRI = addDays(SUN, 5)

describe('isScheduledDay — schedule math', () => {
  it('daily = ทุกวัน', () => {
    expect(isScheduledDay(MON, cust({ scheduleType: 'daily' }))).toBe(true)
    expect(isScheduledDay(TUE, cust({ scheduleType: 'daily' }))).toBe(true)
  })
  it('weekly = เฉพาะวันที่เลือก', () => {
    const c = cust({ scheduleType: 'weekly', scheduleDays: [1] }) // จันทร์ (MON dow=1)
    expect(isScheduledDay(MON, c)).toBe(true)
    expect(isScheduledDay(TUE, c)).toBe(false)
  })
  it('every_n_days N=2 = วันเว้นวัน (48hr)', () => {
    const c = cust({ scheduleType: 'every_n_days', scheduleStartDate: MON, scheduleEveryNDays: 2 })
    expect(isScheduledDay(MON, c)).toBe(true)   // +0
    expect(isScheduledDay(TUE, c)).toBe(false)  // +1
    expect(isScheduledDay(WED, c)).toBe(true)   // +2
  })
  it('biweekly = 2 สัปดาห์ครั้ง ตาม parity', () => {
    const c = cust({ scheduleType: 'biweekly', scheduleDays: [1], scheduleStartDate: MON, scheduleBiweeklyAnchorWeek: 0 })
    expect(isScheduledDay(MON, c)).toBe(true)            // week 0
    expect(isScheduledDay(addDays(MON, 7), c)).toBe(false)  // week 1 (เว้น)
    expect(isScheduledDay(addDays(MON, 14), c)).toBe(true)  // week 2
  })

  // 377 — end condition
  it('scheduleEndDate = หยุดหลังวันสิ้นสุด', () => {
    const c = cust({ scheduleType: 'daily', scheduleEndDate: WED })
    expect(isScheduledDay(TUE, c)).toBe(true)
    expect(isScheduledDay(WED, c)).toBe(true)   // inclusive
    expect(isScheduledDay(THU, c)).toBe(false)  // เลยวันสิ้นสุด
  })
})

describe('nthOccurrenceDate — สิ้นสุดหลัง N ครั้ง (377)', () => {
  it('daily: ครั้งที่ 3 = start + 2 วัน', () => {
    const c = cust({ scheduleType: 'daily', scheduleStartDate: SUN })
    expect(nthOccurrenceDate(c, 1)).toBe(SUN)
    expect(nthOccurrenceDate(c, 3)).toBe(TUE)
  })
  it('weekly จันทร์: ครั้งที่ 2 = จันทร์ถัดไป', () => {
    const c = cust({ scheduleType: 'weekly', scheduleDays: [1], scheduleStartDate: SUN })
    expect(nthOccurrenceDate(c, 1)).toBe(MON)
    expect(nthOccurrenceDate(c, 2)).toBe(addDays(MON, 7))
  })
  it('ละเว้น scheduleEndDate ใน input (ไม่ self-limit)', () => {
    const c = cust({ scheduleType: 'daily', scheduleStartDate: SUN, scheduleEndDate: MON })
    expect(nthOccurrenceDate(c, 5)).toBe(addDays(SUN, 4)) // นับต่อได้แม้มี end
  })
  it('n<1 หรือ type none = null', () => {
    expect(nthOccurrenceDate(cust({ scheduleType: 'daily', scheduleStartDate: SUN }), 0)).toBeNull()
    expect(nthOccurrenceDate(cust({ scheduleType: 'none', scheduleStartDate: SUN }), 3)).toBeNull()
  })
})

describe('buildLogisticsWeek — grid', () => {
  it('378.1 สัปดาห์เริ่มอาทิตย์ + 7 วัน + flag วันนี้', () => {
    const w = buildLogisticsWeek([cust({})], [], [], MON, WED)
    expect(w.days).toHaveLength(7)
    expect(w.weekStart).toBe(SUN)
    expect(w.weekEnd).toBe(addDays(SUN, 6))
    expect(w.days[0].dayOfWeek).toBe(0) // อาทิตย์
    expect(w.days.find(d => d.date === WED)?.isToday).toBe(true)
  })

  it('377 filter isActive: ปิดลูกค้า = ไม่อยู่ในปฏิทิน', () => {
    const w = buildLogisticsWeek([cust({ isActive: false })], [], [], MON, WED)
    expect(w.rows).toHaveLength(0)
  })

  it('daily: มี SD=ok, ไม่มี=missing + นับ weekMissing เฉพาะ <=วันนี้', () => {
    const dns = [dn('d1', 'c1', MON), dn('d2', 'c1', WED)]
    const w = buildLogisticsWeek([cust({ scheduleType: 'daily' })], dns, [], MON, FRI) // today=ศุกร์
    const cells = w.rows[0].cells
    const byDate = (d: string) => cells.find(c => c.date === d)!
    expect(byDate(MON).status).toBe('ok')
    expect(byDate(TUE).status).toBe('missing')
    expect(byDate(WED).status).toBe('ok')
    // missing <= today (ศุกร์): SUN, TUE, THU, FRI = 4 (อาทิตย์อยู่ต้นสัปดาห์=ก่อนวันนี้ · เสาร์ อนาคต ไม่นับ)
    expect(w.rows[0].weekMissing).toBe(4)
  })

  it('skip override → วันนั้นเป็น skipped (ไม่ใช่ missing)', () => {
    const w = buildLogisticsWeek([cust({ scheduleType: 'daily' })], [], [ov('c1', TUE, 'skip')], MON, FRI)
    const tue = w.rows[0].cells.find(c => c.date === TUE)!
    expect(tue.status).toBe('skipped')
  })

  it('reschedule: วันต้นทาง=skipped, วันปลายทาง=expected (P5.1)', () => {
    const overrides = [ov('c1', MON, 'reschedule_skip'), ov('c1', TUE, 'reschedule_add')]
    const w = buildLogisticsWeek([cust({ scheduleType: 'weekly', scheduleDays: [1] })], [], overrides, MON, FRI)
    const cells = w.rows[0].cells
    const mon = cells.find(c => c.date === MON)!
    const tue = cells.find(c => c.date === TUE)!
    expect(mon.status).toBe('skipped')      // เลื่อนออก
    expect(tue.overrides.some(o => o.type === 'reschedule_add')).toBe(true) // เลื่อนเข้า
  })

  it('เรียง row: ลูกค้าที่ขาด (<=วันนี้) ขึ้นก่อน', () => {
    const c1 = cust({ id: 'c1', shortName: 'AAA', scheduleType: 'daily' }) // ขาดเยอะ
    const c2 = cust({ id: 'c2', shortName: 'BBB', scheduleType: 'daily' })
    // c2 มี SD ครบทุกวัน <= วันนี้ (อา-พ) → ไม่ขาด · c1 ไม่มีเลย → ขาด
    const dns = [dn('x0', 'c2', SUN), dn('x1', 'c2', MON), dn('x2', 'c2', TUE), dn('x3', 'c2', WED)]
    const w = buildLogisticsWeek([c2, c1], dns, [], MON, WED) // today=พุธ
    expect(w.rows[0].customer.id).toBe('c1') // ขาดขึ้นก่อน
    expect(w.rows[0].weekMissing).toBeGreaterThan(0)
    expect(w.rows[1].weekMissing).toBe(0)
  })

  it('isDraggableStatus: ok/missing ลากได้, empty/skipped ลากไม่ได้', () => {
    expect(isDraggableStatus('ok')).toBe(true)
    expect(isDraggableStatus('missing')).toBe(true)
    expect(isDraggableStatus('empty')).toBe(false)
    expect(isDraggableStatus('skipped')).toBe(false)
  })
})
