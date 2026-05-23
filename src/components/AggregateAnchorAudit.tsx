'use client'

/**
 * B2 — Aggregate Anchor Value Drift Audit
 *
 * Detect: LF ที่ลูกค้า opt-in aggregate แต่ค่า col2/col5 ไม่ได้อยู่ที่ anchor row
 *         (= manual edit หลุดจาก aggregate convention)
 *
 * Convention (aggregate mode):
 * - col2Agg=true → ค่ารวม col2 ของกลุ่ม ต้องอยู่ที่ anchor row, non-anchor = 0
 * - col5Agg=true → ค่ารวม col5 ของกลุ่ม ต้องอยู่ที่ anchor row, non-anchor = 0
 *
 * Drift case:
 * - col2Agg=true แต่ non-anchor row มี col2 > 0 → ค่าหลุดไป non-anchor
 * - col5Agg=true แต่ non-anchor row มี col5 > 0 → ค่าหลุดไป non-anchor
 *
 * ทำไม drift = problem:
 * - getCarryOver ใช้ `shouldAggregateForMode` ที่อาศัย row.code → group sum
 *   ปัจจุบัน logic sum diff ของ rows ใน group → ถ้าค่ากระจาย ก็ยัง sum ถูก
 * - แต่ visual presentation (LF Grid + Print) แสดง anchor row ที่ "ค่ารวม"
 *   ถ้าค่ากระจาย non-anchor → anchor มีค่าไม่ครบ → user งง
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { exportCSV } from '@/lib/export'
import { formatDate, cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import {
  Search, AlertTriangle, AlertOctagon, FileSpreadsheet, ExternalLink, Package,
} from 'lucide-react'

type Severity = 'high' | 'medium'

interface DriftRow {
  id: string
  lfId: string
  lfNumber: string
  date: string
  customerId: string
  customerShortName: string
  customerName: string
  groupKey: string
  anchorCode: string
  anchorName: string
  /** code ที่มีค่า drift */
  driftCode: string
  driftName: string
  /** which column drifted */
  driftColumn: 'col2' | 'col5'
  /** value ที่กระจายอยู่ */
  driftValue: number
  /** anchor row's value ของ column นี้ (ดูครบหรือเปล่า) */
  anchorValue: number
  /** group sum รวมทั้งหมด */
  groupSum: number
  severity: Severity
}

