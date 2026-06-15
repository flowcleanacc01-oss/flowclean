// 452 — ค้นหา "จุดที่ยังไม่รู้จัก" จาก GPS
//   รวม trip-end (จุดจอด engine-off) ของรถทุกคัน/ทุกวันที่ยังไม่ match ลูกค้า/สถานที่
//   → cluster จุดใกล้กัน (รัศมีเท่าลูกค้า) → จัดอันดับตามจำนวนครั้ง → ระบุทีเดียว ใช้ได้ทุกคัน/ทุกวัน
//   pure (testable) · reuse matchPlace/haversine/isShuffleTrip (geo) + parseV2xTimeMs (TZ ไทย 446)
import type { Customer, SavedPlace } from '@/types'
import type { GpsTrip } from './v2x-types'
import { parseV2xTimeMs } from './v2x-types'
import { matchPlace, haversineM, isShuffleTrip, PLACE_MATCH_RADIUS_M, type LatLng } from './geo'

/** จุดจอดดิบ 1 ครั้ง (ปลายเที่ยว) */
export interface RawStop {
  lat: number
  lng: number
  address: string          // geocode จาก V2X (ใช้ค้นหา)
  date: string             // yyyy-mm-dd
  vehicleCode: string | null
  time: string             // เวลาจอด (= endTime ของเที่ยว)
  dwellMin: number         // จอดนานกี่นาที (0 = ข้ามวัน/ไม่ทราบ)
}

/** กลุ่มจุดจอดที่ยังไม่รู้จัก (จุดเดียวกัน หลายครั้ง) */
export interface UnknownCluster {
  lat: number
  lng: number
  address: string
  count: number            // จอดที่นี่กี่ครั้งรวม
  dwellMedian: number      // จอดนานเฉลี่ย (median, นาที)
  firstDate: string
  lastDate: string
  vehicleCodes: string[]   // รถที่เคยจอด (distinct)
  occurrences: RawStop[]
}

function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/** เที่ยว → จุดจอด (ปลายแต่ละเที่ยว) · ตัด shuffle (<0.5km) · dwell = ช่วงถึงเที่ยวถัดไปวันเดียวกัน */
export function tripsToStops(trips: GpsTrip[], vehicleCode: string | null): RawStop[] {
  const sorted = trips.filter(t => !isShuffleTrip(t)).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const out: RawStop[] = []
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    if (!validCoord(t.endLat, t.endLng)) continue
    const date = (t.endTime || '').slice(0, 10)
    const next = sorted[i + 1]
    let dwellMin = 0
    if (next && (next.startTime || '').slice(0, 10) === date) {
      const ms = parseV2xTimeMs(next.startTime) - parseV2xTimeMs(t.endTime)
      if (Number.isFinite(ms) && ms > 0) dwellMin = Math.round(ms / 60000)
    }
    out.push({ lat: t.endLat, lng: t.endLng, address: t.endAddress || '', date, vehicleCode, time: t.endTime, dwellMin })
  }
  return out
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** address ที่พบบ่อยสุดในกลุ่ม (geocode V2X ค่อนข้างนิ่ง — เอาตัวที่ซ้ำมากสุด) */
function commonAddress(occ: RawStop[]): string {
  const count = new Map<string, number>()
  for (const o of occ) {
    const a = o.address.trim()
    if (a) count.set(a, (count.get(a) || 0) + 1)
  }
  let best = '', bestN = 0
  for (const [a, n] of count) if (n > bestN) { best = a; bestN = n }
  return best
}

/** กรองเฉพาะจุดที่ยังไม่ match (ลูกค้า/สถานที่/โรงงาน) แล้ว cluster จุดใกล้กัน → จัดอันดับตามจำนวนครั้ง */
export function clusterUnknownStops(
  stops: RawStop[],
  customers: Customer[],
  factory: LatLng | null,
  savedPlaces: SavedPlace[],
  radiusM = PLACE_MATCH_RADIUS_M,
): UnknownCluster[] {
  const clusters: { lat: number; lng: number; occ: RawStop[] }[] = []
  for (const s of stops) {
    if (!validCoord(s.lat, s.lng)) continue
    if (matchPlace(s.lat, s.lng, customers, factory, savedPlaces)) continue // รู้จักแล้ว — ข้าม
    const c = clusters.find(cl => haversineM(s.lat, s.lng, cl.lat, cl.lng) <= radiusM)
    if (c) c.occ.push(s)
    else clusters.push({ lat: s.lat, lng: s.lng, occ: [s] })
  }
  return clusters
    .map(c => {
      const dates = c.occ.map(o => o.date).filter(Boolean).sort()
      const codes = [...new Set(c.occ.map(o => o.vehicleCode).filter((v): v is string => !!v))].sort()
      return {
        lat: c.lat, lng: c.lng,
        address: commonAddress(c.occ),
        count: c.occ.length,
        dwellMedian: median(c.occ.map(o => o.dwellMin).filter(d => d > 0)),
        firstDate: dates[0] || '',
        lastDate: dates[dates.length - 1] || '',
        vehicleCodes: codes,
        occurrences: c.occ,
      }
    })
    .sort((a, b) => b.count - a.count || b.dwellMedian - a.dwellMedian)
}
