// V2X GPS API client — ⚠️ SERVER ONLY (เรียกจาก src/app/api/gps/route.ts เท่านั้น)
//   credentials อยู่ใน env (V2X_BASE_URL / V2X_USERNAME / V2X_PASSWORD) ห้ามให้หลุดถึง client
//   auth flow: POST /api/login/login → JWT (อายุ ~14 วัน) → แนบ header `Authorization: <token>` (raw ไม่มี Bearer)
//   token cache ระดับ module + re-login อัตโนมัติเมื่อใกล้หมดอายุ (อ่าน exp จาก JWT payload)
// Feat 423 C — GPS integration

import type {
  V2xEnvelope, V2xCar, V2xPosition, V2xTravelTrip, V2xTripStat, V2xTrackResponse,
  GpsCar, GpsPosition, GpsTrip, GpsDailyKm, GpsTrack, GpsTrackPoint, GpsDangerPoint,
} from './v2x-types'
import { normalizePlate } from './v2x-types'

/** ยังไม่ได้ตั้ง env (→ 503) */
export class V2xConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'V2xConfigError'
  }
}

/** V2X ตอบ code != 0 หรือ HTTP error (→ 502) */
export class V2xApiError extends Error {
  code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.name = 'V2xApiError'
    this.code = code
  }
}

function getConfig() {
  const baseUrl = process.env.V2X_BASE_URL
  const username = process.env.V2X_USERNAME
  const password = process.env.V2X_PASSWORD
  if (!baseUrl || !username || !password) {
    throw new V2xConfigError('ยังไม่ได้ตั้งค่า V2X_BASE_URL / V2X_USERNAME / V2X_PASSWORD บนเซิร์ฟเวอร์')
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), username, password }
}

// ── token cache (module-level — อยู่ได้ตลอดอายุ serverless instance) ──
let cachedToken: { value: string; expMs: number } | null = null

/** อ่าน exp (วินาที) จาก JWT payload → ms · fallback 12 ชม. ถ้า decode ไม่ได้ */
function decodeJwtExpMs(token: string): number {
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8')) as { exp?: number }
    if (typeof json.exp === 'number') return json.exp * 1000
  } catch {
    /* ignore — ใช้ fallback */
  }
  return Date.now() + 12 * 3600 * 1000
}

interface FetchOpts {
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: boolean // default true
}

