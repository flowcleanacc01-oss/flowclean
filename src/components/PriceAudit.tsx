'use client'

/**
 * 217.1 — SD Price Audit UI
 * Read-only monitoring tool — แสดงรายการ DN ที่ราคาไม่ตรงกับ accepted QT
 * Mount: tab ใหม่ในเมนูรายงาน (/dashboard/reports?tab=priceaudit)
 */
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import {
  usePriceAudit,
  REASON_CONFIG,
  type PriceAuditFilters,
  type PriceAuditSeverity,
  type PriceAuditReason,
} from '@/lib/use-price-audit'
import { exportCSV } from '@/lib/export'
import { formatDate, formatCurrency, cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import {
  Search, AlertTriangle, AlertOctagon, CheckCircle2, FileSpreadsheet,
  ShieldAlert, Eye, EyeOff, ChevronDown, ChevronUp, ArrowUpDown, Info, ExternalLink,
} from 'lucide-react'
import HoverPopover from '@/components/HoverPopover'

type SortCol = 'severity' | 'dnDate' | 'dnNumber' | 'customer' | 'item' | 'snapshot' | 'qt' | 'diff'
type SortDir = 'asc' | 'desc'

const SEVERITY_RANK: Record<PriceAuditSeverity, number> = {
  critical: 0, high: 1, warning: 2, info: 3,
}

export default function PriceAudit() {
  const router = useRouter()
  // Date filter — default = current month (per ติ๊ด: monitor by date range)
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())

  // Other filters
  const [customerId, setCustomerId] = useState<string>('all')
  // 305: expand 'info' รับการคลิก OK card (info = OK rows)
  const [severity, setSeverity] = useState<'all' | 'critical' | 'high' | 'warning' | 'info'>('all')
  const [reason, setReason] = useState<'all' | PriceAuditReason>('all')
  const [showOk, setShowOk] = useState(false)
  const [search, setSearch] = useState('')

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // 304: Lazy render — กัน performance lag เมื่อ 5000+ rows (เคสติ๊ดเจอใน Price Audit)
  const INITIAL_VISIBLE = 200
  const LOAD_MORE_STEP = 200
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  // Reset visible count เมื่อ filter เปลี่ยน → user ไม่ติดอยู่ที่ count เดิม
  useEffect(() => { setVisibleCount(INITIAL_VISIBLE) }, [
    dateFrom, dateTo, customerId, severity, reason, showOk, search, sortCol, sortDir,
  ])

  const filters: PriceAuditFilters = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    customerId,
    severity,
    reason,
    showOk,
    showFlatRate: false, // ติ๊ดยืนยัน: ตัด flat-rate ออก
    search,
  }), [dateFrom, dateTo, customerId, severity, reason, showOk, search])

  const { rows, stats } = usePriceAudit(filters)

  // Sort rows
  const sortedRows = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'severity':
          cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
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
        case 'item':
          cmp = a.itemCode.localeCompare(b.itemCode)
          break
        case 'snapshot':
          cmp = (a.snapshotPrice ?? -1) - (b.snapshotPrice ?? -1)
          break
        case 'qt':
          cmp = (a.qtPrice ?? -1) - (b.qtPrice ?? -1)
          break
        case 'diff':
          cmp = Math.abs(a.diff ?? 0) - Math.abs(b.diff ?? 0)
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
    const headers = [
      'Severity', 'Reason', 'DN วันที่', 'DN#', 'Billed', 'ลูกค้า', 'ลูกค้าเต็ม',
      'QT#', 'รหัส', 'ชื่อรายการ', 'SD ราคา', 'QT ราคา', 'Diff', 'Diff %',
    ]
    const data = sortedRows.map(r => [
      r.severity,
      REASON_CONFIG[r.reason].label,
      r.dnDate,
      r.dnNumber,
      r.isBilled ? 'Yes' : 'No',
      r.customerShortName,
      r.customerName,
      r.qtNumber || '-',
      r.itemCode,
      r.itemName,
      r.snapshotPrice == null ? '-' : r.snapshotPrice.toFixed(2),
      r.qtPrice == null ? '-' : r.qtPrice.toFixed(2),
      r.diff == null ? '-' : r.diff.toFixed(2),
      r.diffPercent == null ? '-' : r.diffPercent.toFixed(1) + '%',
    ])
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'all')
    exportCSV(headers, data, formatExportFilename('PriceAudit', '', range))
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <ShieldAlert className="w-3.5 h-3.5" />
          Price Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจราคาในใบส่งของ vs ใบเสนอราคา</h2>
        <p className="text-sm opacity-90 mt-1">
          เครื่องมือ <span className="font-semibold">monitor only</span> — ตรวจหาความไม่ตรงกันของราคา ระบบไม่แก้ไขข้อมูลย้อนหลัง
        </p>
      </div>

      {/* Date filter — primary */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
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
          // 306: exclusive — set ครบทุก filter ทุกครั้ง กัน state ค้าง
          active={severity === 'critical'}
          onClick={() => {
            if (severity === 'critical') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('critical'); setReason('all'); setShowOk(false) }
          }}
          sub="ออกบิลแล้ว + ราคาผิด"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="High"
          value={stats.high}
          color="orange"
          active={severity === 'high'}
          onClick={() => {
            if (severity === 'high') { setSeverity('all'); setReason('all'); setShowOk(false) }
            else { setSeverity('high'); setReason('all'); setShowOk(false) }
          }}
          sub="ยังไม่ออกบิล"
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="OK"
          value={stats.ok}
          color="emerald"
          // 305: คลิก OK = ดูเฉพาะ OK rows (severity='info') — exclusive กับ ตรวจแล้ว
          active={severity === 'info'}
          onClick={() => {
            if (severity === 'info') {
              // toggle off — กลับ default view
              setSeverity('all'); setReason('all'); setShowOk(false)
            } else {
              setSeverity('info'); setReason('all'); setShowOk(true)
            }
          }}
          sub="ราคาตรง QT"
        />
        <StatCard
          icon={<Eye className="w-4 h-4" />}
          label="ตรวจแล้ว"
          value={stats.total}
          color="slate"
          // 304: active เมื่อ filter ทุกตัว reset (รวม showOk) — ก่อนหน้า ไม่ touch showOk ทำให้ตัวเลขกับ list ไม่ตรงกัน
          active={severity === 'all' && reason === 'all' && showOk}
          onClick={() => { setSeverity('all'); setReason('all'); setShowOk(true) }}
          sub={`${stats.dnsAudited} DN · ${stats.customersAudited} ลูกค้า`}
        />
        {/* 237: ปรับ label ให้ชัด — ลูกค้าที่ถูกข้ามคือ "เหมาเดือน" (ไม่มีราคา/ชิ้น)
            ไม่ใช่ลูกค้า per-piece + min/month floor (ตัวนั้นยัง audit ได้) */}
        <HoverPopover
          placement="bottom-start"
          trigger={
            <div className="h-full">
              <StatCard
                icon={<EyeOff className="w-4 h-4" />}
                label="เหมาเดือน ข้าม"
                value={stats.flatRateExcluded}
                color="slate"
                active={false}
                onClick={() => {}}
                sub={stats.flatRateCustomers.length > 0
                  ? `${stats.flatRateCustomers.length} ลูกค้า · hover เพื่อดู`
                  : 'ไม่มีราคา/ชิ้นให้เทียบ'}
                disabled
              />
            </div>
          }
          content={
            stats.flatRateCustomers.length === 0 ? (
              <div className="text-[11px]">ไม่มีลูกค้าเหมาเดือนในช่วงนี้</div>
            ) : (
              <div>
                <div className="font-semibold mb-1 text-slate-200">
                  <Info className="w-3 h-3 inline mr-1" />
                  ลูกค้าเหมาเดือนที่ถูกข้าม ({stats.flatRateCustomers.length} ราย)
                </div>
                <ul className="space-y-0.5 mt-1">
                  {stats.flatRateCustomers.slice(0, 15).map(c => (
                    <li key={c.id} className="text-[11px] flex items-center justify-between gap-3">
                      <span>
                        <span className="text-cyan-300 font-medium">{c.shortName}</span>
                        <span className="opacity-70 ml-1">— {c.name}</span>
                      </span>
                      <span className="font-mono text-amber-300">{c.dnCount} DN</span>
                    </li>
                  ))}
                  {stats.flatRateCustomers.length > 15 && (
                    <li className="text-[10px] opacity-60 italic">+{stats.flatRateCustomers.length - 15} ราย อื่นๆ</li>
                  )}
                </ul>
                <div className="text-[10px] opacity-70 mt-2 pt-2 border-t border-slate-700">
                  เหมาเดือน = ไม่ติ๊ก &quot;คิดตามหน่วย&quot; → ไม่มีราคา/ชิ้นให้ Price Audit เทียบ<br />
                  (ลูกค้าที่คิดตามหน่วย + มี &quot;ขั้นต่ำ/เดือน&quot; ยัง audit ได้ปกติ)
                </div>
              </div>
            )
          }
        />
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
              placeholder="ค้นหา DN# / ลูกค้า / รหัส / ชื่อ"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-64"
            />
          </div>
          <div className="min-w-[180px]">
            <CustomerPicker
              value={customerId === 'all' ? '' : customerId}
              onChange={(id) => setCustomerId(id || 'all')}
              allowAll
            />
          </div>
          <select
            value={reason}
            onChange={e => setReason(e.target.value as 'all' | PriceAuditReason)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
            <option value="all">ทุกเหตุผล</option>
            <option value="price_mismatch">{REASON_CONFIG.price_mismatch.icon} ราคาไม่ตรง</option>
            <option value="missing_snapshot">{REASON_CONFIG.missing_snapshot.icon} ไม่มี snapshot</option>
            <option value="zero_price">{REASON_CONFIG.zero_price.icon} ราคา 0</option>
            <option value="orphan_item">{REASON_CONFIG.orphan_item.icon} ไม่อยู่ใน QT</option>
            <option value="no_qt">{REASON_CONFIG.no_qt.icon} ไม่มี QT</option>
            <option value="ok">{REASON_CONFIG.ok.icon} ราคาตรง</option>
          </select>
          {/* 306: ลบ checkbox + toolbar count — confusing & duplicate
              ใช้ stat cards เป็น single control: OK card = ดูเฉพาะ OK · ตรวจแล้ว = ทั้งหมด
              FloatingTotalBar (ล่างจอ) แสดง count แทน */}
        </div>
        <button
          onClick={handleExportCSV}
          disabled={sortedRows.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          ส่งออก CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <Th col="severity" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">Severity</Th>
                <Th col="dnDate" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">วันที่</Th>
                <Th col="dnNumber" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">DN#</Th>
                <Th col="customer" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">ลูกค้า</Th>
                <Th col="item" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">รหัส / ชื่อ</Th>
                <Th col="snapshot" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">SD ราคา</Th>
                <Th col="qt" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">QT ราคา</Th>
                <Th col="diff" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">Diff</Th>
                <th className="px-3 py-2 text-left font-medium">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-slate-400 text-sm">
                    {stats.total === 0 ? 'ไม่มีข้อมูลในช่วงเวลานี้' : 'ไม่พบรายการตาม filter — ทุกอย่าง OK ในช่วงนี้ 🎉'}
                  </td>
                </tr>
              ) : sortedRows.slice(0, visibleCount).map(r => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2"><SeverityBadge sev={r.severity} isBilled={r.isBilled} /></td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{formatDate(r.dnDate)}</td>
                  <td className="px-3 py-2">
                    {/* 401 — DN# = link เปิดใบส่งของ (SD) ที่หน้า delivery */}
                    <button onClick={() => router.push(`/dashboard/delivery?detail=${r.dnId}`)}
                      title="เปิดใบส่งของ (SD)"
                      className="font-mono text-xs font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1">
                      {r.dnNumber}<ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700">{r.customerShortName}</div>
                    <div className="text-xs text-slate-400">{r.qtNumber || <em className="text-red-500">— ไม่มี QT —</em>}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-slate-500">{r.itemCode}</div>
                    <div className="text-xs text-slate-700">{r.itemName}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.snapshotPrice == null
                      ? <span className="text-red-500 italic text-xs">missing</span>
                      : r.snapshotPrice === 0
                        ? <span className="text-orange-500">0.00</span>
                        : formatCurrency(r.snapshotPrice)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {r.qtPrice == null
                      ? <span className="text-slate-400 italic text-xs">—</span>
                      : formatCurrency(r.qtPrice)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.diff == null
                      ? <span className="text-slate-400">—</span>
                      : (
                        <span className={cn(
                          r.diff > 0 ? 'text-blue-600' : r.diff < 0 ? 'text-red-600' : 'text-emerald-600',
                        )}>
                          {r.diff > 0 ? '+' : ''}{r.diff.toFixed(2)}
                          {r.diffPercent != null && <span className="text-xs ml-1 opacity-70">({r.diffPercent > 0 ? '+' : ''}{r.diffPercent.toFixed(1)}%)</span>}
                        </span>
                      )}
                  </td>
                  <td className="px-3 py-2">
                    <ReasonBadge reason={r.reason} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 304: Load more — กัน lag เมื่อ result เยอะ (5000+) */}
        {sortedRows.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + LOAD_MORE_STEP)}
            className="w-full px-3 py-2.5 text-xs text-[#1B3A5C] bg-slate-50 hover:bg-slate-100 border-t border-slate-200 font-medium"
          >
            ↓ แสดงเพิ่ม {Math.min(LOAD_MORE_STEP, sortedRows.length - visibleCount).toLocaleString()} รายการ
            <span className="text-slate-400 ml-2">(เหลือ {(sortedRows.length - visibleCount).toLocaleString()} รายการ)</span>
          </button>
        )}
      </div>

      {/* 304: FloatingTotalBar — sticky bottom summary */}
      <FloatingTotalBar show={sortedRows.length > 0}>
        <span>
          แสดง <strong className="text-[#1B3A5C]">{Math.min(visibleCount, sortedRows.length).toLocaleString()}</strong>
          {sortedRows.length > visibleCount && <> จาก <strong>{sortedRows.length.toLocaleString()}</strong></>}
          {' '}รายการ
          {(severity !== 'all' || reason !== 'all' || !showOk || search) && (
            <span className="text-slate-400 ml-2">(กรองจากทั้งหมด {stats.total.toLocaleString()})</span>
          )}
        </span>
      </FloatingTotalBar>

      {/* Legend */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1.5">
        <div className="font-medium text-slate-700">📖 คำอธิบาย</div>
        <div><span className="font-medium text-red-600">🔴 Critical</span> — DN ที่ออกบิลแล้ว แต่ราคาไม่ตรง QT (ตรวจสอบเอกสาร)</div>
        <div><span className="font-medium text-orange-600">🟠 High</span> — DN ที่ยังไม่ออกบิล + ราคาไม่ตรง (ตรวจก่อนออกบิล)</div>
        <div><span className="font-medium text-amber-600">{REASON_CONFIG.orphan_item.icon} Ad-hoc</span> — รายการใน DN ที่ไม่มีใน QT (ของเพิ่มเติมนอกข้อตกลง)</div>
        <div className="text-slate-400 italic mt-2">เครื่องมือนี้ <strong>read-only</strong> — ไม่แก้ไขข้อมูลย้อนหลัง</div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────

function Th({ col, sortCol, sortDir, onClick, align, children }: {
  col: SortCol; sortCol: SortCol; sortDir: SortDir; onClick: (c: SortCol) => void
  align: 'left' | 'right' | 'center'; children: React.ReactNode
}) {
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        'px-3 py-2 font-medium select-none cursor-pointer hover:bg-slate-100 transition-colors',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      )}>
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {children}
        {sortCol === col
          ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  )
}

