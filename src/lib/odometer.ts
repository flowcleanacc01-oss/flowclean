// 428 — ไมล์ปัจจุบัน auto จาก GPS · pure (testable)
//   V2X/OBD ไม่มีเลขไมล์หน้าปัดจริง (ODO) — มีแค่ระยะวิ่งต่อวัน
//   สูตร: ไมล์ประมาณ = เลขไมล์จริงล่าสุดที่กรอก (anchor) + Σ ระยะวิ่ง GPS "หลัง anchor" ถึงวันนี้
//   446 — anchor มี "เวลา" ด้วย (คนขับถ่ายไมล์ก่อนออกรถตอนเช้า → วันเดียวกันยังวิ่งอีกทั้งวัน):
//     - วันหลัง anchor: นับระยะเต็มวัน (จาก daily aggregate)
//     - วัน anchor เอง: นับเฉพาะระยะของเที่ยวที่ "ออกหลังเวลาที่กรอก" (anchorDayKm — page คำนวณจาก trips)
//     - ไม่รู้เวลา (anchorTime='') → ข้ามวัน anchor ทั้งวันแบบเดิม (conservative ไม่ over-claim PM)
//   - กรอกไมล์จริงเมื่อไหร่ = ตั้ง anchor ใหม่ (วัน+เวลา) → ค่าประมาณ re-sync กับของจริงเสมอ
import type { Vehicle, OdometerLog, FuelLog, MaintenanceRecord } from '@/types'
import type { GpsDailyKm, GpsTrip } from './v2x-types'
import { normalizePlate, parseV2xTimeMs } from './v2x-types'

/** anchor เก่าสุดที่ยอมคำนวณ (วัน) — เก่ากว่านี้ให้กรอกไมล์จริงตั้งต้นใหม่ (กัน fetch ช่วงยาว + ความคลาดสะสม) */
export const ANCHOR_MAX_AGE_DAYS = 92

/** ฐานคำนวณไมล์: วัน + เวลาของ currentOdometer (time='' = ไม่รู้เวลา) */
export interface Anchor {
  date: string // yyyy-mm-dd ('' = ไม่รู้)
  time: string // HH:MM ('' = ไม่รู้เวลา → ข้ามวัน anchor ทั้งวัน)
}

/**
 * วัน+เวลาของเลขไมล์ปัจจุบัน (ฐานคำนวณ)
 *   ลำดับ: vehicle.odometerAnchorDate (ตั้งตรงๆ + odometerAnchorTime) → log ล่าสุดที่มี odometer > 0
 *          (บันทึกไมล์/งานซ่อมใช้ recordedTime — 446/470 · เติมน้ำมันไม่ระบุเวลา → time='')
 *   date '' = ไม่รู้ (รถที่กรอกไมล์ก่อนมี 428 และไม่เคยลง log)
 */
export function deriveAnchor(
  vehicle: Vehicle,
  odometerLogs: OdometerLog[],
  fuelLogs: FuelLog[],
  maintenanceRecords: MaintenanceRecord[],
): Anchor {
  if (vehicle.odometerAnchorDate) {
    return { date: vehicle.odometerAnchorDate, time: vehicle.odometerAnchorTime || '' }
  }
  const cands: Anchor[] = []
  for (const l of odometerLogs) if (l.vehicleId === vehicle.id && l.odometer > 0 && l.date) cands.push({ date: l.date, time: l.recordedTime || '' })
  for (const f of fuelLogs) if (f.vehicleId === vehicle.id && f.odometer > 0 && f.date) cands.push({ date: f.date, time: '' })
  for (const m of maintenanceRecords) if (m.vehicleId === vehicle.id && m.odometer > 0 && m.date) cands.push({ date: m.date, time: m.recordedTime || '' })
  if (cands.length === 0) return { date: '', time: '' }
  // วันล่าสุดอยู่ท้าย · วันเดียวกัน เลือกตัวที่ "มีเวลา" (ละเอียดกว่า) ไว้ท้าย
  cands.sort((a, b) => a.date.localeCompare(b.date) || (a.time ? 1 : 0) - (b.time ? 1 : 0))
  return cands[cands.length - 1]
}

export interface OdometerEstimate {
  gpsKm: number // ระยะวิ่งสะสมจาก GPS หลัง anchor (รวม partial วัน anchor)
  days: number // จำนวนวันที่มีข้อมูลวิ่ง
  estimate: number // ไมล์ประมาณ = anchorKm + gpsKm (ปัดเป็นจำนวนเต็ม)
}

/**
 * คำนวณไมล์ประมาณของรถ 1 คันจากระยะวิ่งรายวัน GPS
 *   - นับเต็มวันสำหรับ day > anchorDate และ day <= today (เลือกแถวของคันนี้ด้วย plateNorm)
 *   - 446: anchorDayKm = ระยะ "วัน anchor หลังเวลาที่กรอก" (page คำนวณจาก trips) — บวกเพิ่มถ้า > 0
 */
export function estimateOdometer(
  vehicle: Vehicle,
  anchorDate: string,
  dailyRows: GpsDailyKm[],
  today: string,
  anchorDayKm = 0,
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
  // 446 — ระยะของวัน anchor เองที่วิ่งหลังเวลาที่กรอกไมล์ (ไม่ข้ามข้อมูลวันเดียวกัน)
  if (anchorDayKm > 0) {
    gpsKm += anchorDayKm
    days++
  }
  return { gpsKm, days, estimate: Math.round(vehicle.currentOdometer + gpsKm) }
}

/**
 * 446 — ระยะ (กม.) ของวัน anchor ที่วิ่ง "หลังเวลาที่กรอกไมล์"
 *   รวม distanceKm ของเที่ยวที่ startTime >= anchorDate+anchorTime
 *   V2X = เวลาไทย, anchorTime = ไทย → parse แบบ TZ-explicit (parseV2xTimeMs) กันเพี้ยนบน Vercel
 *   anchorTime '' = ไม่รู้เวลา → 0 (ให้ caller ข้ามวัน anchor แบบเดิม)
 */
export function anchorDayKmAfter(trips: GpsTrip[], anchorDate: string, anchorTime: string): number {
  if (!anchorTime || !anchorDate) return 0
  const cutoff = parseV2xTimeMs(`${anchorDate} ${anchorTime}`)
  if (Number.isNaN(cutoff)) return 0
  let km = 0
  for (const t of trips) {
    if (t.startTime.slice(0, 10) !== anchorDate) continue
    const ts = parseV2xTimeMs(t.startTime)
    if (!Number.isNaN(ts) && ts >= cutoff) km += t.distanceKm
  }
  return km
}

/** จำนวนวันระหว่าง anchor → today (string math กัน TZ — [[feedback_timezone_safety]]) */
export function anchorAgeDays(anchorDate: string, today: string): number {
  if (!anchorDate) return Infinity
  const [y1, m1, d1] = anchorDate.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}
