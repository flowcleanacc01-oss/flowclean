'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full'
  className?: string
  /** 104: Close button label — 'close' (ปิด), 'saved' (บันทึกแล้ว), 'cancel' (ยกเลิก) */
  closeLabel?: 'close' | 'saved' | 'cancel'
}

const SIZE_MAP = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  wide: 'w-[90vw] max-w-[1400px]',
  full: 'max-w-7xl',
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function Modal({ open, onClose, title, children, size = 'md', className, closeLabel = 'close' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // F1: Focus management — capture opener, focus modal, restore on close
  useEffect(() => {
    if (!open) return
    openerRef.current = (document.activeElement as HTMLElement) || null
    const node = ref.current
    if (node) {
      // Focus first focusable element, otherwise the panel itself
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? node).focus()
    }
    return () => {
      const opener = openerRef.current
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus()
      }
    }
  }, [open])

  // F1: Focus trap — keep Tab cycling within the modal
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const node = ref.current
      if (!node) return
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (focusables.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !node.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div className={cn("fixed inset-0 z-50 flex items-start justify-center pt-[3vh] px-4 animate-fadeIn", className)}>
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative bg-white rounded-2xl shadow-xl w-full animate-slideIn max-h-[94vh] flex flex-col outline-none', SIZE_MAP[size])}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 flex-shrink-0">
          <h3 id={titleId} className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel === 'saved' ? 'ปิด (บันทึกแล้ว)' : closeLabel === 'cancel' ? 'ยกเลิก' : 'ปิด'}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span className={cn('text-xs font-medium',
              closeLabel === 'saved' ? 'text-emerald-500' : 'text-slate-400'
            )}>
              {closeLabel === 'saved' ? 'บันทึกแล้ว' : closeLabel === 'cancel' ? 'ยกเลิก' : 'ปิด'}
            </span>
            <X className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-4 overflow-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
