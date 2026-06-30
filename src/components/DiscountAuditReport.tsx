'use client'

// 473 — รายงานส่วนลด/ชดเชย (Discount & Claim Audit)
//   track ส่วนลด/ชดเชยค่าเสียหายที่ให้ลูกค้า: รายไหน เดือนไหน เท่าไร เกิดที่เอกสารใบไหน
//   ไล่รอย SD → WB → IV (ยอดเดียวกันไหลต่อ) + เตือน SD ที่มีส่วนลดแต่ยังไม่วางบิล
import { useState, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { buildDiscountEntries, groupDiscountByCustomerMonth, type CustomerMonthDiscount } from '@/lib/discount-audit'
import { exportCSV } from '@/lib/export'
import { formatCurrency, formatDate, cn, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import DateFilter from '@/components/DateFilter'
import CustomerPicker from '@/components/CustomerPicker'
import {
  Search, FileSpreadsheet, Gift, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink, ArrowRight, Receipt, FileText, Package,
} from 'lucide-react'

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return `${TH_MONTH[m - 1]} ${y}`
}

type SortCol = 'customer' | 'month' | 'total' | 'unbilled'

export default function DiscountAuditReport() {
  const router = useRouter()
  const { deliveryNotes, billingStatements, taxInvoices, linenForms, quotations, getCustomer } = useStore()

  const [dateMode, setDateMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())
  const [customerId, setCustomerId] = useState('all')
  const [search, setSearch] = useState('')
  const [onlyUnbilled, setOnlyUnbilled] = useState(false)
  const [sortCol, setSortCol] = useState<SortCol>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const custName = (id: string) => { const c = getCustomer(id); return c ? (c.shortName || c.name) : id }

  // ดึงส่วนลด/ชดเชยจาก SD ทุกใบ → กรองช่วงวัน + ลูกค้า + ค้นหา
  const entries = useMemo(
    () => buildDiscountEntries(deliveryNotes, billingStatements, taxInvoices, linenForms, quotations),
    [deliveryNotes, billingStatements, taxInvoices, linenForms, quotations])

  const filtered = useMemo(() => entries.filter(e => {
    if (dateFrom && e.date < dateFrom) return false
    if (dateTo && e.date > dateTo) return false
    if (customerId !== 'all' && e.customerId !== customerId) return false
    if (onlyUnbilled && e.billed) return false
    if (search.trim() && !matchesThaiQueryAnyField(
      [custName(e.customerId), e.dnNumber, e.wbNumber, e.ivNumber, e.discountNote], search)) return false
    return true
  }), [entries, dateFrom, dateTo, customerId, onlyUnbilled, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const g = groupDiscountByCustomerMonth(filtered)
    const dir = sortDir === 'asc' ? 1 : -1
    return g.sort((a, b) => {
      switch (sortCol) {
        case 'customer': return custName(a.customerId).localeCompare(custName(b.customerId), 'th') * dir || b.month.localeCompare(a.month)
        case 'month': return a.month.localeCompare(b.month) * dir
        case 'unbilled': return (a.unbilledCount - b.unbilledCount) * dir
        default: return (a.total - b.total) * dir
      }
    })
  }, [filtered, sortCol, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => ({
    total: filtered.reduce((s, e) => s + e.total, 0),
    claim: filtered.reduce((s, e) => s + e.claimValue, 0),
    special: filtered.reduce((s, e) => s + e.specialDiscount, 0),
    customers: new Set(filtered.map(e => e.customerId)).size,
    sd: filtered.length,
    unbilled: filtered.filter(e => !e.billed).length,
  }), [filtered])

  const toggle = (key: string) => setExpanded(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n
  })
  const onSort = (c: SortCol) => {
    if (c === sortCol) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(c); setSortDir('desc') }
  }

  const exportRows = () => {
    const headers = ['ลูกค้า', 'เดือน', 'SD', 'วันที่', 'ชดเชยเคลม', 'ชิ้นเคลม(SD)', 'ส่วนลดพิเศษ', 'หมายเหตุ', 'รวม', 'ชิ้นเคลม(LF)', 'วางบิล', 'WB', 'IV']
    const rows: string[][] = []
    for (const g of groups) for (const e of g.entries) {
      rows.push([
        custName(e.customerId), monthLabel(e.month), e.dnNumber, formatDate(e.date),
        e.claimValue.toFixed(2), String(e.claimPieces), e.specialDiscount.toFixed(2),
        e.discountNote, e.total.toFixed(2), String(e.lfClaimPieces),
        e.billed ? 'วางบิลแล้ว' : 'ยังไม่วางบิล', e.wbNumber, e.ivNumber,
      ])
    }
    exportCSV(headers, rows, formatExportFilename('ส่วนลด-ชดเชย', customerId !== 'all' ? custName(customerId) : undefined, dateFrom))
  }

  return (
    <div className="space-y-4">
      {/* หัวเรื่อง + คำอธิบาย */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-base font-bold text-[#1B3A5C] flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#3DD8D8]" /> รายงานส่วนลด / ชดเชยค่าเสียหาย
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          รวม &ldquo;ส่วนลด/ชดเชย&rdquo; ที่ให้ลูกค้าแต่ละราย/เดือน — ทั้ง <b className="text-rose-600">เคลม</b> (ผ้าเสียหาย/หาย ในใบส่งของ)
          และ <b className="text-amber-600">ส่วนลดพิเศษ</b>. ยอดคิดจาก <b>ใบส่งของ (SD)</b> ซึ่งเป็นต้นทาง แล้วไล่รอยว่ายอด<b>เดียวกัน</b>นี้
          ไหลไป <b>ใบวางบิล (WB)</b> → <b>ใบกำกับ (IV)</b> ครบไหม. <span className="text-rose-600 font-medium">⚠ ยังไม่วางบิล</span> = ส่วนลดยังไม่ถึงบิล ต้องตรวจ
        </p>
      </div>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-end gap-3">
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateMode}
          onModeChange={setDateMode} onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          onClear={() => { setDateFrom(''); setDateTo('') }} />
        <div className="min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">ลูกค้า</label>
          <CustomerPicker value={customerId === 'all' ? '' : customerId}
            onChange={id => setCustomerId(id || 'all')} allowAll placeholder="ทุกลูกค้า" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 pb-2 cursor-pointer">
          <input type="checkbox" checked={onlyUnbilled} onChange={e => setOnlyUnbilled(e.target.checked)} className="rounded accent-rose-500" />
          เฉพาะที่ยังไม่วางบิล
        </label>
        <div className="relative pb-0.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า / เลขเอกสาร"
            className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-56" />
        </div>
        {groups.length > 0 && (
          <button onClick={exportRows} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 whitespace-nowrap">
            <FileSpreadsheet className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SumCard label="รวมส่วนลด/ชดเชย" value={`฿${formatCurrency(totals.total)}`} accent />
        <SumCard label="ชดเชยเคลม + ส่วนลดพิเศษ" value={`฿${formatCurrency(totals.claim)} + ฿${formatCurrency(totals.special)}`} small />
        <SumCard label="ลูกค้า / ใบ SD" value={`${totals.customers} ราย · ${totals.sd} ใบ`} small />
        <SumCard label="ยังไม่วางบิล (ต้องตรวจ)" value={`${totals.unbilled} ใบ`} warn={totals.unbilled > 0} />
      </div>

      {/* ตารางจัดกลุ่ม ลูกค้า×เดือน */}
      {groups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Gift className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ไม่มีส่วนลด/ชดเชยในช่วงที่เลือก</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                  <SortTh col="customer" label="ลูกค้า" className="text-left" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                  <SortTh col="month" label="เดือน" className="text-left" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">ชดเชยเคลม</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">ส่วนลดพิเศษ</th>
                  <SortTh col="total" label="รวม" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">ใบ SD</th>
                  <SortTh col="unbilled" label="ยังไม่วางบิล" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map(g => {
                  const key = `${g.customerId}|${g.month}`
                  const open = expanded.has(key)
                  return (
                    <Fragment key={key}>
                      <tr onClick={() => toggle(key)} className="hover:bg-slate-50 cursor-pointer">
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            {custName(g.customerId)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{monthLabel(g.month)}</td>
                        <td className="px-3 py-2.5 text-right text-rose-600 whitespace-nowrap">{g.claimValue > 0 ? `฿${formatCurrency(g.claimValue)}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-amber-600 whitespace-nowrap">{g.specialDiscount > 0 ? `฿${formatCurrency(g.specialDiscount)}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-[#1B3A5C] whitespace-nowrap">฿{formatCurrency(g.total)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500">{g.sdCount}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {g.unbilledCount > 0
                            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-medium"><AlertTriangle className="w-3 h-3" />{g.unbilledCount}</span>
                            : <span className="text-emerald-600 text-xs">✓ ครบ</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} className="px-3 pb-3 pt-0 bg-slate-50/50">
                            <DetailTable g={g} onOpenSD={dnId => router.push(`/dashboard/delivery?detail=${dnId}`)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** หัวคอลัมน์เรียงได้ */
function SortTh({ col, label, className, sortCol, sortDir, onSort }: {
  col: SortCol; label: string; className?: string; sortCol: SortCol; sortDir: 'asc' | 'desc'; onSort: (c: SortCol) => void
}) {
  return (
    <th onClick={() => onSort(col)}
      className={cn('px-3 py-2 font-medium cursor-pointer select-none hover:bg-slate-100 whitespace-nowrap', className || 'text-right')}>
      <span className="inline-flex items-center gap-1">{label}{sortCol === col && <span className="text-[#3DD8D8]">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
    </th>
  )
}

/** รายการ SD รายใบในกลุ่ม + รอยไล่ SD → WB → IV */
function DetailTable({ g, onOpenSD }: { g: CustomerMonthDiscount; onOpenSD: (dnId: string) => void }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100/70 text-slate-500">
            <th className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap">วันที่</th>
            <th className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap">ใบส่งของ (SD)</th>
            <th className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap">ชดเชยเคลม</th>
            <th className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap">ส่วนลดพิเศษ</th>
            <th className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap">รวม</th>
            <th className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap">ไล่รอยเอกสาร (ยอดเดียวกัน)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {g.entries.map(e => (
            <tr key={e.dnId} className="hover:bg-slate-50">
              <td className="px-2.5 py-1.5 text-slate-500 whitespace-nowrap">{formatDate(e.date)}</td>
              <td className="px-2.5 py-1.5 whitespace-nowrap">
                <button onClick={() => onOpenSD(e.dnId)} className="inline-flex items-center gap-1 text-[#1B3A5C] font-medium hover:text-[#3DD8D8] hover:underline">
                  <Package className="w-3 h-3" /> {e.dnNumber} <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </button>
                {e.claimPieces > 0 && <span className="text-slate-400 ml-1">· {e.claimPieces} ชิ้น{e.lfClaimPieces !== e.claimPieces && e.lfClaimPieces > 0 ? ` (LF ${e.lfClaimPieces})` : ''}</span>}
              </td>
              <td className="px-2.5 py-1.5 text-right text-rose-600 whitespace-nowrap">{e.claimValue > 0 ? `฿${formatCurrency(e.claimValue)}` : '—'}</td>
              <td className="px-2.5 py-1.5 text-right text-amber-600 whitespace-nowrap" title={e.discountNote}>{e.specialDiscount > 0 ? `฿${formatCurrency(e.specialDiscount)}` : '—'}</td>
              <td className="px-2.5 py-1.5 text-right font-semibold text-[#1B3A5C] whitespace-nowrap">฿{formatCurrency(e.total)}</td>
              <td className="px-2.5 py-1.5 whitespace-nowrap">
                {e.billed ? (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Receipt className="w-3 h-3 text-emerald-600" /> {e.wbNumber}
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                    {e.ivNumber
                      ? <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3 text-blue-600" />{e.ivNumber}</span>
                      : <span className="text-amber-600">ยังไม่ออกใบกำกับ</span>}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600 font-medium"><AlertTriangle className="w-3 h-3" /> ยังไม่วางบิล</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.entries.some(e => e.discountNote) && (
        <div className="px-2.5 py-1.5 border-t border-slate-100 text-[11px] text-slate-400">
          หมายเหตุส่วนลด: {g.entries.filter(e => e.discountNote).map(e => `${e.dnNumber}: ${e.discountNote}`).join(' · ')}
        </div>
      )}
    </div>
  )
}

function SumCard({ label, value, accent, warn, small }: { label: string; value: string; accent?: boolean; warn?: boolean; small?: boolean }) {
  return (
    <div className={cn('border rounded-xl p-3', warn ? 'bg-rose-50 border-rose-200' : accent ? 'bg-[#1B3A5C] border-[#1B3A5C]' : 'bg-white border-slate-200')}>
      <div className={cn('text-xs mb-1', accent ? 'text-[#3DD8D8]' : warn ? 'text-rose-500' : 'text-slate-400')}>{label}</div>
      <div className={cn('font-bold', small ? 'text-sm' : 'text-lg', accent ? 'text-white' : warn ? 'text-rose-700' : 'text-slate-800')}>{value}</div>
    </div>
  )
}
