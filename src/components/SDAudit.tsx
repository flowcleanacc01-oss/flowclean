'use client'

/**
 * Phase A.1 — SD Integrity Audit UI
 * Read-only monitoring tool — ตรวจ data integrity ของ SD ทุกใบ
 * Mount: tab "🔍 SD Audit" ในเมนูรายงาน (/dashboard/reports?tab=sdaudit)
 */
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  useSDAudit,
  SD_AUDIT_REASON_CONFIG,
  SD_AUDIT_SEVERITY_RANK,
  type SDAuditFilters,
  type SDAuditSeverity,
  type SDAuditReason,
} from '@/lib/use-sd-audit'
import { exportCSV } from '@/lib/export'
import { formatDate, cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import {
  Search, AlertTriangle, AlertOctagon, CheckCircle2, FileSpreadsheet,
  ShieldCheck, Eye, ArrowUpDown, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'

type SortCol = 'severity' | 'dnDate' | 'dnNumber' | 'customer' | 'issues'
type SortDir = 'asc' | 'desc'

export default function SDAudit() {
  const router = useRouter()

  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())

  const [customerId, setCustomerId] = useState<string>('all')
  const [severity, setSeverity] = useState<'all' | SDAuditSeverity>('all')
  const [reason, setReason] = useState<'all' | SDAuditReason>('all')
  const [showOk, setShowOk] = useState(false)
  const [search, setSearch] = useState('')

  const [sortCol, setSortCol] = useState<SortCol>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filters: SDAuditFilters = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    customerId,
    severity,
    reason,
    showOk,
    search,
  }), [dateFrom, dateTo, customerId, severity, reason, showOk, search])

  const { rows, stats } = useSDAudit(filters)

  const sortedRows = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'severity':
          cmp = SD_AUDIT_SEVERITY_RANK[a.severity] - SD_AUDIT_SEVERITY_RANK[b.severity]
          if (cmp === 0) cmp = b.dnDate.localeCompare(a.dnDate)
          break
        case 'dnDate':
          cmp = a.dnDate.localeCompare(b.dnDate)
          break
        case 'dnNumber':
          cmp = a.dnNumber.localeCompare(b.dnNumber)
          break
        case 'customer':
          cmp = a.customerShortName.localeCompare(b.customerShortName)
          break
        case 'issues':
          cmp = a.issues.length - b.issues.length
          break
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
    const headers = ['Severity', 'SD วันที่', 'SD#', 'Billed', 'ลูกค้า', 'จำนวน Issues', 'Issues (detail)']
    const data = sortedRows.map(r => [
      r.severity,
      r.dnDate,
      r.dnNumber,
      r.isBilled ? 'Yes' : 'No',
      r.customerShortName,
      String(r.issues.length),
      r.issues.map(i => `[${SD_AUDIT_REASON_CONFIG[i.reason].label}] ${i.detail}`).join(' · '),
    ])
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'all')
    exportCSV(headers, data, formatExportFilename('SDAudit', '', range))
  }

  const goToSD = (dnId: string) => {
    router.push(`/dashboard/delivery?detail=${dnId}`)
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          SD Integrity Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจ data integrity ของใบส่งของ (SD)</h2>
        <p className="text-sm opacity-90 mt-1">
          เครื่องมือ <span className="font-semibold">monitor only</span> — ตรวจ LF link · qty drift · priceSnapshot · ค่ารถ — ระบบไม่แก้ไขข้อมูล
        </p>
      </div>

      {/* Date filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <DateFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          mode={dateFilterMode}
          onModeChange={setDateFilterMode}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onClear={clearDateFilter}
        />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          icon={<AlertOctagon className="w-4 h-4" />}
          label="Critical"
          value={stats.critical}
          color="red"
          active={severity === 'critical'}
          onClick={() => setSeverity(severity === 'critical' ? 'all' : 'critical')}
          sub="ออกบิลแล้ว + integrity ผิด"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="High"
          value={stats.high}
          color="orange"
          active={severity === 'high'}
          onClick={() => setSeverity(severity === 'high' ? 'all' : 'high')}
          sub="ยังไม่ออกบิล"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Warning"
          value={stats.warning}
          color="amber"
          active={severity === 'warning'}
          onClick={() => setSeverity(severity === 'warning' ? 'all' : 'warning')}
          sub="ตรวจดู ไม่ critical"
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="OK"
          value={stats.ok}
          color="emerald"
          active={showOk}
          onClick={() => setShowOk(v => !v)}
          sub="ผ่านทุกเช็ค"
        />
        <StatCard
          icon={<Eye className="w-4 h-4" />}
          label="ตรวจแล้ว"
          value={stats.total}
          color="slate"
          active={severity === 'all' && reason === 'all'}
          onClick={() => { setSeverity('all'); setReason('all') }}
          sub={`${stats.customersAudited} ลูกค้า`}
        />
      </div>

      {/* Issue legend — count by reason */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-medium text-slate-500 mb-2">Issues by reason (ทั้งช่วงเวลา) — คลิกเพื่อกรอง:</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(stats.byReason) as [SDAuditReason, number][]).map(([r, count]) => {
            const cfg = SD_AUDIT_REASON_CONFIG[r]
            const colorMap: Record<string, string> = {
              red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
              orange: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
              amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
            }
            const active = reason === r
            return (
              <button
                key={r}
                onClick={() => setReason(active ? 'all' : r)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all',
                  colorMap[cfg.color] || 'bg-slate-50 text-slate-700 border-slate-200',
                  active && 'ring-2 ring-[#3DD8D8]/40 border-[#1B3A5C]',
                  count === 0 && 'opacity-40',
                )}
                disabled={count === 0}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span className="ml-1 font-mono font-bold">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา SD# / ลูกค้า"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-56"
            />
          </div>
          <div className="min-w-[180px]">
            <CustomerPicker
              value={customerId === 'all' ? '' : customerId}
              onChange={(id) => setCustomerId(id || 'all')}
              allowAll
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showOk}
              onChange={e => setShowOk(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]"
            />
            แสดง SD ที่ผ่าน
          </label>
          <span className="text-xs text-slate-400">
            แสดง {sortedRows.length} จาก {stats.total - (showOk ? 0 : stats.ok)} รายการ
          </span>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={sortedRows.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader col="severity" label="Severity" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="dnDate" label="วันที่" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="dnNumber" label="SD#" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">Billed</th>
                <SortHeader col="customer" label="ลูกค้า" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <SortHeader col="issues" label="Issues" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">→</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">ไม่พบ SD ที่ตรงเงื่อนไข — ลองปรับ filter</td></tr>
              ) : sortedRows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <SeverityBadge severity={r.severity} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">{formatDate(r.dnDate)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => goToSD(r.dnId)}
                      className="font-mono font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1">
                      {r.dnNumber}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.isBilled && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Billed</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.customerShortName}</div>
                    <div className="text-xs text-slate-500 truncate">{r.customerName}</div>
                  </td>
                  <td className="px-3 py-2">
                    {r.issues.length === 0 ? (
                      <span className="text-xs text-emerald-600">✓ ผ่านทุกเช็ค</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.issues.map((i, idx) => {
                          const cfg = SD_AUDIT_REASON_CONFIG[i.reason]
                          const colorMap: Record<string, string> = {
                            red: 'bg-red-50 text-red-700 border-red-200',
                            orange: 'bg-orange-50 text-orange-700 border-orange-200',
                            amber: 'bg-amber-50 text-amber-700 border-amber-200',
                          }
                          return (
                            <span
                              key={idx}
                              title={i.detail}
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                colorMap[cfg.color] || 'bg-slate-50 text-slate-700 border-slate-200',
                              )}
                            >
                              {cfg.icon} {cfg.label}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => goToSD(r.dnId)}
                      className="p-1 text-slate-400 hover:text-[#1B3A5C]"
                      aria-label="ไปดู SD">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-400 italic mt-2 px-2">
        เครื่องมือนี้ <strong>read-only</strong> — ไม่แก้ไขข้อมูล. ใช้ตรวจหลัง batch creation (Quick Batch SD) หรือ data import. คลิก SD# เพื่อไปแก้ที่หน้า delivery
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color, sub, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string
  sub: string; active: boolean; onClick: () => void
}) {
  const colorMap: Record<string, string> = {
    slate:   'text-slate-600 bg-slate-50',
    red:     'text-red-600 bg-red-50',
    orange:  'text-orange-600 bg-orange-50',
    amber:   'text-amber-600 bg-amber-50',
    emerald: 'text-emerald-600 bg-emerald-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border text-left transition-all',
        active ? 'border-[#1B3A5C] ring-2 ring-[#3DD8D8]/40 bg-white' : 'border-slate-200 bg-white hover:border-slate-300',
      )}>
      <div className={cn('inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium', colorMap[color])}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </button>
  )
}

function SeverityBadge({ severity }: { severity: SDAuditSeverity }) {
  const cfg = {
    critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
    high: { label: 'High', cls: 'bg-orange-100 text-orange-700' },
    warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-700' },
    info: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700' },
  }[severity]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

function SortHeader({
  col, label, sortCol, sortDir, onClick, className,
}: {
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
