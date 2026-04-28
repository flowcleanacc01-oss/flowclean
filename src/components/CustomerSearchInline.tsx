'use client'

/**
 * 185.2.1 / 185.2.2 — Inline customer search
 *
 * ช่อง search ค้นหาลูกค้า (ชื่อ/รหัส/เลขประจำตัวผู้เสียภาษี) ที่ใช้ใน:
 *   - หน้า list (เพิ่ม filter เร็ว)
 *   - หน้า customer detail (เปลี่ยนลูกค้าโดยไม่ต้องปิด/เปิด)
 *
 * Behavior: dropdown เปิดเมื่อพิมพ์ → คลิกเลือก → router.push ไปหน้านั้น
 * ใช้ portal เพื่อ escape clipping context
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, X, Building2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { highlightText } from '@/lib/highlight'
import { cn } from '@/lib/utils'

interface Props {
  /** กำหนดเส้นทางเมื่อคลิก: 'detail' = ไป /dashboard/customers/[id], 'filter' = onSelect callback */
  mode?: 'detail' | 'filter'
  /** เมื่อ mode='filter' — รับค่าที่เลือก */
  onSelect?: (id: string) => void
  /** Initial value (ถ้าใช้แบบ controlled filter) */
  value?: string
  placeholder?: string
  /** Highlight ลูกค้าปัจจุบัน (ใช้ในหน้า detail) */
  currentCustomerId?: string
  className?: string
}

export default function CustomerSearchInline({
  mode = 'detail',
  onSelect,
  value = '',
  placeholder = 'ค้นหาลูกค้า — ชื่อ / รหัส / เลขประจำตัวผู้เสียภาษี',
  currentCustomerId,
  className,
}: Props) {
  const router = useRouter()
  const { customers } = useStore()
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const baseList = useMemo(() => customers.filter(c => c.isActive), [customers])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return baseList.slice(0, 50) // show first 50 by default when focused
    const tokens = q.split(/\s+/).filter(Boolean)
    return baseList.filter(c => {
      const haystack = [c.customerCode, c.shortName, c.name, c.nameEn, c.taxId]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => haystack.includes(t))
    }).slice(0, 100)
  }, [baseList, query])

  // Position portal panel just under the input
  const [pos, setPos] = useState({ top: 0, left: 0, width: 360 })
  useEffect(() => {
    if (!open) return
    const update = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 360) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, query])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset active idx when query/results change
  useEffect(() => { setActiveIdx(0) }, [query])

  const pick = (id: string) => {
    if (mode === 'detail') {
      router.push(`/dashboard/customers/${id}`)
    } else {
      onSelect?.(id)
    }
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[activeIdx]
      if (r) pick(r.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={cn('relative w-full max-w-md', className)}>
      <div className={cn(
        'flex items-center gap-2 h-10 px-3 bg-white border rounded-lg transition-colors',
        open ? 'border-[#3DD8D8] ring-1 ring-[#3DD8D8]' : 'border-slate-200 hover:border-slate-300',
      )}>
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label="ค้นหาลูกค้า"
          className="flex-1 outline-none text-sm placeholder:text-slate-400 bg-transparent"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            aria-label="ล้างคำค้น"
            className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          data-find-skip
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: 420 }}
          className="z-[70] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] text-slate-500">
            {results.length === 0
              ? 'ไม่พบลูกค้า'
              : <>↑↓ เลือก · Enter เปิด · Esc ปิด · พบ <strong>{results.length}</strong> ราย{baseList.length > results.length && query.trim() === '' && ' (แสดง 50 รายแรก พิมพ์เพื่อค้นหา)'}</>}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {results.map((c, idx) => {
              const isActive = idx === activeIdx
              const isCurrent = c.id === currentCustomerId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm border-b border-slate-50 flex items-center gap-2',
                    isActive ? 'bg-[#3DD8D8]/10' : 'hover:bg-slate-50',
                    isCurrent && 'font-semibold text-[#1B3A5C]',
                  )}
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{highlightText(c.shortName || c.name, query)}</span>
                      {c.customerCode && (
                        <span className="text-[10px] font-mono text-slate-400">{highlightText(c.customerCode, query)}</span>
                      )}
                      {isCurrent && <span className="text-[10px] px-1.5 py-0.5 bg-[#3DD8D8]/20 text-[#1B3A5C] rounded ml-auto">กำลังดูอยู่</span>}
                    </div>
                    {(c.shortName ? c.name : c.nameEn) && (
                      <div className="text-[11px] text-slate-500 truncate">{highlightText(c.shortName ? c.name : (c.nameEn || ''), query)}</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
