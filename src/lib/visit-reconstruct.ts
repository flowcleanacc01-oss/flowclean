// 449 — Milk-Run Analytics · Phase 1: reconstruct visit/leg จาก GPS trips (pure · เทสได้)
//   แกน: trip = leg (เคลื่อนที่ A→B มีพิกัดต้น-ปลาย) · ช่วงระหว่างเที่ยว (engine off) = dwell ที่จุดจบเที่ยวก่อน
//   visit = เที่ยวที่ "จบ" ที่พิกัดลูกค้า (engine-off arrival = confidence high)
//   reuse: matchPlace (geo) · parseV2xTimeMs (v2x-types, TZ ไทย 446) · isShuffleTrip (geo)
import type { Customer, SavedPlace, GpsVisit, GpsLeg } from '@/types'
import type { GpsTrip } from './v2x-types'
import { parseV2xTimeMs } from './v2x-types'
import { matchPlace, isShuffleTrip, type LatLng } from './geo'

/** หน้าต่างเวลารอบของรถวันนั้น (จากกระดานจ่ายงาน) — ใช้ resolve รอบ+คนขับของแต่ละเที่ยว */
export interface RoundWindow {
  roundId: string
  driverId: string
  start: string // HH:MM
  end: string   // HH:MM (อาจข้ามเที่ยงคืน end < start)
}

export interface ReconstructContext {
  date: string        // yyyy-mm-dd
  vehicleId: string   // FlowClean vehicle id
  roundWindows: RoundWindow[]
}

export interface ReconstructResult {
  visits: GpsVisit[]
  legs: GpsLeg[]
}

/** "....HH:MM:SS" → นาทีจากเที่ยงคืน · null ถ้า parse ไม่ได้ */
function hhmmToMin(s: string): number | null {
  const m = (s || '').match(/(\d{2}):(\d{2})/)
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
}

/** นาทีระหว่างสอง datetime (เวลาไทย) · 0 ถ้าคำนวณไม่ได้/ติดลบ */
function diffMin(fromTime: string, toTime: string): number {
  const a = parseV2xTimeMs(fromTime), b = parseV2xTimeMs(toTime)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 60000))
}

/** จับพิกัด → ข้อมูลจุด (key/customerId/name) สำหรับ leg/visit */
function placeInfo(
  lat: number, lng: number,
  customers: Customer[], factory: LatLng | null, savedPlaces: SavedPlace[],
): { key: string; customerId: string; name: string } {
  const m = matchPlace(lat, lng, customers, factory, savedPlaces)
  if (!m) return { key: 'unknown', customerId: '', name: '' }
  if (m.type === 'customer') return { key: `c:${m.customer!.id}`, customerId: m.customer!.id, name: m.customer!.shortName || m.customer!.name }
  if (m.type === 'saved') return { key: `s:${m.savedPlace!.id}`, customerId: '', name: m.savedPlace!.name }
  return { key: 'factory', customerId: '', name: 'โรงงาน' }
}

/** resolve รอบ+คนขับของเที่ยว จากเวลา (HH:MM) เทียบหน้าต่างรอบ (รองรับข้ามเที่ยงคืน) */
export function resolveRoundDriver(timeStr: string, windows: RoundWindow[]): { roundId: string; driverId: string } {
  const m = hhmmToMin(timeStr)
  if (m != null) {
    for (const w of windows) {
      const s = hhmmToMin(w.start), e0 = hhmmToMin(w.end)
      if (s == null || e0 == null) continue
      const e = e0 < s ? e0 + 1440 : e0          // รอบข้ามเที่ยงคืน → ขยายปลาย +24 ชม.
      const mm = m < s ? m + 1440 : m            // เที่ยวหลังเที่ยงคืน → shift ให้เทียบในกรอบเดียว
      if (mm >= s && mm <= e) return { roundId: w.roundId, driverId: w.driverId }
    }
  }
  // ไม่เข้า window ไหน — มีรอบเดียว = ใช้รอบนั้น (รถวิ่งรอบเดียวทั้งวัน)
  if (windows.length === 1) return { roundId: windows[0].roundId, driverId: windows[0].driverId }
  return { roundId: '', driverId: '' }
}

/**
 * reconstruct visit/leg ของรถ 1 คันใน 1 วัน
 *   - ตัด shuffle trip (<0.5km = ขยับรถ) ออกจาก leg
 *   - leg = ทุกเที่ยว (จากพิกัดต้น→ปลาย) · visit = เที่ยวที่จบที่ลูกค้า + dwell = ช่วงถึงเที่ยวถัดไป
 */
export function reconstructVisitsLegs(
  trips: GpsTrip[],
  customers: Customer[],
  factory: LatLng | null,
  savedPlaces: SavedPlace[],
  ctx: ReconstructContext,
): ReconstructResult {
  const { date, vehicleId, roundWindows } = ctx
  const sorted = trips
    .filter(t => !isShuffleTrip(t))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const legs: GpsLeg[] = []
  const visits: GpsVisit[] = []
  let visitSeq = 0

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const from = placeInfo(t.startLat, t.startLng, customers, factory, savedPlaces)
    const to = placeInfo(t.endLat, t.endLng, customers, factory, savedPlaces)
    const legRd = resolveRoundDriver(t.startTime, roundWindows)

    legs.push({
      id: `lgt_${date}_${vehicleId}_${i}`,
      date, vehicleId, driverId: legRd.driverId, roundId: legRd.roundId,
      fromKey: from.key, fromCustomerId: from.customerId, fromName: from.name,
      toKey: to.key, toCustomerId: to.customerId, toName: to.name,
      departTime: t.startTime, arriveTime: t.endTime,
      travelMin: diffMin(t.startTime, t.endTime),
      km: t.distanceKm, fuelL: t.fuelLiters, score: t.score,
    })

    // visit = เที่ยวที่จบที่ลูกค้า (engine-off arrival)
    if (to.customerId) {
      const next = sorted[i + 1]
      const departTime = next ? next.startTime : ''
      const dwellMin = next ? diffMin(t.endTime, next.startTime) : 0
      const visRd = resolveRoundDriver(t.endTime, roundWindows)
      visits.push({
        id: `vmt_${date}_${vehicleId}_${visitSeq}`,
        date, vehicleId, driverId: visRd.driverId, roundId: visRd.roundId,
        customerId: to.customerId,
        arriveTime: t.endTime, departTime, dwellMin,
        confidence: 'high', sequence: visitSeq,
      })
      visitSeq++
    }
  }

  return { visits, legs }
}
