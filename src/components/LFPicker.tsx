'use client'

/**
 * LFPicker (Feat 299)
 *
 * Searchable LF dropdown — replaces native <select> ใน tool ที่เลือก LF
 * Designed สำหรับลูกค้าที่มี LF จำนวนมาก (100+, 500+, 800+)
 *
 * Features:
 *   - Click trigger → popup ผ่าน Portal (escape modal overflow clipping)
 *   - Search: formNumber / date typed
 *   - Date filter chips: 30 วัน / เดือนนี้ / ทั้งหมด (default 30 วัน)
 *   - Lazy render: 30 ก่อน + "แสดงเพิ่ม 50" — กัน render ช้าเมื่อ LF เยอะ
 *   - Status badge ใน row: SD/WB indicators
 *   - Keyboard nav: ↑↓ Enter Esc
 *   - Highlight matched tokens
 *
 * Usage:
 *   <LFPicker customerId={cid} value={selLfId} onChange={setSelLfId} />
 */
import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check, X } from 'lucide-react'
import type { LinenFormStatus } from '@/types'
import { useStore } from '@/lib/store'
import { formatDate, cn } from '@/lib/utils'
import { highlightText } from '@/lib/highlight'

interface Props {
  /** Filter LF เฉพาะลูกค้านี้ (required) */
  customerId: string
  value: string
  onChange: (id: string) => void
  /** Filter LF by status (default: 'confirmed') */
  filterStatus?: LinenFormStatus | LinenFormStatus[]
  placeholder?: string
  className?: string
  fullWidth?: boolean
}

const INITIAL_LIMIT = 30
const LOAD_MORE_STEP = 50

