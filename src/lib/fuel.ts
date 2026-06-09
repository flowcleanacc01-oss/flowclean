// 423 งานติ๊ด — Fuel Log logic (อัตราสิ้นเปลือง + ค้างเบิก)
// แยกจาก UI เพื่อ test ได้ (pattern เดียวกับ dispatch.ts)

import type { FuelLog } from '@/types'

// ช่วง km/ลิตร ปกติของ Hilux Revo ดีเซล (~8-15) — นอกช่วงนี้ = น่าตรวจ (anti-fraud เชิงตัวเลข)
//   ต่ำผิดปกติ = เติมเยอะแต่วิ่งน้อย (ดูดน้ำมัน/เติมคันอื่น) · สูงผิดปกติ = odometer ผิด/เติมไม่เต็ม
export const FUEL_EFFICIENCY_MIN = 4
export const FUEL_EFFICIENCY_MAX = 18

export function isEfficiencyAbnormal(kmPerLiter: number): boolean {
  return kmPerLiter > 0 && (kmPerLiter < FUEL_EFFICIENCY_MIN || kmPerLiter > FUEL_EFFICIENCY_MAX)
}

/**
 * km/ลิตร ต่อใบเติม (fill-to-fill) — ระยะระหว่างเติม 2 ครั้ง ÷ ลิตรที่เติมครั้งหลัง
 * group ต่อคัน · เรียงตาม odometer · ข้ามใบที่ odometer=0 (ไม่ระบุไมล์)
 * คืน Map<fuelLogId, kmPerLiter> (เฉพาะใบที่คำนวณได้)
 */
export function fuelEfficiencyMap(logs: FuelLog[]): Map<string, number> {
  const byVehicle = new Map<string, FuelLog[]>()
  for (const f of logs) {
    if (!byVehicle.has(f.vehicleId)) byVehicle.set(f.vehicleId, [])
    byVehicle.get(f.vehicleId)!.push(f)
  }
  const out = new Map<string, number>()
  for (const list of byVehicle.values()) {
    const withOdo = list.filter(f => f.odometer > 0).sort((a, b) => a.odometer - b.odometer)
    for (let i = 1; i < withOdo.length; i++) {
      const km = withOdo[i].odometer - withOdo[i - 1].odometer
      const liters = withOdo[i].liters
      if (km > 0 && liters > 0) out.set(withOdo[i].id, km / liters)
    }
  }
  return out
}

export interface PendingByDriver {
  driverId: string
  amount: number
  count: number
}

/**
 * ค้างเบิกคืนคนขับ — รวมยอดที่ paidBy='driver' && !isReimbursed ต่อคนขับ
 * คืน { byDriver (เรียงยอดมาก→น้อย), total }
 */
export function pendingReimbursements(logs: FuelLog[]): { byDriver: PendingByDriver[]; total: number } {
  const m = new Map<string, PendingByDriver>()
  let total = 0
  for (const f of logs) {
    if (f.paidBy !== 'driver' || f.isReimbursed) continue
    const cur = m.get(f.driverId) || { driverId: f.driverId, amount: 0, count: 0 }
    cur.amount += f.amount
    cur.count++
    m.set(f.driverId, cur)
    total += f.amount
  }
  return { byDriver: [...m.values()].sort((a, b) => b.amount - a.amount), total }
}
