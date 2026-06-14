// V2X — external GPS/telematics API contract + normalized domain types
//   Vehicle Operation Service Management Platform (web-monitor.v2x.co.th)
//   ระบบ GPS/OBD ของฟลีตบริษัทคราฟท์ แอนด์ มอร์ (ของติ๊ด — มีรถติด terminal 3 คัน)
//
// 2 ชั้น:
//   1) V2x*  = raw response ตรงตาม API (field name + type ตามจริง — verified จาก response จริง)
//   2) Gps*  = normalized domain ที่ UI ใช้ (number/boolean ล้วน + plateNorm สำหรับ match)
//   ⚠️ V2X report ส่งตัวเลขปน string/number มาก → UI ห้ามแตะ raw ตรงๆ ใช้ Gps* ที่ผ่าน mapper แล้ว
// Feat 423 C — GPS integration · เรียกผ่าน v2x-client.ts (server-only) → /api/gps

// ─────────────────────────── RAW (ตรง API) ───────────────────────────

/** envelope มาตรฐานของทุก endpoint: code 0 = สำเร็จ ("请求成功") */
export interface V2xEnvelope<T> {
  code: number
  message: string
  total?: number
  data: T
}

/** /car/list (POST {pageNum,pageSize}) */
export interface V2xCar {
  carId: string
  licensePlate: string // มี prefix อักษรนำหน้า เช่น "C 4ฒฆ-8053"
  barCode: string
  ecuVin: string // VIN จาก ECU — fallback matching
  sim: string
  brandName: string | null
  seriesName: string | null
  modelName: string | null
  fuelType: string
  areaName: string
  terminalId: string
  carTerminalStatus: number
}

/** /map/all/gps (GET) — ตำแหน่ง realtime · ตัวเลขเป็น number จริง (ยกเว้น voltage = string) */
export interface V2xPosition {
  carId: string
  licensePlate: string
  lat: number
  lng: number
  gpsTime: string // "2026-06-10 20:35:16"
  lastActiveTime: string
  speed: number // กม./ชม.
  rpm: number
  direction: number // 0–360
  voltage: string // "12.88"
  online: number // 0/1
  driving: number // 0/1
  carTerminalStatus: number
  terminalCode: number
}

/** /report/trip/list (POST {carId,startTime,endTime,pageNum,pageSize}) — 1 เที่ยว
 *  ⚠️ ตัวเลขปน string/number (verified): mileage/drivingtime/totalFreeTime/fuelConsumption = string,
 *     tripMaxSpeed/tripAvgSpeed/consumptionRate = number */
export interface V2xTrip {
  licensePlate: string
  ecuvin: string
  barcode: string
  tripStartAddress: string
  tripEndAddress: string
  begintime: string // "2026-06-09 23:09:59"
  endTime: string
  mileage: string // ระยะทาง กม. — "25.64"
  drivingtime: string // เวลาขับ นาที — "48.0"
  totalFreeTime: string // idle นาที — "2.03"
  tripMaxSpeed: number
  tripAvgSpeed: number
  fuelConsumption: string // ลิตร — "1.98"
  consumptionRate: number // กม./ลิตร — 12.95
  province: string
  areaName: string
}

/** /travelAnalysis/getTravelAnalysis (POST {licensePlate?, startTime, endTime, pageNum, pageSize}) — 1 เที่ยว
 *  ⚠️ 427: ตัวจริงที่ใช้แทน /report/trip/list — มี "พิกัดจุดเริ่ม/จบ" + driver behavior + tripId ครบ
 *  ⚠️ param ต้องชื่อ licensePlate/startTime/endTime เป๊ะ (ชื่ออื่นเช่น carId/beginTime = เงียบๆ ไม่ filter เลย!)
 *  data เป็น array ตรงๆ (ไม่มี .list) · ตัวเลขปน string/number → num() ทุก field */
export interface V2xTravelTrip {
  id: string // ใช้เปิด /travelAnalysis/track/{id} (waypoints)
  tripId: string
  carId: string
  licensePlate: string
  begintime: string // "2026-06-10 16:23:00.0"
  endtime: string
  tripStartAddress: string
  tripEndAddress: string
  slatitude: number | string // พิกัดจุดเริ่ม
  slongitude: number | string
  elatitude: number | string // พิกัดจุดจบ (= จุดจอด/ส่งผ้า)
  elongitude: number | string
  mileage: number | string // กม.
  drivingtime: number | string // นาทีที่ล้อหมุนจริง
  fuelConsumption: number | string // ลิตร
  tripMaxSpeed: number | string
  tripAvgSpeed: number | string
  score: number | string // คะแนนขับขี่ 0-100
  overSpeed: number | string // ครั้งที่เร็วเกิน
  rapidAcceleration: number | string // ออกตัวกระชาก (ครั้ง)
  rapidDeceleration: number | string // เบรกกระชาก (ครั้ง)
  quickspeedcount: number | string
  turncount: number | string // เลี้ยวกระชาก (ครั้ง)
  tripOilCost: number | string
}

