// 311 — Schedule-Based SD Audit Logic
//
// expand schedule → expected dates ใน date range
// แล้วเทียบกับ SD จริง (regular vs extra round)

import type { Customer, DeliveryNote, ScheduleType, ScheduleOverride } from '@/types'

export interface ScheduleAuditDayResult {
  date: string                  // ISO date
  dayOfWeek: number             // 0-6
  expected: boolean             // true = วันที่ควรมี SD ตาม schedule (หลัง apply overrides)
  // P2.3: override flags
  hasSkipOverride: boolean      // วันนี้มี skip/reschedule_skip override
  hasExtraOverride: boolean     // วันนี้มี extra/reschedule_add override
  overrideReason?: string       // เหตุผลจาก override (สำหรับ tooltip)
  regularSDs: DeliveryNote[]    // SD ที่ isExtraRound=false
  extraSDs: DeliveryNote[]      // SD ที่ isExtraRound=true
  status: 'ok' | 'missing' | 'extra-only' | 'multiple-regular' | 'off-schedule' | 'skipped' | 'override-extra'
  // - ok: expected ตรงกับ regular count = 1 (หรือ daily and ≥1)
  // - missing: expected แต่ไม่มี regular
  // - extra-only: expected แต่มี extra round อย่างเดียว (ไม่มี regular)
  // - multiple-regular: expected แต่ regular ≥ 2 (อาจลืม tag extra)
  // - off-schedule: ไม่ใช่วันที่ expect แต่มี SD (ปกติ = extra rounds — informational)
  // - skipped: P2.3 — มี skip override + ตรงกับการกระทำจริง (no SD)
  // - override-extra: P2.3 — มี extra override → adjusted expected
}

export interface ScheduleAuditSummary {
  customer: Pick<Customer, 'id' | 'name' | 'shortName' | 'scheduleType' | 'scheduleDays' | 'scheduleStartDate'>
  rangeStart: string
  rangeEnd: string
  days: ScheduleAuditDayResult[]
  totals: {
    expectedDays: number
    regularSDs: number
    extraSDs: number
    missingDays: number
    multipleRegular: number
    extraOnly: number
    offScheduleDays: number
  }
}

// 318: timezone-safe local date helpers
// `new Date('YYYY-MM-DD')` parse เป็น UTC midnight → ในไทย (UTC+7)
// `toISOString().slice(0,10)` คืน UTC date ที่ off-by-one จาก local
// → ใช้ local date parsing/formatting แทน
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Helper: walk dates [start, end] inclusive (timezone-safe — local date)
function* dateRange(start: string, end: string): Generator<string> {
  const cur = parseLocalDate(start)
  const endDate = parseLocalDate(end)
  while (cur <= endDate) {
    yield toLocalISO(cur)
    cur.setDate(cur.getDate() + 1)
  }
}

