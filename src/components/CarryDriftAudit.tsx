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
import { exportCSV } from '@/lib/export'
import { cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import {
  Search, AlertTriangle, AlertOctagon, CheckCircle2, FileSpreadsheet,
  ShieldCheck, Eye, ArrowUpDown, ChevronDown, ChevronUp,
} from 'lucide-react'

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
                    <span className={cn(r.cumulativeBalance > 500 ? 'text-red-600 font-bold' : r.cumulativeBalance > 200 ? 'text-orange-600' : 'text-slate-700')}>
                      {r.cumulativeBalance.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-mono text-slate-600">
                    {r.modeSpread.toLocaleString()}
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
