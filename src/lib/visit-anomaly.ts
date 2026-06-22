// 449 — Milk-Run Analytics · Phase 3: anomaly + เทียบคนขับ + หา route ดีสุด (pure · เทสได้)
//   - detectAnomalies: visit/leg ที่ผิดปกติเทียบ baseline ของกลุ่มตัวเอง (IQR fence)
//   - driverScores: KPI ต่อคนขับ (dwell/เวลาเดินทาง/คะแนนขับขี่/น้ำมัน) เทียบกัน
//   - routeOpportunities: leg ที่ "เคยทำได้เร็วกว่า" → โอกาสประหยัดเวลา (ลดความแปรปรวน)
import type { GpsVisit, GpsLeg } from '@/types'
import { quantile } from './visit-stats'
import { parseV2xTimeMs } from './v2x-types'

const MIN_SAMPLE = 5   // กลุ่มต้องมีอย่างน้อยเท่านี้ ถึงตัดสินว่าผิดปกติ
const IQR_K = 1.5      // ขอบ outlier = q3 + 1.5·IQR

function push<T>(map: Map<string, T[]>, key: string, val: T) {
  const a = map.get(key)
  if (a) a.push(val); else map.set(key, [val])
}

export interface Anomaly {
  kind: 'dwell' | 'travel'
  date: string
  driverId: string
  customerId: string      // dwell
  fromCustomerId: string  // travel
  toCustomerId: string
  value: number           // นาที (จริง)
  median: number          // นาที (ปกติของกลุ่ม)
}

