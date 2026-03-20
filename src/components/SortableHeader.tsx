'use client'

import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'

interface SortableHeaderProps {
  label: string
  sortKey: string
  currentSortKey: string
  currentSortDir: 'asc' | 'desc'
  onSort: (key: string) => void
  className?: string
}

export default function SortableHeader({
  label, sortKey, currentSortKey, currentSortDir, onSort, className,
}: SortableHeaderProps) {
  const isActive = currentSortKey === sortKey

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-4 py-3 font-medium cursor-pointer select-none transition-colors',
        isActive
          ? 'bg-[#1B3A5C]/10 text-[#1B3A5C] hover:bg-[#1B3A5C]/15'
          : 'text-slate-600 hover:bg-slate-100',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentSortDir === 'asc'
            ? <ChevronUp className="w-3.5 h-3.5 text-[#1B3A5C]" />
            : <ChevronDown className="w-3.5 h-3.5 text-[#1B3A5C]" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-300" />
        )}
      </span>
    </th>
  )
}
