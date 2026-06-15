// 449 — Milk-Run Analytics · Phase 2: สถิติ baseline จาก visit/leg (pure · เทสได้)
//   ต่อลูกค้า: เวลาถึง/dwell/ออก (median + ช่วงปกติ p25–p75)
//   ต่อ leg A→B: เวลาเดินทาง median+ช่วง, กม., น้ำมัน
//   ใช้ median (ทนค่าผิดปกติ) ไม่ใช่ค่าเฉลี่ย · "เวลาส่วนมาก" = median, "ช่วงปกติ" = p25–p75
import type { GpsVisit, GpsLeg } from '@/types'

/** quantile แบบ linear interpolation จาก array ที่เรียงแล้ว (asc) */
export function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length
  if (n === 0) return 0
  if (n === 1) return sortedAsc[0]
  const pos = (n - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sortedAsc[base + 1] !== undefined
    ? sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base])
    : sortedAsc[base]
}

export interface Dist {
  n: number
  median: number
  p25: number
  p75: number
}

/** สรุปการกระจาย (median + ช่วงปกติ p25–p75) · n=0 → ศูนย์ทั้งหมด */
export function summarize(values: number[]): Dist {
  const s = [...values].sort((a, b) => a - b)
  return { n: s.length, median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75) }
}

/** "yyyy-mm-dd HH:MM:SS" → นาทีจากเที่ยงคืน · null ถ้า parse ไม่ได้ */
export function minuteOfDay(datetime: string): number | null {
  const m = (datetime || '').match(/(\d{2}):(\d{2})/)
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
}

export interface CustomerStat {
  customerId: string
  visits: number
  arrive: Dist   // เวลาถึง (นาทีจากเที่ยงคืน)
  dwell: Dist    // เวลาที่ลูกค้า (นาที) — เฉพาะ visit ที่มีเวลาออก
  depart: Dist   // เวลาออก (นาทีจากเที่ยงคืน)
}

/** สถิติต่อลูกค้า — เรียงตามจำนวน visit มาก→น้อย */
export function customerStats(visits: GpsVisit[]): CustomerStat[] {
  const byCust = new Map<string, { arrive: number[]; dwell: number[]; depart: number[] }>()
  for (const v of visits) {
    if (!v.customerId) continue
    let acc = byCust.get(v.customerId)
    if (!acc) { acc = { arrive: [], dwell: [], depart: [] }; byCust.set(v.customerId, acc) }
    const a = minuteOfDay(v.arriveTime)
    if (a != null) acc.arrive.push(a)
    if (v.departTime) {
      const d = minuteOfDay(v.departTime)
      if (d != null) acc.depart.push(d)
      if (v.dwellMin > 0) acc.dwell.push(v.dwellMin)
    }
  }
  return [...byCust.entries()]
    .map(([customerId, acc]) => ({
      customerId,
      visits: acc.arrive.length,
      arrive: summarize(acc.arrive),
      dwell: summarize(acc.dwell),
      depart: summarize(acc.depart),
    }))
    .sort((a, b) => b.visits - a.visits)
}

export interface LegStat {
  fromCustomerId: string
  toCustomerId: string
  fromName: string
  toName: string
  trips: number
  travel: Dist   // เวลาเดินทาง (นาที)
  km: Dist
  fuel: Dist
}

/** สถิติต่อ leg A→B (เฉพาะลูกค้า→ลูกค้า) — เรียงตามจำนวนเที่ยวมาก→น้อย */
export function legStats(legs: GpsLeg[]): LegStat[] {
  const byPair = new Map<string, { fromName: string; toName: string; travel: number[]; km: number[]; fuel: number[] }>()
  for (const l of legs) {
    if (!l.fromCustomerId || !l.toCustomerId) continue
    const key = `${l.fromCustomerId}>${l.toCustomerId}`
    let acc = byPair.get(key)
    if (!acc) { acc = { fromName: l.fromName, toName: l.toName, travel: [], km: [], fuel: [] }; byPair.set(key, acc) }
    acc.travel.push(l.travelMin)
    acc.km.push(l.km)
    acc.fuel.push(l.fuelL)
  }
  return [...byPair.entries()]
    .map(([key, acc]) => {
      const [fromCustomerId, toCustomerId] = key.split('>')
      return {
        fromCustomerId, toCustomerId, fromName: acc.fromName, toName: acc.toName,
        trips: acc.travel.length,
        travel: summarize(acc.travel), km: summarize(acc.km), fuel: summarize(acc.fuel),
      }
    })
    .sort((a, b) => b.trips - a.trips)
}

/** เทียบเวลาถึงจริง (median) กับหน้าต่างเวลาที่ตั้งไว้ — null ถ้าไม่มี window/ข้อมูล */
export function arrivalVsWindow(arriveMedian: number, n: number, windowStart: string, windowEnd: string): 'before' | 'in' | 'after' | null {
  if (n === 0 || (!windowStart && !windowEnd)) return null
  const s = windowStart ? minuteOfDay(windowStart) : null
  const e = windowEnd ? minuteOfDay(windowEnd) : null
  if (s != null && arriveMedian < s) return 'before'
  if (e != null && arriveMedian > e) return 'after'
  return 'in'
}

/** นาทีจากเที่ยงคืน → "HH:MM" */
export function minToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