/** หา visit/leg ที่นาน/ช้าผิดปกติเทียบ baseline ของกลุ่ม (ลูกค้าเดียวกัน / คู่เดียวกัน) */
export function detectAnomalies(visits: GpsVisit[], legs: GpsLeg[]): Anomaly[] {
  const out: Anomaly[] = []

  // dwell ต่อลูกค้า
  const dwellBy = new Map<string, GpsVisit[]>()
  for (const v of visits) if (v.customerId && v.departTime && v.dwellMin > 0) push(dwellBy, v.customerId, v)
  for (const [cid, vs] of dwellBy) {
    if (vs.length < MIN_SAMPLE) continue
    const sorted = vs.map(v => v.dwellMin).sort((a, b) => a - b)
    const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), med = quantile(sorted, 0.5)
    const hi = q3 + IQR_K * (q3 - q1)
    for (const v of vs) {
      if (v.dwellMin > hi) out.push({ kind: 'dwell', date: v.date, driverId: v.driverId, customerId: cid, fromCustomerId: '', toCustomerId: '', value: v.dwellMin, median: med })
    }
  }

  // travel ต่อ leg (ลูกค้า→ลูกค้า)
  const travelBy = new Map<string, GpsLeg[]>()
  for (const l of legs) if (l.fromCustomerId && l.toCustomerId) push(travelBy, `${l.fromCustomerId}>${l.toCustomerId}`, l)
  for (const [key, ls] of travelBy) {
    if (ls.length < MIN_SAMPLE) continue
    const sorted = ls.map(l => l.travelMin).sort((a, b) => a - b)
    const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), med = quantile(sorted, 0.5)
    const hi = q3 + IQR_K * (q3 - q1)
    const [fromCustomerId, toCustomerId] = key.split('>')
    for (const l of ls) {
      if (l.travelMin > hi) out.push({ kind: 'travel', date: l.date, driverId: l.driverId, customerId: '', fromCustomerId, toCustomerId, value: l.travelMin, median: med })
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export interface DriverScore {
  driverId: string
  visits: number
  legs: number
  dwellMedian: number    // นาที
  travelMedian: number   // นาที
  drivingScore: number   // median คะแนนขับขี่ V2X (0 = ไม่มี)
  kmTotal: number
  fuelTotal: number
  kmPerL: number         // 0 = คำนวณไม่ได้
}

const med = (arr: number[]) => (arr.length ? quantile([...arr].sort((a, b) => a - b), 0.5) : 0)

/** KPI ต่อคนขับ (ข้าม driverId ว่าง) — เรียงตามคะแนนขับขี่มาก→น้อย */
export function driverScores(visits: GpsVisit[], legs: GpsLeg[]): DriverScore[] {
  const dwellBy = new Map<string, number[]>()
  const visitCount = new Map<string, number>()
  for (const v of visits) {
    if (!v.driverId) continue
    visitCount.set(v.driverId, (visitCount.get(v.driverId) || 0) + 1)
    if (v.departTime && v.dwellMin > 0) push(dwellBy, v.driverId, v.dwellMin)
  }
  const travelBy = new Map<string, number[]>()
  const scoreBy = new Map<string, number[]>()
  const kmBy = new Map<string, number>()
  const fuelBy = new Map<string, number>()
  const legCount = new Map<string, number>()
  for (const l of legs) {
    if (!l.driverId) continue
    legCount.set(l.driverId, (legCount.get(l.driverId) || 0) + 1)
    push(travelBy, l.driverId, l.travelMin)
    if (l.score > 0) push(scoreBy, l.driverId, l.score)
    kmBy.set(l.driverId, (kmBy.get(l.driverId) || 0) + l.km)
    fuelBy.set(l.driverId, (fuelBy.get(l.driverId) || 0) + l.fuelL)
  }
  const drivers = new Set<string>([...visitCount.keys(), ...legCount.keys()])
  return [...drivers].map(driverId => {
    const km = kmBy.get(driverId) || 0, fuel = fuelBy.get(driverId) || 0
    return {
      driverId,
      visits: visitCount.get(driverId) || 0,
      legs: legCount.get(driverId) || 0,
      dwellMedian: med(dwellBy.get(driverId) || []),
      travelMedian: med(travelBy.get(driverId) || []),
      drivingScore: med(scoreBy.get(driverId) || []),
      kmTotal: km,
      fuelTotal: fuel,
      kmPerL: fuel > 0 ? km / fuel : 0,
    }
  }).sort((a, b) => b.drivingScore - a.drivingScore || b.visits - a.visits)
}

export interface RouteOpportunity {
  fromCustomerId: string
  toCustomerId: string
  fromName: string
  toName: string
  trips: number
  median: number          // นาที (ปกติ)
  fast: number            // p25 (เคยทำได้เร็ว)
  savingPerTrip: number   // median - p25
  savingTotal: number     // savingPerTrip × trips (จัดลำดับความคุ้ม)
}

/** leg ที่ "เคยทำได้เร็วกว่าปกติ" → โอกาสประหยัดเวลา (ลดความแปรปรวน/หา route ดีสุด) */
export function routeOpportunities(legs: GpsLeg[], minTrips = MIN_SAMPLE, minSaving = 3): RouteOpportunity[] {
  const byPair = new Map<string, GpsLeg[]>()
  for (const l of legs) if (l.fromCustomerId && l.toCustomerId) push(byPair, `${l.fromCustomerId}>${l.toCustomerId}`, l)
  const out: RouteOpportunity[] = []
  for (const [key, ls] of byPair) {
    if (ls.length < minTrips) continue
    const sorted = ls.map(l => l.travelMin).sort((a, b) => a - b)
    const median = quantile(sorted, 0.5)
    const fast = quantile(sorted, 0.25)
    const savingPerTrip = median - fast
    if (savingPerTrip < minSaving) continue
    const [fromCustomerId, toCustomerId] = key.split('>')
    out.push({
      fromCustomerId, toCustomerId, fromName: ls[0].fromName, toName: ls[0].toName,
      trips: ls.length, median, fast, savingPerTrip, savingTotal: savingPerTrip * ls.length,
    })
  }
  return out.sort((a, b) => b.savingTotal - a.savingTotal)
}

// ── 469 — งานซ้ำซ้อน: เข้าซ้ำลูกค้ารายเดิมในเที่ยวเดียว (ยังไม่กลับโรงงาน) ──
//   เคส: คนขับเข้าลูกค้า A → งานไม่เสร็จ → ไปทำเจ้าอื่น → ต้องวนกลับมา A อีกครั้ง ในเที่ยวเดียวกัน
//   นิยาม "เที่ยว": กลับถึงโรงงาน = ขึ้นเที่ยวใหม่ · ระหว่าง 2 visit ของลูกค้าเดียวกัน
//   ถ้าไม่มี leg ไหน "ถึงโรงงาน" (toKey='factory') คั่น = เที่ยวเดียวกัน = วนกลับซ้ำซ้อน
const MIN_LOOP_KM = 1   // วนกลับสั้นกว่านี้ + ไม่แวะเจ้าอื่นเลย = ถือว่าจอดเดิม/GPS เพี้ยน ไม่ใช่งานซ้ำ

/** นาทีระหว่างสอง datetime ("yyyy-mm-dd HH:MM:SS" เวลาไทย) · 0 ถ้าคำนวณไม่ได้/ติดลบ */
function elapsedMin(fromTime: string, toTime: string): number {
  const a = parseV2xTimeMs(fromTime), b = parseV2xTimeMs(toTime)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 60000))
}

export interface RevisitIncident {
  date: string
  vehicleId: string
  driverId: string
  customerId: string
  firstArrive: string    // เวลาถึงครั้งแรก (datetime)
  revisitArrive: string  // เวลาที่วนกลับมาถึงอีกครั้ง (datetime)
  otherStops: number     // จำนวนจุดที่แวะลูกค้า "เจ้าอื่น" ระหว่างนั้น
  loopKm: number         // ระยะรวมช่วงวนกลับ (ออกจากลูกค้า → กลับมาถึงอีกครั้ง)
  loopMin: number        // เวลารวมช่วงวนกลับ (door-to-door)
  loopFuelL: number      // น้ำมันรวมช่วงวนกลับ
}

