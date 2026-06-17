// 465.3 (F) — ลูกค้าคุ้ม/ไม่คุ้ม: รายได้ vs ต้นทุนให้บริการ (GPS leg ถึงลูกค้า)
import { describe, it, expect } from 'vitest'
import { buildCustomerValue } from '@/lib/customer-value'
import type { Customer, BillingStatement, GpsLeg, GpsVisit } from '@/types'

const cust = (id: string, roundId = 'rV'): Customer => ({ id, roundId, isActive: true } as Customer)
const bill = (customerId: string, m: string, subtotal: number): BillingStatement =>
  ({ id: `b_${customerId}`, customerId, billingMonth: m, subtotal } as BillingStatement)
const leg = (date: string, toCustomerId: string, km: number, fuelL: number): GpsLeg =>
  ({ id: `l_${date}_${toCustomerId}`, date, toCustomerId, km, fuelL } as GpsLeg)
const visit = (date: string, customerId: string, dwellMin: number): GpsVisit =>
  ({ id: `v_${date}_${customerId}`, date, customerId, dwellMin } as GpsVisit)

const OPTS = { fuelPrice: 30, kmPerLiter: 3 }

describe('buildCustomerValue (465.3 F)', () => {
  it('รายได้ − ต้นทุนให้บริการ (leg ถึงลูกค้า) · net + รายได้/กม.', () => {
    const out = buildCustomerValue(
      [cust('cNear'), cust('cFar')],
      [bill('cNear', '2026-06', 1000), bill('cFar', '2026-06', 1000)],
      [leg('2026-06-01', 'cNear', 5, 1), leg('2026-06-02', 'cFar', 50, 10), leg('2026-05-01', 'cNear', 99, 9)],
      [visit('2026-06-01', 'cNear', 20), visit('2026-06-02', 'cFar', 30)],
      '2026-06', OPTS,
    )
    const near = out.find(r => r.customerId === 'cNear')!
    const far = out.find(r => r.customerId === 'cFar')!
    expect(near.serveKm).toBe(5)         // พ.ค. ไม่นับ
    expect(near.serveCost).toBe(30)      // 1 ลิตร × 30
    expect(near.net).toBe(970)
    expect(near.revenuePerKm).toBe(200)  // 1000/5
    expect(far.serveCost).toBe(300)      // 10 ลิตร × 30
    expect(far.net).toBe(700)
    expect(far.revenuePerKm).toBe(20)    // 1000/50 = ไกล จ่ายเท่ากัน = คุ้มน้อยกว่า
    // เรียงไม่คุ้มก่อน (net น้อย) → cFar (700) มาก่อน cNear (970)
    expect(out[0].customerId).toBe('cFar')
    expect(far.dwellAvg).toBe(30)
  })

  it('ไม่มี GPS leg (serveKm=0) → ไปท้าย', () => {
    const out = buildCustomerValue(
      [cust('cA'), cust('cB')],
      [bill('cA', '2026-06', 100), bill('cB', '2026-06', 100)],
      [leg('2026-06-01', 'cA', 10, 2)],   // cB ไม่มี leg
      [], '2026-06', OPTS,
    )
    expect(out[out.length - 1].customerId).toBe('cB') // ไม่มี GPS → ท้ายสุด
    expect(out[out.length - 1].serveKm).toBe(0)
  })

  it('fuelL=0 → ประมาณจาก km', () => {
    const out = buildCustomerValue([cust('c1')], [bill('c1', '2026-06', 500)], [leg('2026-06-01', 'c1', 30, 0)], [], '2026-06', OPTS)
    expect(out[0].fuelEstimated).toBe(true)
    expect(out[0].serveCost).toBe(300)   // (30/3) × 30
  })
})
