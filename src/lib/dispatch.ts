// 423 Phase B2 — Dispatch logic (สร้างใบงานรอบประจำวัน)
//
// generate DailyTrip จาก membership (customer.roundId) + schedule (isScheduledDay)
// - mode 'schedule': เฉพาะลูกค้าที่ "ถึงคิว" วันนั้น (ตรงกับ Schedule Audit / ปฏิทินขนส่ง)
// - mode 'all':      ทุกลูกค้าในรอบ (เผื่อรอบที่ยังไม่ได้ตั้งคิว — dispatcher ตัดจุดที่ไม่ต้องเอง)
// reuse isScheduledDay (single source of truth) + เคารพ override skip/extra (311)

import type { Customer, Round, DailyTrip, TripStop, ScheduleOverride } from '@/types'
import { dailyTripId } from '@/types'
import { isScheduledDay } from './schedule-audit'

export type GenerateMode = 'schedule' | 'all'

/** ลูกค้าถึงคิววันนั้นไหม (schedule + override) — สำหรับ generate ตาม mode 'schedule' */
function isDueOnDate(customer: Customer, date: string, overrides: ScheduleOverride[]): boolean {
  const dayOverrides = overrides.filter(o => o.customerId === customer.id && o.date === date)
  const hasSkip = dayOverrides.some(o => o.type === 'skip' || o.type === 'reschedule_skip')
  const hasExtra = dayOverrides.some(o => o.type === 'extra' || o.type === 'reschedule_add')
  if (hasSkip) return false
  if (hasExtra) return true
  return isScheduledDay(date, customer)
}

/**
 * สร้าง TripStop[] ของรอบ 1 รอบ สำหรับวันที่กำหนด
 * - สมาชิกรอบ = customer.roundId === round.id && isActive
 * - เรียงตาม routeSequence (default ในรอบ) → ลำดับวิ่ง
 * - snapshot หน้าต่างเวลาเข้า stop (กัน drift เมื่อ customer แก้ทีหลัง)
 */
export function buildTripStops(
  round: Round,
  customers: Customer[],
  date: string,
  overrides: ScheduleOverride[],
  mode: GenerateMode,
): TripStop[] {
  const members = customers
    .filter(c => c.isActive && c.roundId === round.id)
    .filter(c => mode === 'all' || isDueOnDate(c, date, overrides))
    .sort((a, b) =>
      (a.routeSequence || 0) - (b.routeSequence || 0) ||
      (a.shortName || a.name).localeCompare(b.shortName || b.name, 'th'),
    )

  return members.map((c, i) => ({
    customerId: c.id,
    sequence: i + 1,
    source: 'regular' as const,
    bagCount: 0,
    status: 'pending' as const,
    note: '',
    timeWindowStart: c.pickupWindowStart || '',
    timeWindowEnd: c.pickupWindowEnd || '',
  }))
}

export interface GeneratedTrip {
  trip: DailyTrip
  stopCount: number
}

/**
 * generate ใบงานทุกรอบ active สำหรับวันที่กำหนด
 * - id = deterministic dailyTripId(date, roundId) → idempotent
 * - existingIds = ใบงานที่มีอยู่แล้ว (date นั้น) → ข้าม (ไม่ทับงานที่ dispatcher แก้ไปแล้ว)
 * คืน { created, skipped } เพื่อรายงานผล
 */
export function generateDailyTrips(
  rounds: Round[],
  customers: Customer[],
  date: string,
  overrides: ScheduleOverride[],
  existingIds: Set<string>,
  mode: GenerateMode,
  createdBy: string,
): { created: GeneratedTrip[]; skipped: number } {
  const created: GeneratedTrip[] = []
  let skipped = 0

  const activeRounds = [...rounds]
    .filter(r => r.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  for (const round of activeRounds) {
    const id = dailyTripId(date, round.id)
    if (existingIds.has(id)) { skipped++; continue }

    const stops = buildTripStops(round, customers, date, overrides, mode)
    const trip: DailyTrip = {
      id,
      date,
      roundId: round.id,
      vehicleId: round.defaultVehicleId || '',
      driverId: round.defaultDriverId || '',
      helperId: round.defaultHelperId || '',
      status: 'planned',
      note: '',
      stops,
      createdBy,
      createdAt: new Date().toISOString(),
    }
    created.push({ trip, stopCount: stops.length })
  }

  return { created, skipped }
}

/** จำนวนถุงรวม (load) ของใบงาน — ตรงกับ "ยอดรวมท้ายใบ" ใบจดมือ */
export function tripLoad(trip: DailyTrip): number {
  return trip.stops.reduce((s, st) => s + (st.bagCount || 0), 0)
}

/** re-number sequence ให้ต่อเนื่อง 1..n หลัง reorder/insert/remove */
export function resequence(stops: TripStop[]): TripStop[] {
  return stops.map((s, i) => ({ ...s, sequence: i + 1 }))
}
