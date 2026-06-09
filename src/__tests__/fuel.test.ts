// 423 งานติ๊ด — verify Fuel Log logic (อัตราสิ้นเปลือง + ค้างเบิก)
import { describe, it, expect } from 'vitest'
import { fuelEfficiencyMap, isEfficiencyAbnormal, pendingReimbursements } from '@/lib/fuel'
import type { FuelLog } from '@/types'

const fl = (over: Partial<FuelLog>): FuelLog =>
  ({ id: 'f1', vehicleId: 'A', date: '2026-06-01', liters: 0, pricePerLiter: 0, amount: 0,
    odometer: 0, driverId: '', station: '', fuelType: 'ดีเซล', taxInvoiceNumber: '',
    paidBy: 'driver', isReimbursed: false, reimbursedDate: '', expenseId: '',
    receiptPhotoPath: '', slipPhotoPath: '', gaugePhotoPath: '', note: '', createdBy: '', createdAt: '', ...over } as FuelLog)

describe('fuelEfficiencyMap — km/ลิตร fill-to-fill', () => {
  it('คำนวณระยะระหว่างเติม ÷ ลิตรครั้งหลัง (ต่อคัน เรียงตาม odometer)', () => {
    const logs = [
      fl({ id: 'a1', vehicleId: 'A', odometer: 100000, liters: 40 }),
      fl({ id: 'a2', vehicleId: 'A', odometer: 100400, liters: 40 }), // 400 km / 40 = 10
      fl({ id: 'a3', vehicleId: 'A', odometer: 100800, liters: 50 }), // 400 km / 50 = 8
    ]
    const m = fuelEfficiencyMap(logs)
    expect(m.get('a1')).toBeUndefined()       // ใบแรก ไม่มี prev
    expect(m.get('a2')).toBe(10)
    expect(m.get('a3')).toBe(8)
  })

  it('แยกต่อคัน + ข้ามใบที่ odometer=0', () => {
    const logs = [
      fl({ id: 'a1', vehicleId: 'A', odometer: 1000, liters: 40 }),
      fl({ id: 'b1', vehicleId: 'B', odometer: 5000, liters: 40 }),
      fl({ id: 'a2', vehicleId: 'A', odometer: 1500, liters: 50 }), // A: 500/50 = 10
      fl({ id: 'a0', vehicleId: 'A', odometer: 0, liters: 30 }),    // ไม่ระบุไมล์ → ข้าม
    ]
    const m = fuelEfficiencyMap(logs)
    expect(m.get('a2')).toBe(10)
    expect(m.get('b1')).toBeUndefined()       // คัน B มีใบเดียว
    expect(m.has('a0')).toBe(false)
  })
})

describe('isEfficiencyAbnormal — anti-fraud เชิงตัวเลข', () => {
  it('ปกติ 8-15 = ไม่เตือน · ต่ำ/สูงเกิน = เตือน', () => {
    expect(isEfficiencyAbnormal(10)).toBe(false)
    expect(isEfficiencyAbnormal(3)).toBe(true)   // เติมเยอะวิ่งน้อย (น่าสงสัย)
    expect(isEfficiencyAbnormal(25)).toBe(true)  // odometer ผิด/เติมไม่เต็ม
    expect(isEfficiencyAbnormal(0)).toBe(false)  // ไม่มีข้อมูล = ไม่เตือน
  })
})

describe('pendingReimbursements — ค้างเบิกคืนคนขับ', () => {
  it('รวมเฉพาะ paidBy=driver && !reimbursed ต่อคนขับ เรียงยอดมาก→น้อย', () => {
    const logs = [
      fl({ driverId: 'd1', amount: 2000, paidBy: 'driver', isReimbursed: false }),
      fl({ driverId: 'd1', amount: 1500, paidBy: 'driver', isReimbursed: false }),
      fl({ driverId: 'd2', amount: 5000, paidBy: 'driver', isReimbursed: false }),
      fl({ driverId: 'd1', amount: 9999, paidBy: 'driver', isReimbursed: true }),  // เบิกแล้ว → ไม่นับ
      fl({ driverId: 'd3', amount: 3000, paidBy: 'company' }),                     // บริษัทจ่าย → ไม่นับ
    ]
    const { byDriver, total } = pendingReimbursements(logs)
    expect(total).toBe(8500)                       // 2000+1500+5000
    expect(byDriver.map(d => d.driverId)).toEqual(['d2', 'd1']) // d2(5000) > d1(3500)
    expect(byDriver[1]).toMatchObject({ driverId: 'd1', amount: 3500, count: 2 })
  })
})
