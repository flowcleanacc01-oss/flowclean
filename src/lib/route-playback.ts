// 443.1 — คณิตศาสตร์ playback เส้นทาง (pure · เทสได้แยกจาก Leaflet/DOM)
//   V2X track/{id} คืน lat/lng ครบ แต่ travelTime = null ทุกจุด → กระจายเวลาเฉลี่ยตาม index
//   ถ้าวันใดทุกจุดมี time จริง (เพิ่มขึ้น) → ใช้เวลาจริง = ความเร็ว playback เป๊ะตาม V2X อัตโนมัติ
import type { GpsTrackPoint } from './v2x-types'

/** สัดส่วนสะสม 0..1 ต่อจุด (fractions[0]=0, สุดท้าย=1) */
export function buildFractions(points: GpsTrackPoint[]): number[] {
  const n = points.length
  if (n === 0) return []
  if (n === 1) return [0]
  const times = points.map(p => (p.time ? Date.parse(p.time.replace(' ', 'T')) : NaN))
  const allTimed = times.every((t, i) => !Number.isNaN(t) && (i === 0 || t >= times[i - 1]))
  if (allTimed && times[n - 1] > times[0]) {
    const span = times[n - 1] - times[0]
    return times.map(t => (t - times[0]) / span)
  }
  return points.map((_, i) => i / (n - 1)) // เฉลี่ยตามลำดับจุด
}

/** ตำแหน่ง [lat,lng] ณ สัดส่วน f∈[0,1] (lerp ระหว่างจุด) + index จุดสุดท้ายที่ผ่านมาแล้ว */
export function posAt(
  points: GpsTrackPoint[],
  fractions: number[],
  f: number,
): { pos: [number, number]; idx: number } {
  if (points.length === 0) return { pos: [13.736, 100.56], idx: 0 }
  if (f <= 0) return { pos: [points[0].lat, points[0].lng], idx: 0 }
  const last = points.length - 1
  if (f >= 1) return { pos: [points[last].lat, points[last].lng], idx: last }
  let i = 1
  while (i < fractions.length && fractions[i] < f) i++
  const a = points[i - 1]
  const b = points[i] || a
  const seg = fractions[i] - fractions[i - 1] || 1
  const t = (f - fractions[i - 1]) / seg
  return { pos: [a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t], idx: i - 1 }
}