/** /travelAnalysis/track/{id} (GET) — เส้นทางจริงของเที่ยว (waypoints) + จุดขับขี่เสี่ยง
 *  ⚠️ verified จาก response จริง (2026-06-13): polyline อยู่ที่ routeRectify.rectify[] (road-snapped, มีแค่ lat/lng)
 *     · rectify ระดับบนสุด = raw track (อาจ null — มี speed/time เมื่อมีข้อมูล) · dangerPoints = เหตุการณ์ขับขี่เสี่ยง */
export interface V2xTrackPoint {
  lat: number | string
  lng: number | string
  speed?: number | string | null
  direction?: number | string | null
  travelTime?: string | null
  mileage?: number | string | null
}
export interface V2xDangerPoint {
  type: number | string
  lat: number | string
  lng: number | string
  time: string
}
export interface V2xTrackResponse {
  rectify: V2xTrackPoint[] | null
  routeRectify: { rectify: V2xTrackPoint[] | null } | null
  dangerPoints: V2xDangerPoint[] | null
}

/** /travelAnalysis/getTripStatistics (POST {beginTime,endTime,pageNum,pageSize}) — สถิติรายวันต่อคัน
 *  ⚠️ data เป็น array ตรงๆ (ไม่มี .list) · ใช้คำนวณไมล์สะสม (428) */
export interface V2xTripStat {
  carId: string
  licensePlate: string
  day: string // "2026-06-10"
  mileageTotal: number // กม. รวมของวันนั้น
  oilTotal: number
  tripCount: number
}

// ──────────────────────── NORMALIZED (UI ใช้) ────────────────────────

/** รถที่ติด terminal — normalized */
export interface GpsCar {
  carId: string
  plate: string // ทะเบียนพร้อม prefix "C 4ฒฆ-8053"
  plateNorm: string // normalized สำหรับ match กับ vehicle.licensePlate
  vin: string
  sim: string
  model: string // brand + series + model รวม
  fuelType: string
}

/** ตำแหน่ง realtime — normalized */
export interface GpsPosition {
  carId: string
  plate: string
  plateNorm: string
  lat: number
  lng: number
  speed: number // กม./ชม.
  rpm: number
  direction: number // 0–360
  voltage: number
  online: boolean
  driving: boolean
  gpsTime: string
  lastActiveTime: string
}

/** เที่ยววิ่ง — normalized (ตัวเลขเป็น number ล้วน)
 *  427: เพิ่มพิกัดเริ่ม/จบ + driver behavior (จาก getTravelAnalysis)
 *  idleMin = นาทีติดเครื่องแต่ล้อไม่หมุน (duration - drivingMin) — จับ "จอดนิ่งไม่ดับเครื่อง" */
export interface GpsTrip {
  tripId: string // id สำหรับ track waypoints ('' = ไม่มี)
  plate: string
  plateNorm: string
  vin: string
  startAddress: string
  endAddress: string
  startTime: string // "2026-06-09 23:09:59"
  endTime: string
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  distanceKm: number
  drivingMin: number
  idleMin: number
  maxSpeed: number
  avgSpeed: number
  fuelLiters: number
  kmPerLiter: number
  score: number // คะแนนขับขี่ 0-100 (0 = ไม่มีข้อมูล)
  overSpeedCount: number
  rapidAccelCount: number
  rapidDecelCount: number
  sharpTurnCount: number
}

/** เส้นทางเที่ยว — normalized (432.2.1: วาด polyline บนแผนที่) */
export interface GpsTrackPoint {
  lat: number
  lng: number
  speed: number // 0 = ไม่มีข้อมูล (route-rectified จะไม่มี speed)
  time?: string | null // 443.1 — เวลาจริงของจุด (V2X track ปัจจุบันคืน null ทุกจุด · เผื่อ endpoint อนาคต)
}
export interface GpsDangerPoint {
  lat: number
  lng: number
  time: string
  type: number // ประเภทเหตุการณ์เสี่ยง (V2X — ความหมายยังไม่ยืนยัน)
}
export interface GpsTrack {
  points: GpsTrackPoint[]   // waypoints เรียงตามเวลา
  dangers: GpsDangerPoint[] // จุดขับขี่เสี่ยง
}

/** ระยะวิ่งรายวันต่อคัน — normalized (428: ไมล์ auto จาก GPS) */
export interface GpsDailyKm {
  carId: string
  plate: string
  plateNorm: string
  day: string // yyyy-mm-dd
  km: number
}

// ──────────────────────────── helpers ────────────────────────────

/**
 * normalize ทะเบียนสำหรับ match V2X ↔ FlowClean (pure — ใช้ได้ทั้ง client/server)
 *   V2X "C 4ฒฆ-8053" → "4ฒฆ-8053" · FlowClean "4ฒฆ-8053" → "4ฒฆ-8053"
 *   ตัดช่องว่าง + prefix อักษรอังกฤษนำหน้า (A/B/C/D) · ตัวอักษรไทยในทะเบียนคงไว้
 */
export function normalizePlate(plate: string): string {
  return (plate || '').replace(/\s+/g, '').replace(/^[A-Za-z]+/, '').toLowerCase()
}