/**
 * หาเหตุการณ์ "วนกลับเข้าลูกค้ารายเดิมในเที่ยวเดียว" — แต่ละแถว = วนกลับ 1 รอบ (เสียเที่ยวเปล่า 1 รอบ)
 *   - ต้องมีพิกัดโรงงาน (มี leg แตะ factory อย่างน้อย 1) ถึงจะแยกเที่ยวได้ — ไม่งั้นคืน [] (แยกเที่ยวไม่ได้)
 *   - กรอง GPS jitter/จอดเดิม: นับเฉพาะที่ "แวะเจ้าอื่น ≥1 จุด" หรือ "วนไกล ≥ MIN_LOOP_KM กม."
 */
export function detectRevisits(visits: GpsVisit[], legs: GpsLeg[]): RevisitIncident[] {
  const factoryKnown = legs.some(l => l.toKey === 'factory' || l.fromKey === 'factory')
  if (!factoryKnown) return []   // ไม่รู้พิกัดโรงงาน = แยกเที่ยวไม่ได้ → ไม่เดา

  // จัดกลุ่ม leg + visit ตาม (รถ, วัน)
  const legsByVD = new Map<string, GpsLeg[]>()
  for (const l of legs) push(legsByVD, `${l.vehicleId}|${l.date}`, l)
  const visByVD = new Map<string, GpsVisit[]>()
  for (const v of visits) if (v.customerId) push(visByVD, `${v.vehicleId}|${v.date}`, v)

  const out: RevisitIncident[] = []
  for (const [vd, vis] of visByVD) {
    const dayLegs = (legsByVD.get(vd) || []).slice().sort((a, b) => a.departTime.localeCompare(b.departTime))
    // visit ของลูกค้าแต่ละราย เรียงตามเวลาถึง
    const byCust = new Map<string, GpsVisit[]>()
    for (const v of vis) push(byCust, v.customerId, v)
    for (const [cid, vs] of byCust) {
      if (vs.length < 2) continue
      vs.sort((a, b) => a.arriveTime.localeCompare(b.arriveTime))
      for (let i = 1; i < vs.length; i++) {
        const prev = vs[i - 1], cur = vs[i]
        if (!prev.departTime) continue   // ไม่มีเวลาออก (visit สุดท้ายของวัน) — ไม่ควรเกิดในคู่นี้
        // leg ช่วง "ออกจากลูกค้าครั้งก่อน → กลับมาถึงอีกครั้ง"
        const windowLegs = dayLegs.filter(l => l.departTime >= prev.departTime && l.departTime < cur.arriveTime)
        if (windowLegs.some(l => l.toKey === 'factory')) continue   // กลับโรงงานคั่น = คนละเที่ยว
        const otherStops = windowLegs.filter(l => l.toCustomerId && l.toCustomerId !== cid).length
        const loopKm = windowLegs.reduce((s, l) => s + l.km, 0)
        const loopFuelL = windowLegs.reduce((s, l) => s + l.fuelL, 0)
        if (otherStops < 1 && loopKm < MIN_LOOP_KM) continue   // จอดเดิม/GPS เพี้ยน → ข้าม
        out.push({
          date: cur.date, vehicleId: cur.vehicleId,
          driverId: cur.driverId || prev.driverId, customerId: cid,
          firstArrive: prev.arriveTime, revisitArrive: cur.arriveTime,
          otherStops, loopKm, loopFuelL,
          loopMin: elapsedMin(prev.departTime, cur.arriveTime),
        })
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.loopKm - a.loopKm)
}

export interface RevisitCustomerSummary {
  customerId: string
  incidents: number       // จำนวนครั้งที่ต้องวนกลับ
  loopKmTotal: number
  loopMinTotal: number
  otherStopsTotal: number
  lastDate: string
}

/** สรุปลูกค้าที่ต้องวนกลับบ่อย (= ลูกค้าปัญหาเรื้อรัง) — เรียงตามจำนวนครั้งมาก→น้อย */
export function revisitsByCustomer(incidents: RevisitIncident[]): RevisitCustomerSummary[] {
  const by = new Map<string, RevisitCustomerSummary>()
  for (const inc of incidents) {
    let s = by.get(inc.customerId)
    if (!s) { s = { customerId: inc.customerId, incidents: 0, loopKmTotal: 0, loopMinTotal: 0, otherStopsTotal: 0, lastDate: '' }; by.set(inc.customerId, s) }
    s.incidents++
    s.loopKmTotal += inc.loopKm
    s.loopMinTotal += inc.loopMin
    s.otherStopsTotal += inc.otherStops
    if (inc.date > s.lastDate) s.lastDate = inc.date
  }
  return [...by.values()].sort((a, b) => b.incidents - a.incidents || b.loopKmTotal - a.loopKmTotal)
}
