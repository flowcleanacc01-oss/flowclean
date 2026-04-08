'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PAPER_SIZES, MARGIN_PRESETS,
  type PrintSettings, type Orientation, type PaperSize, type MarginPreset,
} from '@/lib/print-utils'

interface Props {
  settings: PrintSettings
  onChange: (settings: PrintSettings) => void
}

/**
 * Print Settings Dropdown (56)
 *
 * Features:
 * - Orientation (portrait/landscape)
 * - Paper size (A4/Letter/A3/A5)
 * - Margin preset (none/narrow/normal/wide)
 * - Help tip for browser headers/footers (#57)
 */
export default function PrintSettingsDropdown({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const marginOrder: MarginPreset[] = ['none', 'narrow', 'normal', 'wide']

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 border border-slate-200 flex items-center gap-1.5 transition-colors"
        title="ตั้งค่าหน้ากระดาษ">
        <Settings className="w-3.5 h-3.5" />
        ตั้งค่า
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Settings className="w-4 h-4" />
              ตั้งค่าพิมพ์/PDF
            </h4>
            <button onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Orientation */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">แนวกระดาษ</label>
              <div className="grid grid-cols-2 gap-2">
                {(['portrait', 'landscape'] as Orientation[]).map(o => (
                  <button key={o}
                    onClick={() => onChange({ ...settings, orientation: o })}
                    className={cn(
                      'px-3 py-2 text-xs rounded-lg border-2 transition-all flex items-center justify-center gap-1.5',
                      settings.orientation === o
                        ? 'bg-[#3DD8D8]/10 border-[#3DD8D8] text-[#1B3A5C] font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}>
                    <span className="text-sm">{o === 'portrait' ? '▯' : '▭'}</span>
                    {o === 'portrait' ? 'แนวตั้ง' : 'แนวนอน'}
                  </button>
                ))}
              </div>
            </div>

            {/* Paper size */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">ขนาดกระดาษ</label>
              <select
                value={settings.paperSize}
                onChange={e => onChange({ ...settings, paperSize: e.target.value as PaperSize })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
                {(Object.keys(PAPER_SIZES) as PaperSize[]).map(p => (
                  <option key={p} value={p}>{PAPER_SIZES[p].label}</option>
                ))}
              </select>
            </div>

            {/* Margin */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">ระยะขอบ</label>
              <div className="grid grid-cols-2 gap-2">
                {marginOrder.map(m => (
                  <button key={m}
                    onClick={() => onChange({ ...settings, margin: m })}
                    className={cn(
                      'px-2 py-1.5 text-xs rounded-lg border transition-all',
                      settings.margin === m
                        ? 'bg-[#3DD8D8]/10 border-[#3DD8D8] text-[#1B3A5C] font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}>
                    {MARGIN_PRESETS[m].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tip for #57 — browser headers/footers */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex gap-2 text-[11px] text-blue-800">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>หากเห็นวันที่/URL ที่หัว-ท้ายกระดาษ</strong>
                <br />
                ในหน้าต่างพิมพ์ของเบราว์เซอร์ → คลิก <strong>&quot;การตั้งค่าเพิ่มเติม&quot;</strong> → ปิด <strong>&quot;หัวกระดาษและท้ายกระดาษ&quot;</strong> (Headers and footers)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
