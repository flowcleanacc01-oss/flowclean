// GPS Route Audit — เทียบแผน (dispatch) vs จริง (GPS) · Feat 423 C-3 · pure (ใช้ client)
//   3 มิติที่ติ๊ดเลือก:
//     1) จำนวน — จุดในแผน vs เที่ยว GPS (flag รถไม่ออกทั้งที่มีจุด)
//     2) เวลา — เวลาออก/เลิกจริง vs รอบ (flag ออกช้า/เลิกเกิน)
//     3) ระยะทาง/น้ำมัน — km/น้ำมันวันนั้น vs median ย้อนหลัง + อัตราสิ้นเปลือง
import type { GpsTrip } from './v2x-types'
import type { Round, TripStop } from '@/types'

export interface TripSummary {
  count: number
  km: number
  fuel: number
  kmPerLiter: number
  firstTime: string // begintime เที่ยวแรก (datetime เต็ม)
  lastTime: string // endTime เที่ยวสุดท้าย
}

export interface AuditFlag {
  level: 'warn' | 'info' | 'ok'
  message: string
}

export interface RoundAudit {
  roundId: string
  roundCode: string
  roundColor: string
  roundStart: string // HH:MM
  roundEnd: string
  vehicleCode: string | null // null = ไม่มีรถผูกรอบ
  plate: string | null
  matched: boolean // จับคู่กับ V2X car ได้ไหม
  plannedStops: number
  plannedBags: number
  actual: TripSummary
  medianKm: number | null // historical (null = ยังไม่ได้คำนวณ/ไม่มีข้อมูล)
  flags: AuditFlag[]
}

const HHMM = /(\d{2}):(\d{2})/

/** "....HH:MM:SS" หรือ "HH:MM" → นาทีจากเที่ยงคืน · null ถ้า parse ไม่ได้ */
export function toMinutes(s: string): number | null {
  const m = s.match(HHMM)
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
}

/** "2026-06-09 23:09:59" → "23:09" */
export function hhmmOf(s: string): string {
  const m = s.match(HHMM)
  return m ? `${m[1]}:${m[2]}` : '—'
}

/** สรุปเที่ยวทั้งหมดของรถใน 1 วัน */
export function summarizeTrips(trips: GpsTrip[]): TripSummary {
  if (trips.length === 0) return { count: 0, km: 0, fuel: 0, kmPerLiter: 0, firstTime: '', lastTime: '' }
  const sorted = [...trips].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const km = trips.reduce((s, t) => s + t.distanceKm, 0)
  const fuel = trips.reduce((s, t) => s + t.fuelLiters, 0)
  return {
    count: trips.length,
    km,
    fuel,
    kmPerLiter: fuel > 0 ? km / fuel : 0,
    firstTime: sorted[0].startTime,
    lastTime: sorted[sorted.length - 1].endTime,
  }
}

/** median ของระยะทางรวมรายวัน จาก trips หลายวัน (ตัดวันที่กำลัง audit ออก) */
export function medianDailyKm(historicalTrips: GpsTrip[], excludeDate: string): number | null {
  const byDay = new Map<string, number>()
  for (const t of historicalTrips) {
    const day = t.startTime.slice(0, 10)
    if (!day || day === excludeDate) continue
    byDay.set(day, (byDay.get(day) || 0) + t.distanceKm)
  }
  const vals = [...byDay.values()].sort((a, b) => a - b)
  if (vals.length === 0) return null
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

// เกณฑ์ (ปรับได้)
const KMPL_LOW = 7 // Hilux Revo ดีเซล ปกติ ~10-13 กม./ลิตร · < 7 = สิ้นเปลืองผิดปกติ
const START_LATE_MIN = 45 // ออกช้ากว่ารอบ > 45 นาที = เตือน
const KM_ANOMALY_MULT = 1.5 // ระยะทาง > 1.5× median = ผิดปกติ

/** ประกอบผล audit 1 รอบ + คำนวณ flags ทั้ง 3 มิติ */
export function buildRoundAudit(
  round: Round,
  vehicleCode: string | null,
  plate: string | null,
  matched: boolean,
  stops: TripStop[],
  trips: GpsTrip[],
  medianKm: number | null,
): RoundAudit {
  const actual = summarizeTrips(trips)
  const audit: RoundAudit = {
    roundId: round.id,
    roundCode: round.code,
    roundColor: round.color,
    roundStart: round.startTime,
    roundEnd: round.endTime,
    vehicleCode,
    plate,
    matched,
    plannedStops: stops.length,
    plannedBags: stops.reduce((s, st) => s + (st.bagCount || 0), 0),
    actual,
    medianKm,
    flags: [],
  }

  if (!matched) {
    audit.flags.push({ level: 'info', message: 'จับคู่ทะเบียนรถกับ GPS ไม่ได้ (รถคันนี้อาจยังไม่ติด terminal)' })
    return audit
  }

  // ── มิติ 1: จำนวน ──
  if (stops.length > 0 && actual.count === 0) {
    audit.flags.push({ level: 'warn', message: `มี ${stops.length} จุดในแผน แต่ GPS ไม่พบการวิ่งเลย` })
  }

  // ── มิติ 2: เวลา ──
  if (actual.count > 0) {
    const roundStartMin = toMinutes(round.startTime)
    const firstMin = toMinutes(actual.firstTime)
    if (roundStartMin != null && firstMin != null) {
      const delay = firstMin - roundStartMin
      if (delay > START_LATE_MIN) {
        audit.flags.push({ level: 'warn', message: `ออกวิ่งช้ากว่ากำหนด ${delay} นาที (รอบ ${round.startTime} · จริง ${hhmmOf(actual.firstTime)})` })
      }
    }
    const roundEndMin = toMinutes(round.endTime)
    const lastMin = toMinutes(actual.lastTime)
    if (roundEndMin != null && lastMin != null && lastMin > roundEndMin) {
      audit.flags.push({ level: 'info', message: `เลิกงานเกินเวลารอบ (รอบจบ ${round.endTime} · จริง ${hhmmOf(actual.lastTime)})` })
    }
  }

  // ── มิติ 3: ระยะทาง/น้ำมัน ──
  if (actual.count > 0 && actual.kmPerLiter > 0 && actual.kmPerLiter < KMPL_LOW) {
    audit.flags.push({ level: 'warn', message: `สิ้นเปลืองน้ำมันผิดปกติ (${actual.kmPerLiter.toFixed(1)} กม./ลิตร)` })
  }
  if (medianKm != null && medianKm > 0 && actual.km > medianKm * KM_ANOMALY_MULT) {
    audit.flags.push({ level: 'warn', message: `ระยะทางสูงผิดปกติ (${actual.km.toFixed(0)} กม. · ปกติ ~${medianKm.toFixed(0)} กม./วัน)` })
  }

  if (audit.flags.length === 0 && actual.count > 0) {
    audit.flags.push({ level: 'ok', message: 'ปกติ — วิ่งตามแผน' })
  }

  return audit
}
