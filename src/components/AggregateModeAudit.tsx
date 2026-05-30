'use client'

/**
 * 330 Phase B — Aggregate Mode Coverage Audit
 *
 * ตรวจ LF ที่ aggregateSnapshot ≠ customer.aggregateSizeGroups ปัจจุบัน
 * Pattern เดียวกับ TrustModeAudit (316) แต่สำหรับ aggregate config
 *
 * Mount: /dashboard/reports?tab=aggaudit
 *
 * Reasons:
 *   - snapshot_missing: LF เก่าก่อน 330 ไม่มี snapshot → ใช้ customer ปัจจุบัน fallback
 *   - snapshot_mismatch: LF มี snapshot แต่ค่าต่างจาก customer ปัจจุบัน → drift!
 *   - extra_groups: snapshot มี group ที่ customer ลบไปแล้ว
 *   - missing_groups: customer มี group ใหม่ที่ snapshot ไม่ครอบ
 */
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { exportCSV } from '@/lib/export'
import { formatDate, cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import { buildAggregateSnapshot, type AggregateSnapshot } from '@/lib/carry-over-logic'
// 390 — reason logic ย้ายไป lib/aggregate-audit (reuse กับ AggregateImpactModal)
import { compareSnapshots, stringifySnap, REASON_CONFIG, type AggReason, type AggSeverity as Severity } from '@/lib/aggregate-audit'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import Modal from '@/components/Modal'
import {
  Search, AlertTriangle, AlertOctagon, CheckCircle2, FileSpreadsheet,
  Package, Eye, ExternalLink, RefreshCw,
} from 'lucide-react'

interface PendingFix {
  sourceType: 'lf' | 'adj'
  sourceId: string
  sourceLabel: string  // LF# or "Adj YYYY-MM-DD"
  customerShortName: string
  fromSnap: AggregateSnapshot | undefined
  toSnap: AggregateSnapshot | undefined
  reason: AggReason
}

// 399 — sort ได้ทุก Col (เพิ่ม snapshot / curSnapshot / issue)
type SortCol = 'severity' | 'date' | 'lfNumber' | 'customer' | 'snapshot' | 'curSnapshot' | 'issue'
type SortDir = 'asc' | 'desc'

export default function AggregateModeAudit() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // B1: include carryOverAdjustments scan
  const { linenForms, customers, updateLinenForm, carryOverAdjustments, updateCarryOverAdjustment } = useStore()
  const [pendingFix, setPendingFix] = useState<PendingFix | null>(null)

  // 390 — deep-link จาก Impact Modal: ?customerId=xxx → pre-filter ลูกค้านี้ + เปิดช่วงวันกว้าง (เห็น LF เก่าครบ)
  //   lazy init = อ่านครั้งเดียวตอน mount (component นี้ mount ใหม่เมื่อ nav มาจากหน้า customer → ค่าถูกเสมอ)
  const deepLinkCustomer = searchParams.get('customerId')
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => deepLinkCustomer ? '' : startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => deepLinkCustomer ? '' : endOfMonthISO())
  const [customerId, setCustomerId] = useState<string>(() => deepLinkCustomer || 'all')
  const [severity, setSeverity] = useState<'all' | Severity>('all')
  const [reason, setReason] = useState<'all' | AggReason>('all')
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
    type Row = {
      id: string
      sourceType: 'lf' | 'adj'   // B1: distinguish LF vs adj
      sourceId: string
      sourceLabel: string         // LF#XXX หรือ "Adj YYYY-MM-DD"
      date: string
      customerId: string; customerShortName: string; customerName: string
      lfSnap: AggregateSnapshot | undefined; curSnap: AggregateSnapshot | undefined
      reason: AggReason | null; severity: Severity; detail: string
    }
    const result: Row[] = []
    // 1. LF rows
    for (const f of linenForms) {
      if (dateFrom && f.date < dateFrom) continue
      if (dateTo && f.date > dateTo) continue
      if (customerId !== 'all' && f.customerId !== customerId) continue
      const cust = custMap.get(f.customerId)
      if (!cust) continue
      if (!f.aggregateSnapshot && (!cust.aggregateSizeGroups || cust.aggregateSizeGroups.length === 0)) continue
      const lfSnap = f.aggregateSnapshot
      const curSnap = buildAggregateSnapshot(cust.aggregateSizeGroups)
      const cmp = compareSnapshots(lfSnap, curSnap)
      result.push({
        id: `lf__${f.id}`,
        sourceType: 'lf', sourceId: f.id, sourceLabel: f.formNumber,
        date: f.date,
        customerId: f.customerId, customerShortName: cust.shortName, customerName: cust.name,
        lfSnap, curSnap,
        reason: cmp.reason, severity: cmp.severity, detail: cmp.detail,
      })
    }
    // 2. B1: Adjustment rows (scan aggregateSnapshot ที่บันทึก ตอน save adj)
    for (const a of carryOverAdjustments) {
      if (a.isDeleted) continue
      if (dateFrom && a.date < dateFrom) continue
      if (dateTo && a.date > dateTo) continue
      if (customerId !== 'all' && a.customerId !== customerId) continue
      const cust = custMap.get(a.customerId)
      if (!cust) continue
      // skip adj ที่ไม่เกี่ยว aggregate เลย (ลด noise)
      if (!a.aggregateSnapshot && (!cust.aggregateSizeGroups || cust.aggregateSizeGroups.length === 0)) continue
      const adjSnap = a.aggregateSnapshot
      const curSnap = buildAggregateSnapshot(cust.aggregateSizeGroups)
      const cmp = compareSnapshots(adjSnap, curSnap)
      result.push({
        id: `adj__${a.id}`,
        sourceType: 'adj', sourceId: a.id, sourceLabel: `Adj ${a.date.slice(5)} (${a.type})`,
        date: a.date,
        customerId: a.customerId, customerShortName: cust.shortName, customerName: cust.name,
        lfSnap: adjSnap, curSnap,
        reason: cmp.reason, severity: cmp.severity, detail: cmp.detail,
      })
    }
    return result
  }, [linenForms, carryOverAdjustments, customers, dateFrom, dateTo, customerId])

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
        r.sourceLabel.toLowerCase().includes(q) ||
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
        case 'lfNumber': cmp = a.sourceLabel.localeCompare(b.sourceLabel); break
        case 'customer': cmp = a.customerShortName.localeCompare(b.customerShortName); break
        case 'snapshot': cmp = stringifySnap(a.lfSnap).localeCompare(stringifySnap(b.lfSnap)); break
        case 'curSnapshot': cmp = stringifySnap(a.curSnap).localeCompare(stringifySnap(b.curSnap)); break
        case 'issue': {
          const ak = a.reason === null ? '' : REASON_CONFIG[a.reason].label
          const bk = b.reason === null ? '' : REASON_CONFIG[b.reason].label
          cmp = ak.localeCompare(bk); break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
    // SEVERITY_RANK = constant literal (ค่าคงที่ทุก render) — ไม่ใส่ใน deps เลี่ยง recompute เปล่าทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortCol, sortDir])

  const stats = useMemo(() => {
    const byReason: Record<AggReason, number> = {
      snapshot_missing: 0, snapshot_mismatch: 0, extra_groups: 0, missing_groups: 0,
    }
    let critical = 0, high = 0, warning = 0, info = 0, ok = 0
    for (const r of rows) {
      if (r.reason === null) ok++
      else byReason[r.reason]++
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
    const headers = ['Severity', 'วันที่', 'Source', 'Label', 'ลูกค้า', 'Snapshot', 'Customer now', 'Detail']
    const data = sortedRows.map(r => [
      r.severity, r.date, r.sourceType, r.sourceLabel, r.customerShortName,
      stringifySnap(r.lfSnap), stringifySnap(r.curSnap), r.detail,
    ])
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'all')
    exportCSV(headers, data, formatExportFilename('AggregateModeAudit', '', range))
  }

  // B1: route to LF detail OR adjustment (reports page)
  const goToSource = (row: typeof sortedRows[number]) => {
    if (row.sourceType === 'lf') router.push(`/dashboard/linen-forms?detail=${row.sourceId}`)
    else router.push(`/dashboard/reports?tab=carry-over`)
  }

  // 337 + B1: Sync snapshot — route ไปยัง update function ตาม sourceType
  const isSafeReason = (r: AggReason | null): boolean => r === 'snapshot_missing'

  const applySnapshot = (sourceType: 'lf' | 'adj', sourceId: string, snap: AggregateSnapshot | undefined) => {
    if (sourceType === 'lf') {
      updateLinenForm(sourceId, { aggregateSnapshot: snap })
    } else {
      updateCarryOverAdjustment(sourceId, { aggregateSnapshot: snap }, 'sync aggregateSnapshot (Mode Audit)')
    }
  }

  const handleSync = (row: typeof sortedRows[number]) => {
    if (row.reason === null) return
    if (isSafeReason(row.reason)) {
      // 🟢 SAFE — apply ทันที (ทั้ง LF + adj)
      applySnapshot(row.sourceType, row.sourceId, row.curSnap)
      return
    }
    // 🔴 RISKY — confirm modal
    setPendingFix({
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceLabel: row.sourceLabel,
      customerShortName: row.customerShortName,
      fromSnap: row.lfSnap,
      toSnap: row.curSnap,
      reason: row.reason,
    })
  }

  const confirmSync = () => {
    if (!pendingFix) return
    applySnapshot(pendingFix.sourceType, pendingFix.sourceId, pendingFix.toSnap)
    setPendingFix(null)
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <Package className="w-3.5 h-3.5" />
          Aggregate Mode Coverage Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจ LF ที่ aggregateSnapshot ไม่ตรง customer ปัจจุบัน</h2>
        <p className="text-sm opacity-90 mt-1">
          เครื่องมือ <span className="font-semibold">monitor + sync</span> — Feat 330: LF.aggregateSnapshot บันทึก config ตอน create กัน drift เมื่อ customer toggle col2Mode/col5Mode ภายหลัง
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
          sub="snapshot mismatch / extra" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Warning" value={stats.warning} color="amber"
          active={severity === 'warning'}
          onClick={() => {
            if (severity === 'warning') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('warning'); setReason('all'); setShowOk(false) }
          }}
          sub="missing / missing groups" />
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
          sub="LF ในช่วงที่มี aggregate" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-medium text-slate-500 mb-2">Issues by reason — คลิกเพื่อกรอง:</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(stats.byReason) as [AggReason, number][]).map(([r, count]) => {
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
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none w-56" />
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
                <SortHeader col="lfNumber" label="ที่มา" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader col="customer" label="ลูกค้า" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <SortHeader col="snapshot" label="Snapshot" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <SortHeader col="curSnapshot" label="Customer now" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
                <SortHeader col="issue" label="Issue" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} className="text-left" />
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
                    <button onClick={() => goToSource(r)}
                      className="font-mono font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1">
                      {r.sourceLabel}<ExternalLink className="w-3 h-3" />
                    </button>
                    {r.sourceType === 'adj' && (
                      <span className="ml-1.5 inline-block px-1 py-0.5 rounded text-[9px] bg-blue-50 text-blue-700 border border-blue-200">adj</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.customerShortName}</div>
                    <div className="text-xs text-slate-500 truncate">{r.customerName}</div>
                  </td>
                  <td className="px-2 py-2 text-[10px] font-mono">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded',
                      r.lfSnap ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700 italic',
                    )} title={stringifySnap(r.lfSnap)}>
                      {stringifySnap(r.lfSnap)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[10px] font-mono">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded',
                      r.curSnap ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500 italic',
                    )} title={stringifySnap(r.curSnap)}>
                      {stringifySnap(r.curSnap)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.reason === null ? (
                      <span className="text-xs text-emerald-600">✓ ตรง</span>
                    ) : (
                      <span title={r.detail}
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          r.severity === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-amber-50 text-amber-700 border-amber-200',
                        )}>
                        {REASON_CONFIG[r.reason].icon} {REASON_CONFIG[r.reason].label}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      {r.reason !== null && (() => {
                        const safe = isSafeReason(r.reason)
                        return (
                          <button
                            type="button"
                            onClick={() => handleSync(r)}
                            title={safe
                              ? `🟢 Safe sync — ใส่ snapshot ที่ขาด (ไม่กระทบ calc ปัจจุบัน)`
                              : `🔴 Risky sync — overwrite snapshot → carry-over จะ recalc (confirm ก่อน)`}
                            className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors',
                              safe
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                                : 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200',
                            )}
                          >
                            <RefreshCw className="w-3 h-3" />
                            {safe ? 'Safe' : '⚠ Risky'}
                          </button>
                        )
                      })()}
                      <button
                        type="button"
                        onClick={() => goToSource(r)}
                        title={r.sourceType === 'lf' ? 'เปิด LF detail' : 'ไปยัง Carry-over Report'}
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
          <strong>Feat 330 + 337</strong>: LF.aggregateSnapshot = config ตอน create. customer.aggregateSizeGroups = ปัจจุบัน.
        </div>
        <div>Mismatch ไม่ใช่ bug — calc carry-over ใช้ snapshot ของ LF เป็นหลัก</div>
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

      <Modal
        open={!!pendingFix}
        onClose={() => setPendingFix(null)}
        title="ยืนยัน Sync aggregateSnapshot"
        size="md"
        closeLabel="cancel"
      >
        {pendingFix && (
          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
              <p className="font-semibold text-orange-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />คุณกำลังจะเปลี่ยน snapshot ของ LF ใบนี้
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-500 min-w-[80px]">{pendingFix.sourceType === 'lf' ? 'LF:' : 'Adjustment:'}</span>
                <span className="font-mono font-semibold">{pendingFix.sourceLabel}</span>
              </div>
              <div className="flex gap-2"><span className="text-slate-500 min-w-[80px]">ลูกค้า:</span><span className="font-medium">{pendingFix.customerShortName}</span></div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500 uppercase">เปลี่ยน snapshot</div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 font-mono text-[11px]">
                <div className="text-slate-500 mb-0.5">From (LF):</div>
                <div className="text-slate-800">{stringifySnap(pendingFix.fromSnap)}</div>
              </div>
              <div className="text-center text-slate-400 text-xs">↓</div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 font-mono text-[11px]">
                <div className="text-emerald-600 mb-0.5">To (customer now):</div>
                <div className="text-emerald-800">{stringifySnap(pendingFix.toSnap)}</div>
              </div>
            </div>

            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
              <p className="font-semibold text-red-900 mb-1">⚠ ผลกระทบ</p>
              <p className="text-red-700 text-xs">
                Carry-over ของ LF ใบนี้จะถูก recalculate ทันที — ค่า col1_carryOver ใน LF ถัดไปอาจเปลี่ยน + รายงานทั้งหมด (drift audit, monthly closing, dashboard) จะ update ตามด้วย
              </p>
            </div>

            <div className="text-xs text-slate-500">
              💡 ปกติแล้ว <strong>ไม่ต้อง sync</strong> — snapshot ของ LF เก่าทำงานถูกต้องตาม config ตอนสร้าง
              <br />Sync เฉพาะเมื่อ ติ๊ดตั้งใจให้ LF ใบนี้ใช้ config ใหม่ (เช่นแก้ตอนกรอกผิด mode)
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
  const cfg: Record<Severity, { label: string; cls: string }> = {
    critical: { label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200' },
    high: { label: 'High', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    info: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  }
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border', cfg[severity].cls)}>
      {cfg[severity].label}
    </span>
  )
}

function SortHeader({ col, label, sortCol, sortDir, onClick, className }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: SortDir
  onClick: (col: SortCol) => void; className?: string
}) {
  const active = sortCol === col
  return (
    <th className={cn('px-3 py-2.5 font-medium text-slate-600 text-xs cursor-pointer hover:bg-slate-100', className || 'text-center')}
      onClick={() => onClick(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-[#3DD8D8]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}
