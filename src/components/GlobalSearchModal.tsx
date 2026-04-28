'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Building2, ClipboardList, Truck, FileCheck, Receipt, FileText, Package } from 'lucide-react'
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
  rc: Receipt, // 162/164
  qt: FileText,
  item: Package,
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
    billingStatements, taxInvoices, receipts, quotations, linenCatalog,
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
    billingStatements, taxInvoices, receipts, quotations, linenCatalog,
  }), [customers, linenForms, deliveryNotes, billingStatements, taxInvoices, receipts, quotations, linenCatalog])

  // 171.2: รับ unlimited results เพื่อ group ดู เห็นจำนวนจริงต่อ kind
  const results = useMemo(() => searchResults(index, query, 500), [index, query])

  // Group by kind (preserve relevance order within each group)
  const grouped = useMemo(() => {
    const order: SearchResultKind[] = ['item', 'customer', 'qt', 'sd', 'wb', 'iv', 'rc', 'lf']
    const groups = new Map<SearchResultKind, typeof results>()
    for (const k of order) groups.set(k, [])
    for (const r of results) {
      groups.get(r.kind)?.push(r)
    }
    return order
      .map(k => ({ kind: k, items: groups.get(k) || [] }))
      .filter(g => g.items.length > 0)
  }, [results])

  // Per-kind expanded state (default: collapsed = top 5)
  const [expandedKinds, setExpandedKinds] = useState<Set<SearchResultKind>>(new Set())
  useEffect(() => { setExpandedKinds(new Set()) }, [query])
  const toggleExpand = (k: SearchResultKind) => {
    setExpandedKinds(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }
  const TOP_PER_KIND = 5

  // Flat list (visible only) — for keyboard nav
  const flatVisible = useMemo(() => {
    const out: typeof results = []
    for (const g of grouped) {
      const cap = expandedKinds.has(g.kind) ? g.items.length : TOP_PER_KIND
      out.push(...g.items.slice(0, cap))
    }
    return out
  }, [grouped, expandedKinds])

  // 147.1: highlight tokens — case-insensitive substring → split text + wrap matches
  const tokens = useMemo(() => {
    return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  }, [query])

  const highlight = (text: string): React.ReactNode => {
    if (tokens.length === 0 || !text) return text
    const sorted = [...tokens].sort((a, b) => b.length - a.length)
    const pattern = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    if (!pattern) return text
    const splitRe = new RegExp(`(${pattern})`, 'gi')
    const tokenSet = new Set(sorted)
    return text.split(splitRe).map((p, i) =>
      tokenSet.has(p.toLowerCase())
        ? <mark key={i} className="bg-yellow-200 text-slate-900 rounded px-0.5">{p}</mark>
        : <span key={i}>{p}</span>
    )
  }

  // Clamp selected when visible list changes
  useEffect(() => {
    if (selectedIdx >= flatVisible.length) setSelectedIdx(Math.max(0, flatVisible.length - 1))
  }, [flatVisible, selectedIdx])

  // Auto-scroll selected into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const openResult = (idx: number) => {
    const r = flatVisible[idx]
    if (!r) return
    onClose()
    // 147.2: append ?q=<query> เพื่อให้ destination page highlight ได้
    const sep = r.href.includes('?') ? '&' : '?'
    const hrefWithQuery = query.trim()
      ? `${r.href}${sep}q=${encodeURIComponent(query.trim())}`
      : r.href
    router.push(hrefWithQuery)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(flatVisible.length - 1, i + 1))
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
            placeholder="ค้นหาลูกค้า, LF, SD, WB, IV, RC, QT, รายการ — เลขที่ / ชื่อ / รหัส / วันที่ / จำนวนเงิน"
            className="flex-1 text-base outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-block text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดค้นหา"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="ผลลัพธ์การค้นหา"
          className="flex-1 overflow-y-auto"
        >
          {query.trim() === '' ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p>พิมพ์เลขที่เอกสาร, ชื่อลูกค้า, รหัสสินค้า (เช่น H22) หรือชื่อรายการ (เช่น ปลอกหมอน)</p>
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
              {(() => {
                let runningIdx = 0
                return grouped.map(g => {
                  const expanded = expandedKinds.has(g.kind)
                  const cap = expanded ? g.items.length : TOP_PER_KIND
                  const visible = g.items.slice(0, cap)
                  const hidden = Math.max(0, g.items.length - cap)
                  return (
                    <div key={g.kind} className="mb-1">
                      {/* Group header */}
                      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50 border-y border-slate-100 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-mono px-1.5 py-0.5 rounded text-[10px]', KIND_COLOR[g.kind])}>
                            {KIND_LABEL[g.kind]}
                          </span>
                          <span className="text-slate-500">{g.items.length} รายการ</span>
                        </div>
                        {g.items.length > TOP_PER_KIND && (
                          <button
                            onClick={() => toggleExpand(g.kind)}
                            className="text-[10px] text-[#1B3A5C] hover:underline font-medium"
                          >
                            {expanded ? `ซ่อน (เหลือ ${TOP_PER_KIND})` : `ดูทั้งหมด (+${hidden})`}
                          </button>
                        )}
                      </div>
                      {/* Group items */}
                      {visible.map(r => {
                        const Icon = KIND_ICON[r.kind]
                        const myIdx = runningIdx++
                        const isSel = myIdx === selectedIdx
                        return (
                          <button
                            type="button"
                            key={`${r.kind}-${r.id}`}
                            data-idx={myIdx}
                            role="option"
                            aria-selected={isSel}
                            tabIndex={-1}
                            onClick={() => openResult(myIdx)}
                            onMouseEnter={() => setSelectedIdx(myIdx)}
                            className={cn(
                              'w-full text-left flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors',
                              isSel ? 'bg-slate-100' : 'hover:bg-slate-50',
                            )}
                          >
                            <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-800 truncate">{highlight(r.primary)}</div>
                              <div className="text-xs text-slate-500 truncate">{highlight(r.secondary)}</div>
                            </div>
                            {isSel && (
                              <span className="text-[10px] text-slate-400 font-mono flex-shrink-0" aria-hidden="true">↵</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between">
          <span>
            {query.trim() === ''
              ? `${index.length} รายการพร้อมค้นหา`
              : `${results.length} ผลลัพธ์ · ${flatVisible.length} แสดงอยู่`}
          </span>
          <span className="hidden sm:inline">
            <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono">⌘K</kbd> หรือ <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>
  )
}
