// 311 — Schedule Pattern Detection
//
// วิเคราะห์ SD history → suggest scheduleType + scheduleDays + scheduleStartDate
//
// Heuristics:
// 1. รวบรวมวันที่ส่งของ (unique dates) จาก SD 60 วันล่าสุด
// 2. นับ frequency ของแต่ละ day-of-week
// 3. ถ้า DOW ใดมี SD ≥ 60% ของสัปดาห์ที่ active → ถือว่าเป็น scheduled day
// 4. ถ้า scheduled days ≥ 6 จาก 7 → suggest 'daily'
// 5. ถ้า 1-5 days → suggest 'weekly' พร้อม scheduleDays
// 6. startDate = วันแรกที่มี SD ที่อยู่ใน scheduleDays
//
// หมายเหตุ: เป็น suggestion เท่านั้น — user confirm/edit ได้

import type { DeliveryNote } from '@/types'

export interface SchedulePatternSuggestion {
  scheduleType: 'none' | 'weekly' | 'daily'
  scheduleDays: number[]      // 0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์
  scheduleStartDate: string   // ISO date
  confidence: number          // 0..1 — % ของสัปดาห์ที่ pattern match
  dayBreakdown: { day: number; count: number; weekActiveCount: number; ratio: number }[]
  sampleSize: number          // จำนวน SD ที่ใช้วิเคราะห์
  weeksAnalyzed: number       // จำนวนสัปดาห์ที่ active
  reason: string              // อธิบาย suggestion
}

const FREQUENCY_THRESHOLD = 0.6 // 60% ของสัปดาห์ที่ active

export function detectSchedulePattern(
  dnsForCustomer: DeliveryNote[],
  lookbackDays = 60,
): SchedulePatternSuggestion {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lookbackStart = new Date(today)
  lookbackStart.setDate(today.getDate() - lookbackDays)

  // กรอง SD ใน window + ที่ไม่ใช่รอบเสริม (รอบเสริมไม่ใช่ schedule)
  const recentDNs = dnsForCustomer.filter(d => {
    if (d.isExtraRound) return false
    const date = new Date(d.date)
    return date >= lookbackStart && date <= today
  })

  if (recentDNs.length === 0) {
    return emptySuggestion('ไม่มีข้อมูล SD ใน 60 วันล่าสุด — ระบุ schedule ด้วยตัวเอง')
  }

  // unique dates (ป้องกัน duplicate SD ในวันเดียว — ถึง isExtraRound=false ก็ตาม)
  const uniqueDates = Array.from(new Set(recentDNs.map(d => d.date.slice(0, 10))))
    .sort()

  if (uniqueDates.length < 3) {
    return emptySuggestion(`SD น้อยเกินไป (${uniqueDates.length} วัน) — ต้องอย่างน้อย 3 วัน เพื่อหา pattern`)
  }

  // ขอบเขตของข้อมูล: วันแรก → วันสุดท้าย
  const firstDate = new Date(uniqueDates[0])
  const lastDate = new Date(uniqueDates[uniqueDates.length - 1])
  const totalDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1
  const weeksActive = Math.max(1, Math.round(totalDays / 7))

  // นับ frequency per DOW
  const dowCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const dateStr of uniqueDates) {
    const dow = new Date(dateStr).getDay()
    dowCounts[dow]++
  }

  // คำนวณ ratio per DOW
  const dayBreakdown = Object.entries(dowCounts).map(([dowStr, count]) => {
    const day = parseInt(dowStr, 10)
    const ratio = count / weeksActive
    return { day, count, weekActiveCount: weeksActive, ratio }
  }).sort((a, b) => b.ratio - a.ratio)

  // หา scheduled days (ratio ≥ threshold)
  const scheduledDays = dayBreakdown
    .filter(d => d.ratio >= FREQUENCY_THRESHOLD)
    .map(d => d.day)
    .sort()

  // วันแรกที่ match pattern
  let startDate = uniqueDates[0]
  if (scheduledDays.length > 0) {
    const firstMatch = uniqueDates.find(d => scheduledDays.includes(new Date(d).getDay()))
    startDate = firstMatch || uniqueDates[0]
  }

  // ตัดสิน scheduleType
  let scheduleType: 'none' | 'weekly' | 'daily' = 'none'
  let reason = ''
  let confidence = 0

  if (scheduledDays.length >= 6) {
    scheduleType = 'daily'
    confidence = dayBreakdown.slice(0, 7).reduce((s, d) => s + d.ratio, 0) / 7
    reason = `พบส่ง ${scheduledDays.length}/7 วันต่อสัปดาห์ — แนะนำ "ทุกวัน"`
  } else if (scheduledDays.length >= 1) {
    scheduleType = 'weekly'
    confidence = scheduledDays.reduce((s, day) => {
      const entry = dayBreakdown.find(d => d.day === day)
      return s + (entry?.ratio || 0)
    }, 0) / scheduledDays.length
    const dayLabels = scheduledDays.map(d => ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][d]).join('/')
    reason = `พบ pattern: ${dayLabels} (${scheduledDays.length} วัน/สัปดาห์)`
  } else {
    scheduleType = 'none'
    reason = 'ไม่พบ pattern ชัดเจน — กรุณาระบุ schedule ด้วยตัวเอง'
  }

  return {
    scheduleType,
    scheduleDays: scheduledDays,
    scheduleStartDate: startDate,
    confidence,
    dayBreakdown,
    sampleSize: uniqueDates.length,
    weeksAnalyzed: weeksActive,
    reason,
  }
}

function emptySuggestion(reason: string): SchedulePatternSuggestion {
  return {
    scheduleType: 'none',
    scheduleDays: [],
    scheduleStartDate: new Date().toISOString().slice(0, 10),
    confidence: 0,
    dayBreakdown: [],
    sampleSize: 0,
    weeksAnalyzed: 0,
    reason,
  }
}
