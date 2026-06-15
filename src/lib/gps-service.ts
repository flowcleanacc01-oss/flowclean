// GPS client service — เรียก /api/gps (proxy ไป V2X) · Feat 423 C
//   คืน normalized Gps* (number/boolean ล้วน) · auth x-fc-session เหมือน qt-scan-service
import type { GpsCar, GpsPosition, GpsTrip, GpsDailyKm, GpsTrack } from './v2x-types'
import { sessionUserId } from './ai-scan-client'

async function gpsFetch<T>(qs: string, timeoutMs?: number): Promise<T> {
  // 450 — timeout ต่อ request (เฉพาะ track ที่ยิงหลายเที่ยว) → ถ้า V2X ค้าง = abort เร็ว ให้ retry ทำงาน
  const ctrl = timeoutMs ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    const res = await fetch(`/api/gps?${qs}`, { headers: { 'x-fc-session': sessionUserId() }, signal: ctrl?.signal })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) throw new Error(body.error || 'เชื่อมต่อระบบ GPS ไม่สำเร็จ')
    return body.data as T
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** รายชื่อรถที่ติด terminal (มี GPS/OBD) */
export function fetchGpsCars(): Promise<GpsCar[]> {
  return gpsFetch<GpsCar[]>('action=cars')
}

/** ตำแหน่ง realtime ของรถทุกคัน */
export function fetchGpsRealtime(): Promise<GpsPosition[]> {
  return gpsFetch<GpsPosition[]>('action=realtime')
}

/** เที่ยววิ่งของรถ 1 คัน — วันเดียว (date) หรือช่วง (date..to) สำหรับ historical
 *  427 — ระบุรถด้วยทะเบียนเต็มแบบ V2X (car.plate เช่น "C 4ฒฆ-8053") */
export function fetchGpsTrips(plate: string, date: string, to?: string): Promise<GpsTrip[]> {
  const range = to ? `&to=${to}` : ''
  return gpsFetch<GpsTrip[]>(`action=trips&plate=${encodeURIComponent(plate)}&date=${date}${range}`)
}

/** 428 — ระยะวิ่งรายวันของทุกคันในช่วง [from..to] (ใช้คำนวณไมล์ประมาณจาก GPS) */
export function fetchGpsDailyMileage(from: string, to: string): Promise<GpsDailyKm[]> {
  return gpsFetch<GpsDailyKm[]>(`action=mileage&from=${from}&to=${to}`)
}

/** 432.2.1 — เส้นทางจริงของเที่ยว (waypoints) สำหรับวาดบนแผนที่ · tripId = GpsTrip.tripId (uuid id)
 *  450 — timeout 20s ต่อเที่ยว (ใช้คู่ batch retry ด้านล่าง) */
export function fetchGpsTrack(tripId: string): Promise<GpsTrack> {
  return gpsFetch<GpsTrack>(`action=track&tripId=${encodeURIComponent(tripId)}`, 20_000)
}

/** 450 — ดึง track หลายเที่ยวแบบ "จำกัด concurrency + retry" (แก้บั๊กโหลดเที่ยวไม่ครบ/ไม่นิ่ง)
 *  เดิม: RouteMapModal ยิง fetchGpsTrack ทุกเที่ยวพร้อมกัน (Promise.allSettled) → V2X/Vercel timeout
 *        บางเที่ยว reject เงียบๆ → แต่ละครั้งได้เที่ยวไม่เท่ากัน (9/12/14)
 *  แก้: ยิงทีละ ≤4 เที่ยว + retry 2 ครั้ง (backoff) + timeout ต่อเที่ยว
 *  คืน array เรียงตรงตาม tripIds · null = ดึงไม่สำเร็จหลัง retry (UI แสดง "ไม่มีเส้นทาง" ไม่ทิ้งเที่ยว) */
export async function fetchGpsTracksBatch(
  tripIds: string[],
  opts: { concurrency?: number; retries?: number } = {},
): Promise<(GpsTrack | null)[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  const retries = opts.retries ?? 2
  const out: (GpsTrack | null)[] = new Array(tripIds.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < tripIds.length) {
      const i = next++
      out[i] = await fetchTrackWithRetry(tripIds[i], retries)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tripIds.length || 1) }, worker))
  return out
}

async function fetchTrackWithRetry(tripId: string, retries: number): Promise<GpsTrack | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchGpsTrack(tripId)
    } catch (err) {
      if (attempt >= retries) {
        console.warn(`[gps track] เที่ยว ${tripId} ดึงไม่สำเร็จหลัง retry ${retries} ครั้ง`, err)
        return null
      }
      await new Promise(res => setTimeout(res, 400 * (attempt + 1)))
    }
  }
  return null
}
