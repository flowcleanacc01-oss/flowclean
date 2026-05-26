'use client'

import { useMemo, useState } from 'react'
import { Sparkles, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  SCHEDULE_TYPE_CONFIG, WEEKDAY_LABELS, WEEKDAY_SHORT,
  type Customer, type ScheduleType,
} from '@/types'
import { detectSchedulePattern } from '@/lib/schedule-pattern'
import { nthOccurrenceDate } from '@/lib/schedule-audit'

interface Props {
  open: boolean
  onClose: () => void
  customer: Customer
}

export default function ScheduleSetupModal({ open, onClose, customer }: Props) {
  const { updateCustomer, deliveryNotes } = useStore()

  const [scheduleType, setScheduleType] = useState<ScheduleType>(customer.scheduleType || 'none')
  const [scheduleDays, setScheduleDays] = useState<number[]>(customer.scheduleDays || [])
  const [scheduleStartDate, setScheduleStartDate] = useState<string>(
    customer.scheduleStartDate || new Date().toISOString().slice(0, 10)
  )
  const [scheduleNote, setScheduleNote] = useState<string>(customer.scheduleNote || '')
  // P2.4 — additional fields for new schedule types
  const [scheduleEveryNDays, setScheduleEveryNDays] = useState<number>(customer.scheduleEveryNDays || 2)
  const [scheduleBiweeklyAnchorWeek, setScheduleBiweeklyAnchorWeek] = useState<0 | 1>(customer.scheduleBiweeklyAnchorWeek ?? 0)
  // 377 — เงื่อนไขสิ้นสุด (never / on_date / after_count)
  const [endMode, setEndMode] = useState<'never' | 'on_date' | 'after_count'>(
    customer.scheduleEndCount ? 'after_count' : customer.scheduleEndDate ? 'on_date' : 'never',
  )
  const [scheduleEndDate, setScheduleEndDate] = useState<string>(customer.scheduleEndDate || '')
  const [scheduleEndCount, setScheduleEndCount] = useState<number>(customer.scheduleEndCount || 10)
  const [aiSuggestion, setAiSuggestion] = useState<ReturnType<typeof detectSchedulePattern> | null>(null)

  const customerDNs = useMemo(
    () => deliveryNotes.filter(d => d.customerId === customer.id),
    [deliveryNotes, customer.id],
  )

  const runAIDetection = () => {
    const suggestion = detectSchedulePattern(customerDNs, 60)
    setAiSuggestion(suggestion)
  }

  const applySuggestion = () => {
    if (!aiSuggestion) return
    setScheduleType(aiSuggestion.scheduleType)
    setScheduleDays(aiSuggestion.scheduleDays)
    setScheduleStartDate(aiSuggestion.scheduleStartDate)
  }

  const toggleDay = (day: number) => {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  // P2.4 — canSave logic ขยายตาม schedule types
  const canSave =
    scheduleType === 'none' ||
    scheduleType === 'daily' ||
    (scheduleType === 'weekly' && scheduleDays.length > 0) ||
    (scheduleType === 'every_n_days' && scheduleEveryNDays >= 1 && !!scheduleStartDate) ||
    (scheduleType === 'biweekly' && scheduleDays.length > 0 && !!scheduleStartDate)

  // 377 — preview วันสิ้นสุดเมื่อเลือก "หลัง N ครั้ง"
  const computedEndFromCount = useMemo(
    () => endMode === 'after_count'
      ? nthOccurrenceDate({ scheduleType, scheduleDays, scheduleStartDate, scheduleEveryNDays, scheduleBiweeklyAnchorWeek }, scheduleEndCount)
      : null,
    [endMode, scheduleType, scheduleDays, scheduleStartDate, scheduleEveryNDays, scheduleBiweeklyAnchorWeek, scheduleEndCount],
  )

  const handleSave = () => {
    if (!canSave) return
    const needsWeekdays = scheduleType === 'weekly' || scheduleType === 'biweekly'
    // 377 — resolve end condition → เก็บ scheduleEndDate (authoritative) + scheduleEndCount (display hint)
    let endDate: string | undefined
    let endCount: number | undefined
    if (scheduleType !== 'none') {
      if (endMode === 'on_date' && scheduleEndDate) endDate = scheduleEndDate
      else if (endMode === 'after_count') { endCount = scheduleEndCount; endDate = computedEndFromCount ?? undefined }
    }
    updateCustomer(customer.id, {
      scheduleType,
      scheduleDays: needsWeekdays ? scheduleDays : [],
      scheduleStartDate: scheduleType === 'none' ? undefined : scheduleStartDate,
      scheduleEveryNDays: scheduleType === 'every_n_days' ? scheduleEveryNDays : undefined,
      scheduleBiweeklyAnchorWeek: scheduleType === 'biweekly' ? scheduleBiweeklyAnchorWeek : undefined,
      scheduleEndDate: endDate,
      scheduleEndCount: endCount,
      scheduleNote,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`ตั้งค่าตารางคิวส่งผ้า — ${customer.shortName || customer.name}`} size="lg">
      <div className="space-y-5">

        {/* AI Pattern Detector */}
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <h4 className="font-semibold text-violet-900 text-sm">AI วิเคราะห์ pattern จาก SD 60 วันล่าสุด</h4>
            </div>
            <button
              type="button"
              onClick={runAIDetection}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              วิเคราะห์ pattern
            </button>
          </div>
          {aiSuggestion && (
            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                {aiSuggestion.scheduleType !== 'none' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-slate-700">{aiSuggestion.reason}</p>
                  {aiSuggestion.scheduleType !== 'none' && (
                    <p className="text-xs text-slate-500 mt-1">
                      ตัวอย่าง {aiSuggestion.sampleSize} วัน · {aiSuggestion.weeksAnalyzed} สัปดาห์ · confidence {(aiSuggestion.confidence * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              </div>
              {aiSuggestion.dayBreakdown.length > 0 && (
                <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                  {[0, 1, 2, 3, 4, 5, 6].map(day => {
                    const entry = aiSuggestion.dayBreakdown.find(d => d.day === day)
                    const isScheduled = aiSuggestion.scheduleDays.includes(day)
                    const ratio = entry?.ratio || 0
                    return (
                      <div key={day} className={cn(
                        'rounded-lg p-1.5',
                        isScheduled ? 'bg-violet-100 border border-violet-300' : 'bg-white border border-slate-200',
                      )}>
                        <div className="font-semibold text-slate-700">{WEEKDAY_SHORT[day]}</div>
                        <div className="text-slate-500 font-mono">{(ratio * 100).toFixed(0)}%</div>
                        <div className="text-slate-400">{entry?.count || 0} ครั้ง</div>
                      </div>
                    )
                  })}
                </div>
              )}
              {aiSuggestion.scheduleType !== 'none' && (
                <button
                  type="button"
                  onClick={applySuggestion}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-violet-300 text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  ใช้ค่าที่ AI แนะนำ
                </button>
              )}
            </div>
          )}
          {!aiSuggestion && (
            <p className="text-xs text-slate-500 mt-1">
              ระบบจะวิเคราะห์วันที่ส่งของจริง 60 วันล่าสุด เพื่อหา pattern เช่น "ส่งทุก จ/พ/ศ" และแนะนำให้ — แก้ภายหลังได้
            </p>
          )}
        </div>

        {/* ประเภท schedule */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">ประเภทตารางคิว</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(['none', 'daily', 'every_n_days', 'weekly', 'biweekly'] as ScheduleType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setScheduleType(type)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  scheduleType === type
                    ? 'border-[#3DD8D8] bg-[#3DD8D8]/10 text-[#1B3A5C]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                <div className="font-semibold">{SCHEDULE_TYPE_CONFIG[type].label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{SCHEDULE_TYPE_CONFIG[type].description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* วันในสัปดาห์ — แสดง weekly + biweekly */}
        {(scheduleType === 'weekly' || scheduleType === 'biweekly') && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">วันที่ส่งของ</label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'rounded-lg border px-2 py-2.5 text-center text-sm font-semibold transition-colors',
                    scheduleDays.includes(day)
                      ? 'border-[#3DD8D8] bg-[#3DD8D8] text-[#1B3A5C]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                  )}
                >
                  <div className="text-base">{WEEKDAY_SHORT[day]}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{label.slice(0, 3)}</div>
                </button>
              ))}
            </div>
            {scheduleDays.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">เลือกอย่างน้อย 1 วัน</p>
            )}
          </div>
        )}

        {/* P2.4 — every_n_days: step input */}
        {scheduleType === 'every_n_days' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">ส่งทุกกี่วัน</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={365}
                value={scheduleEveryNDays}
                onChange={e => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1) setScheduleEveryNDays(v)
                }}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-center font-mono focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30"
              />
              <span className="text-sm text-slate-600">วัน</span>
            </div>
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-slate-400">ทางลัด:</span>
              {[{ n: 2, l: 'วันเว้นวัน (48ชม.)' }, { n: 3, l: 'ทุก 3 วัน' }, { n: 7, l: 'ทุกสัปดาห์' }].map(p => (
                <button
                  key={p.n}
                  type="button"
                  onClick={() => setScheduleEveryNDays(p.n)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs border transition-colors',
                    scheduleEveryNDays === p.n
                      ? 'border-[#3DD8D8] bg-[#3DD8D8]/10 text-[#1B3A5C] font-medium'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300',
                  )}
                >
                  {p.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* P2.4 — biweekly: anchor week parity */}
        {scheduleType === 'biweekly' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">สัปดาห์ที่เริ่ม</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScheduleBiweeklyAnchorWeek(0)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-sm transition-colors',
                  scheduleBiweeklyAnchorWeek === 0
                    ? 'border-[#3DD8D8] bg-[#3DD8D8] text-[#1B3A5C] font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                สัปดาห์ที่ 1 (เริ่มทันที)
              </button>
              <button
                type="button"
                onClick={() => setScheduleBiweeklyAnchorWeek(1)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-sm transition-colors',
                  scheduleBiweeklyAnchorWeek === 1
                    ? 'border-[#3DD8D8] bg-[#3DD8D8] text-[#1B3A5C] font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                สัปดาห์ที่ 2 (เว้นก่อน)
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              ตัดสินจากวันที่เริ่ม schedule: anchor week = สัปดาห์ที่ส่งจริง
            </p>
          </div>
        )}

        {/* วันที่เริ่ม — แสดงเฉพาะ weekly/daily */}
        {scheduleType !== 'none' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />วันที่เริ่ม schedule
            </label>
            <input
              type="date"
              value={scheduleStartDate}
              onChange={e => setScheduleStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30"
            />
            <p className="text-xs text-slate-500 mt-1">
              ไม่จำเป็นต้องเป็นวันแรกจริง — เช่นเดือนที่กำลัง key ข้อมูลก็ได้ Audit จะเริ่มเช็คจากวันนี้เป็นต้นไป
            </p>
          </div>
        )}

        {/* 377 — เงื่อนไขสิ้นสุด (เหมือน Google Calendar recurrence end) */}
        {scheduleType !== 'none' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">สิ้นสุด</label>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="endmode" checked={endMode === 'never'} onChange={() => setEndMode('never')} className="accent-[#3DD8D8]" />
                <span className="text-sm text-slate-700">ไม่หยุด</span>
                <span className="text-xs text-slate-400">(วิ่งต่อเนื่อง — default)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                <input type="radio" name="endmode" checked={endMode === 'on_date'} onChange={() => setEndMode('on_date')} className="accent-[#3DD8D8]" />
                <span className="text-sm text-slate-700">ในวันที่</span>
                <input
                  type="date"
                  value={scheduleEndDate}
                  min={scheduleStartDate}
                  onChange={e => { setScheduleEndDate(e.target.value); setEndMode('on_date') }}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30"
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="endmode" checked={endMode === 'after_count'} onChange={() => setEndMode('after_count')} className="accent-[#3DD8D8]" />
                <span className="text-sm text-slate-700">หลังจากเกิด</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={scheduleEndCount}
                  onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) { setScheduleEndCount(v); setEndMode('after_count') } }}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-center font-mono focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30"
                />
                <span className="text-sm text-slate-700">ครั้ง</span>
              </label>
            </div>
            {endMode === 'after_count' && (
              <p className="text-xs text-slate-500 mt-1.5">
                {computedEndFromCount
                  ? <>ครั้งสุดท้าย ≈ <span className="font-medium text-slate-600">{computedEndFromCount}</span> (ระบบแปลงเป็นวันสิ้นสุดให้อัตโนมัติ)</>
                  : 'คำนวณวันสิ้นสุดไม่ได้ — ตรวจวันเริ่ม/ประเภทคิว'}
              </p>
            )}
            {endMode === 'on_date' && !scheduleEndDate && (
              <p className="text-xs text-amber-600 mt-1.5">เลือกวันสิ้นสุด (ไม่งั้นจะถือว่า "ไม่หยุด")</p>
            )}
          </div>
        )}

        {/* หมายเหตุ */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">หมายเหตุ (optional)</label>
          <textarea
            value={scheduleNote}
            onChange={e => setScheduleNote(e.target.value)}
            rows={2}
            placeholder="เช่น ส่งช่วงเช้า 9-10 โมง / เลื่อนเมื่อชนวันหยุดประจำชาติ"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30 resize-none"
          />
        </div>

        {/* Save */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
              canSave
                ? 'bg-[#1B3A5C] text-white hover:bg-[#122740]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed',
            )}
          >
            บันทึก
          </button>
        </div>
      </div>
    </Modal>
  )
}