export default function LFPicker({
  customerId, value, onChange,
  filterStatus = 'confirmed',
  placeholder = 'เลือกใบรับส่งผ้า (LF)',
  className, fullWidth = true,
}: Props) {
  const { linenForms, deliveryNotes, billingStatements } = useStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [dateFilter, setDateFilter] = useState<'30d' | 'month' | 'all'>('30d')
  const [limit, setLimit] = useState(INITIAL_LIMIT)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Portal positioning — same pattern as CustomerPicker
  const [pos, setPos] = useState<{ top: number; left: number; width: number; placement: 'down' | 'up'; ready: boolean }>({
    top: 0, left: 0, width: 420, placement: 'down', ready: false,
  })
  const PANEL_HEIGHT_EST = 500
  const PANEL_MIN_W = 360
  const updatePos = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.max(PANEL_MIN_W, Math.min(rect.width, 520))
    const spaceBelow = vh - rect.bottom
    const placement: 'down' | 'up' = spaceBelow >= PANEL_HEIGHT_EST + 16 || spaceBelow >= vh / 2 ? 'down' : 'up'
    let left = rect.left
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8)
    const top = placement === 'down' ? rect.bottom + 4 : rect.top - 4
    setPos({ top, left, width, placement, ready: true })
  }
  useLayoutEffect(() => {
    if (!open) {
      setPos(p => p.ready ? { ...p, ready: false } : p)
      return
    }
    updatePos()
    let pending = false
    const scheduleUpdate = () => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => { pending = false; updatePos() })
    }
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    return () => {
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
  }, [open])

  const selLF = useMemo(() => value ? linenForms.find(f => f.id === value) || null : null, [linenForms, value])

  // Base list: customer + status — sorted newest first
  const baseList = useMemo(() => {
    if (!customerId) return []
    const statuses = Array.isArray(filterStatus) ? filterStatus : [filterStatus]
    return linenForms
      .filter(f => f.customerId === customerId && statuses.includes(f.status))
      .sort((a, b) => b.date.localeCompare(a.date) || b.formNumber.localeCompare(a.formNumber))
  }, [linenForms, customerId, filterStatus])

  // Date range filter
  const dateFiltered = useMemo(() => {
    if (dateFilter === 'all') return baseList
    const today = new Date()
    let cutoffISO: string
    if (dateFilter === '30d') {
      const d = new Date(today)
      d.setDate(d.getDate() - 30)
      cutoffISO = d.toISOString().slice(0, 10)
    } else {
      // month: first day of current month
      cutoffISO = `${today.toISOString().slice(0, 7)}-01`
    }
    return baseList.filter(f => f.date >= cutoffISO)
  }, [baseList, dateFilter])

  // Search filter
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dateFiltered
    return dateFiltered.filter(f =>
      f.formNumber.toLowerCase().includes(q) ||
      f.date.includes(q) ||
      formatDate(f.date).toLowerCase().includes(q)
    )
  }, [dateFiltered, search])

  // Lazy slice
  const limited = useMemo(() => filteredList.slice(0, limit), [filteredList, limit])
  const hasMore = filteredList.length > limit

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setLimit(INITIAL_LIMIT)
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    } else {
      setSearch('')
    }
  }, [open])

  // Reset limit when filters change
  useEffect(() => { setLimit(INITIAL_LIMIT); setActiveIdx(0) }, [search, dateFilter])

  // Outside click → close
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Scroll active into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-opt-idx="${activeIdx}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  // Status badge per LF
  const getStatus = (lfId: string) => {
    const sd = deliveryNotes.find(d => d.linenFormIds.includes(lfId))
    if (!sd) return { kind: 'no_sd' as const }
    const wb = billingStatements.find(b => b.deliveryNoteIds.includes(sd.id))
    return wb ? { kind: 'sd_billed' as const, sdNumber: sd.noteNumber, wbNumber: wb.billingNumber }
              : { kind: 'sd_unbilled' as const, sdNumber: sd.noteNumber }
  }

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setSearch('')
    setActiveIdx(0)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, limited.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = limited[activeIdx]
      if (opt) pick(opt.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const triggerLabel = selLF
    ? `(${formatDate(selLF.date)}) ${selLF.formNumber}`
    : placeholder

  const dateChips: Array<{ key: typeof dateFilter; label: string }> = [
    { key: '30d', label: '30 วันล่าสุด' },
    { key: 'month', label: 'เดือนนี้' },
    { key: 'all', label: 'ทั้งหมด' },
  ]

  return (
    <div className={cn('relative', fullWidth ? 'block w-full' : 'inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={!customerId}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors',
          fullWidth ? 'w-full' : 'min-w-[220px]',
          'focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
          !customerId
            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
            : selLF
              ? 'bg-white border-[#3DD8D8] text-[#1B3A5C] hover:border-[#2bb8b8]'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300',
        )}
      >
        <span className="truncate flex-1 text-left">{triggerLabel}</span>
        {selLF && (
          <span
            role="button"
            tabIndex={0}
            aria-label="ล้าง LF ที่เลือก"
            onClick={e => { e.stopPropagation(); pick('') }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                pick('')
              }
            }}
            className="inline-flex items-center justify-center w-4 h-4 hover:bg-black/10 rounded focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        )}
        <ChevronDown className={cn('w-4 h-4 transition-transform shrink-0', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && pos.ready && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          data-find-skip
          style={{
            position: 'fixed',
            top: pos.placement === 'down' ? pos.top : undefined,
            bottom: pos.placement === 'up' ? Math.max(8, window.innerHeight - pos.top) : undefined,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.placement === 'down'
              ? Math.min(PANEL_HEIGHT_EST, window.innerHeight - pos.top - 16)
              : Math.min(PANEL_HEIGHT_EST, pos.top - 16),
          }}
          className="z-[70] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col"
        >
          {/* Search + Date filter chips */}
          <div className="border-b border-slate-100 p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onKey}
                placeholder="พิมพ์เลข LF / วันที่ (DD-MM-YYYY)"
                className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1">
              {dateChips.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setDateFilter(chip.key)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                    dateFilter === chip.key
                      ? 'bg-[#3DD8D8] text-[#1B3A5C]'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                >
                  {chip.label}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-slate-400">
                พบ <strong>{filteredList.length}</strong> ใบ
                {hasMore && <span className="text-amber-600 ml-1">(แสดง {limited.length})</span>}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 px-0.5">
              ↑↓ เลือก · Enter ยืนยัน · Esc ปิด
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
            {limited.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                {customerId ? 'ไม่พบ LF ในช่วงที่เลือก' : 'กรุณาเลือกลูกค้าก่อน'}
              </div>
            ) : (
              <>
                {limited.map((f, idx) => {
                  const isFocused = idx === activeIdx
                  const isSelected = f.id === value
                  const status = getStatus(f.id)
                  return (
                    <button
                      key={f.id}
                      data-opt-idx={idx}
                      onClick={() => pick(f.id)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm border-b border-slate-50 flex items-start gap-2',
                        isFocused ? 'bg-[#3DD8D8]/10' : 'hover:bg-slate-50',
                      )}
                    >
                      {isSelected ? (
                        <Check className="w-4 h-4 text-[#3DD8D8] mt-0.5 shrink-0" />
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-xs text-slate-500 shrink-0')}>
                            ({formatDate(f.date)})
                          </span>
                          <span className={cn('font-mono font-semibold truncate', isSelected ? 'text-[#1B3A5C]' : 'text-slate-700')}>
                            {highlightText(f.formNumber, search)}
                          </span>
                          {status.kind === 'no_sd' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                              ยังไม่มี SD
                            </span>
                          )}
                          {status.kind === 'sd_unbilled' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                              มี SD
                            </span>
                          )}
                          {status.kind === 'sd_billed' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium" title={`SD: ${status.sdNumber} · WB: ${status.wbNumber}`}>
                              มี SD + WB ❌
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setLimit(l => l + LOAD_MORE_STEP)}
                    className="w-full px-3 py-2 text-xs text-[#1B3A5C] bg-slate-50 hover:bg-slate-100 border-t border-slate-100 font-medium"
                  >
                    ↓ แสดงเพิ่ม {Math.min(LOAD_MORE_STEP, filteredList.length - limit)} ใบ
                    <span className="text-slate-400 ml-2">(เหลือ {filteredList.length - limit} ใบ)</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
