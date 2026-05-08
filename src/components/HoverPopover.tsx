'use client'

/**
 * 232.3 — Hover popover ที่ word-wrap + max-width ไม่ล้นจอ
 * ใช้แทน HTML title attribute ที่ Chrome จำกัด format ไม่ดี
 */
import { useState, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  trigger: ReactNode
  content: ReactNode
  /** ตำแหน่งเทียบ trigger (default: 'bottom-end') */
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  className?: string
  /** Class ของ popover panel */
  panelClassName?: string
  /** delay ms ก่อนแสดง */
  openDelay?: number
}

export default function HoverPopover({
  trigger, content, placement = 'bottom-end', className,
  panelClassName, openDelay = 100,
}: Props) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), openDelay)
  }
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOpen(false)
  }

  const positionClasses = {
    'bottom-start': 'top-full left-0 mt-1',
    'bottom-end':   'top-full right-0 mt-1',
    'top-start':    'bottom-full left-0 mb-1',
    'top-end':      'bottom-full right-0 mb-1',
  }[placement]

  return (
    <span
      className={cn('relative inline-block', className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {trigger}
      {open && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50 bg-slate-800 text-white text-xs rounded-lg shadow-xl px-3 py-2',
            'min-w-[220px] max-w-[360px] whitespace-normal break-words',
            'border border-slate-700',
            positionClasses,
            panelClassName,
          )}
        >
          {content}
        </div>
      )}
    </span>
  )
}
