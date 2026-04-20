'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Building2, ClipboardList, Truck, FileCheck, Receipt, FileText } from 'lucide-react'
import { useStore } from '@/lib/store'
import { buildSearchIndex, searchResults, KIND_LABEL, KIND_COLOR, type SearchResultKind } from '@/lib/global-search'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

const KIND_ICON: Record<SearchResultKind, typeof Search> = {
  customer: Building2,
  lf: ClipboardList,
  sd: Truck,
  wb: FileCheck,
  iv: Receipt,
  qt: FileText,
}

/**
 * Global Search Modal (Feature A1) — Cmd+K / Ctrl+K
 *
 * Fuzzy search ข้ามเอกสารทั้งหมด (customer/LF/SD/WB/IV/QT)
 * Keyboard nav: ↑/↓ select, Enter open, Esc close
 */
export default function GlobalSearchModal({ open, onClose }: Props) {
  const router = useRouter()
  const {
    customers, linenForms, deliveryNotes,
    billingStatements, taxInvoices, quotations,
  } = useStore()

  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Build search index (memo)
  const index = useMemo(() => buildSearchIndex({
    customers, linenForms, deliveryNotes,
    billingStatements, taxInvoices, quotations,
  }), [customers, linenForms, deliveryNotes, billingStatements, taxInvoices, quotations])

  const results = useMemo(() => searchResults(index, query, 30), [index, query])

  // Clamp selected when results change
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(Math.max(0, results.length - 1))
  }, [results, selectedIdx])

  // Auto-scroll selected into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const openResult = (idx: number) => {
    const r = results[idx]
    if (!r) return
    onClose()
    router.push(r.href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openResult(selectedIdx)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-slideIn"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
            placeholder="ค้นหาลูกค้า, LF, SD, WB, IV, QT — เลขที่ / ชื่อ / วันที่"
            className="flex-1 text-base outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-block text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {query.trim() === '' ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p>พิมพ์เลขที่เอกสาร หรือชื่อลูกค้าเพื่อค้นหา</p>
              <p className="text-xs mt-1 text-slate-400">
                <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono mx-0.5">↑↓</kbd> เลือก
                <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono mx-0.5">↵</kbd> เปิด
                <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono mx-0.5">ESC</kbd> ปิด
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, i) => {
                const Icon = KIND_ICON[r.kind]
                const isSel = i === selectedIdx
                return (
                  <div
                    key={`${r.kind}-${r.id}`}
                    data-idx={i}
                    onClick={() => openResult(i)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                      isSel ? 'bg-slate-100' : 'hover:bg-slate-50',
                    )}
                  >
                    <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0', KIND_COLOR[r.kind])}>
                      {KIND_LABEL[r.kind]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{r.primary}</div>
                      <div className="text-xs text-slate-500 truncate">{r.secondary}</div>
                    </div>
                    {isSel && (
                      <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">↵</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between">
          <span>{query.trim() === '' ? `${index.length} รายการพร้อมค้นหา` : `${results.length} ผลลัพธ์`}</span>
          <span className="hidden sm:inline">
            <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono">⌘K</kbd> หรือ <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>
  )
}
