// P5.1 — Logistic Calendar (Weekly) logic
//
// สร้าง grid ลูกค้า × 7 วัน สำหรับ "ปฏิทินขนส่ง"
// reuse runScheduleAudit (single source of truth สำหรับ status classification)
// + แนบ raw overrides ต่อ cell เพื่อแยก skip / extra / reschedule

import type { Customer, DeliveryNote, ScheduleOverride } from '@/types'
import { runScheduleAudit, isScheduledDay, type ScheduleAuditDayResult } from './schedule-audit'

// ── timezone-safe local date helpers (Fix 318 — ห้ามใช้ new Date('YYYY-MM-DD') / toISOString) ──
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + n)
  return toLocalISO(d)
}

/** Sunday-based week start (378.1 — ให้ตรงหน้าตั้งค่าตารางคิวที่แสดงอาทิตย์เป็นคอลัมน์แรก) */
export function getWeekStart(iso: string): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() - d.getDay()) // Sun(0)→0, Mon(1)→1 ... Sat(6)→6 — ถอยถึงอาทิตย์
  return toLocalISO(d)
}

// ── grid types ──
export type CellStatus = ScheduleAuditDayResult['status'] | 'empty'

export interface LogisticsCell {
  date: string
  dayOfWeek: number               // 0-6
  status: CellStatus
  baseScheduled: boolean          // scheduled ตาม pattern (ก่อน apply override)
  regularSDs: DeliveryNote[]
  extraSDs: DeliveryNote[]
  overrides: ScheduleOverride[]   // raw overrides ที่ตรง (customer, date)
  overrideReason?: string
  isPast: boolean                 // date < today
  isToday: boolean
}

export interface LogisticsRow {
  customer: Customer
  cells: LogisticsCell[]          // length 7 (Sun..Sat) — 378.1
  weekMissing: number             // missing บนวันที่ <= วันนี้ (ของจริงที่ขาด)
  weekSDs: number                 // จำนวน regular SD ทั้งสัปดาห์
}

export interface LogisticsDayHeader {
  date: string
  dayOfWeek: number
  isToday: boolean
  isPast: boolean
}

export interface LogisticsWeek {
  weekStart: string
  weekEnd: string
  days: LogisticsDayHeader[]      // length 7
  rows: LogisticsRow[]
  totals: {
    customers: number
    scheduledSlots: number        // cell ที่ baseScheduled (หรือ override-expected)
    sdsCreated: number            // regular SD ทั้ง grid
    extra: number                 // extra SD ทั้ง grid
    missing: number               // missing <= วันนี้
    upcoming: number              // missing > วันนี้ (รอสร้าง)
  }
}

/** สถานะที่ลากเลื่อนได้ — มี content ที่เป็น "คิว" จริง */
export function isDraggableStatus(s: CellStatus): boolean {
  return s === 'ok' || s === 'missing' || s === 'extra-only' || s === 'multiple-regular' || s === 'override-extra'
}

export function buildLogisticsWeek(
  customers: Customer[],
  allDns: DeliveryNote[],
  allOverrides: ScheduleOverride[],
  weekStartInput: string,
  today: string,
): LogisticsWeek {
  const weekStart = getWeekStart(weekStartInput)
  const weekEnd = addDays(weekStart, 6)

  // 7-day headers
  const days: LogisticsDayHeader[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    days.push({
      date,
      dayOfWeek: parseLocalDate(date).getDay(),
      isToday: date === today,
      isPast: date < today,
    })
  }

  // pre-group ครั้งเดียว (เลี่ยง filter ซ้ำต่อ customer)
  const dnsByCustomer = new Map<string, DeliveryNote[]>()
  for (const dn of allDns) {
    if (!dnsByCustomer.has(dn.customerId)) dnsByCustomer.set(dn.customerId, [])
    dnsByCustomer.get(dn.customerId)!.push(dn)
  }
  const overridesByCustomer = new Map<string, ScheduleOverride[]>()
  for (const o of allOverrides) {
    if (!overridesByCustomer.has(o.customerId)) overridesByCustomer.set(o.customerId, [])
    overridesByCustomer.get(o.customerId)!.push(o)
  }

  // 377 — filter isActive (ให้ตรงกับ Schedule Audit · ปิดลูกค้า = หายจากปฏิทินด้วย)
  const scheduledCustomers = customers.filter(c => c.scheduleType && c.scheduleType !== 'none' && c.isActive)

  const rows: LogisticsRow[] = []
  let totScheduled = 0, totSDs = 0, totExtra = 0, totMissing = 0, totUpcoming = 0

  for (const customer of scheduledCustomers) {
    const custDns = dnsByCustomer.get(customer.id) || []
    const custOverrides = overridesByCustomer.get(customer.id) || []
    const audit = runScheduleAudit(customer, custDns, weekStart, weekEnd, custOverrides)

    const resultByDate = new Map<string, ScheduleAuditDayResult>()
    for (const d of audit.days) resultByDate.set(d.date, d)

    const overridesByDate = new Map<string, ScheduleOverride[]>()
    for (const o of custOverrides) {
      if (o.date < weekStart || o.date > weekEnd) continue
      if (!overridesByDate.has(o.date)) overridesByDate.set(o.date, [])
      overridesByDate.get(o.date)!.push(o)
    }

    const cells: LogisticsCell[] = []
    let weekMissing = 0, weekSDs = 0
    for (const dh of days) {
      const dr = resultByDate.get(dh.date)
      const overrides = overridesByDate.get(dh.date) || []
      const baseScheduled = isScheduledDay(dh.date, customer)
      const status: CellStatus = dr?.status ?? 'empty'
      const regularSDs = dr?.regularSDs ?? []
      const extraSDs = dr?.extraSDs ?? []

      if (status === 'missing') {
        if (dh.date <= today) { weekMissing++; totMissing++ }
        else totUpcoming++
      }
      if (baseScheduled || dr?.expected) totScheduled++
      weekSDs += regularSDs.length
      totSDs += regularSDs.length
      totExtra += extraSDs.length

      cells.push({
        date: dh.date,
        dayOfWeek: dh.dayOfWeek,
        status,
        baseScheduled,
        regularSDs,
        extraSDs,
        overrides,
        overrideReason: dr?.overrideReason,
        isPast: dh.isPast,
        isToday: dh.isToday,
      })
    }

    rows.push({ customer, cells, weekMissing, weekSDs })
  }

  // เรียง: ลูกค้าที่มี missing (<=วันนี้) ขึ้นก่อน แล้วตามชื่อ
  rows.sort((a, b) => {
    if (b.weekMissing !== a.weekMissing) return b.weekMissing - a.weekMissing
    return (a.customer.shortName || a.customer.name).localeCompare(b.customer.shortName || b.customer.name, 'th')
  })

  return {
    weekStart,
    weekEnd,
    days,
    rows,
    totals: {
      customers: rows.length,
      scheduledSlots: totScheduled,
      sdsCreated: totSDs,
      extra: totExtra,
      missing: totMissing,
      upcoming: totUpcoming,
    },
  }
}
