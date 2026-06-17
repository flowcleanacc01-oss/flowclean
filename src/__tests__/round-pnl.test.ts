// 465.3 (D) — กำไรตามรอบ: รายได้ (วางบิล) − ต้นทุนน้ำมัน (GPS legs) group ตามรอบ
import { describe, it, expect } from 'vitest'
import { buildRoundPnL } from '@/lib/round-pnl'
import type { Customer, BillingStatement, GpsLeg } from '@/types'

const cust = (id: string, roundId: string): Customer => ({ id, roundId, isActive: true } as Customer)
const bill = (customerId: string, billingMonth: string, subtotal: number): BillingStatement =>
  ({ id: `b_${customerId}_${billingMonth}`, customerId, billingMonth, subtotal } as BillingStatement)
const leg = (date: string, roundId: string, km: number, fuelL: number): GpsLeg =>
  ({ id: `l_${date}`, date, roundId, km, fuelL } as GpsLeg)

const OPTS = { fuelPrice: 30, kmPerLiter: 3 }

describe('buildRoundPnL (465.3 D)', () => {
  it('รายได้ group ตามรอบ + ต้นทุนน้ำมันจริง + กำไร เรียงมาก→น้อย', () => {
    const out = buildRoundPnL(
      [cust('c1', 'rV'), cust('c2', 'rV'), cust('c3', '')],
      [bill('c1', '2026-06', 1000), bill('c2', '2026-06', 500), bill('c3', '2026-06', 300), bill('c1', '2026-05', 9999)],
      [leg('2026-06-01', 'rV', 10, 3), leg('2026-06-02', 'rV', 20, 0), leg('2026-05-01', 'rV', 999, 99)],
      '2026-06', OPTS,
    )
    expect(out.length).toBe(2)
    const rV = out[0] // กำไรสูงสุด
    expect(rV.roundId).toBe('rV')
    expect(rV.revenue).toBe(1500)            // c1 1000 + c2 500 (พ.ค. ไม่นับ)
    expect(rV.km).toBe(30)                   // 10+20 (พ.ค. ไม่นับ)
    expect(rV.fuelL).toBe(3)
    expect(rV.fuelEstimated).toBe(false)
    expect(rV.fuelCost).toBe(90)             // 3 × 30
    expect(rV.profit).toBe(1410)             // 1500 − 90
    expect(rV.customerCount).toBe(2)
    expect(rV.customerRevenue[0].customerId).toBe('c1') // เรียงรายได้มากสุด
    expect(rV.revenuePerKm).toBe(50)         // 1500 / 30

    const noRound = out[1]
    expect(noRound.roundId).toBe('')
    expect(noRound.revenue).toBe(300)
    expect(noRound.profit).toBe(300)         // ไม่มี leg → cost 0
  })

  it('ไม่มี fuelL (V2X 0) → ประมาณจาก km/kmPerLiter', () => {
    const out = buildRoundPnL(
      [cust('c1', 'rV')],
      [bill('c1', '2026-06', 1000)],
      [leg('2026-06-01', 'rV', 30, 0)],
      '2026-06', OPTS,
    )
    expect(out[0].fuelEstimated).toBe(true)
    expect(out[0].fuelCost).toBe(300)        // (30/3) × 30
    expect(out[0].profit).toBe(700)
  })

  it('เดือนที่ไม่มีข้อมูล → ว่าง', () => {
    expect(buildRoundPnL([cust('c1', 'rV')], [bill('c1', '2026-06', 1000)], [], '2026-07', OPTS).length).toBe(0)
  })
})
