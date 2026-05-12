'use client'

/**
 * 232.3 — Hover popover ที่ word-wrap + max-width ไม่ล้นจอ
 * ใช้แทน HTML title attribute ที่ Chrome จำกัด format ไม่ดี
 *
 * 259: render via React Portal + position: fixed
 *   - ก่อน: absolute positioning ใต้ trigger → ถูก parent overflow-hidden clip
 *     (เช่น <table> wrapper ใน SyncNamesTool ที่มี rounded-xl overflow-hidden)
 *   - หลัง: portal เข้า document.body → ไม่ติด clip hierarchy
 *   - + collision detection — flip บน/ล่าง + ดัน left ถ้าจะล้นขอบ viewport
 */
import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface Props {
  trigger: ReactNode
  content: ReactNode
  /** ตำแหน่งเริ่มต้น (default: 'bottom-end') — auto-flip ถ้าล้น viewport */
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  className?: string
  /** Class ของ popover panel */
  panelClassName?: string
  /** delay ms ก่อนแสดง */
  openDelay?: number
}

const POPOVER_MAX_WIDTH = 420
const POPOVER_MAX_HEIGHT_VH = 0.6
const VIEWPORT_PAD = 8

export default function HoverPopover({
  trigger, content, placement = 'bottom-end', className,
  panelClassName, openDelay = 100,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return null
    const rect = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const maxHeight = vh * POPOVER_MAX_HEIGHT_VH
    const gap = 4

    // Estimate panel width (real measurement happens after render, but provide reasonable default)
    const panelW = Math.min(POPOVER_MAX_WIDTH, vw - 2 * VIEWPORT_PAD)

    // Vertical: prefer placement direction, flip if not enough room
    const spaceBelow = vh - rect.bottom - VIEWPORT_PAD
    const spaceAbove = rect.top - VIEWPORT_PAD
    const preferBelow = placement.startsWith('bottom')
    const useBelow = preferBelow
      ? (spaceBelow >= 120 || spaceBelow >= spaceAbove)
      : (spaceAbove < 120 && spaceBelow > spaceAbove)
    const top = useBelow
      ? rect.bottom + gap
      : Math.max(VIEWPORT_PAD, rect.top - gap - Math.min(maxHeight, spaceAbove))

    // Horizontal: prefer end (right-aligned) vs start (left-aligned), clamp to viewport
    const preferEnd = placement.endsWith('end')
    let left = preferEnd
      ? rect.right - panelW
      : rect.left
    // Clamp
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
    if (left + panelW > vw - VIEWPORT_PAD) left = vw - panelW - VIEWPORT_PAD

    return { top, left, maxHeight }
  }, [placement])

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const p = computePosition()
      if (p) {
        setPos(p)
        setOpen(true)
      }
    }, openDelay)
  }
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOpen(false)
  }

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const p = computePosition()
      if (p) setPos(p)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, computePosition])

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('relative inline-block', className)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {trigger}
      </span>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, maxHeight: pos.maxHeight, zIndex: 9999 }}
          className={cn(
            'bg-slate-800 text-white text-xs rounded-lg shadow-xl',
            'min-w-[240px] max-w-[420px] overflow-y-auto',
            'whitespace-normal break-words border border-slate-700',
            '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded',
            panelClassName,
          )}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="px-3 py-2">{content}</div>
        </div>,
        document.body,
      )}
    </>
  )
}
