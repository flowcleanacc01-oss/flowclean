'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatDate, cn } from '@/lib/utils'
import {
  CHECKLIST_TYPE_CONFIG, CHECKLIST_STATUS_CONFIG,
  type ChecklistType, type ChecklistStatus, type ChecklistItem, type ProductChecklist,
} from '@/types'
import { Plus, Search, Printer, X, ChevronRight, ClipboardCheck } from 'lucide-react'
import Modal from '@/components/Modal'
import ChecklistPrint from '@/components/ChecklistPrint'

export default function ChecklistPage() {
  const {
    checklists, addChecklist, updateChecklist, updateChecklistStatus, deleteChecklist,
    linenForms, deliveryNotes, customers, getCustomer, linenCatalog, companyInfo,
  } = useStore()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ChecklistType | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  // Create form state
  const [newType, setNewType] = useState<ChecklistType>('qc')
  const [newLinkedId, setNewLinkedId] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [newInspector, setNewInspector] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newItems, setNewItems] = useState<ChecklistItem[]>([])

  const nameMap = useMemo(() => Object.fromEntries(linenCatalog.map(i => [i.code, i.name])), [linenCatalog])

  // Available documents to link
  const availableDocs = useMemo(() => {
    if (newType === 'qc') {
      return linenForms
        .filter(f => ['qc', 'packed', 'delivered', 'confirmed'].includes(f.status))
        .map(f => ({
          id: f.id,
          number: f.formNumber,
          customerName: getCustomer(f.customerId)?.name || '-',
          customerId: f.customerId,
          date: f.date,
        }))
    }
    return deliveryNotes.map(dn => ({
      id: dn.id,
      number: dn.noteNumber,
      customerName: getCustomer(dn.customerId)?.name || '-',
      customerId: dn.customerId,
      date: dn.date,
    }))
  }, [newType, linenForms, deliveryNotes, getCustomer])

  const handleLinkedDocSelect = (docId: string) => {
    setNewLinkedId(docId)
    if (newType === 'qc') {
      const form = linenForms.find(f => f.id === docId)
      if (form) {
        setNewItems(form.rows.filter(r => r.col5_factoryPackSend > 0).map(r => ({
          code: r.code,
          name: nameMap[r.code] || r.code,
          expectedQty: r.col5_factoryPackSend,
          actualQty: 0,
          passed: false,
          note: '',
        })))
      }
    } else {
      const dn = deliveryNotes.find(d => d.id === docId)
      if (dn) {
        setNewItems(dn.items.map(item => ({
          code: item.code,
          name: nameMap[item.code] || item.code,
          expectedQty: item.quantity,
          actualQty: 0,
          passed: false,
          note: '',
        })))
      }
    }
  }

  const handleCreate = () => {
    if (!newLinkedId || newItems.length === 0) return
    const doc = availableDocs.find(d => d.id === newLinkedId)
    if (!doc) return
    addChecklist({
      type: newType,
      customerId: doc.customerId,
      linkedDocumentId: newLinkedId,
      linkedDocumentNumber: doc.number,
      date: newDate,
      items: newItems,
      inspectorName: newInspector,
      status: 'draft',
      notes: newNotes,
    })
    setShowCreate(false)
  }

  const handleCreateOpen = () => {
    setNewType('qc')
    setNewLinkedId('')
    setNewDate(new Date().toISOString().split('T')[0])
    setNewInspector('')
    setNewNotes('')
    setNewItems([])
    setShowCreate(true)
  }

  const filtered = useMemo(() => {
    return checklists.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const custName = getCustomer(c.customerId)?.name || ''
        if (!c.checklistNumber.toLowerCase().includes(q) && !custName.toLowerCase().includes(q)) return false
      }
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [checklists, typeFilter, search, getCustomer])

  const detailCL = showDetail ? checklists.find(c => c.id === showDetail) : null
  const detailCustomer = detailCL ? getCustomer(detailCL.customerId) : null

  const handleAdvanceStatus = (id: string) => {
    const cl = checklists.find(c => c.id === id)
    if (!cl) return
    if (cl.status === 'draft') updateChecklistStatus(id, 'checked')
    else if (cl.status === 'checked') updateChecklistStatus(id, 'approved')
  }

  const nextStatusLabel = (status: ChecklistStatus): string | null => {
    if (status === 'draft') return 'ตรวจแล้ว'
    if (status === 'checked') return 'อนุมัติ'
    return null
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">เช็คสินค้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">ใบเช็คคุณภาพ (QC) และขึ้นรถ (Loading)</p>
        </div>
        <button onClick={handleCreateOpen}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />สร้างใบเช็ค
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่, ชื่อโรงแรม..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'qc', 'loading'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                typeFilter === t ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {t === 'all' ? 'ทั้งหมด' : CHECKLIST_TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">เลขที่</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">ประเภท</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">โรงแรม</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">เอกสารอ้างอิง</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">วันที่</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">ผ่าน/รวม</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                  <ClipboardCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  ไม่พบข้อมูล
                </td></tr>
              ) : filtered.map(cl => {
                const customer = getCustomer(cl.customerId)
                const passedCount = cl.items.filter(i => i.passed).length
                const cfg = CHECKLIST_STATUS_CONFIG[cl.status]
                const nxt = nextStatusLabel(cl.status)
                return (
                  <tr key={cl.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setShowDetail(cl.id)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{cl.checklistNumber}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        cl.type === 'qc' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700')}>
                        {cl.type === 'qc' ? 'QC' : 'Loading'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{cl.linkedDocumentNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(cl.date)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-xs font-medium', passedCount === cl.items.length ? 'text-emerald-600' : 'text-amber-600')}>
                        {passedCount}/{cl.items.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {nxt && (
                        <button onClick={() => handleAdvanceStatus(cl.id)}
                          className="text-xs px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] rounded font-medium hover:bg-[#2bb8b8] inline-flex items-center gap-0.5">
                          {nxt} <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบเช็คสินค้า" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ประเภท</label>
              <select value={newType} onChange={e => { setNewType(e.target.value as ChecklistType); setNewLinkedId(''); setNewItems([]) }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="qc">ตรวจคุณภาพ (QC)</option>
                <option value="loading">ขึ้นรถ (Loading)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                {newType === 'qc' ? 'เลือกใบรับส่งผ้า' : 'เลือกใบส่งของ'}
              </label>
              <select value={newLinkedId} onChange={e => handleLinkedDocSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">เลือกเอกสาร</option>
                {availableDocs.map(d => (
                  <option key={d.id} value={d.id}>{d.number} — {d.customerName} ({formatDate(d.date)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">วันที่ตรวจ</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ผู้ตรวจ</label>
              <input value={newInspector} onChange={e => setNewInspector(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {newItems.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">รายการตรวจ</label>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-20">ควรมี</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-24">จริง</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-16">ผ่าน</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-32">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newItems.map((item, idx) => (
                      <tr key={item.code} className="border-t border-slate-100">
                        <td className="px-3 py-1 font-mono text-xs text-slate-500">{item.code}</td>
                        <td className="px-3 py-1 text-slate-700">{item.name}</td>
                        <td className="px-3 py-1 text-right text-slate-600">{item.expectedQty}</td>
                        <td className="px-1 py-1 text-right">
                          <input type="number" min={0}
                            value={item.actualQty || ''}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0
                              const updated = [...newItems]
                              updated[idx] = { ...item, actualQty: val, passed: val === item.expectedQty }
                              setNewItems(updated)
                            }}
                            className="w-20 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        </td>
                        <td className="px-3 py-1 text-center">
                          <input type="checkbox" checked={item.passed}
                            onChange={e => {
                              const updated = [...newItems]
                              updated[idx] = { ...item, passed: e.target.checked }
                              setNewItems(updated)
                            }}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-[#3DD8D8]" />
                        </td>
                        <td className="px-1 py-1">
                          <input value={item.note}
                            onChange={e => {
                              const updated = [...newItems]
                              updated[idx] = { ...item, note: e.target.value }
                              setNewItems(updated)
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                            placeholder="..." />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!newLinkedId || newItems.length === 0}
              className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium">
              บันทึก
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setShowPrint(false) }} title={detailCL?.checklistNumber || ''} size="xl">
        {detailCL && detailCustomer && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailCustomer.name}</strong></div>
              <div><span className="text-slate-500">ประเภท:</span> {CHECKLIST_TYPE_CONFIG[detailCL.type].label}</div>
              <div><span className="text-slate-500">อ้างอิง:</span> <span className="font-mono text-xs">{detailCL.linkedDocumentNumber}</span></div>
              <div><span className="text-slate-500">วันที่:</span> {formatDate(detailCL.date)}</div>
              <div><span className="text-slate-500">ผู้ตรวจ:</span> {detailCL.inspectorName || '-'}</div>
              <div>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                  CHECKLIST_STATUS_CONFIG[detailCL.status].bgColor,
                  CHECKLIST_STATUS_CONFIG[detailCL.status].color)}>
                  {CHECKLIST_STATUS_CONFIG[detailCL.status].label}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-20">ควรมี</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-20">จริง</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600 w-16">ผ่าน</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {detailCL.items.map((item, idx) => (
                    <tr key={item.code} className={cn('border-t border-slate-100', !item.passed && item.actualQty > 0 && 'bg-red-50')}>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                      <td className="px-3 py-1.5 text-slate-700">{item.name}</td>
                      <td className="px-3 py-1.5 text-right">{item.expectedQty}</td>
                      <td className="px-3 py-1.5 text-right">
                        {detailCL.status === 'draft' ? (
                          <input type="number" min={0} value={item.actualQty || ''}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0
                              const updatedItems = [...detailCL.items]
                              updatedItems[idx] = { ...item, actualQty: val, passed: val === item.expectedQty }
                              updateChecklist(detailCL.id, { items: updatedItems })
                            }}
                            className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        ) : (
                          <span className={cn(item.actualQty !== item.expectedQty && 'text-red-600 font-medium')}>{item.actualQty}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {item.passed ? (
                          <span className="text-emerald-600 font-medium">&#10003;</span>
                        ) : item.actualQty > 0 ? (
                          <span className="text-red-600 font-medium">&#10007;</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-slate-500">{item.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-medium">
                    <td colSpan={4} className="px-3 py-2 text-right">
                      ผ่าน: {detailCL.items.filter(i => i.passed).length}/{detailCL.items.length}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {detailCL.notes && (
              <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                <strong>หมายเหตุ:</strong> {detailCL.notes}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button onClick={() => { deleteChecklist(detailCL.id); setShowDetail(null) }}
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                <X className="w-4 h-4" />ลบ
              </button>
              <div className="flex gap-2">
                {nextStatusLabel(detailCL.status) && (
                  <button onClick={() => handleAdvanceStatus(detailCL.id)}
                    className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium flex items-center gap-1">
                    {nextStatusLabel(detailCL.status)} <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setShowPrint(true)}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                  <Printer className="w-4 h-4" />พิมพ์
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Print Modal */}
      <Modal open={showPrint && !!detailCL} onClose={() => setShowPrint(false)} title="พิมพ์ใบเช็คสินค้า" size="xl">
        {detailCL && detailCustomer && (
          <div>
            <ChecklistPrint checklist={detailCL} customer={detailCustomer} company={companyInfo} />
            <div className="flex justify-end mt-4 no-print">
              <button onClick={() => window.print()}
                className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors flex items-center gap-1">
                <Printer className="w-4 h-4" />พิมพ์
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
