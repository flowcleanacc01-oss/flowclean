'use client'

import { cn } from '@/lib/utils'
import { Calendar, X } from 'lucide-react'

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

export default function DateFilter({
  dateFrom, dateTo, mode, onModeChange, onDateFromChange, onDateToChange, onClear,
}: DateFilterProps) {
  const hasFilter = !!dateFrom

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
        <button onClick={() => onModeChange('single')}
          className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
            mode === 'single' ? 'bg-[#1B3A5C] text-white' : 'bg-white text-slate-600 hover:bg-slate-100')}>
          วันที่เดียว
        </button>
        <button onClick={() => onModeChange('range')}
          className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
            mode === 'range' ? 'bg-[#1B3A5C] text-white' : 'bg-white text-slate-600 hover:bg-slate-100')}>
          ช่วงเวลา
        </button>
      </div>

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
  )
}
