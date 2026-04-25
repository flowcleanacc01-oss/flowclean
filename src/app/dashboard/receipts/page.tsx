'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, formatCurrency, cn, todayISO, startOfMonthISO, endOfMonthISO, formatExportFilename } from '@/lib/utils'
import { Search, FileDown, Trash2, X } from 'lucide-react'
import Modal from '@/components/Modal'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import ReceiptPrint from '@/components/ReceiptPrint'
import ExportButtons from '@/components/ExportButtons'
import { canViewBilling } from '@/lib/permissions'

type RCFilter = 'all' | 'not-printed' | 'printed' | 'not-paid' | 'paid'

/**
 * Receipts Page (Feature 148) — ใบเสร็จรับเงิน (RC)
 * สำหรับลูกค้าไม่คิด VAT (enableVat=false) ที่ต้องการหลักฐานการชำระเงิน
 */
export default function ReceiptsPage() {
  const {
    currentUser, receipts, billingStatements, customers, getCustomer,
    updateReceipt, deleteReceipt,
  } = useStore()

  const searchParams = useSearchParams()

  // Filters
  const [search, setSearch] = useState('')
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
        if (!rc.receiptNumber.toLowerCase().includes(q) && !(c?.shortName || '').toLowerCase().includes(q) && !(c?.name || '').toLowerCase().includes(q)) return false
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
      </div>

      {/* Search + customer filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบเสร็จ, ชื่อลูกค้า..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          className={cn(
            'px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none font-medium transition-colors',
            customerFilter === 'all' ? 'border-slate-200 text-slate-600' : 'bg-[#3DD8D8] border-[#3DD8D8] text-[#1B3A5C]',
          )}>
          <option value="all">ทุกลูกค้า</option>
          {customers.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
          ))}
        </select>
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
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="เลขที่" sortKey="receiptNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="ยอดรวม" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="ชำระ" sortKey="isPaid" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">ยังไม่มีใบเสร็จรับเงิน — ออกจากใบวางบิลของลูกค้าที่ไม่คิด VAT</td></tr>
              ) : filtered.map(rc => {
                const c = getCustomer(rc.customerId)
                return (
                  <tr key={rc.id} data-row-id={rc.id}
                    className={cn("border-b border-slate-100 cursor-pointer", activeRowId === rc.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                    onClick={() => { setActiveRowId(rc.id); setShowDetail(rc.id) }}>
                    <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(rc.issueDate)}</td>
                    <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{c?.shortName || c?.name || '-'}</td>
                    <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('receiptNumber'))}>{rc.receiptNumber}</td>
                    <td className={cn("px-4 py-3 text-right text-slate-700 font-medium", sortedBg('grandTotal'))}>{formatCurrency(rc.grandTotal)}</td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        rc.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                        {rc.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                      </span>
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
                    <td colSpan={3} className="px-4 py-3 text-slate-700">รวม {filtered.length} รายการ</td>
                    <td className="px-4 py-3 text-right text-[#1B3A5C]">{formatCurrency(totalGrand)}</td>
                    <td colSpan={2}></td>
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

            {/* WB reference */}
            {linkedWB && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-100">
                <span className="text-sm text-slate-600 font-medium">ใบวางบิล (WB):</span>
                <span className="font-mono text-sm text-orange-700">{linkedWB.billingNumber} · {formatDate(linkedWB.issueDate)} · {formatCurrency(linkedWB.netPayable)}</span>
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
      <Modal open={showPrint && !!detailRC} onClose={() => setShowPrint(false)} title="พิมพ์ใบเสร็จรับเงิน" size="xl" closeLabel="close">
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

      {/* Delete Confirm */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="ยืนยันการลบใบเสร็จรับเงิน" size="md" closeLabel="cancel">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">ต้องการลบใบเสร็จ <span className="font-mono font-semibold">{detailRC?.receiptNumber}</span> ใช่หรือไม่?</p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ การลบจะทำให้ user สามารถออกใบเสร็จใหม่จากใบวางบิลใบนี้ได้อีกครั้ง
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
            <button onClick={() => {
              if (confirmDeleteId) {
                deleteReceipt(confirmDeleteId)
                setConfirmDeleteId(null)
                setShowDetail(null)
              }
            }} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1">
              <X className="w-4 h-4" />ลบ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
