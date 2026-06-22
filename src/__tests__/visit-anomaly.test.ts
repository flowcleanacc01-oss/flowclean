// 449 P3 — anomaly + เทียบคนขับ + หา route ดีสุด
import { describe, it, expect } from 'vitest'
import { detectAnomalies, driverScores, routeOpportunities, detectRevisits, revisitsByCustomer } from '@/lib/visit-anomaly'
import type { GpsVisit, GpsLeg } from '@/types'

const visit = (over: Partial<GpsVisit>): GpsVisit =>
  ({ id: 'v', date: '2026-06-10', vehicleId: 'V1', driverId: 'D1', roundId: 'R1', customerId: 'A',
    arriveTime: '2026-06-10 08:00:00', departTime: '2026-06-10 08:15:00', dwellMin: 15, confidence: 'high', sequence: 0, ...over } as GpsVisit)

const leg = (over: Partial<GpsLeg>): GpsLeg =>
  ({ id: 'l', date: '2026-06-10', vehicleId: 'V1', driverId: 'D1', roundId: 'R1',
    fromKey: 'c:A', fromCustomerId: 'A', fromName: 'A', toKey: 'c:B', toCustomerId: 'B', toName: 'B',
    departTime: '', arriveTime: '', travelMin: 10, km: 3, fuelL: 0.3, score: 85, ...over } as GpsLeg)

describe('detectAnomalies — dwell นานผิดปกติ', () => {
  // ลูกค้า A: dwell ปกติ ~10-15 นาที × 6 ครั้ง + 1 ครั้ง 90 นาที (outlier)
  const visits = [
    ...[10, 12, 11, 13, 12, 14].map((m, i) => visit({ id: `v${i}`, date: `2026-06-1${i}`, dwellMin: m, departTime: 'x' })),
    visit({ id: 'vbad', date: '2026-06-17', dwellMin: 90, departTime: 'x' }),
  ]
  const anomalies = detectAnomalies(visits, [])
  it('จับ dwell 90 นาที เป็น anomaly', () => {
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toMatchObject({ kind: 'dwell', customerId: 'A', value: 90 })
  })
  it('ตัวอย่างน้อยกว่า 5 → ไม่ตัดสิน', () => {
    expect(detectAnomalies([visit({ dwellMin: 90, departTime: 'x' })], [])).toHaveLength(0)
  })
})

describe('detectAnomalies — เวลาเดินทางช้าผิดปกติ', () => {
  const legs = [
    ...[8, 9, 10, 9, 11, 10].map((m, i) => leg({ id: `l${i}`, travelMin: m })),
    leg({ id: 'lbad', date: '2026-06-18', travelMin: 45 }),
  ]
  it('จับ leg 45 นาที เป็น anomaly', () => {
    const a = detectAnomalies([], legs)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: 'travel', fromCustomerId: 'A', toCustomerId: 'B', value: 45 })
  })
})

describe('driverScores', () => {
  const visits = [
    visit({ driverId: 'D1', dwellMin: 10, departTime: 'x' }),
    visit({ driverId: 'D2', dwellMin: 30, departTime: 'x' }),
  ]
  const legs = [
    leg({ driverId: 'D1', travelMin: 10, km: 10, fuelL: 1, score: 90 }),
    leg({ driverId: 'D2', travelMin: 20, km: 10, fuelL: 2, score: 60 }),
  ]
  const scores = driverScores(visits, legs)
  it('เรียงตามคะแนนขับขี่ (D1=90 ก่อน D2=60)', () => {
    expect(scores.map(s => s.driverId)).toEqual(['D1', 'D2'])
  })
  it('km/L คำนวณถูก (D1 10/1=10)', () => {
    expect(scores[0].kmPerL).toBe(10)
    expect(scores[1].kmPerL).toBe(5)
  })
  it('ข้าม driverId ว่าง', () => {
    expect(driverScores([visit({ driverId: '' })], [])).toHaveLength(0)
  })
})

describe('routeOpportunities', () => {
  // A→B: ส่วนมาก 20 นาที แต่เคยทำได้ 10 → มีโอกาสประหยัด
  const legs = [10, 10, 20, 20, 20, 22].map((m, i) => leg({ id: `l${i}`, travelMin: m }))
  it('จับโอกาสประหยัดเวลา (median > p25)', () => {
    const opp = routeOpportunities(legs)
    expect(opp).toHaveLength(1)
    expect(opp[0].fromCustomerId).toBe('A')
    expect(opp[0].savingPerTrip).toBeGreaterThan(0)
    expect(opp[0].fast).toBeLessThan(opp[0].median)
  })
  it('ความแปรปรวนต่ำ → ไม่ใช่โอกาส', () => {
    const stable = [10, 10, 10, 10, 10, 10].map((m, i) => leg({ id: `s${i}`, travelMin: m }))
    expect(routeOpportunities(stable)).toHaveLength(0)
  })
})

// 469 — งานซ้ำซ้อน: เข้าซ้ำลูกค้ารายเดิมในเที่ยวเดียว (ยังไม่กลับโรงงาน)
const T = (hhmm: string) => `2026-06-10 ${hhmm}:00`
const factoryLeg = leg({ id: 'lf', toKey: 'factory', toCustomerId: '', departTime: T('17:00'), arriveTime: T('17:30') })

