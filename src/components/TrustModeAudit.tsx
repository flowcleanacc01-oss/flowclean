'use client'

/**
 * Phase A.5 — Trust Mode Coverage Audit
 * ตรวจ LF ที่ workflowMode snapshot ≠ customer.workflowMode current (Feat 265 edge case)
 * Mount: /dashboard/reports?tab=trustaudit
 */
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { exportCSV } from '@/lib/export'
import { formatDate, cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import Modal from '@/components/Modal'
import {
  Search, AlertTriangle, AlertOctagon, CheckCircle2, FileSpreadsheet,
  ShieldCheck, Eye, ArrowUpDown, ChevronDown, ChevronUp, ExternalLink,
  RefreshCw,
} from 'lucide-react'

type TrustReason = 'snapshot_mismatch' | 'snapshot_missing'
type Severity = 'critical' | 'high' | 'warning' | 'info'

interface PendingFix {
  lfId: string
  lfNumber: string
  customerShortName: string
  fromMode: string | null
  toMode: string
  reason: TrustReason
}

const REASON_CONFIG: Record<TrustReason, { label: string; color: string; icon: string }> = {
  snapshot_mismatch: { label: 'snapshot ≠ ปัจจุบัน', color: 'orange', icon: '🔀' },
  snapshot_missing:  { label: 'ไม่มี snapshot',     color: 'amber',  icon: '❓' },
}

type SortCol = 'severity' | 'date' | 'lfNumber' | 'customer'
type SortDir = 'asc' | 'desc'

export default function TrustModeAudit() {
  const router = useRouter()
  const { linenForms, customers, updateLinenForm } = useStore()
  const [pendingFix, setPendingFix] = useState<PendingFix | null>(null)

  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())
  const [customerId, setCustomerId] = useState<string>('all')
  const [severity, setSeverity] = useState<'all' | Severity>('all')
  const [reason, setReason] = useState<'all' | TrustReason>('all')
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

  const rows = useMemo(() => {
    const custMap = new Map(customers.map(c => [c.id, c]))
    const result: Array<{
      id: string; lfId: string; lfNumber: string; date: string
      customerId: string; customerShortName: string; customerName: string
      lfMode: string | null; currentMode: string
      reason: TrustReason | null; severity: Severity
      detail: string
    }> = []
    for (const f of linenForms) {
      if (dateFrom && f.date < dateFrom) continue
      if (dateTo && f.date > dateTo) continue
      if (customerId !== 'all' && f.customerId !== customerId) continue
      const cust = custMap.get(f.customerId)
      if (!cust) continue
      const lfMode = f.workflowMode || null
      const currentMode = cust.workflowMode || 'cross_check'
      let issueReason: TrustReason | null = null
      let sev: Severity = 'info'
      let detail = ''
      if (!lfMode) {
        issueReason = 'snapshot_missing'
        sev = 'warning'
        detail = `LF ไม่มี workflowMode snapshot (เก่าก่อน Feat 265) — ใช้ current ของลูกค้า = ${currentMode}`
      } else if (lfMode !== currentMode) {
        issueReason = 'snapshot_mismatch'
        sev = 'high'
        detail = `LF snapshot=${lfMode} · customer current=${currentMode} — calc carry-over จะใช้ snapshot`
      }
      result.push({
        id: f.id, lfId: f.id, lfNumber: f.formNumber, date: f.date,
        customerId: f.customerId, customerShortName: cust.shortName, customerName: cust.name,
        lfMode, currentMode, reason: issueReason, severity: sev, detail,
      })
    }
    return result
  }, [linenForms, customers, dateFrom, dateTo, customerId])

  // Apply filters
  const filtered = useMemo(() => {
    let list = rows
    if (severity !== 'all') list = list.filter(r => r.severity === severity)
    if (reason !== 'all') list = list.filter(r => r.reason === reason)
    const sevNarrow = severity !== 'all'
    const reasonNarrow = reason !== 'all'
    if (!sevNarrow && !reasonNarrow && !showOk) {
      list = list.filter(r => r.reason !== null)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r =>
        r.lfNumber.toLowerCase().includes(q) ||
        r.customerShortName.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q),
      )
    }
    return list
  }, [rows, severity, reason, showOk, search])

  const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, warning: 2, info: 3 }
  const sortedRows = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'severity': cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]; if (cmp === 0) cmp = b.date.localeCompare(a.date); break
        case 'date': cmp = a.date.localeCompare(b.date); break
        case 'lfNumber': cmp = a.lfNumber.localeCompare(b.lfNumber); break
        case 'customer': cmp = a.customerShortName.localeCompare(b.customerShortName); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [filtered, sortCol, sortDir])

  const stats = useMemo(() => {
    const byReason = { snapshot_mismatch: 0, snapshot_missing: 0 }
    let critical = 0, high = 0, warning = 0, info = 0, ok = 0
    for (const r of rows) {
      if (r.reason === null) ok++
      else {
        if (r.reason === 'snapshot_mismatch') byReason.snapshot_mismatch++
        if (r.reason === 'snapshot_missing') byReason.snapshot_missing++
      }
      if (r.severity === 'critical') critical++
      else if (r.severity === 'high') high++
      else if (r.severity === 'warning') warning++
      else if (r.severity === 'info' && r.reason !== null) info++
    }
    return { critical, high, warning, info, ok, total: rows.length, byReason }
  }, [rows])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'severity' ? 'asc' : 'desc') }
  }

  const handleExportCSV = () => {
    if (sortedRows.length === 0) return
    const headers = ['Severity', 'วันที่', 'LF#', 'ลูกค้า', 'LF mode', 'Customer mode (now)', 'Detail']
    const data = sortedRows.map(r => [
      r.severity, r.date, r.lfNumber, r.customerShortName,
      r.lfMode || '(none)', r.currentMode, r.detail,
    ])
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'all')
    exportCSV(headers, data, formatExportFilename('TrustModeAudit', '', range))
  }

  const goToLF = (lfId: string) => router.push(`/dashboard/linen-forms?detail=${lfId}`)

  // 316 + 337: Sync snapshot — set LF.workflowMode = customer.workflowMode (current)
  // - snapshot_missing (🟢 SAFE) → no calc change now (fallback = sync target). Apply directly.
  // - snapshot_mismatch (🔴 RISKY) → carry-over recalc. Confirm modal with explicit warning.
  const handleSync = (row: typeof sortedRows[number]) => {
    if (row.reason === null) return
    const fix: PendingFix = {
      lfId: row.lfId,
      lfNumber: row.lfNumber,
      customerShortName: row.customerShortName,
      fromMode: row.lfMode,
      toMode: row.currentMode,
      reason: row.reason,
    }
    if (row.reason === 'snapshot_missing') {
      // 🟢 SAFE — no current calc change, just freezes future behavior
      updateLinenForm(row.lfId, { workflowMode: row.currentMode as 'cross_check' | 'trust_customer' })
    } else {
      // 🔴 RISKY — opens confirm modal
      setPendingFix(fix)
    }
  }

  const confirmSync = () => {
    if (!pendingFix) return
    updateLinenForm(pendingFix.lfId, {
      workflowMode: pendingFix.toMode as 'cross_check' | 'trust_customer',
    })
    setPendingFix(null)
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Trust Mode Coverage Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจ LF ที่ workflowMode snapshot ไม่ตรง</h2>
        <p className="text-sm opacity-90 mt-1">
          เครื่องมือ <span className="font-semibold">monitor only</span> — Feat 265: LF.workflowMode snapshot เมื่อ create. ถ้า customer config เปลี่ยน LF เก่ายังใช้ snapshot เดิม
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <DateFilter
          dateFrom={dateFrom} dateTo={dateTo}
          mode={dateFilterMode} onModeChange={setDateFilterMode}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          onClear={() => { setDateFrom(''); setDateTo('') }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={<AlertOctagon className="w-4 h-4" />} label="Critical" value={stats.critical} color="red"
          active={severity === 'critical'}
          onClick={() => {
            if (severity === 'critical') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('critical'); setReason('all'); setShowOk(false) }
          }}
          sub="เก็บไว้สำหรับเคสรุนแรง" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="High" value={stats.high} color="orange"
          active={severity === 'high'}
          onClick={() => {
            if (severity === 'high') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('high'); setReason('all'); setShowOk(false) }
          }}
          sub="snapshot mismatch" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Warning" value={stats.warning} color="amber"
          active={severity === 'warning'}
          onClick={() => {
            if (severity === 'warning') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('warning'); setReason('all'); setShowOk(false) }
          }}
          sub="snapshot missing" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="OK" value={stats.ok} color="emerald"
          active={severity === 'info'}
          onClick={() => {
            if (severity === 'info') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('info'); setReason('all'); setShowOk(true) }
          }}
          sub="ตรงปัจจุบัน" />
        <StatCard icon={<Eye className="w-4 h-4" />} label="ตรวจแล้ว" value={stats.total} color="slate"
          active={severity === 'all' && reason === 'all' && showOk}
          onClick={() => { setSeverity('all'); setReason('all'); setShowOk(true) }}
          sub="LF ทั้งช่วง" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-medium text-slate-500 mb-2">Issues by reason — คลิกเพื่อกรอง:</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(stats.byReason) as [TrustReason, number][]).map(([r, count]) => {
            const cfg = REASON_CONFIG[r]
            const colorMap: Record<string, string> = {
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
                <span>{cfg.icon}</span><span>{cfg.label}</span>
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
              placeholder="ค้นหา LF# / ลูกค้า"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-56" />
          </div>
          <div className="min-w-[180px]">
            <CustomerPicker value={customerId === 'all' ? '' : customerId}
              onChange={(id) => setCustomerId(id || 'all')} allowAll />
          </div>
        </div>
        <button onClick={handleExportCSV} disabled={sortedRows.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
          <FileSpreadsheet className="w-3.5 h-3.5" />Export CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader col="severity" label="Severity" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="date" label="วันที่" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="lfNumber" label="LF#" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="customer" label="ลูกค้า" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">LF mode</th>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">Customer now</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Issue</th>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">ไม่พบ LF ที่ตรงเงื่อนไข</td></tr>
              ) : sortedRows.slice(0, visibleCount).map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2"><SeverityBadge severity={r.severity} /></td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">{formatDate(r.date)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => goToLF(r.lfId)}
                      className="font-mono font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1">
                      {r.lfNumber}<ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.customerShortName}</div>
                    <div className="text-xs text-slate-500 truncate">{r.customerName}</div>
                  </td>
                  <td className="px-2 py-2 text-center text-[10px]">
                    {r.lfMode ? (
                      <span className={cn('px-1.5 py-0.5 rounded font-medium',
                        r.lfMode === 'trust_customer' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700')}>
                        {r.lfMode}
                      </span>
                    ) : <span className="text-slate-400 italic">none</span>}
                  </td>
                  <td className="px-2 py-2 text-center text-[10px]">
                    <span className={cn('px-1.5 py-0.5 rounded font-medium',
                      r.currentMode === 'trust_customer' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700')}>
                      {r.currentMode}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.reason === null ? (
                      <span className="text-xs text-emerald-600">✓ ตรง</span>
                    ) : (
                      <span title={r.detail}
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          r.reason === 'snapshot_mismatch' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-amber-50 text-amber-700 border-amber-200',
                        )}>
                        {REASON_CONFIG[r.reason].icon} {REASON_CONFIG[r.reason].label}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      {r.reason !== null && (
                        <button
                          type="button"
                          onClick={() => handleSync(r)}
                          title={r.reason === 'snapshot_missing'
                            ? `🟢 Safe sync — ใส่ snapshot ที่ขาด (ไม่กระทบ calc ปัจจุบัน)`
                            : `🔴 Risky sync — เปลี่ยน snapshot ${r.lfMode} → ${r.currentMode} (carry-over จะ recalc — confirm ก่อน)`}
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors',
                            r.reason === 'snapshot_missing'
                              ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                              : 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200',
                          )}
                        >
                          <RefreshCw className="w-3 h-3" />
                          {r.reason === 'snapshot_missing' ? 'Safe' : '⚠ Risky'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => goToLF(r.lfId)}
                        title="เปิด LF detail"
                        className="p-1 text-slate-400 hover:text-[#1B3A5C]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
            ↓ แสดงเพิ่ม {Math.min(LOAD_MORE_STEP, sortedRows.length - visibleCount)} ใบ
            <span className="text-slate-400 ml-2">(เหลือ {sortedRows.length - visibleCount} ใบ)</span>
          </button>
        )}
      </div>

      <div className="text-xs text-slate-400 italic mt-2 px-2 space-y-1">
        <div>
          <strong>Feat 265 + 268 + 316 + 337</strong>: customer.workflowMode = current setting · LF.workflowMode = snapshot ตอน create.
        </div>
        <div>
          Mismatch ไม่ใช่ bug — calc carry-over ใช้ snapshot ของ LF เป็นหลัก
        </div>
        <div className="not-italic flex flex-wrap gap-3 pt-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
            <RefreshCw className="w-3 h-3" /> Safe = ไม่กระทบ calc (snapshot ขาด — เพิ่ม field)
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
            <RefreshCw className="w-3 h-3" /> ⚠ Risky = recalc carry-over (snapshot ≠ ปัจจุบัน)
          </span>
        </div>
      </div>

      <FloatingTotalBar show={sortedRows.length > 0}>
        <span>
          แสดง <strong className="text-[#1B3A5C]">{Math.min(visibleCount, sortedRows.length).toLocaleString()}</strong>
          {sortedRows.length > visibleCount && <> จาก <strong>{sortedRows.length.toLocaleString()}</strong></>}
          {' '}ใบ
          {(severity !== 'all' || reason !== 'all' || !showOk || search) && (
            <span className="text-slate-400 ml-2">(กรองจากทั้งหมด {stats.total.toLocaleString()})</span>
          )}
        </span>
      </FloatingTotalBar>

      {/* 316: Confirm modal — snapshot_mismatch ต้อง confirm ก่อนแก้ เพราะมีความเสี่ยง */}
      <Modal
        open={!!pendingFix}
        onClose={() => setPendingFix(null)}
        title="ยืนยัน Sync snapshot"
        size="md"
        closeLabel="cancel"
      >
        {pendingFix && (
          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
              <p className="font-semibold text-orange-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />คุณกำลังจะเปลี่ยน snapshot ที่บันทึกไว้
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-slate-500 min-w-[80px]">LF:</span><span className="font-mono font-semibold">{pendingFix.lfNumber}</span></div>
              <div className="flex gap-2"><span className="text-slate-500 min-w-[80px]">ลูกค้า:</span><span className="font-medium">{pendingFix.customerShortName}</span></div>
              <div className="flex gap-2"><span className="text-slate-500 min-w-[80px]">เปลี่ยน:</span>
                <span className="flex items-center gap-2">
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{pendingFix.fromMode}</code>
                  <span className="text-slate-400">→</span>
                  <code className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{pendingFix.toMode}</code>
                </span>
              </div>
            </div>

            {pendingFix.fromMode === 'cross_check' && pendingFix.toMode === 'trust_customer' && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
                <p className="font-semibold text-red-900 mb-1">⚠ ความเสี่ยง: cross_check → trust_customer</p>
                <p className="text-red-700 text-xs">
                  LF ใบนี้สร้างตอน cross_check → col5 (โรงซักนับเข้า) มีข้อมูลครบ การคำนวณ carry-over ปัจจุบันใช้ Mode 1 (col6 − col5) ถ้าเปลี่ยนเป็น trust_customer → จะใช้ Mode 2 (col6 − col2+col3) แทน → carry-over อาจเปลี่ยนค่า
                </p>
              </div>
            )}
            {pendingFix.fromMode === 'trust_customer' && pendingFix.toMode === 'cross_check' && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
                <p className="font-semibold text-red-900 mb-1">⚠ ความเสี่ยง: trust_customer → cross_check</p>
                <p className="text-red-700 text-xs">
                  LF ใบนี้สร้างตอน trust_customer → col5 (โรงซักนับเข้า) อาจไม่ได้กรอก (เป็น 0) ถ้าเปลี่ยนเป็น cross_check → carry-over จะใช้ Mode 1 (col6 − col5) → ค่า col5=0 จะทำให้ carry-over ผิดมหาศาล (= +col6 ทั้งหมด)
                </p>
              </div>
            )}

            <div className="text-xs text-slate-500">
              💡 ปกติแล้ว <strong>ไม่ต้อง sync</strong> — snapshot mismatch ไม่ใช่ bug LF เก่ายังคำนวณถูกตาม snapshot ตอนสร้าง
              <br />Sync เฉพาะเมื่อ ติ๊ดตั้งใจให้ LF ใบนี้ใช้ workflow ใหม่ (เช่นแก้ไขย้อนหลังเพื่อ correct config error)
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingFix(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmSync}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />ยืนยัน Sync
              </button>
            </div>
          </div>
        )}
      </Modal>
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

function SeverityBadge({ severity }: { severity: Severity }) {
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
        {active ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
      </span>
    </th>
  )
}
