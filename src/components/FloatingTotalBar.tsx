'use client'

/**
 * 185 (revised) — Floating total bar
 *
 * แถบ "รวม X รายการ" ที่ลอยอยู่ที่ขอบล่างของ viewport
 * - position: fixed bottom-0
 * - กว้างเท่า main content (เคารพ sidebar collapse state)
 * - z-index ต่ำกว่า modal (z=20)
 * - body padding-bottom เพิ่มอัตโนมัติ ไม่บังเนื้อหาท้ายตาราง
 *
 * Usage:
 *   <FloatingTotalBar>
 *     <div>รวม {filtered.length} รายการ</div>
 *   </FloatingTotalBar>
 */
import { useEffect, type ReactNode } from 'react'
import { useSidebarCollapsed } from '@/lib/sidebar-state'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  /** Hide when no data */
  show?: boolean
  className?: string
}

const BAR_HEIGHT = 56

export default function FloatingTotalBar({ children, show = true, className }: Props) {
  const [collapsed] = useSidebarCollapsed()

  // Reserve space at bottom of body so the floating bar doesn't cover content
  useEffect(() => {
    if (!show) return
    const prev = document.body.style.paddingBottom
    document.body.style.paddingBottom = `${BAR_HEIGHT + 8}px`
    return () => { document.body.style.paddingBottom = prev }
  }, [show])

  if (!show) return null

  return (
    <div
      data-find-skip
      className={cn(
        'fixed bottom-0 right-0 z-20',
        'bg-slate-50 border-t-2 border-slate-300',
        'shadow-[0_-4px_8px_rgba(0,0,0,0.06)]',
        // pad to match dashboard layout: sidebar (lg:w-60 / collapsed lg:w-16) + content padding
        collapsed ? 'lg:left-16' : 'lg:left-60',
        'left-0',
        className,
      )}
      style={{ minHeight: BAR_HEIGHT }}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 text-sm font-semibold text-slate-700 flex items-center justify-between gap-4">
        {children}
      </div>
    </div>
  )
}
