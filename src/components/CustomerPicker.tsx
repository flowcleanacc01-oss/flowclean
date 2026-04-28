'use client'

/**
 * CustomerPicker (Feature 162.2)
 *
 * Searchable customer dropdown — replaces native <select> in pages with
 * many customers (180+). Designed for accurate, fast, keyboard-friendly
 * selection.
 *
 * Features:
 *   - Click trigger → opens panel with auto-focused search input
 *   - Type to filter by code / shortName / name / nameEn / taxId
 *   - "Recent" section pinned at top (last 5 used)
 *   - "ทุกลูกค้า" entry at top (when allowAll=true)
 *   - Keyboard nav: ↑/↓ select, Enter pick, Esc close
 *   - Yellow <mark> highlight on matched tokens
 *   - Compact 1-line rows: shortName + name (truncated) + code badge
 *   - Closes on outside click or selection
 *
 * Usage:
 *   <CustomerPicker
 *     value={selCustomerId}
 *     onChange={setSelCustomerId}
 *     allowAll
 *   />
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, X, Check, History } from 'lucide-react'
import type { Customer } from '@/types'
import { useStore } from '@/lib/store'
import { highlightText } from '@/lib/highlight'
import { getRecentCustomerIds, trackRecentCustomer } from '@/lib/recent-customers'
import { cn } from '@/lib/utils'

interface Props {
  value: string // '' = all
  onChange: (id: string) => void
  allowAll?: boolean // show "ทุกลูกค้า" option (default true)
  placeholder?: string
  className?: string
  /** Active flag → choose 'teal' when value is set */
  themed?: boolean
  /** Filter function — only show customers passing this */
  filter?: (c: Customer) => boolean
  /** Full-width trigger (for inside form rows / grid cells) */
  fullWidth?: boolean
}

export default function CustomerPicker({
  value, onChange, allowAll = true, placeholder = 'เลือกลูกค้า',
  className, themed = true, filter, fullWidth = false,
}: Props) {
  const { customers, getCustomer } = useStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selCustomer = value ? getCustomer(value) : null

  // Build base list — active customers, optionally filtered
  const baseList = useMemo(() => {
    let list = customers.filter(c => c.isActive)
    if (filter) list = list.filter(filter)
    return list
  }, [customers, filter])

  // Recent customer IDs (for "ใช้ล่าสุด" section)
  const recentIds = useMemo(() => {
    if (!open) return []
    return getRecentCustomerIds().slice(0, 5)
  }, [open])

  // Filtered + sorted list
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return baseList
    const tokens = q.split(/\s+/).filter(Boolean)
    return baseList.filter(c => {
      const haystack = [c.customerCode, c.shortName, c.name, c.nameEn, c.taxId]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => haystack.includes(t))
    })
  }, [baseList, search])

  // Build flat option list for keyboard nav: [all?, ...recent, ...filtered]
  type Opt = { kind: 'all' | 'recent' | 'normal'; id: string; customer?: Customer }
  const options: Opt[] = useMemo(() => {
    const opts: Opt[] = []
    if (allowAll && !search.trim()) opts.push({ kind: 'all', id: '' })
    if (!search.trim() && recentIds.length > 0) {
      for (const id of recentIds) {
        const c = baseList.find(x => x.id === id)
        if (c) opts.push({ kind: 'recent', id: c.id, customer: c })
      }
    }
    const recentSet = new Set(recentIds)
    for (const c of filteredList) {
      if (!search.trim() && recentSet.has(c.id)) continue // dedup with recent section
      opts.push({ kind: 'normal', id: c.id, customer: c })
    }
    return opts
  }, [allowAll, search, recentIds, filteredList, baseList])

  // Reset active idx when options change
  useEffect(() => { setActiveIdx(0) }, [options.length, search])

  // Outside click → close
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Auto-focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  // Scroll active into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-opt-idx="${activeIdx}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  const pick = (id: string) => {
    onChange(id)
    if (id) trackRecentCustomer(id)
    setOpen(false)
    setSearch('')
    setActiveIdx(0)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[activeIdx]
      if (opt) pick(opt.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
    }
  }

  const isActive = !!value
  const triggerLabel = selCustomer
    ? (selCustomer.shortName || selCustomer.name)
    : (allowAll ? 'ทุกลูกค้า' : placeholder)

  return (
    <div className={cn('relative', fullWidth ? 'block w-full' : 'inline-block', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors',
          fullWidth ? 'w-full' : 'min-w-[180px] max-w-[260px]',
          'focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
          themed && isActive
            ? 'bg-[#3DD8D8] border-[#3DD8D8] text-[#1B3A5C]'
            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300',
        )}
      >
        <span className="truncate flex-1 text-left">{triggerLabel}</span>
        {isActive && (
          <span
            role="button"
            tabIndex={0}
            aria-label="ล้างลูกค้าที่เลือก"
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
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute z-50 mt-1 left-0 w-[340px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
        >
          {/* Search */}
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onKey}
                placeholder="พิมพ์ชื่อ / รหัส / เลขประจำตัวผู้เสียภาษี"
                className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1 px-1">
              {options.length === 0
                ? 'ไม่พบลูกค้า'
                : <>↑↓ เลือก · Enter ยืนยัน · Esc ปิด · พบ <strong>{filteredList.length}</strong> รายการ</>}
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-[360px] overflow-y-auto">
            {options.map((opt, idx) => {
              const isFocused = idx === activeIdx
              const isSelected = opt.id === value
              if (opt.kind === 'all') {
                return (
                  <button
                    key="all"
                    data-opt-idx={idx}
                    onClick={() => pick('')}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-b border-slate-100',
                      isFocused ? 'bg-[#3DD8D8]/10' : 'hover:bg-slate-50',
                      isSelected && 'font-semibold text-[#1B3A5C]',
                    )}
                  >
                    {isSelected && <Check className="w-4 h-4 text-[#3DD8D8]" />}
                    <span className={cn(!isSelected && 'pl-6')}>ทุกลูกค้า</span>
                  </button>
                )
              }
              const c = opt.customer!
              const isRecent = opt.kind === 'recent'
              return (
                <button
                  key={`${opt.kind}-${c.id}`}
                  data-opt-idx={idx}
                  onClick={() => pick(c.id)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm border-b border-slate-50 flex items-start gap-2',
                    isFocused ? 'bg-[#3DD8D8]/10' : 'hover:bg-slate-50',
                  )}
                >
                  {isSelected ? (
                    <Check className="w-4 h-4 text-[#3DD8D8] mt-0.5 shrink-0" />
                  ) : isRecent ? (
                    <History className="w-3.5 h-3.5 text-amber-500 mt-1 shrink-0" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-semibold text-slate-800 truncate', isSelected && 'text-[#1B3A5C]')}>
                        {highlightText(c.shortName || c.name, search)}
                      </span>
                      {c.customerCode && (
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {highlightText(c.customerCode, search)}
                        </span>
                      )}
                    </div>
                    {c.shortName && c.name !== c.shortName && (
                      <div className="text-[11px] text-slate-500 truncate">
                        {highlightText(c.name, search)}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
