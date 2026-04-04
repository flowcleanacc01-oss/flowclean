'use client'

import { useState } from 'react'
import { cn, todayISO, formatDate } from '@/lib/utils'
import { Calendar, X, ChevronDown } from 'lucide-react'

type DateFilterMode = 'single' | 'range'

interface DateFilterProps {
  dateFrom: string
  dateTo: string
  mode: DateFilterMode
  onModeChange: (mode: DateFilterMode) => void
  onDateFromChange: (date: string) => void
  onDateToChange: (date: string) => void
  onClear: () => void
}

// Preset date ranges
function getPresets() {
  const today = todayISO()
  const [y, m] = today.split('-').map(Number)
  const startOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
  const startOfYear = `${y}-01-01`
  // Previous month
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  const prevMonthStart = `${py}-${String(pm).padStart(2, '0')}-01`
  const prevMonthEnd = `${py}-${String(pm).padStart(2, '0')}-${new Date(py, pm, 0).getDate()}`
  // Offsets
  const daysAgo = (n: number) => {
    const d = new Date(y, m - 1, parseInt(today.split('-')[2]) - n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return [
    { label: 'วันนี้', from: today, to: today },
    { label: 'เดือนนี้', from: startOfMonth, to: today },
    { label: 'ต้นปีนี้', from: startOfYear, to: today },
    { label: 'เดือนที่แล้ว', from: prevMonthStart, to: prevMonthEnd },
    { divider: true },
    { label: '1 สัปดาห์', from: daysAgo(7), to: today },
    { label: '1 เดือน', from: daysAgo(30), to: today },
    { label: '3 เดือน', from: daysAgo(90), to: today },
    { label: '6 เดือน', from: daysAgo(180), to: today },
    { label: '12 เดือน', from: daysAgo(365), to: today },
    { divider: true },
    { label: 'ไม่กำหนด (ทั้งหมด)', from: '', to: '' },
  ] as ({ label: string; from: string; to: string; divider?: never } | { divider: true; label?: never; from?: never; to?: never })[]
}

export default function DateFilter({
  dateFrom, dateTo, mode, onModeChange, onDateFromChange, onDateToChange, onClear,
}: DateFilterProps) {
  const [showPresets, setShowPresets] = useState(false)
  const hasFilter = !!dateFrom
  const presets = getPresets()

  const applyPreset = (from: string, to: string) => {
    if (!from && !to) {
      onClear()
    } else if (from === to) {
      onModeChange('single')
      onDateFromChange(from)
      onDateToChange('')
    } else {
      onModeChange('range')
      onDateFromChange(from)
      onDateToChange(to)
    }
    setShowPresets(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 font-medium">เปลี่ยนวันที่:</span>

        {/* Presets dropdown */}
        <div className="relative">
          <button onClick={() => setShowPresets(!showPresets)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1">
            เลือกช่วงเวลา <ChevronDown className={cn('w-3 h-3 transition-transform', showPresets && 'rotate-180')} />
          </button>
          {showPresets && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPresets(false)} />
              <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px]">
                {presets.map((p, i) =>
                  p.divider ? (
                    <div key={i} className="border-t border-slate-100 my-1" />
                  ) : (
                    <button key={p.label} onClick={() => applyPreset(p.from, p.to)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-[#3DD8D8]/10 hover:text-[#1B3A5C] transition-colors">
                      {p.label}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* Mode toggle */}
        <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
          <button onClick={() => onModeChange('single')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'single' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
            วันที่เดียว
          </button>
          <button onClick={() => onModeChange('range')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'range' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
            ช่วงเวลา
          </button>
        </div>

        {/* Date inputs */}
        {mode === 'single' ? (
          <input type="date" value={dateFrom} onChange={e => { onDateFromChange(e.target.value); onDateToChange('') }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        ) : (
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            <span className="text-xs text-slate-400">ถึง</span>
            <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>
        )}

        {hasFilter && (
          <button onClick={onClear} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="ล้างตัวกรองวันที่">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Current range indicator */}
      {hasFilter && (
        <p className="text-[11px] text-slate-400 pl-6">
          กำลังแสดง: {mode === 'single'
            ? `วันที่ ${formatDate(dateFrom)}`
            : `${formatDate(dateFrom)} — ${dateTo ? formatDate(dateTo) : 'ถึงปัจจุบัน'}`
          }
        </p>
      )}
      {!hasFilter && (
        <p className="text-[11px] text-slate-400 pl-6">กำลังแสดง: ข้อมูลทั้งหมด (ไม่กำหนดวันที่)</p>
      )}
    </div>
  )
}
