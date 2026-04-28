'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import GlobalSearchModal from './GlobalSearchModal'
import NotificationBell from './NotificationBell'

/**
 * HeaderActions (Features A1 + C1 + 121)
 *
 * Inline top bar actions (no fixed positioning):
 * - Search (Cmd+K / Ctrl+K) → GlobalSearchModal
 * - Bell 🔔 → NotificationBell panel
 *
 * Rendered inside sticky top bar in dashboard/layout.tsx (Feature 121)
 */
export default function HeaderActions() {
  const [searchOpen, setSearchOpen] = useState(false)

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Search trigger */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="ค้นหา (Cmd+K / Ctrl+K)"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          title="ค้นหา (Cmd+K / Ctrl+K)"
          className="flex items-center gap-2 h-9 px-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-[#3DD8D8] hover:shadow-md transition-all text-slate-500 hover:text-[#1B3A5C]"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline text-xs">ค้นหา</span>
          <kbd className="hidden sm:inline-block text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded font-mono ml-1">⌘K</kbd>
        </button>

        {/* Bell */}
        <NotificationBell />
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
