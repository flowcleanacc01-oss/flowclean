// 311 — Schedule-Based SD Audit Logic
//
// expand schedule → expected dates ใน date range
// แล้วเทียบกับ SD จริง (regular vs extra round)

import type { Customer, DeliveryNote, ScheduleType } from '@/types'

export interface ScheduleAuditDayResult {
  date: string                  // ISO date
  dayOfWeek: number             // 0-6
  expected: boolean             // true = วันที่ควรมี SD ตาม schedule
  regularSDs: DeliveryNote[]    // SD ที่ isExtraRound=false
  extraSDs: DeliveryNote[]      // SD ที่ isExtraRound=true
  status: 'ok' | 'missing' | 'extra-only' | 'multiple-regular' | 'off-schedule'
  // - ok: expected ตรงกับ regular count = 1 (หรือ daily and ≥1)
  // - missing: expected แต่ไม่มี regular
  // - extra-only: expected แต่มี extra round อย่างเดียว (ไม่มี regular)
  // - multiple-regular: expected แต่ regular ≥ 2 (อาจลืม tag extra)
  // - off-schedule: ไม่ใช่วันที่ expect แต่มี SD (ปกติ = extra rounds — informational)
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

function isScheduledDay(
  date: string,
  scheduleType: ScheduleType | undefined,
  scheduleDays: number[] | undefined,
  scheduleStartDate: string | undefined,
): boolean {
  if (scheduleType === 'none' || !scheduleType) return false
  if (scheduleStartDate && date < scheduleStartDate) return false
  if (scheduleType === 'daily') return true
  if (scheduleType === 'weekly') {
    const dow = parseLocalDate(date).getDay()
    return (scheduleDays || []).includes(dow)
  }
  // 311 P2.3 — every_n_days + biweekly จะ implement ต่อใน P2.3 (commit ต่อไป)
  return false
}

export function runScheduleAudit(
  customer: Customer,
  dnsForCustomer: DeliveryNote[],
  rangeStart: string,
  rangeEnd: string,
): ScheduleAuditSummary {
  // กรอง SDs ใน range + group by date
  const dnsByDate = new Map<string, DeliveryNote[]>()
  for (const dn of dnsForCustomer) {
    const date = dn.date.slice(0, 10)
    if (date < rangeStart || date > rangeEnd) continue
    if (!dnsByDate.has(date)) dnsByDate.set(date, [])
    dnsByDate.get(date)!.push(dn)
  }

  const days: ScheduleAuditDayResult[] = []
  for (const date of dateRange(rangeStart, rangeEnd)) {
    const dayOfWeek = parseLocalDate(date).getDay()
    const expected = isScheduledDay(date, customer.scheduleType, customer.scheduleDays, customer.scheduleStartDate)
    const dns = dnsByDate.get(date) || []
    const regularSDs = dns.filter(d => !d.isExtraRound)
    const extraSDs = dns.filter(d => d.isExtraRound)

    let status: ScheduleAuditDayResult['status'] = 'ok'
    if (expected) {
      if (regularSDs.length === 0 && extraSDs.length === 0) status = 'missing'
      else if (regularSDs.length === 0 && extraSDs.length > 0) status = 'extra-only'
      else if (regularSDs.length >= 2) status = 'multiple-regular'
      else status = 'ok'
    } else {
      if (regularSDs.length + extraSDs.length > 0) status = 'off-schedule'
      else continue // ไม่ expected + ไม่มี SD = ไม่ต้องแสดง
    }

    days.push({ date, dayOfWeek, expected, regularSDs, extraSDs, status })
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
