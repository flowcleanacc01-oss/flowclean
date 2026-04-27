'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, formatCurrency, cn, todayISO, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import { highlightText, highlightAmount, matchesAmountQuery } from '@/lib/highlight'
import { Search, FileDown, Trash2, Printer, FileText, Plus, ExternalLink, Check } from 'lucide-react'
import Modal from '@/components/Modal'
import DeleteWithRedirectModal from '@/components/DeleteWithRedirectModal'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import ReceiptPrint from '@/components/ReceiptPrint'
import ExportButtons from '@/components/ExportButtons'
import CustomerPicker from '@/components/CustomerPicker'
import { canViewBilling } from '@/lib/permissions'
import { exportCSV } from '@/lib/export'
import { useRouter } from 'next/navigation'

type RCFilter = 'all' | 'not-printed' | 'printed' | 'not-paid' | 'paid'

/**
 * Receipts Page (Feature 148) — ใบเสร็จรับเงิน (RC)
 * สำหรับลูกค้าไม่คิด VAT (enableVat=false) ที่ต้องการหลักฐานการชำระเงิน
 */
export default function ReceiptsPage() {
  const {
    currentUser, receipts, billingStatements, customers, getCustomer,
    updateReceipt, deleteReceipt, addReceipt, deliveryNotes, taxInvoices, companyInfo,
  } = useStore()

  const router = useRouter()
  const searchParams = useSearchParams()
  const urlHighlightQ = searchParams.get('q') || '' // 147.2

  // 154: bulk select + print modals
  const [selectedRcIds, setSelectedRcIds] = useState<string[]>([])
  const [showRcPrintList, setShowRcPrintList] = useState(false)
  const [showRcBulkPrint, setShowRcBulkPrint] = useState(false)
  const [showSelectWbForRc, setShowSelectWbForRc] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  // 162.1: combine local search + URL ?q so live typing also highlights
  const highlightQ = [search, urlHighlightQ].filter(Boolean).join(' ').trim()
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [rcFilter, setRcFilter] = useState<RCFilter>('all')
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState(() => endOfMonthISO())
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Detail
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [activeRowId, setActiveRowId] = useState<string | null>(() => searchParams.get('detail'))
  const [showPrint, setShowPrint] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (!canViewBilling(currentUser)) {
    return <div className="text-center text-slate-400 py-20">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
  }

  const matchesDateFilter = (date: string) => {
    if (!dateFrom) return true
    if (dateFilterMode === 'single') return date === dateFrom
    if (date < dateFrom) return false
    if (dateTo && date > dateTo) return false
    return true
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const filtered = useMemo(() => {
    return receipts.filter(rc => {
      if (customerFilter !== 'all' && rc.customerId !== customerFilter) return false
      if (search) {
        const c = getCustomer(rc.customerId)
        const q = search.toLowerCase()
        const textMatch = rc.receiptNumber.toLowerCase().includes(q)
          || (c?.shortName || '').toLowerCase().includes(q)
          || (c?.name || '').toLowerCase().includes(q)
        // 162: also match by amount
        const amountMatch = matchesAmountQuery(search, [rc.grandTotal])
        if (!textMatch && !amountMatch) return false
      }
      if (!matchesDateFilter(rc.issueDate)) return false
      if (rcFilter === 'not-printed' && rc.isPrinted) return false
      if (rcFilter === 'printed' && !rc.isPrinted) return false
      if (rcFilter === 'not-paid' && rc.isPaid) return false
      if (rcFilter === 'paid' && !rc.isPaid) return false
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'receiptNumber': va = a.receiptNumber; vb = b.receiptNumber; break
        case 'customer': { const ca = getCustomer(a.customerId); va = ca?.shortName || ca?.name || ''; const cb = getCustomer(b.customerId); vb = cb?.shortName || cb?.name || ''; break }
        case 'grandTotal': va = a.grandTotal; vb = b.grandTotal; break
        case 'isPrinted': va = a.isPrinted ? 1 : 0; vb = b.isPrinted ? 1 : 0; break
        case 'isPaid': va = a.isPaid ? 1 : 0; vb = b.isPaid ? 1 : 0; break
        case 'wb': { va = billingStatements.find(b2 => b2.id === a.billingStatementId)?.billingNumber || ''; vb = billingStatements.find(b2 => b2.id === b.billingStatementId)?.billingNumber || ''; break }
        default: va = a.issueDate; vb = b.issueDate
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [receipts, customerFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, rcFilter])

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortedBg = (key: string) => sortKey === key ? 'bg-[#1B3A5C]/[0.04]' : ''

  const detailRC = showDetail ? receipts.find(r => r.id === showDetail) : null
  const detailCustomer = detailRC ? getCustomer(detailRC.customerId) : null
  const linkedWB = detailRC ? billingStatements.find(b => b.id === detailRC.billingStatementId) : null

  // Mark as printed when print modal opens
  useEffect(() => {
    if (showPrint && detailRC && !detailRC.isPrinted) {
      updateReceipt(detailRC.id, { isPrinted: true })
    }
  }, [showPrint, detailRC, updateReceipt])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">5. ใบเสร็จรับเงิน (RC)</h1>
          <p className="text-sm text-slate-500 mt-0.5">เอกสารสำหรับลูกค้าที่ไม่คิด VAT — ไม่ใช่ใบกำกับภาษี</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedRcIds.length > 0 && (
            <button onClick={() => setShowRcBulkPrint(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสารที่เลือก ({selectedRcIds.length})
            </button>
          )}
          <button onClick={() => setShowRcPrintList(true)} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
          </button>
          <button onClick={() => setShowSelectWbForRc(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />ออกใบเสร็จรับเงิน
          </button>
        </div>
      </div>

      {/* Search + customer filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบเสร็จ, ชื่อลูกค้า, จำนวนเงิน..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        {/* 162.2: searchable CustomerPicker */}
        <CustomerPicker
          value={customerFilter === 'all' ? '' : customerFilter}
          onChange={id => setCustomerFilter(id || 'all')}
          allowAll
        />
      </div>

      <div className="mb-4">
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateFilterMode}
          onModeChange={setDateFilterMode} onDateFromChange={setDateFrom}
          onDateToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([
          { key: 'all' as RCFilter, label: 'ทั้งหมด' },
          { key: 'not-printed' as RCFilter, label: 'ยังไม่พิมพ์' },
          { key: 'printed' as RCFilter, label: 'พิมพ์แล้ว' },
          { key: 'not-paid' as RCFilter, label: 'ยังไม่ชำระ' },
          { key: 'paid' as RCFilter, label: 'ชำระแล้ว' },
        ]).map(f => (
          <button key={f.key} onClick={() => setRcFilter(f.key)}
            className={cn('px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              rcFilter === f.key ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-3 w-10">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selectedRcIds.length === filtered.length}
                    onChange={e => setSelectedRcIds(e.target.checked ? filtered.map(r => r.id) : [])}
                    className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                </th>
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="เลขที่" sortKey="receiptNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="ยอดรวม" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                {/* 164: WB link col (mirror IV pattern) */}
                <SortableHeader label="WB" sortKey="wb" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="ชำระ" sortKey="isPaid" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">ยังไม่มีใบเสร็จรับเงิน — ออกจากใบวางบิลของลูกค้าที่ไม่คิด VAT</td></tr>
              ) : filtered.map(rc => {
                const c = getCustomer(rc.customerId)
                const linkedWb = billingStatements.find(b => b.id === rc.billingStatementId)
                return (
                  <tr key={rc.id} data-row-id={rc.id}
                    className={cn("border-b border-slate-100 cursor-pointer", activeRowId === rc.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                    onClick={() => { setActiveRowId(rc.id); setShowDetail(rc.id) }}>
                    <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRcIds.includes(rc.id)}
                        onChange={e => setSelectedRcIds(prev => e.target.checked ? [...prev, rc.id] : prev.filter(id => id !== rc.id))}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </td>
                    <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(rc.issueDate)}</td>
                    <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{highlightText(c?.shortName || c?.name || '-', highlightQ)}</td>
                    <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('receiptNumber'))}>{highlightText(rc.receiptNumber, highlightQ)}</td>
                    {/* 162: highlight amount when search matches */}
                    <td className={cn("px-4 py-3 text-right text-slate-700 font-medium", sortedBg('grandTotal'))}>{highlightAmount(formatCurrency(rc.grandTotal), search)}</td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        rc.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                        {rc.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                      </span>
                    </td>
                    {/* 164: WB link (mirror IV) */}
                    <td className={cn("px-4 py-3 text-center", sortedBg('wb'))} onClick={e => e.stopPropagation()}>
                      {linkedWb ? (
                        <button onClick={() => router.push(`/dashboard/billing?tab=billing&detail=${linkedWb.id}`)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200">
                          <span className="font-mono">{linkedWb.billingNumber}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isPaid'))} onClick={e => e.stopPropagation()}>
                      <button onClick={() => updateReceipt(rc.id, { isPaid: !rc.isPaid })}
                        className={cn('px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                          rc.isPaid ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                        {rc.isPaid ? 'ชำระแล้ว' : 'ยังไม่ชำระ'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals footer */}
            {filtered.length > 0 && (() => {
              const totalGrand = filtered.reduce((s, rc) => s + rc.grandTotal, 0)
              return (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-slate-700">รวม {filtered.length} รายการ</td>
                    <td className="px-4 py-3 text-right text-[#1B3A5C]">{formatCurrency(totalGrand)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setShowPrint(false) }}
        title={`ใบเสร็จรับเงิน ${detailRC?.receiptNumber || ''}`} size="lg" closeLabel="saved">
        {detailRC && detailCustomer && (
          <div className="space-y-4">
            <div className="bg-[#1B3A5C] rounded-lg px-4 py-2.5 sticky top-0 z-10">
              <span className="text-sm font-semibold text-white tracking-wide">
                ลูกค้า: {detailCustomer.shortName || detailCustomer.name} | วันที่ออก: {formatDate(detailRC.issueDate)}
              </span>
            </div>

            {/* Info banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠ ใบเสร็จรับเงิน — สำหรับลูกค้าที่ไม่คิด VAT · ไม่ใช่ใบกำกับภาษี · ใช้เป็นหลักฐานการชำระเงินเท่านั้น
            </div>

            {/* WB reference — 164: clickable link (mirror IV-detail pattern) */}
            {linkedWB && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-100">
                <span className="text-sm text-slate-600 font-medium">ใบวางบิล (WB):</span>
                <button onClick={() => { setShowDetail(null); router.push(`/dashboard/billing?tab=billing&detail=${linkedWB.id}`) }}
                  className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-900">
                  <span className="font-mono">{linkedWB.billingNumber}</span>
                  <span className="text-xs text-orange-500">· {formatDate(linkedWB.issueDate)} · {formatCurrency(linkedWB.netPayable)}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Items */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวน</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">ราคา</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRC.lineItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{item.name}</td>
                      <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.pricePerUnit)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#e8eef5]">
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-[#1B3A5C]">รวมทั้งสิ้น</td>
                    <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatCurrency(detailRC.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-2">
              <button onClick={() => setConfirmDeleteId(detailRC.id)}
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" />ลบ
              </button>
              <button onClick={() => setShowPrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Print Modal */}
      <Modal open={showPrint && !!detailRC} onClose={() => setShowPrint(false)} title="พิมพ์ใบเสร็จรับเงิน" size="xl" closeLabel="close" className="print-target">
        {detailRC && detailCustomer && (
          <div className="space-y-3">
            <ExportButtons
              targetId="print-receipt"
              filename={formatExportFilename(detailRC.receiptNumber, detailCustomer.shortName || detailCustomer.name, detailRC.issueDate)}
            />
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[70vh]">
              <ReceiptPrint receipt={detailRC} customer={detailCustomer} />
            </div>
          </div>
        )}
      </Modal>

      {/* 154: Print List Modal */}
      <Modal open={showRcPrintList} onClose={() => setShowRcPrintList(false)} title="รายการใบเสร็จรับเงิน" size="xl" closeLabel="close" className="print-target">
        {(() => {
          const printItems = selectedRcIds.length > 0 ? filtered.filter(r => selectedRcIds.includes(r.id)) : filtered
          const total = printItems.reduce((s, r) => s + r.grandTotal, 0)
          const handleListCSV = () => {
            const headers = ['ลำดับ', 'วันที่', 'ลูกค้า', 'เลขที่ RC', 'ยอดรวม', 'พิมพ์', 'ชำระ']
            const rows = printItems.map((r, i) => {
              const c = getCustomer(r.customerId)
              return [String(i+1), formatDate(r.issueDate), c?.shortName || c?.name || '-', r.receiptNumber, String(r.grandTotal), r.isPrinted ? 'พิมพ์แล้ว' : '-', r.isPaid ? 'ชำระแล้ว' : '-']
            })
            exportCSV(headers, rows, 'รายการใบเสร็จรับเงิน')
          }
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500">
                {selectedRcIds.length > 0 ? `เลือก ${printItems.length} รายการ` : `ทั้งหมด ${printItems.length} รายการ`}
              </div>
              <div id="print-rc-list" className="border border-slate-200 rounded-lg overflow-hidden">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">FlowClean Laundry Service — รายการใบเสร็จรับเงิน</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">วันที่</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่ RC</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">ยอดรวม</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printItems.map((r, idx) => {
                      const c = getCustomer(r.customerId)
                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 text-slate-700">{formatDate(r.issueDate)}</td>
                          <td className="px-3 py-1.5 text-slate-800">{c?.shortName || c?.name || '-'}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{r.receiptNumber}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700">{formatCurrency(r.grandTotal)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full', r.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                              {r.isPaid ? 'ชำระแล้ว' : 'ยังไม่ชำระ'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td className="px-3 py-2" colSpan={4}>ยอดรวมทั้งหมด</td>
                      <td className="px-3 py-2 text-right text-[#1B3A5C]">{formatCurrency(total)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex justify-end mt-4">
                <ExportButtons targetId="print-rc-list" filename="รายการใบเสร็จรับเงิน" onExportCSV={handleListCSV} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 154: Bulk Print Modal */}
      <Modal open={showRcBulkPrint} onClose={() => setShowRcBulkPrint(false)} title={`พิมพ์ใบเสร็จรับเงิน (${selectedRcIds.length} ใบ)`} size="xl" closeLabel="close" className="print-target">
        <div className="space-y-4">
          {selectedRcIds.map(id => {
            const rc = receipts.find(r => r.id === id)
            const c = rc ? getCustomer(rc.customerId) : null
            if (!rc || !c) return null
            return (
              <div key={id} className="border border-slate-200 rounded-lg overflow-hidden break-after-page">
                <ReceiptPrint receipt={rc} customer={c} />
              </div>
            )
          })}
        </div>
      </Modal>

      {/* 154: Select WB to create RC Modal */}
      <Modal open={showSelectWbForRc} onClose={() => setShowSelectWbForRc(false)} title="เลือกใบวางบิลที่จะออกใบเสร็จรับเงิน" size="lg" closeLabel="cancel">
        {(() => {
          const allWbs = billingStatements
            .filter(b => !receipts.some(r => r.billingStatementId === b.id))
            .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
          // เฉพาะลูกค้าไม่คิด VAT
          const eligibleWbs = allWbs.filter(b => {
            const c = getCustomer(b.customerId)
            return c && c.enableVat === false
          })
          const skippedVatCount = allWbs.length - eligibleWbs.length

          if (eligibleWbs.length === 0) {
            return (
              <div className="text-center py-12 text-slate-500 text-sm">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                ไม่มีใบวางบิลของลูกค้าไม่คิด VAT ที่ยังไม่ได้ออกใบเสร็จรับเงิน
                {skippedVatCount > 0 && (
                  <p className="text-xs text-amber-600 mt-3">⚠ ไม่แสดงใบวางบิลของลูกค้าที่คิด VAT — ใช้ "ออกใบกำกับภาษี (IV)" แทน</p>
                )}
              </div>
            )
          }

          const handleSelect = (b: typeof eligibleWbs[number]) => {
            const customer = getCustomer(b.customerId)
            if (!customer) return
            if (!confirm(`ออกใบเสร็จรับเงิน (RC) สำหรับ ${customer.shortName || customer.name}?\nยอด: ${formatCurrency(b.netPayable)}\n\n⚠ ใบเสร็จนี้ไม่ใช่ใบกำกับภาษี — ใช้เป็นหลักฐานการชำระเงินเท่านั้น`)) return

            // Build line items (same as billing/page.tsx pattern)
            let rcLineItems = b.lineItems
            if (b.deliveryNoteIds.length > 0) {
              const transportCodes = new Set(['TRANSPORT_TRIP', 'TRANSPORT_MONTH'])
              const adjustmentCodes = new Set(['EXTRA_CHARGE', 'DISCOUNT'])
              const serviceLines = b.lineItems.filter(i => !transportCodes.has(i.code) && !adjustmentCodes.has(i.code))
              const transportLines = b.lineItems.filter(i => transportCodes.has(i.code))
              const adjustmentLines = b.lineItems.filter(i => adjustmentCodes.has(i.code))
              if (serviceLines.length > 0) {
                const serviceTotal = serviceLines.reduce((s, i) => s + i.amount, 0)
                const dnDates = b.deliveryNoteIds.map(id => deliveryNotes.find(d => d.id === id)?.date).filter(Boolean).sort() as string[]
                const dateLabel = dnDates.length > 0
                  ? (dnDates[0] === dnDates[dnDates.length - 1] ? formatDate(dnDates[0]) : `${formatDate(dnDates[0])} - ${formatDate(dnDates[dnDates.length - 1])}`)
                  : b.billingMonth
                rcLineItems = [
                  { code: 'SERVICE', name: `ค่าบริการซักวันที่ ${dateLabel}`, quantity: 1, pricePerUnit: serviceTotal, amount: serviceTotal },
                  ...transportLines, ...adjustmentLines,
                ]
              }
            }
            const newRC = addReceipt({
              billingStatementId: b.id,
              customerId: b.customerId,
              issueDate: todayISO(),
              lineItems: rcLineItems,
              subtotal: b.subtotal,
              grandTotal: b.subtotal,
              notes: '',
            })
            setShowSelectWbForRc(false)
            setShowDetail(newRC.id)
          }

          return (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">เลือกใบวางบิลที่ต้องการออกใบเสร็จรับเงิน ({eligibleWbs.length} ใบ)</p>
              {skippedVatCount > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                  ⚠ ไม่แสดงใบวางบิลของลูกค้าที่คิด VAT — ใช้ "ออกใบกำกับภาษี (IV)" แทน
                </p>
              )}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-24">วันที่ออก</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่ WB</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ยอดรวม</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleWbs.map(b => {
                      const c = getCustomer(b.customerId)
                      return (
                        <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-700 font-medium">{formatDate(b.issueDate)}</td>
                          <td className="px-3 py-1.5 text-slate-800">{c?.shortName || c?.name || '-'}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{b.billingNumber}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(b.netPayable)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <button onClick={() => handleSelect(b)}
                              className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700">เลือก</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Delete Confirm — 167: pattern เดียวกับ IV (DeleteWithRedirectModal) */}
      {(() => {
        const pendingRC = confirmDeleteId ? receipts.find(r => r.id === confirmDeleteId) : null
        const linkedWB = pendingRC ? billingStatements.find(b => b.id === pendingRC.billingStatementId) : null
        return (
          <DeleteWithRedirectModal
            open={!!confirmDeleteId}
            onClose={() => setConfirmDeleteId(null)}
            docNumber={pendingRC?.receiptNumber || ''}
            message="ต้องการลบใบเสร็จรับเงินนี้หรือไม่? หลังลบ ระบบจะปลดล็อคใบวางบิล (WB) ที่เกี่ยวข้องให้ออกใบเสร็จใหม่ได้"
            warning={linkedWB ? `ใบวางบิลที่เกี่ยวข้อง: ${linkedWB.billingNumber}` : undefined}
            redirectLabel={linkedWB ? 'ไปแก้ WB' : undefined}
            onDeleteAndStay={() => {
              if (!confirmDeleteId) return
              deleteReceipt(confirmDeleteId)
              setConfirmDeleteId(null)
              setShowDetail(null)
            }}
            onDeleteAndRedirect={linkedWB ? () => {
              if (!confirmDeleteId) return
              const wbId = linkedWB.id
              deleteReceipt(confirmDeleteId)
              setConfirmDeleteId(null)
              setShowDetail(null)
              router.push(`/dashboard/billing?tab=billing&detail=${wbId}`)
            } : undefined}
          />
        )
      })()}
    </div>
  )
}
