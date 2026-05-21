'use client'

/**
 * 321.2 — Schedule Manager
 *
 * Mount: /dashboard/customers → tab 'schedule'
 *
 * Overview ของลูกค้าทั้งหมด + schedule status
 * - Filter: ตั้งแล้ว / ยังไม่ตั้ง / ทั้งหมด
 * - Sort: ชื่อ, วันที่เริ่ม
 * - Quick edit (เปิด ScheduleSetupModal)
 * - Link ไป Schedule Audit ของลูกค้านั้น
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { cn, formatDate } from '@/lib/utils'
import { SCHEDULE_TYPE_CONFIG, WEEKDAY_SHORT } from '@/types'
import { Search, CalendarClock, Settings, ExternalLink, CheckCircle2, AlertCircle, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import ScheduleSetupModal from '@/components/ScheduleSetupModal'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { Customer } from '@/types'

type StatusFilter = 'all' | 'set' | 'unset'
type SortCol = 'name' | 'type' | 'startDate'
type SortDir = 'asc' | 'desc'

export default function ScheduleManager() {
  const { customers } = useStore()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editTarget, setEditTarget] = useState<Customer | null>(null)

  const activeCustomers = useMemo(
    () => customers.filter(c => c.isActive),
    [customers],
  )

  const stats = useMemo(() => {
    const set = activeCustomers.filter(c => c.scheduleType && c.scheduleType !== 'none').length
    return { set, unset: activeCustomers.length - set, total: activeCustomers.length }
  }, [activeCustomers])

  const filtered = useMemo(() => {
    let list = activeCustomers
    if (statusFilter === 'set') list = list.filter(c => c.scheduleType && c.scheduleType !== 'none')
    else if (statusFilter === 'unset') list = list.filter(c => !c.scheduleType || c.scheduleType === 'none')
    if (search.trim()) {
      list = list.filter(c => matchesThaiQueryAnyField([c.shortName, c.name, c.nameEn, c.customerCode], search))
    }
    return list.slice().sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'name': cmp = (a.shortName || a.name).localeCompare(b.shortName || b.name); break
        case 'type': cmp = (a.scheduleType || '').localeCompare(b.scheduleType || ''); break
        case 'startDate': cmp = (a.scheduleStartDate || '').localeCompare(b.scheduleStartDate || ''); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [activeCustomers, statusFilter, search, sortCol, sortDir])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <CalendarClock className="w-3.5 h-3.5" />Schedule Manager
        </div>
        <h2 className="text-xl font-bold">จัดการคิวส่งของลูกค้า</h2>
        <p className="text-sm opacity-90 mt-1">
          ดูทุกลูกค้าในที่เดียว · ตั้งค่า / แก้ไข schedule · ลิงค์ไป Schedule Audit
        </p>
      </div>

      {/* Stat cards + filter */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="ตั้งค่าแล้ว"
          value={stats.set}
          active={statusFilter === 'set'}
          color="emerald"
          onClick={() => setStatusFilter(statusFilter === 'set' ? 'all' : 'set')}
        />
        <StatCard
          label="ยังไม่ตั้ง"
          value={stats.unset}
          active={statusFilter === 'unset'}
          color="amber"
          onClick={() => setStatusFilter(statusFilter === 'unset' ? 'all' : 'unset')}
        />
        <StatCard
          label="ลูกค้าทั้งหมด"
          value={stats.total}
          active={statusFilter === 'all'}
          color="slate"
          onClick={() => setStatusFilter('all')}
        />
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาลูกค้า..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader col="name" label="ลูกค้า" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <SortHeader col="type" label="ประเภท" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">วันส่ง</th>
                <SortHeader col="startDate" label="เริ่ม" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">หมายเหตุ</th>
                <th className="text-center px-3 py-2.5 font-medium text-slate-600 text-xs w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">ไม่พบลูกค้าที่ตรงเงื่อนไข</td></tr>
              ) : (
                filtered.map(c => {
                  const isSet = c.scheduleType && c.scheduleType !== 'none'
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B3A5C] hover:underline">
                          {c.shortName || c.name}
                        </Link>
                        <div className="text-[10px] text-slate-500 truncate">{c.shortName ? c.name : c.customerCode}</div>
                      </td>
                      <td className="px-3 py-2">
                        {isSet ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="font-medium text-slate-700">{SCHEDULE_TYPE_CONFIG[c.scheduleType!].label}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <AlertCircle className="w-3 h-3" />ยังไม่ตั้ง
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {c.scheduleType === 'weekly' && c.scheduleDays && c.scheduleDays.length > 0 ? (
                          <div className="flex gap-1">
                            {c.scheduleDays.map(d => (
                              <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                                {WEEKDAY_SHORT[d]}
                              </span>
                            ))}
                          </div>
                        ) : c.scheduleType === 'daily' ? (
                          <span className="text-xs text-slate-500">ทุกวัน</span>
                        ) : (
                          <span className="text-slate-300 text-xs">−</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 font-mono">
                        {c.scheduleStartDate ? formatDate(c.scheduleStartDate) : <span className="text-slate-300">−</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate" title={c.scheduleNote || ''}>
                        {c.scheduleNote || <span className="text-slate-300">−</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditTarget(c)}
                            title={isSet ? 'แก้ไข' : 'ตั้งค่า'}
                            className="p-1.5 rounded text-[#1B3A5C] hover:bg-[#3DD8D8]/20 transition-colors"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                          {isSet && (
                            <Link
                              href={`/dashboard/reports?tab=scheduleaudit&customerId=${c.id}`}
                              title="ดู Schedule Audit"
                              className="p-1.5 rounded text-slate-400 hover:text-[#1B3A5C] hover:bg-slate-100 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100 bg-slate-50">
          แสดง {filtered.length} จาก {activeCustomers.length} ลูกค้า
        </div>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <ScheduleSetupModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          customer={editTarget}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, active, onClick, color }: {
  label: string
  value: number
  active: boolean
  onClick: () => void
  color: 'emerald' | 'amber' | 'slate'
}) {
  const MAP: Record<typeof color, { border: string; bg: string; activeBg: string; text: string }> = {
    emerald: { border: 'border-emerald-200', bg: 'bg-white', activeBg: 'bg-emerald-50', text: 'text-emerald-700' },
    amber:   { border: 'border-amber-200',   bg: 'bg-white', activeBg: 'bg-amber-50',   text: 'text-amber-700' },
    slate:   { border: 'border-slate-200',   bg: 'bg-white', activeBg: 'bg-slate-100',  text: 'text-slate-700' },
  }
  const c = MAP[color]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left transition-all hover:shadow-sm',
        active ? `${c.activeBg} ${c.border} shadow-sm ring-2 ring-[#3DD8D8]/30` : `${c.bg} ${c.border}`,
      )}
    >
      <div className={cn('text-xs font-semibold uppercase tracking-wide', c.text)}>{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value.toLocaleString()}</div>
    </button>
  )
}

function SortHeader({ col, label, sortCol, sortDir, onClick, className }: {
  col: SortCol
  label: string
  sortCol: SortCol
  sortDir: SortDir
  onClick: (c: SortCol) => void
  className?: string
}) {
  const active = sortCol === col
  return (
    <th className={cn('px-3 py-2.5 font-medium text-slate-600 text-xs cursor-pointer hover:bg-slate-100', className || 'text-left')}
        onClick={() => onClick(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
      </span>
    </th>
  )
}
