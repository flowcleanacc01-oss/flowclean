'use client'

import { useState, useMemo, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { LINEN_FORM_STATUS_CONFIG, NEXT_LINEN_STATUS, PREV_LINEN_STATUS, ALL_LINEN_STATUSES, PROCESS_STATUSES, DEPARTMENT_CONFIG, type LinenFormStatus, type LinenFormRow } from '@/types'
import { hasType1Discrepancy, hasType2Discrepancy } from '@/lib/discrepancy'
import { Plus, Search, ChevronRight, ChevronLeft, AlertTriangle, X, Check, Printer } from 'lucide-react'
import Modal from '@/components/Modal'
import LinenFormGrid from '@/components/LinenFormGrid'
import LinenFormPrint from '@/components/LinenFormPrint'
import ExportButtons from '@/components/ExportButtons'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import { exportCSV } from '@/lib/export'

export default function LinenFormsPage() {
  const {
    linenForms, addLinenForm, updateLinenForm, updateLinenFormStatus, deleteLinenForm,
    customers, getCustomer, getCarryOver, linenCatalog, deliveryNotes, companyInfo,
  } = useStore()

  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LinenFormStatus | 'all'>(() => {
    const s = searchParams.get('status')
    return s && ALL_LINEN_STATUSES.includes(s as LinenFormStatus) ? s as LinenFormStatus : 'all'
  })
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Date filter & sort state
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('single')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [showPrint, setShowPrint] = useState(false)

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleExportCSV = () => {
    if (!detailForm || !detailCustomer) return
    const headers = ['รหัส', 'รายการ', 'ยกยอดมา', 'ลูกค้านับผ้าส่งซัก', 'ลูกค้านับผ้าส่งเคลม', 'โรงซักนับเข้า', 'โรงซักแพคส่ง', 'ค้าง/คืน', 'หมายเหตุ', 'ลูกค้านับผ้ากลับ']
    const nameMap = Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))
    const rows = detailForm.rows.map(r => {
      const co = detailCarryOver[r.code] || 0
      const diff = (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved
      return [
        r.code, nameMap[r.code] || r.code,
        String(co), String(r.col2_hotelCountIn), String(r.col3_hotelClaimCount),
        String(r.col5_factoryClaimApproved), String(r.col6_factoryPackSend || 0),
        String(diff), r.note, String(r.col4_factoryApproved),
      ]
    })
    exportCSV(headers, rows, `${detailForm.formNumber}_${detailCustomer.name}`)
  }

  // Create form state
  const [newCustomerId, setNewCustomerId] = useState('')
  const [newDate, setNewDate] = useState(todayISO())
  const [newRows, setNewRows] = useState<LinenFormRow[]>([])
  const [newNotes, setNewNotes] = useState('')
  const [newBagsSent, setNewBagsSent] = useState(0)

  const filtered = useMemo(() => {
    return linenForms.filter(f => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (customerFilter !== 'all' && f.customerId !== customerFilter) return false
      if (search) {
        const customer = getCustomer(f.customerId)
        const q = search.toLowerCase()
        if (!f.formNumber.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
      }
      if (dateFrom) {
        if (dateFilterMode === 'single') {
          if (f.date !== dateFrom) return false
        } else {
          if (f.date < dateFrom) return false
          if (dateTo && f.date > dateTo) return false
        }
      }
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'formNumber': va = a.formNumber; vb = b.formNumber; break
        case 'customer': va = getCustomer(a.customerId)?.name || ''; vb = getCustomer(b.customerId)?.name || ''; break
        case 'date': va = a.date; vb = b.date; break
        case 'pieces': va = a.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0); vb = b.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0); break
        case 'status': va = ALL_LINEN_STATUSES.indexOf(a.status); vb = ALL_LINEN_STATUSES.indexOf(b.status); break
        default: va = a.date; vb = b.date
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [linenForms, statusFilter, customerFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  const statuses: (LinenFormStatus | 'all')[] = ['all', ...ALL_LINEN_STATUSES]

  const handleCreateOpen = () => {
    const firstCustomer = customers.filter(c => c.isActive)[0]
    setNewCustomerId(firstCustomer?.id || '')
    setNewDate(todayISO())
    // Init rows from first customer's enabled items
    if (firstCustomer) {
      setNewRows(firstCustomer.enabledItems.map(code => ({
        code,
        col1_carryOver: 0,
        col2_hotelCountIn: 0,
        col3_hotelClaimCount: 0,
        col4_factoryApproved: 0,
        col5_factoryClaimApproved: 0,
        col6_factoryPackSend: 0,
        note: '',
      })))
    } else {
      setNewRows([])
    }
    setNewNotes('')
    setNewBagsSent(0)
    setShowCreate(true)
  }

  const handleCustomerSelect = (custId: string) => {
    setNewCustomerId(custId)
    const cust = getCustomer(custId)
    if (cust) {
      setNewRows(cust.enabledItems.map(code => ({
        code,
        col1_carryOver: 0,
        col2_hotelCountIn: 0,
        col3_hotelClaimCount: 0,
        col4_factoryApproved: 0,
        col5_factoryClaimApproved: 0,
        col6_factoryPackSend: 0,
        note: '',
      })))
    }
  }

  const handleCreate = () => {
    if (!newCustomerId || newRows.length === 0) return
    addLinenForm({
      customerId: newCustomerId,
      date: newDate,
      status: 'draft',
      rows: newRows,
      notes: newNotes,
      bagsSentCount: newBagsSent,
    })
    setShowCreate(false)
  }

  const detailForm = showDetail ? linenForms.find(f => f.id === showDetail) : null
  const detailCustomer = detailForm ? getCustomer(detailForm.customerId) : null
  const detailCarryOver = detailForm ? getCarryOver(detailForm.customerId, detailForm.date) : {}
  const nextDetailStatus = detailForm ? NEXT_LINEN_STATUS[detailForm.status] : null
  const linkedDN = detailForm ? deliveryNotes.find(dn => dn.linenFormIds.includes(detailForm.id)) : null
  const isLockedByDN = !!linkedDN && detailForm?.status === 'confirmed'

  const handleAdvanceStatus = (formId: string) => {
    const form = linenForms.find(f => f.id === formId)
    if (!form) return
    const next = NEXT_LINEN_STATUS[form.status]
    if (!next) return

    // Per-step validation
    if (form.status === 'draft') {
      const hasData = form.rows.some(r => r.col2_hotelCountIn > 0 || r.col3_hotelClaimCount > 0)
      if (!hasData) {
        alert('กรุณากรอกจำนวนผ้าส่งซักหรือผ้าส่งเคลมอย่างน้อย 1 รายการ')
        return
      }
    } else if (form.status === 'received') {
      const hasCountIn = form.rows.some(r => r.col5_factoryClaimApproved > 0)
      if (!hasCountIn) {
        alert('กรุณากรอกจำนวนโรงซักนับเข้าอย่างน้อย 1 รายการ')
        return
      }
    } else if (form.status === 'washing') {
      const hasPack = form.rows.some(r => (r.col6_factoryPackSend || 0) > 0)
      if (!hasPack) {
        alert('กรุณากรอกจำนวนแพคส่งอย่างน้อย 1 รายการ')
        return
      }
    }

    // Pre-fill col4 (ลูกค้านับผ้ากลับ) from col6 (แพคส่ง) when entering delivered
    if (next === 'delivered') {
      const updatedRows = form.rows.map(row => ({
        ...row,
        col4_factoryApproved: row.col6_factoryPackSend || 0,
      }))
      updateLinenForm(formId, { rows: updatedRows })
    }
    updateLinenFormStatus(formId, next)
  }

  const handleRevertStatus = (formId: string) => {
    const form = linenForms.find(f => f.id === formId)
    if (!form) return
    const prev = PREV_LINEN_STATUS[form.status]
    if (prev) updateLinenFormStatus(formId, prev)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ใบส่งรับผ้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการใบส่งรับผ้าทั้งหมด</p>
        </div>
        <button onClick={handleCreateOpen}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          สร้างใบส่งรับผ้าใหม่
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ฟอร์ม, ชื่อโรงแรม..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
          />
        </div>
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
          <option value="all">ทุกโรงแรม</option>
          {customers.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Date filter */}
      <div className="mb-4">
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateFilterMode}
          onModeChange={setDateFilterMode} onDateFromChange={setDateFrom}
          onDateToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-[#1B3A5C] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}>
            {s === 'all' ? 'ทั้งหมด' : LINEN_FORM_STATUS_CONFIG[s].label}
            <span className="ml-1 opacity-70">
              ({s === 'all' ? linenForms.length : linenForms.filter(f => f.status === s).length})
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <SortableHeader label="เลขที่ฟอร์ม" sortKey="formNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="โรงแรม" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="จำนวนชิ้น" sortKey="pieces" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="สถานะ" sortKey="status" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <th className="text-center px-4 py-3 font-medium text-slate-600 w-12"></th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(form => {
                const customer = getCustomer(form.customerId)
                const totalPieces = form.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
                const disc1 = hasType1Discrepancy(form)
                const disc2 = hasType2Discrepancy(form)
                const cfg = LINEN_FORM_STATUS_CONFIG[form.status] || LINEN_FORM_STATUS_CONFIG.draft
                const nextStatus = NEXT_LINEN_STATUS[form.status]

                return (
                  <tr key={form.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setShowDetail(form.id)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{form.formNumber}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(form.date)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{totalPieces}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dotColor)} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {disc1 && <span title="โรงซักนับเข้า ≠ นับส่ง+เคลม"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /></span>}
                      {disc2 && <span title="ลูกค้านับกลับ ≠ แพคส่ง"><AlertTriangle className="w-4 h-4 text-red-500 inline" /></span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {PREV_LINEN_STATUS[form.status] && (
                          <button onClick={() => handleRevertStatus(form.id)}
                            className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded font-medium hover:bg-slate-200 transition-colors inline-flex items-center gap-1"
                            title={`ย้อนกลับ → ${LINEN_FORM_STATUS_CONFIG[PREV_LINEN_STATUS[form.status]!].label}`}>
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                        )}
                        {nextStatus && (
                          <button onClick={() => handleAdvanceStatus(form.id)}
                            className="text-xs px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] rounded font-medium hover:bg-[#2bb8b8] transition-colors inline-flex items-center gap-1">
                            {LINEN_FORM_STATUS_CONFIG[nextStatus].label}
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบส่งรับผ้าใหม่ (Create New LF)" size="xl">
        <div className="space-y-4">
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5 text-sm text-teal-700">
            <span className="font-medium">สิ่งที่ทำ: {LINEN_FORM_STATUS_CONFIG.draft.todoLabel}</span>
            <span className="mx-2">|</span>
            กรอก: ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, หมายเหตุ
            <span className="ml-2 text-xs text-teal-500">(บันทึกแล้วจะเข้าสถานะ &quot;{LINEN_FORM_STATUS_CONFIG.draft.label}&quot;)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">โรงแรม</label>
              <select value={newCustomerId} onChange={e => handleCustomerSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">เลือกโรงแรม</option>
                {customers.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">วันที่</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {newCustomerId && getCustomer(newCustomerId) && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <label className="block text-sm font-medium text-amber-800 mb-1">จำนวนถุงกระสอบส่งซัก</label>
                <input type="number" min={0}
                  value={newBagsSent || ''}
                  onChange={e => setNewBagsSent(sanitizeNumber(e.target.value, 9999))}
                  className="w-32 px-3 py-2 border border-amber-300 rounded-lg text-sm text-center font-medium focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                  placeholder="0" />
              </div>
              <LinenFormGrid
                customer={getCustomer(newCustomerId)!}
                rows={newRows}
                onChange={setNewRows}
                catalog={linenCatalog}
                carryOver={getCarryOver(newCustomerId, newDate)}
                editableColumns={['col2', 'col3', 'note']}
                formStatus="draft"
              />
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <button onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium transition-colors flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" />ยกเลิก
            </button>
            <span className={cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap', LINEN_FORM_STATUS_CONFIG.draft.bgColor, LINEN_FORM_STATUS_CONFIG.draft.color)}>
              {LINEN_FORM_STATUS_CONFIG.draft.todoLabel}
            </span>
            <button onClick={handleCreate} disabled={!newCustomerId || newRows.length === 0}
              className="px-3 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-50 font-medium transition-colors flex items-center gap-1">
              {LINEN_FORM_STATUS_CONFIG.draft.label}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={detailForm?.formNumber || ''} size="xl">
        {detailForm && detailCustomer && (
          <div className="space-y-4">
            <div id="linen-form-detail" className="space-y-4 bg-white p-2">
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailCustomer.name}</strong></div>
              <div><span className="text-slate-500">วันที่:</span> {formatDate(detailForm.date)}</div>
              <div>
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  LINEN_FORM_STATUS_CONFIG[detailForm.status].bgColor,
                  LINEN_FORM_STATUS_CONFIG[detailForm.status].color
                )}>
                  {LINEN_FORM_STATUS_CONFIG[detailForm.status].label}
                </span>
              </div>
            </div>

            {/* จำนวนถุง — แสดงตามสถานะ */}
            <div className="flex flex-wrap gap-4">
              {['draft', 'received', 'sorting', 'washing'].includes(detailForm.status) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <label className="block text-xs font-medium text-amber-800 mb-1">จำนวนถุงกระสอบส่งซัก</label>
                  {['draft', 'received', 'sorting'].includes(detailForm.status) ? (
                    <input type="number" min={0}
                      value={detailForm.bagsSentCount || ''}
                      onChange={e => updateLinenForm(detailForm.id, { bagsSentCount: sanitizeNumber(e.target.value, 9999) })}
                      className="w-28 px-3 py-1.5 border border-amber-300 rounded text-sm text-center font-medium focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  ) : (
                    <span className="text-sm font-medium text-amber-900">{detailForm.bagsSentCount || '-'}</span>
                  )}
                </div>
              )}
              {['packed', 'delivered', 'confirmed'].includes(detailForm.status) && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
                  <label className="block text-xs font-medium text-teal-800 mb-1">จำนวนถุงแพคส่ง</label>
                  {['packed', 'delivered'].includes(detailForm.status) ? (
                    <input type="number" min={0}
                      value={detailForm.bagsPackCount || ''}
                      onChange={e => updateLinenForm(detailForm.id, { bagsPackCount: sanitizeNumber(e.target.value, 9999) })}
                      className="w-28 px-3 py-1.5 border border-teal-300 rounded text-sm text-center font-medium focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  ) : (
                    <span className="text-sm font-medium text-teal-900">{detailForm.bagsPackCount || '-'}</span>
                  )}
                </div>
              )}
            </div>

            {/* Status guide — สิ่งที่ทำ + ช่องที่กรอกได้ */}
            <div className={cn(
              'rounded-lg px-4 py-2.5 text-sm border',
              ['packed', 'confirmed'].includes(detailForm.status)
                ? 'bg-slate-50 border-slate-200 text-slate-500'
                : 'bg-teal-50 border-teal-200 text-teal-700'
            )}>
              <span className="font-medium">สิ่งที่ทำ: {nextDetailStatus ? LINEN_FORM_STATUS_CONFIG[nextDetailStatus].todoLabel : LINEN_FORM_STATUS_CONFIG[detailForm.status].label}</span>
              <span className="mx-2">|</span>
              {{
                draft: 'กรอก: ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, หมายเหตุ',
                received: 'กรอก: โรงซักนับเข้า, หมายเหตุ',
                sorting: 'แก้ได้เฉพาะหมายเหตุ',
                washing: 'กรอก: โรงซักแพคส่ง, หมายเหตุ',
                packed: 'ดูข้อมูลเท่านั้น',
                delivered: 'กรอก: ลูกค้านับผ้ากลับ',
                confirmed: 'ดูข้อมูลเท่านั้น',
              }[detailForm.status]}
            </div>

            <LinenFormGrid
              customer={detailCustomer}
              rows={detailForm.rows}
              onChange={(rows) => updateLinenForm(detailForm.id, { rows })}
              catalog={linenCatalog}
              carryOver={detailCarryOver}
              formDate={detailForm.date}
              formStatus={detailForm.status}
              editableColumns={
                detailForm.status === 'draft' ? ['col2', 'col3', 'note'] :
                detailForm.status === 'received' ? ['col5', 'note'] :
                PROCESS_STATUSES.includes(detailForm.status) ? ['note'] :
                detailForm.status === 'washing' ? ['col6', 'note'] :
                detailForm.status === 'delivered' ? ['col4'] :
                []
              }
            />

            {detailForm.notes && (
              <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                <strong>หมายเหตุ:</strong> {detailForm.notes}
              </div>
            )}

            {/* Department checkboxes — แสดงเมื่อสถานะ >= ซักอบเสร็จ */}
            {['washing', 'packed', 'delivered', 'confirmed'].includes(detailForm.status) && (
              <div className="bg-slate-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-slate-500 mb-2">สถานะแผนก (ติ๊กได้อิสระ)</p>
                <div className="flex flex-wrap gap-3">
                  {DEPARTMENT_CONFIG.map(dept => {
                    const checked = detailForm[dept.key] ?? false
                    const isReadOnly = detailForm.status === 'confirmed'
                    return (
                      <label key={dept.key} className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-all',
                        checked ? `${dept.bgColor} ${dept.color} border-current` : 'bg-white border-slate-200 text-slate-500',
                        isReadOnly && 'cursor-default opacity-70'
                      )}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (!isReadOnly) updateLinenForm(detailForm.id, { [dept.key]: !checked })
                          }}
                          disabled={isReadOnly}
                          className="w-4 h-4 rounded accent-current"
                        />
                        {dept.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            </div>{/* end #linen-form-detail */}

            {/* Progress stepper + Action buttons */}
            <div className="border-t border-slate-200 pt-4 mt-2 space-y-3">
              {/* Step progress bar */}
              {(() => {
                const currentIdx = ALL_LINEN_STATUSES.indexOf(detailForm.status)
                return (
                  <div className="flex items-center gap-0.5 px-1">
                    {ALL_LINEN_STATUSES.map((s, i) => {
                      const isDone = i < currentIdx
                      const isCurrent = i === currentIdx
                      return (
                        <Fragment key={s}>
                          <div title={LINEN_FORM_STATUS_CONFIG[s].label} className="flex-shrink-0">
                            <div className={cn(
                              'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold',
                              isCurrent
                                ? 'bg-[#1B3A5C] text-white ring-2 ring-[#3DD8D8] ring-offset-1'
                                : isDone
                                  ? 'bg-[#3DD8D8] text-white'
                                  : 'bg-slate-100 text-slate-400',
                            )}>
                              {isDone ? <Check className="w-3 h-3" /> : i + 1}
                            </div>
                          </div>
                          {i < 6 && (
                            <div className={cn(
                              'flex-1 h-0.5 rounded-full',
                              i < currentIdx ? 'bg-[#3DD8D8]' : 'bg-slate-100'
                            )} />
                          )}
                        </Fragment>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Current status label + step count */}
              <div className="flex items-center justify-center gap-2">
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
                  LINEN_FORM_STATUS_CONFIG[detailForm.status].bgColor,
                  LINEN_FORM_STATUS_CONFIG[detailForm.status].color
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', LINEN_FORM_STATUS_CONFIG[detailForm.status].dotColor)} />
                  {LINEN_FORM_STATUS_CONFIG[detailForm.status].label}
                </span>
                <span className="text-xs text-slate-400">ขั้นตอน {ALL_LINEN_STATUSES.indexOf(detailForm.status) + 1}/7</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setConfirmDeleteId(detailForm.id)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1">
                    <X className="w-3.5 h-3.5" />ลบ
                  </button>
                  <button onClick={() => setShowPrint(true)}
                    className="text-xs text-slate-400 hover:text-[#1B3A5C] transition-colors flex items-center gap-1">
                    <Printer className="w-3.5 h-3.5" />พิมพ์/ส่งออก
                  </button>
                </div>

                {isLockedByDN ? (
                  <span className="px-4 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                    สถานะเปลี่ยนผ่านใบส่งของ <strong>{linkedDN!.noteNumber}</strong>
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    {PREV_LINEN_STATUS[detailForm.status] ? (
                      <button onClick={() => handleRevertStatus(detailForm.id)}
                        className="px-3 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium transition-colors flex items-center gap-1">
                        <ChevronLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">{LINEN_FORM_STATUS_CONFIG[detailForm.status].prevLabel}</span>
                        <span className="sm:hidden">ย้อน</span>
                      </button>
                    ) : (
                      <button onClick={() => setShowDetail(null)}
                        className="px-3 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium transition-colors">
                        ปิด
                      </button>
                    )}

                    {NEXT_LINEN_STATUS[detailForm.status] ? (
                      <button onClick={() => handleAdvanceStatus(detailForm.id)}
                        className="px-4 py-2.5 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                        {LINEN_FORM_STATUS_CONFIG[NEXT_LINEN_STATUS[detailForm.status]!].label}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-1.5">
                        <Check className="w-4 h-4" />
                        เสร็จสมบูรณ์
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* LF Print Preview Modal */}
      <Modal open={showPrint && !!detailForm} onClose={() => setShowPrint(false)} title="พิมพ์ใบส่งรับผ้า" size="xl" className="print-target">
        {detailForm && detailCustomer && (
          <div>
            <LinenFormPrint form={detailForm} customer={detailCustomer} company={companyInfo} catalog={linenCatalog} carryOver={detailCarryOver} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-lf" filename={detailForm.formNumber} onExportCSV={handleExportCSV} />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal — ต้องอยู่หลัง Detail Modal เพื่อให้แสดงด้านหน้า */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">ต้องการลบใบรับส่งผ้านี้หรือไม่? การลบไม่สามารถเรียกคืนได้</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={() => { if (confirmDeleteId) { deleteLinenForm(confirmDeleteId); setConfirmDeleteId(null); setShowDetail(null) } }}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">ลบ</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
