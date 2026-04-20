'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import GlobalSearchModal from './GlobalSearchModal'
import NotificationBell from './NotificationBell'

/**
 * HeaderActions (Features A1 + C1)
 *
 * Floating top-right bar ที่มี:
 * - Search (Cmd+K / Ctrl+K) → GlobalSearchModal
 * - Bell 🔔 → NotificationBell panel
 *
 * Mounted ใน dashboard/layout.tsx
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
      <div className="fixed top-3 right-3 lg:top-4 lg:right-4 z-40 flex items-center gap-2">
        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 h-9 px-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-[#3DD8D8] hover:shadow-md transition-all text-slate-500 hover:text-[#1B3A5C]"
          title="ค้นหา (Cmd+K / Ctrl+K)"
        >
          <Search className="w-4 h-4" />
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
