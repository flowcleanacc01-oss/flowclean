'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full'
  className?: string
  /** ใช้สำหรับ modal ที่ซ้อนกัน (confirm delete บน detail) */
  layer?: 'base' | 'overlay'
}

const SIZE_MAP = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  wide: 'w-[90vw] max-w-[1400px]',
  full: 'max-w-7xl',
}

export default function Modal({ open, onClose, title, children, size = 'md', className, layer = 'base' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)

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

  if (!open) return null

  // z-index สำหรับ modal ซ้อนกัน: overlay สูงกว่า base
  const zIndexClass = layer === 'overlay' ? 'z-[60]' : 'z-50'
  const backdropZIndex = layer === 'overlay' ? 'z-[59]' : 'z-40'

  return (
    <div className={cn("fixed inset-0 flex items-start justify-center pt-[10vh] px-4 animate-fadeIn", zIndexClass, className)}>
      <div className={cn("fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity", backdropZIndex)} onClick={onClose} />
      <div ref={ref} className={cn('relative bg-white rounded-2xl shadow-2xl w-full animate-slideIn border border-slate-200', SIZE_MAP[size])}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white rounded-t-2xl">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5 max-h-[85vh] overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