/** Calc number of days between two ISO dates (positive if to > from) */
function daysBetween(fromIso: string, toIso: string): number {
  const from = parseLocalDate(fromIso)
  const to = parseLocalDate(toIso)
  const diffMs = to.getTime() - from.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

function isScheduledDay(
  date: string,
  customer: Pick<Customer, 'scheduleType' | 'scheduleDays' | 'scheduleStartDate' | 'scheduleEveryNDays' | 'scheduleBiweeklyAnchorWeek'>,
): boolean {
  const { scheduleType, scheduleDays, scheduleStartDate, scheduleEveryNDays, scheduleBiweeklyAnchorWeek } = customer
  if (scheduleType === 'none' || !scheduleType) return false
  if (scheduleStartDate && date < scheduleStartDate) return false

  if (scheduleType === 'daily') return true

  if (scheduleType === 'weekly') {
    const dow = parseLocalDate(date).getDay()
    return (scheduleDays || []).includes(dow)
  }

  if (scheduleType === 'every_n_days') {
    // P2.3 — every N days from anchor (scheduleStartDate)
    if (!scheduleStartDate || !scheduleEveryNDays || scheduleEveryNDays < 1) return false
    const days = daysBetween(scheduleStartDate, date)
    if (days < 0) return false
    return days % scheduleEveryNDays === 0
  }

  if (scheduleType === 'biweekly') {
    // P2.3 — every other week ตาม scheduleDays + anchor week parity
    if (!scheduleStartDate) return false
    const dow = parseLocalDate(date).getDay()
    if (!(scheduleDays || []).includes(dow)) return false
    // คำนวณ week index จาก anchor
    const days = daysBetween(scheduleStartDate, date)
    if (days < 0) return false
    const weekIndex = Math.floor(days / 7)
    const expectedParity = scheduleBiweeklyAnchorWeek ?? 0
    return (weekIndex % 2) === expectedParity
  }

  return false
}

export function runScheduleAudit(
  customer: Customer,
  dnsForCustomer: DeliveryNote[],
  rangeStart: string,
  rangeEnd: string,
  overridesForCustomer: ScheduleOverride[] = [],   // P2.3 — adjust expected dates
): ScheduleAuditSummary {
  // กรอง SDs ใน range + group by date
  const dnsByDate = new Map<string, DeliveryNote[]>()
  for (const dn of dnsForCustomer) {
    const date = dn.date.slice(0, 10)
    if (date < rangeStart || date > rangeEnd) continue
    if (!dnsByDate.has(date)) dnsByDate.set(date, [])
    dnsByDate.get(date)!.push(dn)
  }

  // P2.3 — index overrides by date
  const overrideByDate = new Map<string, ScheduleOverride[]>()
  for (const o of overridesForCustomer) {
    if (o.date < rangeStart || o.date > rangeEnd) continue
    if (!overrideByDate.has(o.date)) overrideByDate.set(o.date, [])
    overrideByDate.get(o.date)!.push(o)
  }

  const days: ScheduleAuditDayResult[] = []
  for (const date of dateRange(rangeStart, rangeEnd)) {
    const dayOfWeek = parseLocalDate(date).getDay()
    const baseExpected = isScheduledDay(date, customer)
    const dateOverrides = overrideByDate.get(date) || []
    const hasSkipOverride = dateOverrides.some(o => o.type === 'skip' || o.type === 'reschedule_skip')
    const hasExtraOverride = dateOverrides.some(o => o.type === 'extra' || o.type === 'reschedule_add')
    const overrideReason = dateOverrides.map(o => `[${o.type}] ${o.reason}`).join(' · ') || undefined

    // P2.3 — adjusted expected:
    //   base expected + extra override → expected
    //   base expected + skip override → NOT expected
    let expected = baseExpected
    if (hasSkipOverride) expected = false
    if (hasExtraOverride) expected = true

    const dns = dnsByDate.get(date) || []
    const regularSDs = dns.filter(d => !d.isExtraRound)
    const extraSDs = dns.filter(d => d.isExtraRound)

    let status: ScheduleAuditDayResult['status'] = 'ok'
    if (expected) {
      if (regularSDs.length === 0 && extraSDs.length === 0) status = 'missing'
      else if (regularSDs.length === 0 && extraSDs.length > 0) status = 'extra-only'
      else if (regularSDs.length >= 2) status = 'multiple-regular'
      else status = 'ok'
      // P2.3: ถ้ามี extra override + SD ตรง → status special
      if (hasExtraOverride && (regularSDs.length + extraSDs.length) > 0) status = 'override-extra'
    } else {
      if (regularSDs.length + extraSDs.length > 0) status = 'off-schedule'
      else if (hasSkipOverride && baseExpected) status = 'skipped' // skip ถูกใช้ → แสดง
      else continue // ไม่ expected + ไม่มี SD + ไม่มี override = ไม่ต้องแสดง
    }

    days.push({ date, dayOfWeek, expected, hasSkipOverride, hasExtraOverride, overrideReason, regularSDs, extraSDs, status })
  }

  const totals = {
    expectedDays: days.filter(d => d.expected).length,
    regularSDs: days.reduce((s, d) => s + d.regularSDs.length, 0),
    extraSDs: days.reduce((s, d) => s + d.extraSDs.length, 0),
    missingDays: days.filter(d => d.status === 'missing').length,
    multipleRegular: days.filter(d => d.status === 'multiple-regular').length,
    extraOnly: days.filter(d => d.status === 'extra-only').length,
    offScheduleDays: days.filter(d => d.status === 'off-schedule').length,
  }

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      shortName: customer.shortName,
      scheduleType: customer.scheduleType,
      scheduleDays: customer.scheduleDays,
      scheduleStartDate: customer.scheduleStartDate,
    },
    rangeStart,
    rangeEnd,
    days,
    totals,
  }
}

// Section: "ต้อง tag extra round" — scan dates ที่มี SD ≥ 2 + isExtraRound=false ทั้งหมด
export interface MultipleRegularGroup {
  customerId: string
  customerName: string
  customerShortName: string
  date: string
  dns: DeliveryNote[]
}

export function findMultipleRegularGroups(
  customers: Customer[],
  allDns: DeliveryNote[],
): MultipleRegularGroup[] {
  const byCustDate = new Map<string, DeliveryNote[]>() // key: customerId|date
  for (const dn of allDns) {
    if (dn.isExtraRound) continue
    const date = dn.date.slice(0, 10)
    const key = `${dn.customerId}|${date}`
    if (!byCustDate.has(key)) byCustDate.set(key, [])
    byCustDate.get(key)!.push(dn)
  }

  const groups: MultipleRegularGroup[] = []
  for (const [key, dns] of byCustDate.entries()) {
    if (dns.length < 2) continue
    const [customerId, date] = key.split('|')
    const cust = customers.find(c => c.id === customerId)
    if (!cust) continue
    groups.push({
      customerId,
      customerName: cust.name,
      customerShortName: cust.shortName || cust.name,
      date,
      dns: dns.sort((a, b) => a.noteNumber.localeCompare(b.noteNumber)),
    })
  }
  return groups.sort((a, b) => b.date.localeCompare(a.date))
}
