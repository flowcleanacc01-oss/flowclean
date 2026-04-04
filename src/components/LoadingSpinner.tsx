'use client'

import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

const SIZE_MAP = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
}

export default function LoadingSpinner({ size = 'md', className, text }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className={cn(
        'border-slate-300 border-t-[#3DD8D8] rounded-full animate-spin',
        SIZE_MAP[size]
      )} />
      {text && <p className="mt-3 text-sm text-slate-500">{text}</p>}
    </div>
  )
}

export function LoadingOverlay({ text = 'กำลังโหลด...' }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <LoadingSpinner size="lg" text={text} />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={`h-${i}`} className="h-4 bg-slate-200 rounded flex-1" style={{ maxWidth: `${100 / cols}%` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={`r-${rowIdx}`} className="flex gap-4 px-4 py-4 border-b border-slate-100">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div key={`c-${rowIdx}-${colIdx}`} className="h-4 bg-slate-100 rounded flex-1" style={{ maxWidth: `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-slate-200 p-6">
      <div className="h-6 bg-slate-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-slate-100 rounded" />
        <div className="h-4 bg-slate-100 rounded w-5/6" />
        <div className="h-4 bg-slate-100 rounded w-4/6" />
      </div>
    </div>
  )
}
