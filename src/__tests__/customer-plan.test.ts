// 453 — แผนคิวลูกค้า: ขยาย schedule + override + ช่วง 1/2/3 เดือน
import { describe, it, expect } from 'vitest'
import { planRange, buildCustomerPlan, buildCustomerPlanText, thaiDateShort } from '@/lib/customer-plan'
import type { Customer, Round, ScheduleOverride } from '@/types'

const cust = (o: Partial<Customer>): Customer => ({
  id: 'c1', scheduleType: 'weekly', scheduleDays: [1, 4], // จันทร์/พฤหัส
  pickupWindowStart: '', pickupWindowEnd: '', roundId: '', ...o,
} as Customer)
const round = (o: Partial<Round>): Round => ({ id: 'r1', startTime: '08:00', endTime: '12:00', isActive: true, ...o } as Round)
const ov = (o: Partial<ScheduleOverride>): ScheduleOverride => ({ id: 'o', customerId: 'c1', date: '', type: 'skip', reason: '', ...o } as ScheduleOverride)

describe('planRange (453)', () => {
  it('1 เดือน = วันนี้ → สิ้นเดือนนี้', () => {
    expect(planRange('2026-06-15', 1)).toEqual({ start: '2026-06-15', end: '2026-06-30' })
  })
  it('2 เดือน = วันนี้ → สิ้นเดือนหน้า', () => {
    expect(planRange('2026-06-15', 2)).toEqual({ start: '2026-06-15', end: '2026-07-31' })
  })
  it('3 เดือน = วันนี้ → สิ้นเดือน +2 (ข้ามปีถูกต้อง)', () => {
    expect(planRange('2026-11-20', 3)).toEqual({ start: '2026-11-20', end: '2027-01-31' })
  })
})

describe('buildCustomerPlan (453)', () => {
  it('weekly จ/พฤ → วันคิวถูกต้อง + เวลาจากรอบ', () => {
    const days = buildCustomerPlan(cust({ roundId: 'r1' }), '2026-06-15', '2026-06-30', [], [round({})])
    // 2026-06-15 = จันทร์ · 18=พฤ · 22=จ · 25=พฤ · 29=จ
    expect(days.map(d => d.date)).toEqual(['2026-06-15', '2026-06-18', '2026-06-22', '2026-06-25', '2026-06-29'])
    expect(days[0].timeStart).toBe('08:00')
    expect(days[0].timeEnd).toBe('12:00')
  })

  it('pickup window ของลูกค้า ชนะเวลารอบ', () => {
    const days = buildCustomerPlan(cust({ roundId: 'r1', pickupWindowStart: '09:30', pickupWindowEnd: '10:30' }), '2026-06-15', '2026-06-18', [], [round({})])
    expect(days[0].timeStart).toBe('09:30')
    expect(days[0].timeEnd).toBe('10:30')
  })

  it('skip override ตัดวันออก · extra override เพิ่มวัน (rescheduledIn)', () => {
    const overrides = [
      ov({ date: '2026-06-15', type: 'skip' }),               // ตัด จ.15
      ov({ date: '2026-06-17', type: 'extra' }),              // เพิ่ม พ.17 (ไม่ใช่คิวปกติ)
    ]
    const days = buildCustomerPlan(cust({}), '2026-06-15', '2026-06-18', overrides, [])
    const dates = days.map(d => d.date)
    expect(dates).not.toContain('2026-06-15')   // ถูก skip
    expect(dates).toContain('2026-06-17')        // extra
    expect(dates).toContain('2026-06-18')        // พฤ. ปกติ
    expect(days.find(d => d.date === '2026-06-17')?.rescheduledIn).toBe(true)
  })

  it('scheduleType none → ไม่มีคิว', () => {
    expect(buildCustomerPlan(cust({ scheduleType: 'none' }), '2026-06-15', '2026-06-30', [], []).length).toBe(0)
  })

  it('458 — dispatchNote ลูกค้า → ทุกวันมี note · override note ทับเฉพาะวันนั้น', () => {
    const overrides = [ov({ date: '2026-06-18', type: 'note', reason: 'รับมาซักวันสุดท้าย' })]
    const days = buildCustomerPlan(cust({ roundId: 'r1', dispatchNote: 'รับ' }), '2026-06-15', '2026-06-18', overrides, [round({})])
    expect(days.find(d => d.date === '2026-06-15')?.note).toBe('รับ')                  // default dispatchNote
    expect(days.find(d => d.date === '2026-06-18')?.note).toBe('รับมาซักวันสุดท้าย')    // override ทับ
  })
})

describe('buildCustomerPlanText (453)', () => {
  it('จัดกลุ่มตามเดือน + รวมจำนวน + ชื่อบริษัท', () => {
    const days = buildCustomerPlan(cust({ roundId: 'r1' }), '2026-06-29', '2026-07-06', [], [round({})])
    const txt = buildCustomerPlanText('โรงแรม A', days, 'FlowClean', 'มิ.ย.–ก.ค. 2569')
    expect(txt).toContain('📋 แผนคิวรับ-ส่งผ้า')
    expect(txt).toContain('โรงแรม A')
    expect(txt).toContain('📅 มิถุนายน 2569')
    expect(txt).toContain('📅 กรกฎาคม 2569')
    expect(txt).toContain('⏰ 08:00-12:00')
    expect(txt).toContain(`รวม ${days.length} ครั้ง`)
    expect(txt).toContain('— FlowClean')
  })

  it('ไม่มีคิว → ข้อความบอกชัด', () => {
    expect(buildCustomerPlanText('โรงแรม B', [], 'FlowClean', 'มิ.ย. 2569')).toContain('(ไม่มีคิวในช่วงนี้)')
  })

  it('458 — note โผล่ในข้อความ', () => {
    const days = buildCustomerPlan(cust({ roundId: 'r1', dispatchNote: 'รับ' }), '2026-06-15', '2026-06-18', [], [round({})])
    expect(buildCustomerPlanText('โรงแรม A', days, 'FlowClean', 'มิ.ย. 2569')).toContain('— รับ')
  })
})

describe('thaiDateShort', () => {
  it('แสดงวัน+วันที่+เดือนย่อ', () => {
    expect(thaiDateShort('2026-06-15')).toBe('จ. 15 มิ.ย.')
  })
})
