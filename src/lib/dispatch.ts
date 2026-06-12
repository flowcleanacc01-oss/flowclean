// 423 Phase B2 — Dispatch logic (สร้างใบงานรอบประจำวัน)
//
// generate DailyTrip จาก membership (customer.roundId) + schedule (isScheduledDay)
// - mode 'schedule': เฉพาะลูกค้าที่ "ถึงคิว" วันนั้น (ตรงกับ Schedule Audit / ปฏิทินขนส่ง)
// - mode 'all':      ทุกลูกค้าในรอบ (เผื่อรอบที่ยังไม่ได้ตั้งคิว — dispatcher ตัดจุดที่ไม่ต้องเอง)
// reuse isScheduledDay (single source of truth) + เคารพ override skip/extra (311)

import type { Customer, Round, DailyTrip, TripStop, ScheduleOverride } from '@/types'
import { dailyTripId } from '@/types'
import { isScheduledDay } from './schedule-audit'
import { parseLocalDate } from './logistics-week'

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
 * 429 — รอบที่ลูกค้าอยู่จริงในวันนั้น: ข้อยกเว้นรายวัน (roundDayOverrides) ชนะรอบหลัก (roundId)
 * เคสติ๊ด: IONA รอบหลัก SPA + {เสาร์: V} → เสาร์โผล่ในรอบ V อัตโนมัติ (หายจาก SPA วันนั้น)
 */
export function effectiveRoundId(customer: Customer, date: string): string {
  const ov = customer.roundDayOverrides
  if (ov) {
    const target = ov[parseLocalDate(date).getDay()]
    if (target) return target
  }
  return customer.roundId || ''
}

/**
 * สร้าง TripStop[] ของรอบ 1 รอบ สำหรับวันที่กำหนด
 * - สมาชิกรอบ = effectiveRoundId(customer, date) === round.id && isActive (429: รอบหลัก + ข้อยกเว้นรายวัน)
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
    .filter(c => c.isActive && effectiveRoundId(c, date) === round.id)
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

// 423 B-1 — Capacity status: เทียบ load จริง กับ capacityTarget ของรอบ
// ติ๊ด: <เป้า=เสี่ยงต้นทุน(under-utilize) · ~เป้า=ปกติ · เกิน 1.25×=เริ่มเยอะ · เกิน 1.5×=เตือนบริหารเวลา
export type CapacityStatus = 'none' | 'low' | 'ok' | 'warn' | 'high'

export function capacityStatus(load: number, target: number): CapacityStatus {
  if (!target || target <= 0) return 'none'   // ไม่ได้ตั้งเป้า
  if (load < target) return 'low'             // น้อยกว่าเป้า → เสี่ยงต้นทุน
  if (load <= target * 1.25) return 'ok'      // ~ปกติ
  if (load <= target * 1.5) return 'warn'     // เริ่มเยอะ
  return 'high'                               // เตือนบริหารเวลาให้ทัน
}

/** re-number sequence ให้ต่อเนื่อง 1..n หลัง reorder/insert/remove */
export function resequence(stops: TripStop[]): TripStop[] {
  return stops.map((s, i) => ({ ...s, sequence: i + 1 }))
}

// 423 B-2 — Skip-queue review: ลูกค้าถึงคิวแต่ถุง=0 (ข้ามคิว? หรือยังไม่กรอก)
// ติ๊ด: เก็บข้อมูลเตือนลูกค้าให้แจ้งล่วงหน้า · ยกเว้นกลุ่มเจ้าของเดียวกันที่สาขาอื่นส่งแล้ว
export interface SkipQueueItem {
  customerId: string
  roundId: string
  ownerGroup: string
}

export function skipQueueReview(
  trips: DailyTrip[],          // ใบงานของวันนั้น
  customers: Customer[],
  date: string,
  overrides: ScheduleOverride[],
): SkipQueueItem[] {
  const custById = new Map(customers.map(c => [c.id, c]))

  // กลุ่มเจ้าของที่ "มีอย่างน้อย 1 สาขาส่งถุง > 0" วันนั้น → ยกเว้นทั้งกลุ่ม
  const groupSent = new Set<string>()
  for (const t of trips) {
    for (const s of t.stops) {
      if (s.bagCount > 0) {
        const g = custById.get(s.customerId)?.ownerGroup
        if (g) groupSent.add(g)
      }
    }
  }

  const out: SkipQueueItem[] = []
  const seen = new Set<string>()
  for (const t of trips) {
    for (const s of t.stops) {
      if (s.source !== 'regular') continue          // เฉพาะจุดประจำ (ไม่ใช่แทรก/ยืมรอบ)
      if (s.bagCount > 0) continue                  // มีถุง = ส่งแล้ว
      const c = custById.get(s.customerId)
      if (!c) continue
      if (!isDueOnDate(c, date, overrides)) continue // ต้องถึงคิวจริงวันนั้น (กัน mode='all')
      if (c.ownerGroup && groupSent.has(c.ownerGroup)) continue // สาขาอื่นในกลุ่มส่งแล้ว
      if (seen.has(s.customerId)) continue
      seen.add(s.customerId)
      out.push({ customerId: s.customerId, roundId: t.roundId, ownerGroup: c.ownerGroup || '' })
    }
  }
  return out
}
