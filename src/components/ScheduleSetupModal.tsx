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

  const canSave = scheduleType === 'none'
    || scheduleType === 'daily'
    || (scheduleType === 'weekly' && scheduleDays.length > 0)

  const handleSave = () => {
    if (!canSave) return
    updateCustomer(customer.id, {
      scheduleType,
      scheduleDays: scheduleType === 'weekly' ? scheduleDays : [],
      scheduleStartDate: scheduleType === 'none' ? undefined : scheduleStartDate,
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['none', 'weekly', 'daily'] as ScheduleType[]).map(type => (
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

        {/* วันในสัปดาห์ — แสดงเฉพาะ weekly */}
        {scheduleType === 'weekly' && (
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