async function v2xFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { baseUrl } = getConfig()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== false) headers['Authorization'] = await getToken()

  const res = await fetch(`${baseUrl}/api${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    // V2X cert = Let's Encrypt ของจริง → ไม่ต้อง disable TLS
    cache: 'no-store',
  })
  if (!res.ok) throw new V2xApiError(`V2X HTTP ${res.status} (${path})`)

  const json = (await res.json()) as V2xEnvelope<T>
  if (json.code !== 0) throw new V2xApiError(json.message || `V2X code ${json.code} (${path})`, json.code)
  return json.data
}

async function login(): Promise<string> {
  const { username, password } = getConfig()
  const data = await v2xFetch<{ accessToken: string }>('/login/login', {
    method: 'POST',
    body: { loginname: username, loginpwd: password },
    auth: false,
  })
  if (!data?.accessToken) throw new V2xApiError('V2X login ไม่คืน accessToken')
  return data.accessToken
}

async function getToken(): Promise<string> {
  const SKEW_MS = 60_000 // re-login ล่วงหน้า 1 นาทีกัน edge
  if (cachedToken && cachedToken.expMs - SKEW_MS > Date.now()) return cachedToken.value
  const token = await login()
  cachedToken = { value: token, expMs: decodeJwtExpMs(token) }
  return token
}

// ── normalize helpers ──

/** แปลงค่าที่ V2X ส่งมา (string/number/null ปน) → number ปลอดภัย */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function toGpsCar(c: V2xCar): GpsCar {
  return {
    carId: c.carId,
    plate: c.licensePlate,
    plateNorm: normalizePlate(c.licensePlate),
    vin: c.ecuVin || '',
    sim: c.sim || '',
    model: [c.brandName, c.seriesName, c.modelName].filter(Boolean).join(' '),
    fuelType: c.fuelType || '',
  }
}

function toGpsPosition(p: V2xPosition): GpsPosition {
  return {
    carId: p.carId,
    plate: p.licensePlate,
    plateNorm: normalizePlate(p.licensePlate),
    lat: num(p.lat),
    lng: num(p.lng),
    speed: num(p.speed),
    rpm: num(p.rpm),
    direction: num(p.direction),
    voltage: num(p.voltage),
    online: p.online === 1,
    driving: p.driving === 1,
    gpsTime: p.gpsTime || '',
    lastActiveTime: p.lastActiveTime || '',
  }
}

/** "2026-06-10 16:23:00.0" → "2026-06-10 16:23:00" (ตัด .0 ท้าย — ให้ format ตรงกับของเดิม) */
function cleanTime(s: string | undefined): string {
  return (s || '').replace(/\.\d+$/, '')
}

// 427 — getTravelAnalysis ให้ครบกว่า /report/trip/list (พิกัด + behavior + tripId)
function toGpsTrip(t: V2xTravelTrip): GpsTrip {
  const startTime = cleanTime(t.begintime)
  const endTime = cleanTime(t.endtime)
  const distanceKm = num(t.mileage)
  const drivingMin = num(t.drivingtime)
  // ติดเครื่องนิ่ง = เวลาเที่ยวทั้งหมด - เวลาล้อหมุนจริง (จับ "จอดไม่ดับเครื่อง" — เคสติ๊ด)
  const durMs = new Date(endTime.replace(' ', 'T')).getTime() - new Date(startTime.replace(' ', 'T')).getTime()
  const idleMin = Number.isFinite(durMs) && durMs > 0 ? Math.max(0, Math.round(durMs / 60000 - drivingMin)) : 0
  const fuelLiters = num(t.fuelConsumption)
  return {
    tripId: t.id || '',
    plate: t.licensePlate,
    plateNorm: normalizePlate(t.licensePlate),
    vin: '',
    startAddress: t.tripStartAddress || '',
    endAddress: t.tripEndAddress || '',
    startTime,
    endTime,
    startLat: num(t.slatitude),
    startLng: num(t.slongitude),
    endLat: num(t.elatitude),
    endLng: num(t.elongitude),
    distanceKm,
    drivingMin,
    idleMin,
    maxSpeed: num(t.tripMaxSpeed),
    avgSpeed: num(t.tripAvgSpeed),
    fuelLiters,
    kmPerLiter: fuelLiters > 0 ? distanceKm / fuelLiters : 0,
    score: num(t.score),
    overSpeedCount: num(t.overSpeed),
    rapidAccelCount: num(t.rapidAcceleration),
    rapidDecelCount: num(t.rapidDeceleration),
    sharpTurnCount: num(t.turncount),
  }
}

// ── public API (คืน normalized Gps*) ──

/** รายชื่อรถที่ติด terminal (มี GPS/OBD) */
export async function getCars(): Promise<GpsCar[]> {
  const raw = await v2xFetch<V2xCar[]>('/car/list', { method: 'POST', body: { pageNum: 1, pageSize: 200 } })
  return (raw || []).map(toGpsCar)
}

/** ตำแหน่ง realtime ของรถทุกคัน */
export async function getRealtimePositions(): Promise<GpsPosition[]> {
  const raw = await v2xFetch<V2xPosition[]>('/map/all/gps', { method: 'GET' })
  return (raw || []).map(toGpsPosition)
}

/** เที่ยววิ่งของรถ 1 คันในช่วงเวลา (format "yyyy-mm-dd HH:MM:SS")
 *  427 — เปลี่ยนจาก /report/trip/list → getTravelAnalysis: มีพิกัด + driver behavior + เร็วกว่ามาก
 *  ⚠️ filter ด้วย "ทะเบียนเต็มแบบ V2X" (มี prefix เช่น "C 4ฒฆ-8053") — ส่งชื่อ param ผิด = ไม่ filter เงียบๆ */
export async function getTrips(plate: string, startTime: string, endTime: string): Promise<GpsTrip[]> {
  const out: GpsTrip[] = []
  for (let pageNum = 1; pageNum <= 10; pageNum++) {
    const raw = await v2xFetch<V2xTravelTrip[]>('/travelAnalysis/getTravelAnalysis', {
      method: 'POST',
      body: { licensePlate: plate, startTime, endTime, pageNum, pageSize: 200 },
    })
    const rows = raw || []
    out.push(...rows.map(toGpsTrip))
    if (rows.length < 200) break
  }
  return out
}

/** 432.2.1 — เส้นทางจริงของเที่ยว (waypoints) จาก track/{id}
 *  verified shape: polyline = routeRectify.rectify[] (road-snapped lat/lng) · fallback raw rectify (มี speed)
 *  ⚠️ id = V2xTravelTrip.id (uuid) ไม่ใช่ tripId (เลขลำดับ) */
export async function getTripTrack(id: string): Promise<GpsTrack> {
  const raw = await v2xFetch<V2xTrackResponse>(`/travelAnalysis/track/${encodeURIComponent(id)}`, { method: 'GET' })
  // prefer raw rectify (มี speed/time) → ไม่มีก็ใช้ routeRectify.rectify (road-snapped, lat/lng เท่านั้น)
  const src = (Array.isArray(raw?.rectify) && raw.rectify.length > 0)
    ? raw.rectify
    : (raw?.routeRectify?.rectify || [])
  const points: GpsTrackPoint[] = src
    .map(p => ({ lat: num(p.lat), lng: num(p.lng), speed: num(p.speed) }))
    .filter(p => p.lat !== 0 || p.lng !== 0)
  const dangers: GpsDangerPoint[] = (raw?.dangerPoints || [])
    .map(d => ({ lat: num(d.lat), lng: num(d.lng), time: cleanTime(d.time), type: num(d.type) }))
    .filter(d => d.lat !== 0 || d.lng !== 0)
  return { points, dangers }
}

/** 428 — ระยะวิ่งรายวันของทุกคันในช่วง [from..to] (yyyy-mm-dd)
 *  ใช้ getTripStatistics (aggregate ฝั่ง V2X — เร็วกว่า trip list ที่ geocode ทุกเที่ยว)
 *  ⚠️ data เป็น array ตรงๆ + page ละ ~100 → paginate จนหมด
 *  ⚠️ 434: getTripStatistics aggregate "วันที่จบแล้ว" เท่านั้น — วันปัจจุบันยังไม่มี →
 *     ถ้า `to` ไม่โผล่ใน stats (= วันยังไม่จบ) เติมจาก trips สด (getTravelAnalysis) ให้ครบถึงวันนี้ */
export async function getDailyMileage(from: string, to: string): Promise<GpsDailyKm[]> {
  const out: GpsDailyKm[] = []
  for (let pageNum = 1; pageNum <= 12; pageNum++) {
    const raw = await v2xFetch<V2xTripStat[]>('/travelAnalysis/getTripStatistics', {
      method: 'POST',
      body: { beginTime: `${from} 00:00:00`, endTime: `${to} 23:59:59`, pageNum, pageSize: 100 },
    })
    const rows = raw || []
    out.push(...rows.map(r => ({
      carId: r.carId,
      plate: r.licensePlate,
      plateNorm: normalizePlate(r.licensePlate),
      day: r.day,
      km: num(r.mileageTotal),
    })))
    if (rows.length < 100) break
  }
  // 434 — วัน `to` ไม่มีใน aggregate (วันยังไม่จบ) → เติมระยะของวันนั้นจาก trips สด
  if (!out.some(r => r.day === to)) {
    try {
      out.push(...await getDayMileageFromTrips(to))
    } catch {
      /* live วันนี้ดึงไม่ได้ → ใช้เฉพาะวันที่จบแล้ว (ไม่ล้มทั้งก้อน) */
    }
  }
  return out
}

/** 434 — ระยะวิ่งของ "วันที่ยังไม่จบ" (1 วัน) รวมต่อคัน จาก trips สด
 *  ไม่ใส่ licensePlate = คืนทุกคัน (verified) · carId='' (estimate match ด้วย plateNorm ไม่ใช้ carId) */
async function getDayMileageFromTrips(day: string): Promise<GpsDailyKm[]> {
  const byPlate = new Map<string, number>()
  for (let pageNum = 1; pageNum <= 10; pageNum++) {
    const raw = await v2xFetch<V2xTravelTrip[]>('/travelAnalysis/getTravelAnalysis', {
      method: 'POST',
      body: { startTime: `${day} 00:00:00`, endTime: `${day} 23:59:59`, pageNum, pageSize: 200 },
    })
    const rows = raw || []
    for (const t of rows) {
      const plate = t.licensePlate || ''
      if (plate) byPlate.set(plate, (byPlate.get(plate) || 0) + num(t.mileage))
    }
    if (rows.length < 200) break
  }
  return [...byPlate.entries()].map(([plate, km]) => ({
    carId: '', plate, plateNorm: normalizePlate(plate), day, km,
  }))
}
