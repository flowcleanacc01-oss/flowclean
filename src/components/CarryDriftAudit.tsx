'use client'

/**
 * Phase A.3 — Carry-over Drift Detector UI
 * Per-customer scan: cumulative balance + discrepancy rate + mode spread
 * Mount: /dashboard/reports?tab=driftaudit
 */
import { useState, useMemo, useEffect } from 'react'
import {
  useCarryDriftAudit,
  CARRY_DRIFT_REASON_CONFIG,
  CARRY_DRIFT_SEVERITY_RANK,
  type CarryDriftFilters,
  type CarryDriftSeverity,
  type CarryDriftReason,
} from '@/lib/use-carry-drift-audit'
import { useStore } from '@/lib/store'
import { exportCSV } from '@/lib/export'
import { cn, startOfMonthISO, endOfMonthISO, formatExportFilename, formatDate } from '@/lib/utils'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import Modal from '@/components/Modal'
import { groupCarryOver, customerUsesAggregateGroups } from '@/lib/carry-over-groups'
import {
  Search, AlertTriangle, AlertOctagon, CheckCircle2, FileSpreadsheet,
  ShieldCheck, Eye, ArrowUpDown, ChevronDown, ChevronUp, ExternalLink,
  Package, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import type { CarryOverMode } from '@/types'

interface DrillDownTarget {
  customerId: string
  customerShortName: string
  customerName: string
  workflowMode: string
  lfCount: number
  type1Count: number
  type2Count: number
  discrepancyRatio: number
  cumulativeBalance: number
  modeBalances: { 1: number; 2: number; 3: number; 4: number }
  modeSpread: number
}

type SortCol = 'severity' | 'customer' | 'lfCount' | 'discPct' | 'balance' | 'spread'
type SortDir = 'asc' | 'desc'

export default function CarryDriftAudit() {
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())

  const [customerId, setCustomerId] = useState<string>('all')
  const [severity, setSeverity] = useState<'all' | CarryDriftSeverity>('all')
  const [reason, setReason] = useState<'all' | CarryDriftReason>('all')
  const [showOk, setShowOk] = useState(false)
  const [search, setSearch] = useState('')

  const [sortCol, setSortCol] = useState<SortCol>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  // 315.D: Drill-down modal — เปิดเมื่อคลิกตัวเลข "ค้างรวม"
  const [drillDown, setDrillDown] = useState<DrillDownTarget | null>(null)

  const INITIAL_VISIBLE = 200
  const LOAD_MORE_STEP = 200
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  useEffect(() => { setVisibleCount(INITIAL_VISIBLE) }, [
    dateFrom, dateTo, customerId, severity, reason, showOk, search, sortCol, sortDir,
  ])

  const filters: CarryDriftFilters = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    customerId, severity, reason, showOk, search,
  }), [dateFrom, dateTo, customerId, severity, reason, showOk, search])

  const { rows, stats } = useCarryDriftAudit(filters)

  const sortedRows = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'severity':
          cmp = CARRY_DRIFT_SEVERITY_RANK[a.severity] - CARRY_DRIFT_SEVERITY_RANK[b.severity]
          if (cmp === 0) cmp = b.cumulativeBalance - a.cumulativeBalance
          break
        case 'customer': cmp = a.customerShortName.localeCompare(b.customerShortName); break
        case 'lfCount': cmp = a.lfCount - b.lfCount; break
        case 'discPct': cmp = a.discrepancyRatio - b.discrepancyRatio; break
        case 'balance': cmp = a.cumulativeBalance - b.cumulativeBalance; break
        case 'spread': cmp = a.modeSpread - b.modeSpread; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [rows, sortCol, sortDir])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'severity' ? 'asc' : 'desc') }
  }

  const clearDateFilter = () => { setDateFrom(''); setDateTo('') }

  const handleExportCSV = () => {
    if (sortedRows.length === 0) return
    const headers = ['Severity', 'ลูกค้า', 'Workflow', 'LF Count', 'Type1', 'Type2', 'Disc Ratio %', 'Cumulative Balance', 'Mode Spread', 'Issues']
    const data = sortedRows.map(r => [
      r.severity, r.customerShortName, r.workflowMode,
      String(r.lfCount), String(r.type1Count), String(r.type2Count),
      (r.discrepancyRatio * 100).toFixed(1),
      String(r.cumulativeBalance), String(r.modeSpread),
      r.issues.map(i => `[${CARRY_DRIFT_REASON_CONFIG[i.reason].label}] ${i.detail}`).join(' · '),
    ])
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'all')
    exportCSV(headers, data, formatExportFilename('CarryDrift', '', range))
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Carry-over Drift Detector
        </div>
        <h2 className="text-xl font-bold">ตรวจ stock balance + discrepancy rate per customer</h2>
        <p className="text-sm opacity-90 mt-1">
          เครื่องมือ <span className="font-semibold">monitor only</span> — ตรวจสต๊อกค้าง · LF นับไม่ตรง · 4 modes spread — ไม่แก้ไขข้อมูล
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <DateFilter
          dateFrom={dateFrom} dateTo={dateTo}
          mode={dateFilterMode} onModeChange={setDateFilterMode}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          onClear={clearDateFilter}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={<AlertOctagon className="w-4 h-4" />} label="Critical" value={stats.critical} color="red"
          active={severity === 'critical'}
          onClick={() => {
            if (severity === 'critical') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('critical'); setReason('all'); setShowOk(false) }
          }}
          sub="ค้างมาก/นับผิดเยอะ" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="High" value={stats.high} color="orange"
          active={severity === 'high'}
          onClick={() => {
            if (severity === 'high') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('high'); setReason('all'); setShowOk(false) }
          }}
          sub="ติดตาม" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Warning" value={stats.warning} color="amber"
          active={severity === 'warning'}
          onClick={() => {
            if (severity === 'warning') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('warning'); setReason('all'); setShowOk(false) }
          }}
          sub="ตรวจดู" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="OK" value={stats.ok} color="emerald"
          active={severity === 'info'}
          onClick={() => {
            if (severity === 'info') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('info'); setReason('all'); setShowOk(true) }
          }}
          sub="workflow ปกติ" />
        <StatCard icon={<Eye className="w-4 h-4" />} label="ตรวจแล้ว" value={stats.total} color="slate"
          active={severity === 'all' && reason === 'all' && showOk}
          onClick={() => { setSeverity('all'); setReason('all'); setShowOk(true) }}
          sub={`${stats.total} ลูกค้า`} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-medium text-slate-500 mb-2">Issues by reason — คลิกเพื่อกรอง:</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(stats.byReason) as [CarryDriftReason, number][]).map(([r, count]) => {
            const cfg = CARRY_DRIFT_REASON_CONFIG[r]
            const colorMap: Record<string, string> = {
              red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
              orange: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
              amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
            }
            const active = reason === r
            return (
              <button key={r} onClick={() => setReason(active ? 'all' : r)} disabled={count === 0}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all',
                  colorMap[cfg.color] || 'bg-slate-50 text-slate-700 border-slate-200',
                  active && 'ring-2 ring-[#3DD8D8]/40 border-[#1B3A5C]',
                  count === 0 && 'opacity-40',
                )}>
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span className="ml-1 font-mono font-bold">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาลูกค้า"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-56" />
          </div>
          <div className="min-w-[180px]">
            <CustomerPicker value={customerId === 'all' ? '' : customerId}
              onChange={(id) => setCustomerId(id || 'all')} allowAll />
          </div>
        </div>
        <button onClick={handleExportCSV} disabled={sortedRows.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader col="severity" label="Severity" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="customer" label="ลูกค้า" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">Workflow</th>
                <SortHeader col="lfCount" label="LF" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <SortHeader col="discPct" label="นับไม่ตรง %" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <SortHeader col="balance" label="ค้างรวม" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <SortHeader col="spread" label="Mode Spread" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Issues</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">ไม่พบลูกค้าที่ตรงเงื่อนไข</td></tr>
              ) : sortedRows.slice(0, visibleCount).map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2"><SeverityBadge severity={r.severity} /></td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.customerShortName}</div>
                    <div className="text-xs text-slate-500 truncate">{r.customerName}</div>
                  </td>
                  <td className="px-2 py-2 text-center text-[10px] text-slate-500">
                    {r.workflowMode === 'trust_customer' ? 'Trust' : 'Cross-check'}
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-slate-600 font-mono">{r.lfCount}</td>
                  <td className="px-2 py-2 text-right text-xs font-mono">
                    <span className={cn(r.discrepancyRatio > 0.3 ? 'text-red-600' : r.discrepancyRatio > 0.1 ? 'text-orange-600' : 'text-slate-500')}>
                      {(r.discrepancyRatio * 100).toFixed(1)}%
                    </span>
                    <div className="text-[10px] text-slate-400">T1:{r.type1Count} T2:{r.type2Count}</div>
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setDrillDown({
                        customerId: r.customerId,
                        customerShortName: r.customerShortName,
                        customerName: r.customerName,
                        workflowMode: r.workflowMode,
                        lfCount: r.lfCount,
                        type1Count: r.type1Count,
                        type2Count: r.type2Count,
                        discrepancyRatio: r.discrepancyRatio,
                        cumulativeBalance: r.cumulativeBalance,
                        modeBalances: r.modeBalances,
                        modeSpread: r.modeSpread,
                      })}
                      title="ดู breakdown code-by-code"
                      className={cn(
                        'inline-flex items-center gap-1 hover:underline cursor-pointer',
                        r.cumulativeBalance > 500 ? 'text-red-600 font-bold' : r.cumulativeBalance > 200 ? 'text-orange-600' : 'text-slate-700',
                      )}
                    >
                      {r.cumulativeBalance.toLocaleString()}
                      <BarChart3 className="w-3 h-3 opacity-60" />
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setDrillDown({
                        customerId: r.customerId,
                        customerShortName: r.customerShortName,
                        customerName: r.customerName,
                        workflowMode: r.workflowMode,
                        lfCount: r.lfCount,
                        type1Count: r.type1Count,
                        type2Count: r.type2Count,
                        discrepancyRatio: r.discrepancyRatio,
                        cumulativeBalance: r.cumulativeBalance,
                        modeBalances: r.modeBalances,
                        modeSpread: r.modeSpread,
                      })}
                      title="ดู 4-mode breakdown"
                      className="text-slate-600 hover:underline cursor-pointer"
                    >
                      {r.modeSpread.toLocaleString()}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {r.issues.length === 0 ? (
                      <span className="text-xs text-emerald-600">✓ ปกติ</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.issues.map((i, idx) => {
                          const cfg = CARRY_DRIFT_REASON_CONFIG[i.reason]
                          const colorMap: Record<string, string> = {
                            red: 'bg-red-50 text-red-700 border-red-200',
                            orange: 'bg-orange-50 text-orange-700 border-orange-200',
                            amber: 'bg-amber-50 text-amber-700 border-amber-200',
                          }
                          return (
                            <span key={idx} title={i.detail}
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                colorMap[cfg.color] || 'bg-slate-50 text-slate-700 border-slate-200',
                              )}>
                              {cfg.icon} {cfg.label}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedRows.length > visibleCount && (
          <button type="button"
            onClick={() => setVisibleCount(c => c + LOAD_MORE_STEP)}
            className="w-full px-3 py-2.5 text-xs text-[#1B3A5C] bg-slate-50 hover:bg-slate-100 border-t border-slate-200 font-medium">
            ↓ แสดงเพิ่ม {Math.min(LOAD_MORE_STEP, sortedRows.length - visibleCount)} ราย
            <span className="text-slate-400 ml-2">(เหลือ {sortedRows.length - visibleCount} ราย)</span>
          </button>
        )}
      </div>

      <div className="text-xs text-slate-400 italic mt-2 px-2">
        <strong>read-only</strong> — ใช้ตรวจหลัง trust-mode migration หรือ batch ขนาดใหญ่.
        <br />Mode Spread = max-min ของ 4 modes (ถ้า spread เกิน 50 = workflow config ไม่ตรงกัน)
      </div>

      <FloatingTotalBar show={sortedRows.length > 0}>
        <span>
          แสดง <strong className="text-[#1B3A5C]">{Math.min(visibleCount, sortedRows.length).toLocaleString()}</strong>
          {sortedRows.length > visibleCount && <> จาก <strong>{sortedRows.length.toLocaleString()}</strong></>}
          {' '}ลูกค้า
          {(severity !== 'all' || reason !== 'all' || !showOk || search) && (
            <span className="text-slate-400 ml-2">(กรองจากทั้งหมด {stats.total.toLocaleString()})</span>
          )}
        </span>
      </FloatingTotalBar>

      {/* 315.D: Drill-down modal — code-by-code breakdown + 4-mode comparison */}
      <Modal
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown ? `Drift Breakdown — ${drillDown.customerShortName}` : ''}
        size="xl"
      >
        {drillDown && (
          <DriftBreakdownContent
            target={drillDown}
            dateTo={dateTo}
            onClose={() => setDrillDown(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// 315.D: Drill-down content — refetches carry-over per mode + group by sizeGroup
function DriftBreakdownContent({
  target,
  dateTo,
  onClose,
}: {
  target: DrillDownTarget
  dateTo: string
  onClose: () => void
}) {
  const { getCustomer, getCarryOver, linenCatalog } = useStore()
  const [selectedMode, setSelectedMode] = useState<CarryOverMode>(1)

  const customer = getCustomer(target.customerId)
  const cutoffEnd = useMemo(() => {
    const d = new Date(dateTo || new Date().toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [dateTo])

  // Fetch all 4 modes
  const allModes = useMemo(() => {
    return {
      1: getCarryOver(target.customerId, cutoffEnd, 1),
      2: getCarryOver(target.customerId, cutoffEnd, 2),
      3: getCarryOver(target.customerId, cutoffEnd, 3),
      4: getCarryOver(target.customerId, cutoffEnd, 4),
    } as Record<CarryOverMode, Record<string, number>>
  }, [getCarryOver, target.customerId, cutoffEnd])

  // Group by sizeGroup สำหรับ selected mode (ถ้า customer opt-in)
  const grouped = useMemo(() => {
    if (!customer) return { groups: [], ungrouped: [] }
    return groupCarryOver(allModes[selectedMode], customer, linenCatalog)
  }, [allModes, selectedMode, customer, linenCatalog])

  const useGroupView = customer ? customerUsesAggregateGroups(customer) : false

  // Stats per mode (รวม |abs| + net + count)
  const modeStats = useMemo(() => {
    const result: Record<CarryOverMode, { absSum: number; netSum: number; count: number }> = {
      1: { absSum: 0, netSum: 0, count: 0 },
      2: { absSum: 0, netSum: 0, count: 0 },
      3: { absSum: 0, netSum: 0, count: 0 },
      4: { absSum: 0, netSum: 0, count: 0 },
    }
    for (const mode of [1, 2, 3, 4] as CarryOverMode[]) {
      const carry = allModes[mode]
      for (const v of Object.values(carry)) {
        if (v === 0) continue
        result[mode].absSum += Math.abs(v)
        result[mode].netSum += v
        result[mode].count++
      }
    }
    return result
  }, [allModes])

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Workflow</div>
            <div className="font-semibold text-slate-700 mt-0.5">
              {target.workflowMode === 'trust_customer' ? '✅ Trust' : '🔄 Cross-check'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">LF ทั้งช่วง</div>
            <div className="font-semibold text-slate-700 mt-0.5">{target.lfCount.toLocaleString()} ใบ</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">นับไม่ตรง</div>
            <div className={cn('font-semibold mt-0.5',
              target.discrepancyRatio > 0.3 ? 'text-red-600' : target.discrepancyRatio > 0.1 ? 'text-orange-600' : 'text-slate-700',
            )}>
              {(target.discrepancyRatio * 100).toFixed(1)}%
              <span className="text-[10px] text-slate-400 ml-1">T1:{target.type1Count} T2:{target.type2Count}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Mode spread</div>
            <div className="font-semibold text-slate-700 mt-0.5">{target.modeSpread.toLocaleString()}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-3 text-xs">
          <Link
            href={`/dashboard/customers/${target.customerId}`}
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[#1B3A5C] hover:underline font-medium"
          >
            <ExternalLink className="w-3 h-3" />เปิดหน้าลูกค้า
          </Link>
          <Link
            href={`/dashboard/reports?tab=carryover&customerId=${target.customerId}`}
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[#1B3A5C] hover:underline font-medium"
          >
            <ExternalLink className="w-3 h-3" />รายงานผ้าค้าง (drill-down เต็ม)
          </Link>
        </div>
      </div>

      {/* 4-mode comparison tabs */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">เปรียบเทียบ 4 modes (ที่สิ้น {formatDate(dateTo)})</div>
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as CarryOverMode[]).map(mode => {
            const stat = modeStats[mode]
            const isActive = selectedMode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSelectedMode(mode)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition-colors',
                  isActive
                    ? 'border-[#1B3A5C] bg-[#3DD8D8]/10 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <div className={cn('text-[10px] uppercase tracking-wide font-semibold',
                  isActive ? 'text-[#1B3A5C]' : 'text-slate-500',
                )}>
                  Mode {mode}{mode === 1 && ' ⭐'}
                </div>
                <div className={cn('text-lg font-bold mt-0.5 font-mono',
                  stat.absSum > 500 ? 'text-red-600' : stat.absSum > 200 ? 'text-orange-600' : 'text-slate-700',
                )}>
                  {stat.absSum.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  net: <span className={cn('font-mono', stat.netSum < 0 ? 'text-red-500' : 'text-emerald-600')}>
                    {stat.netSum > 0 ? '+' : ''}{stat.netSum.toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">{stat.count} codes</div>
              </button>
            )
          })}
        </div>
        <div className="mt-2 text-[10px] text-slate-500">
          {selectedMode === 1 && 'Mode 1 (default): col6_แพคส่ง − col5_โรงซักนับเข้า'}
          {selectedMode === 2 && 'Mode 2: col6_แพคส่ง − (col2_ลูกค้าส่ง + col3_เคลม)'}
          {selectedMode === 3 && 'Mode 3: col4_ลูกค้านับกลับ − col5_โรงซักนับเข้า'}
          {selectedMode === 4 && 'Mode 4: col4_ลูกค้านับกลับ − (col2_ลูกค้าส่ง + col3_เคลม)'}
        </div>
      </div>

      {/* By-Group view (ถ้าลูกค้า opt-in) */}
      {useGroupView && grouped.groups.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
          <div className="text-xs font-semibold text-indigo-900 mb-2 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" />รวมกลุ่ม (sum = ค้าง/คืนจริง)
          </div>
          <div className="space-y-1.5">
            {grouped.groups.map(grp => (
              <details key={grp.groupKey} className="rounded-lg bg-white border border-indigo-100 overflow-hidden">
                <summary className="cursor-pointer px-3 py-2 hover:bg-indigo-50 list-none flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-700 text-xs">{grp.groupKey}</span>
                    <span className="text-[10px] text-slate-500">{grp.items.length} ไซส์</span>
                  </span>
                  <span className={cn(
                    'font-bold font-mono',
                    grp.netCarry < 0 ? 'text-red-600' : 'text-emerald-600',
                  )}>
                    {grp.netCarry > 0 ? '+' : ''}{grp.netCarry.toLocaleString()}
                  </span>
                </summary>
                <div className="px-3 pb-2 pt-1 space-y-0.5 border-t border-indigo-100 text-xs">
                  {grp.items.map(it => (
                    <div key={it.code} className="flex justify-between py-0.5">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <code className="font-mono text-slate-400">{it.code}</code>
                        <span className="truncate">{it.name}</span>
                      </span>
                      <span className={cn('font-medium font-mono', it.carry < 0 ? 'text-red-500' : 'text-emerald-600')}>
                        {it.carry > 0 ? '+' : ''}{it.carry.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* By-code list (ทุก code ที่ carry ≠ 0) */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-700">
            {useGroupView && grouped.ungrouped.length > 0 ? 'รายการนอกกลุ่ม' : 'แยกตาม code'}
            <span className="text-[10px] text-slate-500 ml-2">
              ({(useGroupView ? grouped.ungrouped : Object.entries(allModes[selectedMode]).filter(([, v]) => v !== 0)).length} codes)
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            Mode {selectedMode} · |abs sum| = <strong>{modeStats[selectedMode].absSum.toLocaleString()}</strong>
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium text-slate-600 text-xs">Code</th>
                <th className="text-left px-3 py-1.5 font-medium text-slate-600 text-xs">ชื่อ</th>
                <th className="text-right px-3 py-1.5 font-medium text-slate-600 text-xs">Carry</th>
                <th className="text-right px-3 py-1.5 font-medium text-slate-600 text-xs">|abs|</th>
              </tr>
            </thead>
            <tbody>
              {(useGroupView ? grouped.ungrouped : Object.entries(allModes[selectedMode])
                .filter(([, v]) => v !== 0)
                .map(([code, carry]) => ({
                  code,
                  name: linenCatalog.find(i => i.code === code)?.name || code,
                  carry,
                }))
              ).length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-slate-400 text-xs">ไม่มีรายการนอกกลุ่ม</td></tr>
              ) : (
                (useGroupView ? grouped.ungrouped : Object.entries(allModes[selectedMode])
                  .filter(([, v]) => v !== 0)
                  .map(([code, carry]) => ({
                    code,
                    name: linenCatalog.find(i => i.code === code)?.name || code,
                    carry,
                  }))
                ).sort((a, b) => Math.abs(b.carry) - Math.abs(a.carry)).map(it => (
                  <tr key={it.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{it.code}</td>
                    <td className="px-3 py-1.5 text-slate-700 text-xs truncate">{it.name}</td>
                    <td className={cn('px-3 py-1.5 text-right font-mono text-xs font-medium',
                      it.carry < 0 ? 'text-red-600' : 'text-emerald-600',
                    )}>
                      {it.carry > 0 ? '+' : ''}{it.carry.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-500">
                      {Math.abs(it.carry).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-100">
        💡 |abs sum| = ตัวเลข "ค้างรวม" ที่แสดงใน Drift Audit · net sum = ค้าง/คืนจริง (หักล้างกัน)
        {useGroupView && (
          <span className="block mt-1">
            📦 รวมกลุ่ม = net sum ของแต่ละ group → ตัวเลขที่ตรงกับความจริงสำหรับลูกค้าที่นับรวมไซส์ตอนรับเข้า
          </span>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color, sub, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string
  sub: string; active: boolean; onClick: () => void
}) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-50', red: 'text-red-600 bg-red-50',
    orange: 'text-orange-600 bg-orange-50', amber: 'text-amber-600 bg-amber-50',
    emerald: 'text-emerald-600 bg-emerald-50',
  }
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'p-3 rounded-xl border text-left transition-all',
        active ? 'border-[#1B3A5C] ring-2 ring-[#3DD8D8]/40 bg-white' : 'border-slate-200 bg-white hover:border-slate-300',
      )}>
      <div className={cn('inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium', colorMap[color])}>
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </button>
  )
}

function SeverityBadge({ severity }: { severity: CarryDriftSeverity }) {
  const cfg = {
    critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
    high: { label: 'High', cls: 'bg-orange-100 text-orange-700' },
    warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-700' },
    info: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700' },
  }[severity]
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold', cfg.cls)}>{cfg.label}</span>
}

function SortHeader({ col, label, sortCol, sortDir, onClick, className }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: SortDir
  onClick: (c: SortCol) => void; className?: string
}) {
  const active = sortCol === col
  return (
    <th className={cn('px-3 py-2.5 font-medium text-slate-600 text-xs cursor-pointer hover:bg-slate-100', className || 'text-left')}
        onClick={() => onClick(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-300" />
        )}
      </span>
    </th>
  )
}
