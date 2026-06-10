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

/** เที่ยววิ่ง — normalized (ตัวเลขเป็น number ล้วน) */
export interface GpsTrip {
  plate: string
  plateNorm: string
  vin: string
  startAddress: string
  endAddress: string
  startTime: string // "2026-06-09 23:09:59"
  endTime: string
  distanceKm: number
  drivingMin: number
  idleMin: number
  maxSpeed: number
  avgSpeed: number
  fuelLiters: number
  kmPerLiter: number
}
