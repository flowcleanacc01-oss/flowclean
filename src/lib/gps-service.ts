// GPS client service — เรียก /api/gps (proxy ไป V2X) · Feat 423 C
//   คืน normalized Gps* (number/boolean ล้วน) · auth x-fc-session เหมือน qt-scan-service
import type { GpsCar, GpsPosition, GpsTrip } from './v2x-types'
import { sessionUserId } from './ai-scan-client'

async function gpsFetch<T>(qs: string): Promise<T> {
  const res = await fetch(`/api/gps?${qs}`, { headers: { 'x-fc-session': sessionUserId() } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) throw new Error(body.error || 'เชื่อมต่อระบบ GPS ไม่สำเร็จ')
  return body.data as T
}

/** รายชื่อรถที่ติด terminal (มี GPS/OBD) */
export function fetchGpsCars(): Promise<GpsCar[]> {
  return gpsFetch<GpsCar[]>('action=cars')
}

/** ตำแหน่ง realtime ของรถทุกคัน */
export function fetchGpsRealtime(): Promise<GpsPosition[]> {
  return gpsFetch<GpsPosition[]>('action=realtime')
}

/** เที่ยววิ่งของรถ 1 คัน — วันเดียว (date) หรือช่วง (date..to) สำหรับ historical */
export function fetchGpsTrips(carId: string, date: string, to?: string): Promise<GpsTrip[]> {
  const range = to ? `&to=${to}` : ''
  return gpsFetch<GpsTrip[]>(`action=trips&carId=${encodeURIComponent(carId)}&date=${date}${range}`)
}
