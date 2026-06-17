// 465.3 (F) — ลูกค้าคุ้ม/ไม่คุ้ม (Customer Value)
//   รายได้ (วางบิล) เทียบ "ต้นทุนให้บริการ" จาก GPS: ระยะ/น้ำมันของ leg ที่วิ่งไป "ถึง" ลูกค้ารายนั้น
//   → จับลูกค้าไกล+จ่ายน้อย = ขาดทุนซ่อน · pure (testable) · ยังไม่รวมค่าแรง (v1)
import type { Customer, BillingStatement, GpsLeg, GpsVisit } from '@/types'

export interface CustomerValueRow {
  customerId: string
  roundId: string
  revenue: number          // ยอดวางบิลเดือนนั้น
  serveKm: number          // ระยะรวมของ leg ที่จบ (ถึง) ลูกค้ารายนี้
  serveFuelL: number
  serveCost: number        // ต้นทุนน้ำมันให้บริการ (โดยประมาณ)
  fuelEstimated: boolean
  visits: number           // จำนวนครั้งที่จอด (visit)
  dwellAvg: number         // เวลาที่จุดเฉลี่ย (นาที)
  net: number              // revenue − serveCost
  revenuePerKm: number     // 0 ถ้า serveKm=0
}

export interface CustomerValueOptions {
  fuelPrice: number
  kmPerLiter: number
}

export function buildCustomerValue(
  customers: Customer[],
  billingStatements: BillingStatement[],
  legs: GpsLeg[],
  visits: GpsVisit[],
  month: string,           // 'yyyy-mm'
  opts: CustomerValueOptions,
): CustomerValueRow[] {
  const roundOf = new Map(customers.map(c => [c.id, c.roundId || '']))

  // รายได้ต่อลูกค้า (วางบิลเดือนนั้น)
  const rev = new Map<string, number>()
  for (const b of billingStatements) {
    if (b.billingMonth !== month) continue
    rev.set(b.customerId, (rev.get(b.customerId) || 0) + b.subtotal)
  }

  // ต้นทุนให้บริการ: leg ที่ "ถึง" ลูกค้า (toCustomerId) → km/น้ำมัน
  const serve = new Map<string, { km: number; fuelL: number }>()
  for (const l of legs) {
    if (!l.toCustomerId || !l.date.startsWith(month)) continue
    const s = serve.get(l.toCustomerId) || { km: 0, fuelL: 0 }
    s.km += l.km || 0
    s.fuelL += l.fuelL || 0
    serve.set(l.toCustomerId, s)
  }

  // visit: จำนวนครั้ง + dwell รวม
  const vis = new Map<string, { n: number; dwell: number }>()
  for (const v of visits) {
    if (!v.customerId || !v.date.startsWith(month)) continue
    const x = vis.get(v.customerId) || { n: 0, dwell: 0 }
    x.n += 1
    x.dwell += v.dwellMin || 0
    vis.set(v.customerId, x)
  }

  const ids = new Set<string>([...rev.keys(), ...serve.keys()])
  const rows: CustomerValueRow[] = []
  for (const id of ids) {
    const revenue = rev.get(id) || 0
    const s = serve.get(id) || { km: 0, fuelL: 0 }
    const v = vis.get(id) || { n: 0, dwell: 0 }
    const fuelEstimated = s.fuelL <= 0 && s.km > 0
    const effectiveFuelL = fuelEstimated ? s.km / Math.max(0.1, opts.kmPerLiter) : s.fuelL
    const serveCost = effectiveFuelL * opts.fuelPrice
    rows.push({
      customerId: id,
      roundId: roundOf.get(id) ?? '',
      revenue,
      serveKm: s.km,
      serveFuelL: s.fuelL,
      serveCost,
      fuelEstimated,
      visits: v.n,
      dwellAvg: v.n > 0 ? Math.round(v.dwell / v.n) : 0,
      net: revenue - serveCost,
      revenuePerKm: s.km > 0 ? revenue / s.km : 0,
    })
  }

  // เรียง "ไม่คุ้มก่อน": net น้อยสุดขึ้นก่อน · ลูกค้าไม่มีข้อมูล GPS (serveKm=0) ไปท้าย
  return rows.sort((a, b) => {
    const aNoGps = a.serveKm === 0, bNoGps = b.serveKm === 0
    if (aNoGps !== bNoGps) return aNoGps ? 1 : -1
    return a.net - b.net
  })
}
