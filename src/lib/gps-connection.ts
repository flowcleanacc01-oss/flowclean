// 433 — สถานะการเชื่อมต่ออุปกรณ์ GPS: จับ "ขาดสัญญาณ" (อาจถูกถอด/ปิดอุปกรณ์) จาก realtime
//   pure (testable) · ใช้ online + lastActiveTime จาก GpsPosition (/map/all/gps)
//   หลักการ: อุปกรณ์ฮาร์ดไวร์ที่ถูกถอด → ไม่มีไฟ → online=0 + lastActiveTime หยุดเดิน
//   ⚠️ "ขาดสัญญาณ" = ควรตรวจสอบ ไม่ใช่ข้อสรุปว่า "ถูกถอด" (อาจจอดดับเครื่อง/อับสัญญาณ) — ให้คนตัดสิน
import { type GpsPosition, parseV2xTimeMs } from './v2x-types'

export type ConnLevel =
  | 'online'      // กำลังเชื่อมต่อ
  | 'recent'      // เพิ่งขาด (<30 นาที — อาจอับสัญญาณ/จอดดับเครื่องชั่วคราว)
  | 'suspicious'  // ขาดระหว่างวัน (30 นาที–8 ชม.) — เคยส่งวันนี้แล้วเงียบ ควรตรวจสอบ
  | 'long'        // ขาดนาน (>8 ชม. — จอดค้างคืน/ไม่ได้ใช้)

/** ออฟไลน์เกินนี้ (นาที) = เริ่มน่าสงสัย (ไม่ใช่แค่อับสัญญาณชั่วคราว) */
export const SUSPICIOUS_MIN = 30
/** ออฟไลน์เกินนี้ (นาที) = ขาดนาน (จอดค้างคืน) — เด่นน้อยลง */
export const LONG_MIN = 8 * 60

export interface ConnStatus {
  online: boolean
  offlineMin: number   // นาทีจาก lastActiveTime → now (0 ถ้า online หรือ parse เวลาไม่ได้)
  level: ConnLevel
  lastSeen: string     // เวลาที่อุปกรณ์ติดต่อล่าสุด (lastActiveTime หรือ gpsTime)
}

/** ประเมินสถานะการเชื่อมต่อของรถ 1 คัน ณ เวลา nowMs */
export function connStatus(pos: GpsPosition, nowMs: number): ConnStatus {
  const lastSeen = pos.lastActiveTime || pos.gpsTime || ''
  if (pos.online) return { online: true, offlineMin: 0, level: 'online', lastSeen }
  const t = parseV2xTimeMs(lastSeen) // 444 — V2X = เวลาไทย (UTC+7) · parse แบบ TZ-explicit กันเพี้ยนบน Vercel(UTC)
  const offlineMin = Number.isFinite(t) ? Math.max(0, Math.round((nowMs - t) / 60000)) : 0
  let level: ConnLevel
  if (offlineMin < SUSPICIOUS_MIN) level = 'recent'
  else if (offlineMin <= LONG_MIN) level = 'suspicious'
  else level = 'long'
  return { online: false, offlineMin, level, lastSeen }
}

/** ลำดับความสำคัญในการแสดง (น่าสงสัยขึ้นก่อน) */
export const CONN_LEVEL_ORDER: Record<ConnLevel, number> = {
  suspicious: 0, recent: 1, long: 2, online: 3,
}
