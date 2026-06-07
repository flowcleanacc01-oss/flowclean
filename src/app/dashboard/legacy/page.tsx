'use client'

import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '@/lib/store'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { highlightText, highlightAmount, matchesAmountQuery } from '@/lib/highlight'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import { Search, Archive, FileCheck, Receipt as ReceiptIcon, Truck, FileText, Info } from 'lucide-react'
import Modal from '@/components/Modal'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import { canViewBilling } from '@/lib/permissions'
import type { LegacyDocKind } from '@/types'

const KIND_CONFIG: Record<LegacyDocKind, { label: string; color: string; bgColor: string; icon: typeof Archive }> = {
  WB: { label: 'ใบวางบิล', color: 'text-orange-700', bgColor: 'bg-orange-50', icon: FileCheck },
  IV: { label: 'ใบกำกับภาษี', color: 'text-purple-700', bgColor: 'bg-purple-50', icon: ReceiptIcon },
  SD: { label: 'ใบส่งของ', color: 'text-blue-700', bgColor: 'bg-blue-50', icon: Truck },
  QT: { label: 'ใบเสนอราคา', color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: FileText },
}

/**
 * Legacy Documents Viewer (Feature 161)
 * READ-ONLY archive ของเอกสารจากระบบเก่า (NeoSME)
 * ไม่กระทบ workflow ปัจจุบัน — search/filter/audit เท่านั้น
 */