describe('detectRevisits — วนกลับเข้าลูกค้ารายเดิม', () => {
  // A(08:00) → B(08:20) → กลับ A(08:40) ในเที่ยวเดียว (ไม่กลับโรงงาน)
  const visits: GpsVisit[] = [
    visit({ id: 'va1', customerId: 'A', arriveTime: T('08:00'), departTime: T('08:10') }),
    visit({ id: 'vb', customerId: 'B', arriveTime: T('08:20'), departTime: T('08:30') }),
    visit({ id: 'va2', customerId: 'A', arriveTime: T('08:40'), departTime: T('09:00') }),
  ]
  const legs: GpsLeg[] = [
    leg({ id: 'l1', fromCustomerId: 'A', toKey: 'c:B', toCustomerId: 'B', departTime: T('08:10'), arriveTime: T('08:20'), km: 3 }),
    leg({ id: 'l2', fromKey: 'c:B', fromCustomerId: 'B', toKey: 'c:A', toCustomerId: 'A', departTime: T('08:30'), arriveTime: T('08:40'), km: 3 }),
    factoryLeg,
  ]

  it('จับการวนกลับ A เป็น 1 incident', () => {
    const r = detectRevisits(visits, legs)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ customerId: 'A', otherStops: 1, loopKm: 6 })
    expect(r[0].loopMin).toBe(30)   // 08:10 → 08:40
  })

  it('กลับโรงงานคั่นระหว่างกลาง → คนละเที่ยว ไม่นับ', () => {
    const withReturn: GpsLeg[] = [
      leg({ id: 'l1', fromCustomerId: 'A', toKey: 'factory', toCustomerId: '', departTime: T('08:10'), arriveTime: T('08:20'), km: 5 }),
      leg({ id: 'l2', fromKey: 'factory', toKey: 'c:A', toCustomerId: 'A', departTime: T('08:30'), arriveTime: T('08:40'), km: 5 }),
    ]
    expect(detectRevisits(visits, withReturn)).toHaveLength(0)
  })

  it('วนสั้น + ไม่แวะเจ้าอื่น (GPS jitter/จอดเดิม) → ไม่นับ', () => {
    const jitterVisits: GpsVisit[] = [
      visit({ id: 'j1', customerId: 'A', arriveTime: T('08:00'), departTime: T('08:05') }),
      visit({ id: 'j2', customerId: 'A', arriveTime: T('08:08'), departTime: T('08:20') }),
    ]
    const jitterLegs: GpsLeg[] = [
      leg({ id: 'jl', fromCustomerId: 'A', toKey: 'c:A', toCustomerId: 'A', departTime: T('08:05'), arriveTime: T('08:08'), km: 0.6 }),
      factoryLeg,
    ]
    expect(detectRevisits(jitterVisits, jitterLegs)).toHaveLength(0)
  })

  it('ไม่รู้พิกัดโรงงาน (ไม่มี leg แตะ factory) → คืน [] (แยกเที่ยวไม่ได้)', () => {
    const noFactory = legs.filter(l => l.toKey !== 'factory')
    expect(detectRevisits(visits, noFactory)).toHaveLength(0)
  })

  it('แยกตามรถ — รถคนละคันเข้าลูกค้าเดียวกัน = คนละเที่ยว ไม่นับ', () => {
    const twoVehicles: GpsVisit[] = [
      visit({ id: 'p1', vehicleId: 'V1', customerId: 'A', arriveTime: T('08:00'), departTime: T('08:10') }),
      visit({ id: 'p2', vehicleId: 'V2', customerId: 'A', arriveTime: T('08:40'), departTime: T('09:00') }),
    ]
    expect(detectRevisits(twoVehicles, legs)).toHaveLength(0)
  })
})

describe('revisitsByCustomer', () => {
  it('รวมจำนวนครั้ง + ระยะวน ต่อลูกค้า เรียงมาก→น้อย', () => {
    const incidents = [
      { date: '2026-06-10', vehicleId: 'V1', driverId: 'D1', customerId: 'A', firstArrive: '', revisitArrive: '', otherStops: 1, loopKm: 6, loopMin: 30, loopFuelL: 0.5 },
      { date: '2026-06-11', vehicleId: 'V1', driverId: 'D1', customerId: 'A', firstArrive: '', revisitArrive: '', otherStops: 2, loopKm: 4, loopMin: 20, loopFuelL: 0.4 },
      { date: '2026-06-10', vehicleId: 'V1', driverId: 'D1', customerId: 'B', firstArrive: '', revisitArrive: '', otherStops: 1, loopKm: 2, loopMin: 10, loopFuelL: 0.2 },
    ]
    const sum = revisitsByCustomer(incidents)
    expect(sum.map(s => s.customerId)).toEqual(['A', 'B'])
    expect(sum[0]).toMatchObject({ incidents: 2, loopKmTotal: 10, loopMinTotal: 50, lastDate: '2026-06-11' })
  })
})
