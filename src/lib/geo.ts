// 427 — พิกัด GPS: parse ลิงก์ Google Maps · ระยะ haversine · จับคู่จุดกับลูกค้า/โรงงาน · ช่วงดับเครื่องจอด
//   pure ทั้งไฟล์ (testable · ใช้ได้ทั้ง client/server)
import type { Customer, SavedPlace } from '@/types'
import type { GpsTrip } from './v2x-types'

/** รัศมีจับคู่ลูกค้า (เมตร) — จุดจบเที่ยวห่างพิกัดลูกค้าไม่เกินนี้ = จุดส่งลูกค้ารายนั้น */
export const PLACE_MATCH_RADIUS_M = 150
/** โรงงานพื้นที่ใหญ่กว่า (ลานจอด/หลายประตู) → รัศมีกว้างขึ้น */
export const FACTORY_MATCH_RADIUS_M = 250
/** จุดที่บันทึก (ร้านอาหาร/ปั๊ม ฯลฯ) — จุดเดี่ยว แคบกว่าลูกค้าเล็กน้อย กันชนกับลูกค้าข้างเคียง (432.1) */
export const SAVED_PLACE_MATCH_RADIUS_M = 120

export interface LatLng {
  lat: number
  lng: number
}

function validLatLng(lat: number, lng: number): LatLng | null {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
    ? { lat, lng } : null
}

/**
 * parse พิกัดจากข้อความ/ลิงก์ Google Maps — รองรับ:
 *   1) ลิงก์ place เต็ม `!3d13.75!4d100.47` (พิกัดหมุดจริง — แม่นสุด เช็คก่อน)
 *   2) `?q=13.75,100.47` / `ll=` / `query=` / `destination=`
 *   3) `@13.75,100.47,17z` (จุดกึ่งกลางแผนที่)
 *   4) พิกัดดิบ "13.7563, 100.5018"
 *   ⚠️ ลิงก์สั้น maps.app.goo.gl ไม่มีพิกัดในตัว — ให้เปิดในเบราว์เซอร์ก่อนแล้ว copy URL เต็ม
 */
