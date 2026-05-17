'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { Search, X, Building2, ClipboardList, Truck, FileCheck, Receipt, FileText, Package } from 'lucide-react'
import { useStore } from '@/lib/store'
import { buildSearchIndex, searchResults, KIND_LABEL, KIND_COLOR, type SearchResultKind } from '@/lib/global-search'
import { findMatchRanges } from '@/lib/thai-search'
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
  const pathname = usePathname()
  const {
    customers, linenForms, deliveryNotes,
    billingStatements, taxInvoices, receipts, quotations, linenCatalog,
  } = useStore()

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('') // 248.2: debounce expensive search
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // 248.2: debounce query → searchResults runs over ~9000+ entries × Lev fuzzy,
  // 250: ปรับเป็น 150ms (เดิม 100ms) — most typists won't notice, big perf win.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(t)
  }, [query])

  // 250.1: useDeferredValue lets React deprioritize the (expensive) search
  // when input/UI updates are pending — keeps typing smooth even if search is slow.
  const deferredQuery = useDeferredValue(debouncedQuery)

  // Build search index (memo)
  const index = useMemo(() => buildSearchIndex({
    customers, linenForms, deliveryNotes,
    billingStatements, taxInvoices, receipts, quotations, linenCatalog,
  }), [customers, linenForms, deliveryNotes, billingStatements, taxInvoices, receipts, quotations, linenCatalog])

  // 171.2: รับ unlimited results เพื่อ group ดู เห็นจำนวนจริงต่อ kind
  // 248.2 + 250.1: use deferredQuery — React defers search when UI is busy
  const results = useMemo(() => searchResults(index, deferredQuery, 500), [index, deferredQuery])

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

  // 147.1 → 248: phonetic-aware highlight — show WHY each result matched
  // Use findMatchRanges() which handles direct + phonetic + simple split
  const tokens = useMemo(() => {
    return deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
  }, [deferredQuery])

  // 250.2: cache highlight results per (tokens, text) — avoids recomputing on
  // every re-render (hover sets selectedIdx → all 40 buttons re-render).
  // Cache resets when tokens change.
  const highlightCache = useMemo(() => new Map<string, React.ReactNode>(), [tokens])

  const highlight = (text: string): React.ReactNode => {
    if (tokens.length === 0 || !text) return text
    const cached = highlightCache.get(text)
    if (cached !== undefined) return cached
    // Collect ranges from all tokens
    const allRanges: Array<[number, number]> = []
    for (const t of tokens) {
      const r = findMatchRanges(text, t)
      if (r.length > 0) allRanges.push(...r)
    }
    if (allRanges.length === 0) {
      highlightCache.set(text, text)
      return text
    }
    // Merge overlapping ranges, then render
    const sorted = allRanges.sort((a, b) => a[0] - b[0])
    const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]]
    for (let i = 1; i < sorted.length; i++) {
      const [s, e] = sorted[i]
      const last = merged[merged.length - 1]
      if (s <= last[1]) last[1] = Math.max(last[1], e)
      else merged.push([s, e])
    }
    const parts: React.ReactNode[] = []
    let pos = 0
    merged.forEach(([s, e], i) => {
      if (s > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, s)}</span>)
      parts.push(<mark key={`m${i}`} className="bg-yellow-200 text-slate-900 rounded px-0.5">{text.slice(s, e)}</mark>)
      pos = e
    })
    if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>)
    highlightCache.set(text, parts)
    return parts
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
    const trimmed = query.trim()
    const hrefWithQuery = trimmed
      ? `${r.href}${sep}q=${encodeURIComponent(trimmed)}`
      : r.href
    // 175.1 — ถ้าผลลัพธ์อยู่หน้าเดียวกัน ใช้ replace เพื่อให้ FindBar เปิดอัตโนมัติ
    // โดยไม่ navigate ใหม่ (กัน loading flicker + รักษา scroll position)
    const targetPath = r.href.split('?')[0]
    if (targetPath === pathname) {
      router.replace(hrefWithQuery, { scroll: false })
    } else {
      router.push(hrefWithQuery)
    }
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

  // 275.1: SSR guard + portal — consistent with Modal post-Fix 271
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!open || !mounted) return null

  return createPortal(
    <div data-find-skip className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4 animate-fadeIn">
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
          {deferredQuery.trim() === '' ? (
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
              ไม่พบผลลัพธ์สำหรับ &quot;{deferredQuery}&quot;
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
            {deferredQuery.trim() === ''
              ? `${index.length} รายการพร้อมค้นหา`
              : `${results.length} ผลลัพธ์ · ${flatVisible.length} แสดงอยู่`}
          </span>
          <span className="hidden sm:inline">
            <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono">⌘K</kbd> หรือ <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