export default function AggregateAnchorAudit() {
  const router = useRouter()
  const { linenForms, customers, linenCatalog } = useStore()

  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())
  const [customerId, setCustomerId] = useState<string>('all')
  const [search, setSearch] = useState('')

  const rows = useMemo<DriftRow[]>(() => {
    const result: DriftRow[] = []
    const custMap = new Map(customers.map(c => [c.id, c]))
    const catalogMap = new Map(linenCatalog.map(i => [i.code, i]))

    for (const f of linenForms) {
      if (dateFrom && f.date < dateFrom) continue
      if (dateTo && f.date > dateTo) continue
      if (customerId !== 'all' && f.customerId !== customerId) continue
      const cust = custMap.get(f.customerId)
      if (!cust) continue

      // ใช้ form.aggregateSnapshot ก่อน (drift-proof) → fallback customer
      const snapshot = f.aggregateSnapshot
      const cfgs = cust.aggregateSizeGroups || []
      if (!snapshot && cfgs.length === 0) continue

      const groupKeys = new Set<string>([
        ...Object.keys(snapshot || {}),
        ...cfgs.map(c => c.groupKey),
      ])

      for (const groupKey of groupKeys) {
        const snap = snapshot?.[groupKey]
        const cfg = cfgs.find(c => c.groupKey === groupKey)
        const col2Agg = (snap?.col2Mode ?? cfg?.col2Mode ?? 'per_row') === 'aggregate'
        const col5Agg = (snap?.col5Mode ?? cfg?.col5Mode ?? 'aggregate') === 'aggregate'
        if (!col2Agg && !col5Agg) continue

        const groupItems = linenCatalog.filter(i => i.sizeGroup === groupKey)
        if (groupItems.length === 0) continue
        const anchorCode = snap?.anchorCode || getGroupAnchorCode(groupItems, cfg?.anchorCode)
        const anchorItem = catalogMap.get(anchorCode)
        const anchorRow = f.rows.find(r => r.code === anchorCode)
        const groupCodes = new Set(groupItems.map(i => i.code))

        // Check each non-anchor row in this group
        for (const row of f.rows) {
          if (!groupCodes.has(row.code)) continue
          if (row.code === anchorCode) continue
          const item = catalogMap.get(row.code)
          if (!item) continue

          if (col2Agg && row.col2_hotelCountIn > 0) {
            const sum = f.rows.reduce((s, r) => groupCodes.has(r.code) ? s + r.col2_hotelCountIn : s, 0)
            result.push({
              id: `${f.id}__${row.code}__col2`,
              lfId: f.id, lfNumber: f.formNumber, date: f.date,
              customerId: f.customerId, customerShortName: cust.shortName, customerName: cust.name,
              groupKey,
              anchorCode, anchorName: anchorItem?.name || anchorCode,
              driftCode: row.code, driftName: item.name,
              driftColumn: 'col2',
              driftValue: row.col2_hotelCountIn,
              anchorValue: anchorRow?.col2_hotelCountIn || 0,
              groupSum: sum,
              severity: (anchorRow?.col2_hotelCountIn || 0) === 0 ? 'high' : 'medium',
            })
          }
          if (col5Agg && row.col5_factoryClaimApproved > 0) {
            const sum = f.rows.reduce((s, r) => groupCodes.has(r.code) ? s + r.col5_factoryClaimApproved : s, 0)
            result.push({
              id: `${f.id}__${row.code}__col5`,
              lfId: f.id, lfNumber: f.formNumber, date: f.date,
              customerId: f.customerId, customerShortName: cust.shortName, customerName: cust.name,
              groupKey,
              anchorCode, anchorName: anchorItem?.name || anchorCode,
              driftCode: row.code, driftName: item.name,
              driftColumn: 'col5',
              driftValue: row.col5_factoryClaimApproved,
              anchorValue: anchorRow?.col5_factoryClaimApproved || 0,
              groupSum: sum,
              severity: (anchorRow?.col5_factoryClaimApproved || 0) === 0 ? 'high' : 'medium',
            })
          }
        }
      }
    }
    // Sort: severity desc → date desc → LF#
    const sevRank: Record<Severity, number> = { high: 0, medium: 1 }
    result.sort((a, b) => {
      if (a.severity !== b.severity) return sevRank[a.severity] - sevRank[b.severity]
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return a.lfNumber.localeCompare(b.lfNumber)
    })
    return result
  }, [linenForms, customers, linenCatalog, dateFrom, dateTo, customerId])

  const filtered = useMemo(() => {
    let list = rows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r =>
        r.lfNumber.toLowerCase().includes(q) ||
        r.customerShortName.toLowerCase().includes(q) ||
        r.driftCode.toLowerCase().includes(q) ||
        r.anchorCode.toLowerCase().includes(q) ||
        r.groupKey.toLowerCase().includes(q),
      )
    }
    return list
  }, [rows, search])

  const stats = useMemo(() => {
    let high = 0, medium = 0
    for (const r of rows) {
      if (r.severity === 'high') high++
      else medium++
    }
    return { high, medium, total: rows.length }
  }, [rows])

  const handleExportCSV = () => {
    if (filtered.length === 0) return
    const headers = ['Severity', 'วันที่', 'LF#', 'ลูกค้า', 'Group', 'Anchor', 'Drift Row', 'Column', 'Drift Value', 'Anchor Value', 'Group Sum']
    const data = filtered.map(r => [
      r.severity, r.date, r.lfNumber, r.customerShortName,
      r.groupKey, `${r.anchorCode} ${r.anchorName}`, `${r.driftCode} ${r.driftName}`,
      r.driftColumn, String(r.driftValue), String(r.anchorValue), String(r.groupSum),
    ])
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : (dateFrom || 'all')
    exportCSV(headers, data, formatExportFilename('AnchorDrift', '', range))
  }

  const goToLF = (lfId: string) => router.push(`/dashboard/linen-forms?detail=${lfId}`)

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <Package className="w-3.5 h-3.5" />
          Aggregate Anchor Value Drift Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจค่าที่หลุดจาก anchor row ใน aggregate group</h2>
        <p className="text-sm opacity-90 mt-1">
          ลูกค้า opt-in aggregate (col2/col5) แต่ค่าไม่อยู่ที่ anchor row → <strong>manual edit drift</strong>
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

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<AlertOctagon className="w-4 h-4" />} label="High" value={stats.high} color="red"
          sub="anchor=0 แต่ non-anchor มีค่า" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Medium" value={stats.medium} color="amber"
          sub="anchor มีค่าด้วย — drift บางส่วน" />
        <StatCard icon={<Package className="w-4 h-4" />} label="Total drifts" value={stats.total} color="slate"
          sub="instance ของค่าหลุดทั้งหมด" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา LF# / ลูกค้า / group / code"
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-64" />
          </div>
          <div className="min-w-[180px]">
            <CustomerPicker value={customerId === 'all' ? '' : customerId}
              onChange={(id) => setCustomerId(id || 'all')} allowAll />
          </div>
        </div>
        <button onClick={handleExportCSV} disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50">
          <FileSpreadsheet className="w-3.5 h-3.5" />Export CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs w-16">Sev</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">LF#</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">ลูกค้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Group / Anchor</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Drift</th>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs">Col</th>
                <th className="text-right px-2 py-2.5 font-medium text-slate-600 text-xs">Value</th>
                <th className="text-right px-2 py-2.5 font-medium text-slate-600 text-xs">Anchor</th>
                <th className="text-right px-2 py-2.5 font-medium text-slate-600 text-xs">Sum</th>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">
                  {stats.total === 0 ? '✓ ไม่พบ anchor drift — aggregate ทำงานปกติ' : 'ไม่พบที่ตรงเงื่อนไข'}
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 text-center">
                    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border',
                      r.severity === 'high'
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : 'bg-amber-100 text-amber-700 border-amber-200',
                    )}>
                      {r.severity === 'high' ? 'High' : 'Med'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-slate-600">{formatDate(r.date)}</td>
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
                  <td className="px-3 py-2 text-xs">
                    <div className="font-mono text-indigo-700">{r.groupKey}</div>
                    <div className="text-slate-500">⚓ {r.anchorCode} {r.anchorName}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-mono text-orange-700">{r.driftCode}</div>
                    <div className="text-slate-600">{r.driftName}</div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {r.driftColumn}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-orange-700">{r.driftValue}</td>
                  <td className={cn('px-2 py-2 text-right font-mono', r.anchorValue === 0 ? 'text-slate-400' : 'text-slate-700')}>{r.anchorValue}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-slate-800">{r.groupSum}</td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => goToLF(r.lfId)}
                      title="เปิด LF เพื่อแก้ — ย้ายค่าไป anchor row"
                      className="p-1 text-slate-400 hover:text-[#1B3A5C]">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-400 italic">
        💡 <strong>Anchor drift</strong>: ค่า col2/col5 ที่ aggregate ควรอยู่ที่ anchor row เท่านั้น
        ถ้าหลุดไป non-anchor → manual edit · ผลกระทบ: visual presentation ดูสับสน
        แต่ getCarryOver ยัง sum group ถูก (ค่ารวมไม่หาย)
      </div>

      <FloatingTotalBar show={filtered.length > 0}>
        <span>แสดง <strong className="text-[#1B3A5C]">{filtered.length.toLocaleString()}</strong> drift instance</span>
      </FloatingTotalBar>
    </div>
  )
}

function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number; color: string; sub: string
}) {
  const colorMap: Record<string, string> = {
    red: 'text-red-600 bg-red-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-50',
  }
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white">
      <div className={cn('inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium', colorMap[color])}>
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  )
}