export function parseLatLng(text: string): LatLng | null {
  const t = (text || '').trim()
  if (!t) return null
  let m = t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
  if (m) return validLatLng(Number(m[1]), Number(m[2]))
  m = t.match(/[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (m) return validLatLng(Number(m[1]), Number(m[2]))
  m = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  if (m) return validLatLng(Number(m[1]), Number(m[2]))
  m = t.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/)
  if (m) return validLatLng(Number(m[1]), Number(m[2]))
  return null
}

/** ระยะระหว่าง 2 พิกัด (เมตร) */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export interface PlaceMatch {
  type: 'customer' | 'factory' | 'saved'
  customer?: Customer
  savedPlace?: SavedPlace // 432.1 — จุดที่บันทึก (ร้านอาหาร/ปั๊ม ฯลฯ)
  distanceM: number
}

/** จับคู่พิกัดกับสถานที่ที่รู้จัก — ลำดับความสำคัญ: ลูกค้า → จุดที่บันทึก → โรงงาน
 *  ลูกค้า/จุดบันทึกที่ใกล้สุดในรัศมีชนะ · ลูกค้ามาก่อนเสมอ (จุดส่งของจริงสำคัญกว่าจุดแวะ) */
export function matchPlace(
  lat: number,
  lng: number,
  customers: Customer[],
  factory: LatLng | null,
  savedPlaces: SavedPlace[] = [],
): PlaceMatch | null {
  if (!lat && !lng) return null
  let best: PlaceMatch | null = null
  for (const c of customers) {
    if (!c.gpsLat && !c.gpsLng) continue
    const d = haversineM(lat, lng, c.gpsLat || 0, c.gpsLng || 0)
    if (d <= PLACE_MATCH_RADIUS_M && (!best || d < best.distanceM)) {
      best = { type: 'customer', customer: c, distanceM: d }
    }
  }
  if (best) return best // ลูกค้าชนะก่อน — ไม่ทับด้วยจุดแวะ/โรงงาน
  // ไม่เจอลูกค้า → จุดที่บันทึก (ใกล้สุดในรัศมีชนะ)
  for (const p of savedPlaces) {
    if (!p.lat && !p.lng) continue
    const d = haversineM(lat, lng, p.lat, p.lng)
    if (d <= SAVED_PLACE_MATCH_RADIUS_M && (!best || d < best.distanceM)) {
      best = { type: 'saved', savedPlace: p, distanceM: d }
    }
  }
  if (best) return best
  if (factory && (factory.lat || factory.lng)) {
    const d = haversineM(lat, lng, factory.lat, factory.lng)
    if (d <= FACTORY_MATCH_RADIUS_M) best = { type: 'factory', distanceM: d }
  }
  return best
}

/** 435 — จุดที่รู้จักที่เส้นทางผ่านเข้าใกล้ (ตามลำดับ path)
 *  ใช้ break down เที่ยวยาวที่ "ไม่ดับเครื่อง" — V2X รวมเป็นเที่ยวเดียว เห็นแค่ปลายทางสุดท้าย
 *  → ไล่ waypoints ดูว่าผ่านลูกค้า/จุดบันทึก/โรงงานรายไหนบ้าง
 *  ⚠️ waypoints ไม่มี timestamp → บอกได้แค่ "ผ่านจุดไหนบ้าง + ลำดับ" ไม่ใช่ "จอดนานเท่าไหร่" */
export interface PassedPlace {
  type: 'customer' | 'factory' | 'saved'
  name: string
  key: string
}

export function passedPlaces(
  points: LatLng[],
  customers: Customer[],
  factory: LatLng | null,
  savedPlaces: SavedPlace[] = [],
): PassedPlace[] {
  const seq: PassedPlace[] = []
  let lastKey = '' // ออกนอกจุด (no match) → reset → วนกลับเข้าจุดเดิม = ขึ้นซ้ำ (เห็นการวนรอบ)
  for (const pt of points) {
    const m = matchPlace(pt.lat, pt.lng, customers, factory, savedPlaces)
    if (!m) { lastKey = ''; continue }
    const key = m.type === 'customer' ? `c:${m.customer!.id}`
      : m.type === 'saved' ? `s:${m.savedPlace!.id}` : 'factory'
    if (key === lastKey) continue // ยังอยู่จุดเดิม → ไม่ซ้ำ
    const name = m.type === 'customer' ? (m.customer!.shortName || m.customer!.name)
      : m.type === 'saved' ? m.savedPlace!.name : 'โรงงาน'
    seq.push({ type: m.type, name, key })
    lastKey = key
  }
  return seq
}

/** "2026-06-10 16:23:00" → ms (local) · NaN ถ้า parse ไม่ได้ */
function timeMs(s: string): number {
  return new Date((s || '').replace(' ', 'T')).getTime()
}

/** ช่วง "ดับเครื่องจอด" ระหว่างเที่ยว — gap ระหว่างจบเที่ยวก่อนหน้า → เริ่มเที่ยวถัดไป
 *  จุดจอด = จุดจบของเที่ยวก่อนหน้า (ติ๊ด: รู้ว่าคนขับแวะ/ดับเครื่องที่ไหน นานเท่าไหร่) */
export interface EngineOffGap {
  afterIndex: number // index ของเที่ยว (ใน list ที่เรียงเวลาแล้ว) ที่ gap นี้ตามหลัง
  minutes: number
  lat: number
  lng: number
  address: string
  fromTime: string // เวลาดับเครื่อง (endTime เที่ยวก่อน)
  toTime: string // เวลาติดเครื่องอีกครั้ง
}

export function engineOffGaps(sortedTrips: GpsTrip[], minGapMin = 5): EngineOffGap[] {
  const out: EngineOffGap[] = []
  for (let i = 0; i < sortedTrips.length - 1; i++) {
    const a = sortedTrips[i]
    const b = sortedTrips[i + 1]
    const end = timeMs(a.endTime)
    const start = timeMs(b.startTime)
    if (!Number.isFinite(end) || !Number.isFinite(start)) continue
    const minutes = Math.round((start - end) / 60000)
    if (minutes >= minGapMin) {
      out.push({
        afterIndex: i,
        minutes,
        lat: a.endLat || 0,
        lng: a.endLng || 0,
        address: a.endAddress,
        fromTime: a.endTime,
        toTime: b.startTime,
      })
    }
  }
  return out
}

/** เที่ยวระยะสั้นมาก = ขยับรถ (โหลดของ/เปลี่ยนช่องจอด) — ติ๊ดให้เก็บไว้ ไม่กรองทิ้ง */
export const SHUFFLE_TRIP_KM = 0.5
export function isShuffleTrip(t: GpsTrip): boolean {
  return t.distanceKm < SHUFFLE_TRIP_KM
}