export default function LegacyPage() {
  const { currentUser, legacyDocuments, getCustomer } = useStore()

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<LegacyDocKind | 'all'>('all')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState('') // default: ดูทั้งหมด
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [detailId, setDetailId] = useState<string | null>(null)

  const matchesDate = (d: string) => {
    if (!dateFrom) return true
    if (dateFilterMode === 'single') return d === dateFrom
    if (d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    return true
  }

  const filtered = useMemo(() => {
    return legacyDocuments.filter(doc => {
      if (kindFilter !== 'all' && doc.kind !== kindFilter) return false
      if (customerFilter !== 'all' && doc.customerId !== customerFilter) return false
      if (!matchesDate(doc.docDate)) return false
      if (search) {
        const c = doc.customerId ? getCustomer(doc.customerId) : null
        // 245: Thai-aware tolerant
        const textMatch = matchesThaiQueryAnyField([doc.docNumber, doc.customerName, doc.customerCode, c?.shortName], search)
        // 162: also match by amount
        const amountMatch = matchesAmountQuery(search, [doc.amount, doc.netPayable, doc.outstanding])
        if (!textMatch && !amountMatch) return false
      }
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'docNumber': va = a.docNumber; vb = b.docNumber; break
        case 'customer': va = (getCustomer(a.customerId)?.shortName || a.customerName); vb = (getCustomer(b.customerId)?.shortName || b.customerName); break
        case 'amount': va = a.amount; vb = b.amount; break
        case 'kind': va = a.kind; vb = b.kind; break
        default: va = a.docDate; vb = b.docDate
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
    // matchesDate อ่าน dateFrom/dateTo/dateFilterMode ที่อยู่ใน deps แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyDocuments, kindFilter, customerFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  // 421 — virtualize ตาราง legacy (5,093 docs ไม่ค้าง · เลิก cap 6,000) · element-scroll + spacer rows
  const listScrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 46,
    overscan: 12,
    getItemKey: (index) => filtered[index]?.id ?? index,
  })

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortedBg = (key: string) => sortKey === key ? 'bg-[#1B3A5C]/[0.04]' : ''

  // Stats by kind
  const stats = useMemo(() => {
    const byKind = { WB: 0, IV: 0, SD: 0, QT: 0 } as Record<LegacyDocKind, number>
    for (const d of legacyDocuments) byKind[d.kind] = (byKind[d.kind] || 0) + 1
    return byKind
  }, [legacyDocuments])

  const detail = detailId ? legacyDocuments.find(d => d.id === detailId) : null
  const detailCust = detail?.customerId ? getCustomer(detail.customerId) : null

  // permission gate — ต้องอยู่หลัง hooks ทั้งหมด (กัน rules-of-hooks: hooks ต้องถูกเรียกทุก render)
  if (!canViewBilling(currentUser)) {
    return <div className="text-center text-slate-400 py-20">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Archive className="w-8 h-8 text-slate-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ประวัติเอกสารเก่า</h1>
            <p className="text-sm text-slate-500 mt-0.5">เอกสารจากระบบเก่า (NeoSME) — ดูอย่างเดียว</p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {legacyDocuments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Archive className="w-12 h-12 text-amber-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-amber-800">ยังไม่มีข้อมูลเอกสารเก่าใน archive</p>
          <p className="text-xs text-amber-700 mt-1">รอ AI import ข้อมูล WB/IV จาก Excel reports</p>
        </div>
      )}

      {legacyDocuments.length > 0 && (
        <>
          {/* Stats by kind */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {(['WB', 'IV', 'SD', 'QT'] as LegacyDocKind[]).map(k => {
              const cfg = KIND_CONFIG[k]
              const Icon = cfg.icon
              return (
                <button key={k} onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-all',
                    kindFilter === k ? `${cfg.bgColor} border-current ${cfg.color}` : 'bg-white border-slate-200 hover:border-slate-300',
                  )}>
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', cfg.bgColor, cfg.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-800">{stats[k] || 0}</p>
                      <p className="text-xs text-slate-500">{cfg.label} ({k})</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาเลขที่เอกสาร, ชื่อลูกค้า, รหัส X-prefix, จำนวนเงิน..."
                className="w-full pl-10 pr-4 py-2 border-2 border-[#3DD8D8] rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
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

          {/* Table — 421: virtualize (inner-scroll + table-fixed + colgroup %) · thead sticky */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div ref={listScrollRef} className="overflow-auto" style={{ maxHeight: '72vh' }}>
              <table className="w-full text-sm table-fixed lf-list-table">
                <colgroup>
                  <col style={{ width: '14%' }} />{/* วันที่ */}
                  <col style={{ width: '26%' }} />{/* ชื่อย่อลูกค้า */}
                  <col style={{ width: '12%' }} />{/* ประเภท */}
                  <col style={{ width: '24%' }} />{/* เลขที่ */}
                  <col style={{ width: '14%' }} />{/* ยอดเงิน */}
                  <col style={{ width: '10%' }} />{/* สถานะ */}
                </colgroup>
                <thead className="sticky top-0 z-20 bg-slate-50">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="ประเภท" sortKey="kind" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <SortableHeader label="เลขที่" sortKey="docNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="ยอดเงิน" sortKey="amount" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-slate-400">ไม่พบเอกสาร</td></tr>
                  ) : (() => {
                    const vItems = rowVirtualizer.getVirtualItems()
                    const padTop = vItems.length > 0 ? vItems[0].start : 0
                    const padBottom = vItems.length > 0 ? rowVirtualizer.getTotalSize() - vItems[vItems.length - 1].end : 0
                    return (
                      <>
                        {padTop > 0 && <tr aria-hidden><td colSpan={6} style={{ height: padTop, padding: 0, border: 0 }} /></tr>}
                        {vItems.map(vi => {
                          const d = filtered[vi.index]
                          const c = d.customerId ? getCustomer(d.customerId) : null
                          const cfg = KIND_CONFIG[d.kind]
                          return (
                            <tr key={d.id} data-row-id={d.id} data-index={vi.index} ref={rowVirtualizer.measureElement}
                              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                              onClick={() => setDetailId(d.id)}>
                              <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(d.docDate)}</td>
                              <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>
                                {highlightText(c?.shortName || d.customerName || '-', search)}
                                {!c && <span className="ml-1 text-[10px] text-slate-400">[unmatched]</span>}
                              </td>
                              <td className={cn("px-4 py-3 text-center", sortedBg('kind'))}>
                                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>
                                  {d.kind}
                                </span>
                              </td>
                              <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('docNumber'))}>{highlightText(d.docNumber, search)}</td>
                              <td className={cn("px-4 py-3 text-right text-slate-700", sortedBg('amount'))}>{highlightAmount(formatCurrency(d.amount), search)}</td>
                              <td className="px-4 py-3 text-center text-xs text-slate-500">{d.status || '-'}</td>
                            </tr>
                          )
                        })}
                        {padBottom > 0 && <tr aria-hidden><td colSpan={6} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>}
                      </>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 211: Floating total bar (pattern เดียวกับ 57c12b9) */}
      {filtered.length > 0 && (() => {
        const totalAmount = filtered.reduce((s, d) => s + d.amount, 0)
        return (
          <FloatingTotalBar>
            <span>รวม {filtered.length} เอกสาร</span>
            <span className="ml-auto">ยอดรวม <span className="text-[#1B3A5C]">{formatCurrency(totalAmount)}</span></span>
          </FloatingTotalBar>
        )
      })()}

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} title={`${detail?.kind} ${detail?.docNumber || ''}`} size="md" closeLabel="close">
        {detail && (
          <div className="space-y-4">
            <div className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
              <Info className="w-4 h-4" />
              เอกสารจากระบบเก่า — ดูอย่างเดียว ไม่สามารถแก้ไขได้
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">ประเภท:</span>
                <span className={cn('ml-1 px-2 py-0.5 rounded-full text-xs font-medium', KIND_CONFIG[detail.kind].bgColor, KIND_CONFIG[detail.kind].color)}>
                  {KIND_CONFIG[detail.kind].label} ({detail.kind})
                </span>
              </div>
              <div><span className="text-slate-500">เลขที่:</span> <span className="font-mono">{detail.docNumber}</span></div>
              <div><span className="text-slate-500">วันที่:</span> {formatDate(detail.docDate)}</div>
              <div><span className="text-slate-500">รหัสลูกค้า (legacy):</span> <span className="font-mono">{detail.customerCode || '-'}</span></div>
              <div className="col-span-2">
                <span className="text-slate-500">ลูกค้า:</span>
                <span className="ml-1 font-medium">
                  {detailCust?.shortName ? `${detailCust.shortName} · ` : ''}{detail.customerName}
                </span>
              </div>
              {detail.dueDate && <div><span className="text-slate-500">กำหนดชำระ:</span> {formatDate(detail.dueDate)}</div>}
              {detail.status && <div><span className="text-slate-500">สถานะ:</span> {detail.status}</div>}
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100"><td className="px-3 py-2 text-slate-600">จำนวนเงิน</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(detail.amount)}</td></tr>
                  {detail.kind === 'WB' && (
                    <>
                      <tr className="border-b border-slate-100"><td className="px-3 py-2 text-slate-600">ยอดสุทธิ</td><td className="px-3 py-2 text-right">{formatCurrency(detail.netPayable)}</td></tr>
                      <tr className="border-b border-slate-100"><td className="px-3 py-2 text-slate-600">ชำระแล้ว</td><td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(detail.paidAmount)}</td></tr>
                      <tr><td className="px-3 py-2 text-slate-600 font-medium">ค้างชำระ</td><td className={cn("px-3 py-2 text-right font-medium", detail.outstanding > 0 ? 'text-red-600' : 'text-slate-400')}>{formatCurrency(detail.outstanding)}</td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {detail.notes && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                <strong>หมายเหตุ:</strong> {detail.notes}
              </div>
            )}

            <div className="text-[10px] text-slate-400 italic">
              Imported: {detail.importedAt} · Source: {detail.sourceFile}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
