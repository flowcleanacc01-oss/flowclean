'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, cn, todayISO } from '@/lib/utils'
import { LINEN_FORM_STATUS_CONFIG, NEXT_LINEN_STATUS, PREV_LINEN_STATUS, ALL_LINEN_STATUSES, PROCESS_STATUSES, type LinenFormStatus, type LinenFormRow } from '@/types'
import { hasDiscrepancies } from '@/lib/discrepancy'
import { Plus, Search, ChevronRight, ChevronLeft, AlertTriangle, X } from 'lucide-react'
import Modal from '@/components/Modal'
import LinenFormGrid from '@/components/LinenFormGrid'

export default function LinenFormsPage() {
  const {
    linenForms, addLinenForm, updateLinenForm, updateLinenFormStatus, deleteLinenForm,
    customers, getCustomer, getCarryOver, linenCatalog,
  } = useStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LinenFormStatus | 'all'>('all')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const searchParams = useSearchParams()
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Create form state
  const [newCustomerId, setNewCustomerId] = useState('')
  const [newDate, setNewDate] = useState(todayISO())
  const [newRows, setNewRows] = useState<LinenFormRow[]>([])
  const [newNotes, setNewNotes] = useState('')

  const filtered = useMemo(() => {
    return linenForms.filter(f => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (customerFilter !== 'all' && f.customerId !== customerFilter) return false
      if (search) {
        const customer = getCustomer(f.customerId)
        const q = search.toLowerCase()
        if (!f.formNumber.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
      }
      return true
    }).sort((a, b) => b.date.localeCompare(a.date) || b.formNumber.localeCompare(a.formNumber))
  }, [linenForms, statusFilter, customerFilter, search, getCustomer])

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
    })
    setShowCreate(false)
  }

  const detailForm = showDetail ? linenForms.find(f => f.id === showDetail) : null
  const detailCustomer = detailForm ? getCustomer(detailForm.customerId) : null
  const detailCarryOver = detailForm ? getCarryOver(detailForm.customerId, detailForm.date) : {}

  const handleAdvanceStatus = (formId: string) => {
    const form = linenForms.find(f => f.id === formId)
    if (!form) return
    const next = NEXT_LINEN_STATUS[form.status]
    if (next) updateLinenFormStatus(formId, next)
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
          รับผ้าเข้าใหม่
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
                <th className="text-left px-4 py-3 font-medium text-slate-600">เลขที่ฟอร์ม</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">โรงแรม</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">วันที่</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">จำนวนชิ้น</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
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
                const disc = hasDiscrepancies(form)
                const cfg = LINEN_FORM_STATUS_CONFIG[form.status]
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
                      {disc && <AlertTriangle className="w-4 h-4 text-orange-500 inline" />}
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
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="รับผ้าเข้าใหม่" size="xl">
        <div className="space-y-4">
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
            <LinenFormGrid
              customer={getCustomer(newCustomerId)!}
              rows={newRows}
              onChange={setNewRows}
              catalog={linenCatalog}
              carryOver={getCarryOver(newCustomerId, newDate)}
              editableColumns={['col2', 'col3', 'note']}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!newCustomerId || newRows.length === 0}
              className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium">
              ลูกค้านับส่งแล้ว
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
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

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={detailForm?.formNumber || ''} size="xl">
        {detailForm && detailCustomer && (
          <div className="space-y-4">
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

            <LinenFormGrid
              customer={detailCustomer}
              rows={detailForm.rows}
              onChange={(rows) => updateLinenForm(detailForm.id, { rows })}
              catalog={linenCatalog}
              carryOver={detailCarryOver}
              formDate={detailForm.date}
              readOnly={detailForm.status === 'confirmed'}
              editableColumns={
                detailForm.status === 'draft' ? ['col2', 'col3', 'note'] :
                detailForm.status === 'received' ? ['col4', 'col5', 'note'] :
                PROCESS_STATUSES.includes(detailForm.status) ? ['note'] :
                detailForm.status === 'packed' ? ['col6', 'note'] :
                []
              }
            />

            {detailForm.notes && (
              <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                <strong>หมายเหตุ:</strong> {detailForm.notes}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setConfirmDeleteId(detailForm.id)}
                className="text-sm text-red-500 hover:text-red-700 transition-colors flex items-center gap-1">
                <X className="w-4 h-4" />ลบ
              </button>
              <div className="flex gap-2 items-center">
                {PREV_LINEN_STATUS[detailForm.status] && (
                  <button onClick={() => { handleRevertStatus(detailForm.id) }}
                    className="px-4 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium transition-colors flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" />
                    {LINEN_FORM_STATUS_CONFIG[PREV_LINEN_STATUS[detailForm.status]!].label}
                  </button>
                )}
                <span className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium',
                  LINEN_FORM_STATUS_CONFIG[detailForm.status].bgColor,
                  LINEN_FORM_STATUS_CONFIG[detailForm.status].color
                )}>
                  {LINEN_FORM_STATUS_CONFIG[detailForm.status].label}
                </span>
                {NEXT_LINEN_STATUS[detailForm.status] && (
                  <button onClick={() => { handleAdvanceStatus(detailForm.id) }}
                    className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium transition-colors flex items-center gap-1">
                    {LINEN_FORM_STATUS_CONFIG[NEXT_LINEN_STATUS[detailForm.status]!].label}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
