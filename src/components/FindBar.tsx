'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronUp, ChevronDown, X, Search } from 'lucide-react'
import { useFindMatches } from '@/lib/use-find'
import { cn } from '@/lib/utils'

/**
 * 175.1 — In-page Find bar (Slack/GitHub style)
 *
 * Triggers:
 *   - "/" key opens bar (skipped while typing in input/textarea/contenteditable)
 *   - Cmd+K result that lands on the same page also opens bar via ?q=
 *   - URL ?q= populates the search box; bar opens automatically when q is non-empty
 *
 * Keys (when bar is open):
 *   Enter       → next
 *   Shift+Enter → prev
 *   Escape      → close bar (and clear ?q=)
 */
export default function FindBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') || ''

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(urlQ)
  const inputRef = useRef<HTMLInputElement>(null)

  const { index, total, next, prev } = useFindMatches(open && query.trim().length > 0)

  // Sync from URL → if ?q= is present, open the bar with that query
  useEffect(() => {
    if (urlQ.trim()) {
      setQuery(urlQ)
      setOpen(true)
      // focus input on next tick so user can keep typing
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [urlQ])

  // "/" global shortcut to open bar (ignore when typing in form fields)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return
      const t = e.target as HTMLElement | null
      if (!t) return
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (t.isContentEditable) return
      e.preventDefault()
      setOpen(true)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Push query → URL ?q= (so other components like useScrollToMark + highlight react)
  const pushQuery = (q: string) => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    if (q) sp.set('q', q)
    else sp.delete('q')
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  // Debounce URL update so typing isn't laggy
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (query !== urlQ) pushQuery(query)
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])

  const close = () => {
    setOpen(false)
    setQuery('')
    pushQuery('')
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prev()
      else next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      prev()
    }
  }

  if (!open) return null

  const noMatch = query.trim().length > 0 && total === 0

  return (
    <div
      data-find-skip
      className="fixed top-3 right-4 z-[55] bg-white rounded-xl shadow-2xl border border-slate-200 flex items-center gap-1 pl-3 pr-1 py-1.5 animate-fadeIn"
      role="search"
      aria-label="ค้นหาในหน้านี้"
    >
      <Search className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        placeholder="ค้นหาในหน้านี้"
        aria-label="ค้นหาในหน้านี้"
        className={cn(
          'w-44 sm:w-56 text-sm outline-none px-1 py-1 bg-transparent',
          noMatch && 'text-red-600',
        )}
      />
      <span
        className={cn(
          'text-[11px] font-mono px-1.5 py-0.5 rounded min-w-[3.5rem] text-center select-none',
          noMatch ? 'bg-red-50 text-red-600' :
          total === 0 ? 'text-slate-300' : 'bg-slate-100 text-slate-600',
        )}
        aria-live="polite"
      >
        {query.trim().length === 0 ? '0 / 0' : noMatch ? 'ไม่พบ' : `${index + 1} / ${total}`}
      </span>
      <button
        type="button"
        onClick={prev}
        disabled={total === 0}
        aria-label="ก่อนหน้า"
        title="ก่อนหน้า (Shift+Enter)"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-[#1B3A5C] hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronUp className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={next}
        disabled={total === 0}
        aria-label="ถัดไป"
        title="ถัดไป (Enter)"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-[#1B3A5C] hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="ปิดค้นหาในหน้านี้"
        title="ปิด (Esc)"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
}
