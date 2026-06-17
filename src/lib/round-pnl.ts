// 465.3 (D) — กำไรตามรอบ (Profit by Round)
//   รายได้ (ยอดวางบิลของลูกค้าในรอบ) − ต้นทุนน้ำมัน (จาก GPS legs 449) = กำไรเบื้องต้นต่อรอบ
//   เชื่อมข้อมูลใหม่: customer.roundId (membership) + gps_legs (roundId/km/fuelL จาก reconstruct 449)
//   pure (testable) · ยังไม่รวมค่าแรง/ค่าเสื่อม/ซ่อม (v1)
import type { Customer, BillingStatement, GpsLeg } from '@/types'

export interface RoundPnLRow {
  roundId: string                    // '' = ไม่มีรอบ / ระบุรอบไม่ได้
  revenue: number                    // ยอดวางบิลรวม (subtotal) ของลูกค้าในรอบ เดือนนั้น
  customerCount: number
  customerRevenue: { customerId: string; revenue: number }[] // เรียงมาก→น้อย (drill-down)
  km: number                         // ระยะวิ่งรวมของรอบ (GPS legs)
  fuelL: number                      // น้ำมันจริงจาก V2X (0 = ไม่มีข้อมูล → ประมาณจาก km)
  fuelEstimated: boolean             // true = ค่าน้ำมันประมาณจาก km/kmPerLiter
  fuelCost: number                   // ต้นทุนน้ำมันโดยประมาณ (฿)
  profit: number                     // revenue − fuelCost
  revenuePerKm: number               // 0 ถ้า km=0
}

export interface RoundPnLOptions {
  fuelPrice: number      // ฿/ลิตร
  kmPerLiter: number     // ใช้ประมาณน้ำมันเมื่อ V2X ไม่มี fuelL (km/นี้ = ลิตร)
}

/** กำไรตามรอบของเดือนที่เลือก · เรียงกำไรมาก→น้อย */
export function buildRoundPnL(
  customers: Customer[],
  billingStatements: BillingStatement[],
  legs: GpsLeg[],
  month: string,         // 'yyyy-mm'
  opts: RoundPnLOptions,
): RoundPnLRow[] {
  const roundOf = new Map(customers.map(c => [c.id, c.roundId || '']))

  // รายได้: ยอดวางบิลของเดือน → group ตามรอบ + ต่อลูกค้า
  const revByRound = new Map<string, Map<string, number>>()
  for (const b of billingStatements) {
    if (b.billingMonth !== month) continue
    const rid = roundOf.get(b.customerId) ?? ''
    let m = revByRound.get(rid)
    if (!m) { m = new Map(); revByRound.set(rid, m) }
    m.set(b.customerId, (m.get(b.customerId) || 0) + b.subtotal)
  }

  // ต้นทุน: ระยะ/น้ำมันของ legs เดือนนั้น → group ตามรอบ
  const costByRound = new Map<string, { km: number; fuelL: number }>()
  for (const l of legs) {
    if (!l.date.startsWith(month)) continue
    const c = costByRound.get(l.roundId) || { km: 0, fuelL: 0 }
    c.km += l.km || 0
    c.fuelL += l.fuelL || 0
    costByRound.set(l.roundId, c)
  }

  const allRids = new Set<string>([...revByRound.keys(), ...costByRound.keys()])
  const rows: RoundPnLRow[] = []
  for (const rid of allRids) {
    const custMap = revByRound.get(rid) || new Map<string, number>()
    const customerRevenue = [...custMap.entries()]
      .map(([customerId, revenue]) => ({ customerId, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
    const revenue = customerRevenue.reduce((s, r) => s + r.revenue, 0)

    const cost = costByRound.get(rid) || { km: 0, fuelL: 0 }
    const fuelEstimated = cost.fuelL <= 0 && cost.km > 0
    const effectiveFuelL = fuelEstimated ? cost.km / Math.max(0.1, opts.kmPerLiter) : cost.fuelL
    const fuelCost = effectiveFuelL * opts.fuelPrice

    rows.push({
      roundId: rid,
      revenue,
      customerCount: customerRevenue.length,
      customerRevenue,
      km: cost.km,
      fuelL: cost.fuelL,
      fuelEstimated,
      fuelCost,
      profit: revenue - fuelCost,
      revenuePerKm: cost.km > 0 ? revenue / cost.km : 0,
    })
  }
  return rows.sort((a, b) => b.profit - a.profit)
}
