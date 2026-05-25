'use client'

/**
 * 321.1 — Aggregate Manager
 *
 * Mount: /dashboard/customers → tab 'aggregate'
 *
 * Overview ของลูกค้าที่ opt-in aggregate size groups + col2/col5 modes
 * - Filter: opt-in / not opt-in / ทั้งหมด · ตาม group
 * - Quick edit (เปิด AggregateGroupsModal)
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Search, Boxes, Settings, ExternalLink, AlertCircle, ArrowUpDown, ChevronUp, ChevronDown, Package } from 'lucide-react'
import AggregateGroupsModal from '@/components/AggregateGroupsModal'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { Customer, LinenItemDef } from '@/types'

type StatusFilter = 'all' | 'opted_in' | 'not_opted_in'
type SortCol = 'name' | 'groups'
type SortDir = 'asc' | 'desc'

export default function AggregateManager() {
  const { customers, linenCatalog } = useStore()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editTarget, setEditTarget] = useState<Customer | null>(null)

  const activeCustomers = useMemo(
    () => customers.filter(c => c.isActive),
    [customers],
  )

  // size groups ที่มีใน catalog
  const groupsInCatalog = useMemo(() => {
    const map = new Map<string, LinenItemDef[]>()
    for (const it of linenCatalog) {
      if (!it.sizeGroup) continue
      if (!map.has(it.sizeGroup)) map.set(it.sizeGroup, [])
      map.get(it.sizeGroup)!.push(it)
    }
    return Array.from(map.keys()).sort()
  }, [linenCatalog])

  const stats = useMemo(() => {
    const optedIn = activeCustomers.filter(c => (c.aggregateSizeGroups?.length ?? 0) > 0).length
    return { optedIn, notOptedIn: activeCustomers.length - optedIn, total: activeCustomers.length }
  }, [activeCustomers])

  const filtered = useMemo(() => {
    let list = activeCustomers
    if (statusFilter === 'opted_in') list = list.filter(c => (c.aggregateSizeGroups?.length ?? 0) > 0)
    else if (statusFilter === 'not_opted_in') list = list.filter(c => (c.aggregateSizeGroups?.length ?? 0) === 0)
    if (groupFilter !== 'all') {
      list = list.filter(c => c.aggregateSizeGroups?.some(g => g.groupKey === groupFilter))
    }
    if (search.trim()) {
      list = list.filter(c => matchesThaiQueryAnyField([c.shortName, c.name, c.nameEn, c.customerCode], search))
    }
    return list.slice().sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'name': cmp = (a.shortName || a.name).localeCompare(b.shortName || b.name); break
        case 'groups': cmp = (a.aggregateSizeGroups?.length ?? 0) - (b.aggregateSizeGroups?.length ?? 0); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [activeCustomers, statusFilter, groupFilter, search, sortCol, sortDir])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <Boxes className="w-3.5 h-3.5" />Aggregate Manager
        </div>
        <h2 className="text-xl font-bold">จัดการการนับรวมไซส์ (Size Groups)</h2>
        <p className="text-sm opacity-90 mt-1">
          ดูทุกลูกค้าในที่เดียว · ตั้งค่า / แก้ไข aggregate groups + col2/col5 modes
        </p>
      </div>

      {/* Stat cards + filter */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="opt-in แล้ว"
          value={stats.optedIn}
          active={statusFilter === 'opted_in'}
          color="indigo"
          onClick={() => setStatusFilter(statusFilter === 'opted_in' ? 'all' : 'opted_in')}
        />
        <StatCard
          label="ยังไม่ opt-in"
          value={stats.notOptedIn}
          active={statusFilter === 'not_opted_in'}
          color="amber"
          onClick={() => setStatusFilter(statusFilter === 'not_opted_in' ? 'all' : 'not_opted_in')}
        />
        <StatCard
          label="ลูกค้าทั้งหมด"
          value={stats.total}
          active={statusFilter === 'all'}
          color="slate"
          onClick={() => setStatusFilter('all')}
        />
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาลูกค้า..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8]"
          />
        </div>
        {groupsInCatalog.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500">Group:</span>
            <button
              type="button"
              onClick={() => setGroupFilter('all')}
              className={cn(
                'px-2 py-1 rounded text-xs font-medium border transition-colors',
                groupFilter === 'all'
                  ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
              )}
            >
              ทั้งหมด
            </button>
            {groupsInCatalog.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupFilter(groupFilter === g ? 'all' : g)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-mono font-medium border transition-colors',
                  groupFilter === g
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-700 border-indigo-200 hover:border-indigo-400',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader col="name" label="ลูกค้า" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <SortHeader col="groups" label="Groups opted-in" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Config (col2 / col5)</th>
                <th className="text-center px-3 py-2.5 font-medium text-slate-600 text-xs w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-400">ไม่พบลูกค้าที่ตรงเงื่อนไข</td></tr>
              ) : (
                filtered.map(c => {
                  const groups = c.aggregateSizeGroups ?? []
                  const hasGroups = groups.length > 0
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B3A5C] hover:underline">
                          {c.shortName || c.name}
                        </Link>
                        <div className="text-[10px] text-slate-500 truncate">{c.shortName ? c.name : c.customerCode}</div>
                      </td>
                      <td className="px-3 py-2">
                        {hasGroups ? (
                          <div className="flex flex-wrap gap-1">
                            {groups.map(g => (
                              <span key={g.groupKey} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                <Package className="w-2.5 h-2.5" />{g.groupKey}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <AlertCircle className="w-3 h-3" />ยังไม่ opt-in
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {hasGroups ? (
                          <div className="space-y-1">
                            {groups.map(g => {
                              const col5Mode = g.col5Mode ?? 'aggregate'
                              return (
                                <div key={g.groupKey} className="flex items-center gap-1.5 text-[10px]">
                                  <span className="font-mono text-slate-500 w-20 truncate">{g.groupKey}</span>
                                  <span
                                    title="col2 — ลูกค้าส่งซัก"
                                    className={cn(
                                      'px-1.5 py-0.5 rounded font-medium',
                                      g.col2Mode === 'aggregate' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                                    )}>
                                    {g.col2Mode === 'aggregate' ? '🧺' : '📋'} col2
                                  </span>
                                  <span
                                    title="col5 — โรงซักนับเข้า"
                                    className={cn(
                                      'px-1.5 py-0.5 rounded font-medium',
                                      col5Mode === 'aggregate' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
                                    )}>
                                    {col5Mode === 'aggregate' ? '🧺' : '📋'} col5
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">−</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditTarget(c)}
                            title={hasGroups ? 'แก้ไข' : 'ตั้งค่า'}
                            className="p-1.5 rounded text-[#1B3A5C] hover:bg-[#3DD8D8]/20 transition-colors"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                          {hasGroups && (
                            <Link
                              href={`/dashboard/reports?tab=carryover&customerId=${c.id}`}
                              title="ดูผ้าค้าง by-group"
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
          แสดง {filtered.length} จาก {activeCustomers.length} ลูกค้า · {groupsInCatalog.length} groups ใน catalog
        </div>
      </div>

      {groupsInCatalog.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 mb-1">ยังไม่มี size group ใน catalog</p>
              <p className="text-xs text-amber-700">
                ไปตั้ง size group ก่อน — <Link href="/dashboard/items?tab=items" className="font-medium underline hover:text-amber-900">หน้ารายการผ้า</Link> → คอลัมน์ 📦 Group
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <AggregateGroupsModal
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
  color: 'indigo' | 'amber' | 'slate'
}) {
  const MAP: Record<typeof color, { border: string; bg: string; activeBg: string; text: string }> = {
    indigo: { border: 'border-indigo-200', bg: 'bg-white', activeBg: 'bg-indigo-50', text: 'text-indigo-700' },
    amber:  { border: 'border-amber-200',  bg: 'bg-white', activeBg: 'bg-amber-50',  text: 'text-amber-700' },
    slate:  { border: 'border-slate-200',  bg: 'bg-white', activeBg: 'bg-slate-100', text: 'text-slate-700' },
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
