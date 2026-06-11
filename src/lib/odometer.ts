// 428 — ไมล์ปัจจุบัน auto จาก GPS · pure (testable)
//   V2X/OBD ไม่มีเลขไมล์หน้าปัดจริง (ODO) — มีแค่ระยะวิ่งต่อวัน
//   สูตร: ไมล์ประมาณ = เลขไมล์จริงล่าสุดที่กรอก (anchor) + Σ ระยะวิ่ง GPS "หลังวัน anchor" ถึงวันนี้
//   - ไม่รวมวัน anchor เอง (ไม่รู้ว่ากรอกตอนไหนของวัน — ประมาณแบบ conservative ไม่ over-claim PM)
//   - กรอกไมล์จริงเมื่อไหร่ = ตั้ง anchor ใหม่ → ค่าประมาณ re-sync กับของจริงเสมอ
import type { Vehicle, OdometerLog, FuelLog, MaintenanceRecord } from '@/types'
import type { GpsDailyKm } from './v2x-types'
import { normalizePlate } from './v2x-types'

/** anchor เก่าสุดที่ยอมคำนวณ (วัน) — เก่ากว่านี้ให้กรอกไมล์จริงตั้งต้นใหม่ (กัน fetch ช่วงยาว + ความคลาดสะสม) */
export const ANCHOR_MAX_AGE_DAYS = 92

/**
 * วันที่ของเลขไมล์ปัจจุบัน (ฐานคำนวณ)
 *   ลำดับ: vehicle.odometerAnchorDate (ตั้งตรงๆ) → log ล่าสุดที่มี odometer > 0 (บันทึกไมล์/เติมน้ำมัน/งานซ่อม)
 *   '' = ไม่รู้ (รถที่กรอกไมล์ในฟอร์มก่อนมี 428 และไม่เคยลง log)
 */
export function deriveAnchorDate(
  vehicle: Vehicle,
  odometerLogs: OdometerLog[],
  fuelLogs: FuelLog[],
  maintenanceRecords: MaintenanceRecord[],
): string {
  if (vehicle.odometerAnchorDate) return vehicle.odometerAnchorDate
  const dates: string[] = []
  for (const l of odometerLogs) if (l.vehicleId === vehicle.id && l.odometer > 0 && l.date) dates.push(l.date)
  for (const f of fuelLogs) if (f.vehicleId === vehicle.id && f.odometer > 0 && f.date) dates.push(f.date)
  for (const m of maintenanceRecords) if (m.vehicleId === vehicle.id && m.odometer > 0 && m.date) dates.push(m.date)
  return dates.sort().pop() || ''
}

export interface OdometerEstimate {
  gpsKm: number // ระยะวิ่งสะสมจาก GPS หลังวัน anchor
  days: number // จำนวนวันที่มีข้อมูลวิ่ง
  estimate: number // ไมล์ประมาณ = anchorKm + gpsKm (ปัดเป็นจำนวนเต็ม)
}

/**
 * คำนวณไมล์ประมาณของรถ 1 คันจากระยะวิ่งรายวัน GPS
 *   นับเฉพาะ day > anchorDate และ day <= today (เลือกแถวของคันนี้ด้วย plateNorm)
 */
export function estimateOdometer(
  vehicle: Vehicle,
  anchorDate: string,
  dailyRows: GpsDailyKm[],
  today: string,
): OdometerEstimate {
  const plateNorm = normalizePlate(vehicle.licensePlate)
  let gpsKm = 0
  let days = 0
  for (const r of dailyRows) {
    if (r.plateNorm !== plateNorm) continue
    if (r.day <= anchorDate || r.day > today) continue
    if (r.km <= 0) continue
    gpsKm += r.km
    days++
  }
  return { gpsKm, days, estimate: Math.round(vehicle.currentOdometer + gpsKm) }
}

/** จำนวนวันระหว่าง anchor → today (string math กัน TZ — [[feedback_timezone_safety]]) */
export function anchorAgeDays(anchorDate: string, today: string): number {
  if (!anchorDate) return Infinity
  const [y1, m1, d1] = anchorDate.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}