function SeverityBadge({ sev, isBilled }: { sev: PriceAuditSeverity; isBilled: boolean }) {
  const cfg: Record<PriceAuditSeverity, { color: string; label: string; icon: string }> = {
    critical: { color: 'bg-red-100 text-red-700 border-red-200',         label: 'Critical', icon: '🔴' },
    high:     { color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'High',     icon: '🟠' },
    warning:  { color: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Warning',  icon: '🟡' },
    info:     { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'OK',  icon: '🟢' },
  }
  const c = cfg[sev]
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium', c.color)}>
      <span>{c.icon}</span>
      {c.label}
      {isBilled && sev !== 'info' && <span className="ml-0.5 px-1 bg-white/60 rounded text-[9px]">📄 billed</span>}
    </span>
  )
}

function ReasonBadge({ reason }: { reason: PriceAuditReason }) {
  const cfg = REASON_CONFIG[reason]
  const colorMap: Record<string, string> = {
    red:     'bg-red-50 text-red-700',
    orange:  'bg-orange-50 text-orange-700',
    amber:   'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium', colorMap[cfg.color])}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

function StatCard({ icon, label, value, color, sub, active, onClick, disabled }: {
  icon: React.ReactNode; label: string; value: number; color: string
  sub: string; active: boolean; onClick: () => void; disabled?: boolean
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
      disabled={disabled}
      className={cn(
        'p-3 rounded-xl border text-left transition-all',
        active ? 'border-[#1B3A5C] ring-2 ring-[#3DD8D8]/40 bg-white' : 'border-slate-200 bg-white hover:border-slate-300',
        disabled && 'opacity-60 cursor-default',
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
