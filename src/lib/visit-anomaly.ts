// 449 — Milk-Run Analytics · Phase 3: anomaly + เทียบคนขับ + หา route ดีสุด (pure · เทสได้)
//   - detectAnomalies: visit/leg ที่ผิดปกติเทียบ baseline ของกลุ่มตัวเอง (IQR fence)
//   - driverScores: KPI ต่อคนขับ (dwell/เวลาเดินทาง/คะแนนขับขี่/น้ำมัน) เทียบกัน
//   - routeOpportunities: leg ที่ "เคยทำได้เร็วกว่า" → โอกาสประหยัดเวลา (ลดความแปรปรวน)
import type { GpsVisit, GpsLeg } from '@/types'
import { quantile } from './visit-stats'

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
