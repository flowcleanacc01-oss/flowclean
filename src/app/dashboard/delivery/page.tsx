'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, formatNumber, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { DELIVERY_STATUS_CONFIG, type DeliveryNoteStatus, type DeliveryNoteItem } from '@/types'
import { Plus, Search, Truck, X, FileDown } from 'lucide-react'
import Modal from '@/components/Modal'
import DeliveryNotePrint from '@/components/DeliveryNotePrint'
import ExportButtons from '@/components/ExportButtons'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import { exportCSV } from '@/lib/export'

export default function DeliveryPage() {
  const {
    deliveryNotes, addDeliveryNote, updateDeliveryNoteStatus, deleteDeliveryNote,
    linenForms, customers, getCustomer, companyInfo, linenCatalog,
  } = useStore()
  const [showPrint, setShowPrint] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const searchParams = useSearchParams()
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('single')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Create form state
  const [selCustomerId, setSelCustomerId] = useState('')
  const [selFormIds, setSelFormIds] = useState<string[]>([])
  const [deliveryItems, setDeliveryItems] = useState<DeliveryNoteItem[]>([])
  const [driverName, setDriverName] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [dnNotes, setDnNotes] = useState('')

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    return deliveryNotes.filter(dn => {
      if (statusFilter !== 'all' && dn.status !== statusFilter) return false
      if (search) {
        const customer = getCustomer(dn.customerId)
        const q = search.toLowerCase()
        if (!dn.noteNumber.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
      }
      if (dateFrom) {
        if (dateFilterMode === 'single') {
          if (dn.date !== dateFrom) return false
        } else {
          if (dn.date < dateFrom) return false
          if (dateTo && dn.date > dateTo) return false
        }
      }
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'noteNumber': va = a.noteNumber; vb = b.noteNumber; break
        case 'customer': va = getCustomer(a.customerId)?.name || ''; vb = getCustomer(b.customerId)?.name || ''; break
        case 'date': va = a.date; vb = b.date; break
        case 'items': va = a.items.reduce((s, i) => s + i.quantity, 0); vb = b.items.reduce((s, i) => s + i.quantity, 0); break
        case 'driver': va = a.driverName || ''; vb = b.driverName || ''; break
        default: va = a.date; vb = b.date
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [deliveryNotes, statusFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  // Forms available for delivery (packed status)
  const availableForms = useMemo(() => {
    if (!selCustomerId) return []
    const linkedFormIds = new Set(deliveryNotes.flatMap(dn => dn.linenFormIds))
    return linenForms.filter(f =>
      f.customerId === selCustomerId &&
      f.status === 'confirmed' &&
      !linkedFormIds.has(f.id)
    )
  }, [linenForms, selCustomerId, deliveryNotes])

  const handleCustomerSelect = (custId: string) => {
    setSelCustomerId(custId)
    setSelFormIds([])
    setDeliveryItems([])
  }

  const handleFormToggle = (formId: string) => {
    const updated = selFormIds.includes(formId)
      ? selFormIds.filter(id => id !== formId)
      : [...selFormIds, formId]
    setSelFormIds(updated)

    // Billing = Col5 (UI: แพคส่ง) = code col6_factoryPackSend ทั้งหมด
    const qtyMap: Record<string, number> = {}
    for (const fId of updated) {
      const form = linenForms.find(f => f.id === fId)
      if (!form) continue
      for (const row of form.rows) {
        const packSend = row.col6_factoryPackSend || 0
        if (packSend > 0) {
          qtyMap[row.code] = (qtyMap[row.code] || 0) + packSend
        }
      }
    }
    const items: DeliveryNoteItem[] = Object.entries(qtyMap)
      .map(([code, quantity]) => ({ code, quantity, isClaim: false }))
    items.sort((a, b) => {
      const ai = linenCatalog.findIndex(i => i.code === a.code)
      const bi = linenCatalog.findIndex(i => i.code === b.code)
      return ai - bi
    })
    setDeliveryItems(items)
  }

  const handleCreate = () => {
    if (!selCustomerId || deliveryItems.length === 0) return
    addDeliveryNote({
      customerId: selCustomerId,
      linenFormIds: selFormIds,
      date: todayISO(),
      items: deliveryItems,
      driverName,
      vehiclePlate,
      receiverName,
      status: 'pending',
      notes: dnNotes,
    })
    setShowCreate(false)
  }

  const detailNote = showDetail ? deliveryNotes.find(d => d.id === showDetail) : null
  const detailCustomer = detailNote ? getCustomer(detailNote.customerId) : null
  const itemNameMap = Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))

  const handleExportCSV = () => {
    if (!detailNote || !detailCustomer) return
    const isPer = detailCustomer.billingModel === 'per_piece'
    const priceMap = Object.fromEntries(detailCustomer.priceList.map(p => [p.code, p.price]))
    const headers = isPer
      ? ['รหัส', 'รายการ', 'จำนวน', 'ราคา/หน่วย', 'มูลค่า']
      : ['รหัส', 'รายการ', 'จำนวน']
    const rows = detailNote.items.map(item => {
      const price = priceMap[item.code] || 0
      return isPer
        ? [item.code, itemNameMap[item.code] || item.code, String(item.quantity), String(price), String(item.quantity * price)]
        : [item.code, itemNameMap[item.code] || item.code, String(item.quantity)]
    })
    exportCSV(headers, rows, detailNote.noteNumber)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ใบส่งของ</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการใบส่งของชั่วคราว (SD)</p>
        </div>
        <button onClick={() => { setShowCreate(true); setSelCustomerId(''); setSelFormIds([]); setDeliveryItems([]); setDriverName(''); setVehiclePlate(''); setReceiverName(''); setDnNotes('') }}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          สร้างใบส่งของ
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบส่งของ, โรงแรม..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'pending', 'delivered', 'acknowledged'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                statusFilter === s ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {s === 'all' ? 'ทั้งหมด' : DELIVERY_STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Filter */}
      <div className="mb-4">
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateFilterMode}
          onModeChange={setDateFilterMode} onDateFromChange={setDateFrom}
          onDateToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <SortableHeader label="เลขที่" sortKey="noteNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="โรงแรม" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="จำนวนชิ้น" sortKey="items" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="คนขับ" sortKey="driver" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(dn => {
                const customer = getCustomer(dn.customerId)
                const totalItems = dn.items.reduce((s, i) => s + i.quantity, 0)
                const cfg = DELIVERY_STATUS_CONFIG[dn.status]
                return (
                  <tr key={dn.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setShowDetail(dn.id)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{dn.noteNumber}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(dn.date)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNumber(totalItems)}</td>
                    <td className="px-4 py-3 text-slate-600">{dn.driverName || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {dn.status === 'pending' && (
                        <button onClick={() => updateDeliveryNoteStatus(dn.id, 'delivered')}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors">
                          <Truck className="w-3 h-3 inline mr-1" />ส่งแล้ว
                        </button>
                      )}
                      {dn.status === 'delivered' && (
                        <button onClick={() => updateDeliveryNoteStatus(dn.id, 'acknowledged')}
                          className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors">
                          รับแล้ว
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
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบส่งของ" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">โรงแรม</label>
            <select value={selCustomerId} onChange={e => handleCustomerSelect(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
              <option value="">เลือกโรงแรม</option>
              {customers.filter(c => c.isActive).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selCustomerId && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">เลือกใบส่งรับผ้า (ลูกค้านับผ้ากลับแล้ว)</label>
              {availableForms.length > 0 ? (
                <div className="space-y-2">
                  {availableForms.map(f => (
                    <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selFormIds.includes(f.id)}
                        onChange={() => handleFormToggle(f.id)}
                        className="rounded border-slate-300" />
                      <span className="text-sm">
                        {f.formNumber} — {formatDate(f.date)} ({f.rows.reduce((s, r) => s + (r.col6_factoryPackSend || 0), 0)} ชิ้น)
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                  ไม่มีใบส่งรับผ้าที่สถานะ &quot;ลูกค้านับผ้ากลับแล้ว&quot; — ต้องเลื่อนสถานะใบส่งรับผ้าให้ถึง &quot;ลูกค้านับผ้ากลับแล้ว&quot; ก่อนจึงจะสร้างใบส่งของได้
                </div>
              )}
            </div>
          )}

          {deliveryItems.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">รายการผ้า</label>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryItems.map((item, idx) => (
                      <tr key={`${item.code}-${item.isClaim}`} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono text-xs">{item.code}</td>
                        <td className="px-3 py-1.5">
                          {itemNameMap[item.code] || item.code}
                          {item.isClaim && <span className="ml-1 text-xs text-orange-600">(เคลม)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" min={0} value={item.quantity}
                            onChange={e => setDeliveryItems(prev => prev.map((di, i) => i === idx ? { ...di, quantity: sanitizeNumber(e.target.value, 99999) } : di))}
                            className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">คนขับ</label>
              <input value={driverName} onChange={e => setDriverName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ทะเบียนรถ</label>
              <input value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ผู้รับ</label>
              <input value={receiverName} onChange={e => setReceiverName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={dnNotes} onChange={e => setDnNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!selCustomerId || deliveryItems.length === 0}
              className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium">
              บันทึก
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={detailNote?.noteNumber || ''} size="lg">
        {detailNote && detailCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailCustomer.name}</strong></div>
              <div><span className="text-slate-500">วันที่:</span> {formatDate(detailNote.date)}</div>
              <div><span className="text-slate-500">คนขับ:</span> {detailNote.driverName || '-'}</div>
              <div><span className="text-slate-500">ทะเบียน:</span> {detailNote.vehiclePlate || '-'}</div>
              <div><span className="text-slate-500">ผู้รับ:</span> {detailNote.receiverName || '-'}</div>
              <div>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                  DELIVERY_STATUS_CONFIG[detailNote.status].bgColor,
                  DELIVERY_STATUS_CONFIG[detailNote.status].color)}>
                  {DELIVERY_STATUS_CONFIG[detailNote.status].label}
                </span>
              </div>
            </div>

            {(() => {
              const isPer = detailCustomer.billingModel === 'per_piece'
              const priceMap = Object.fromEntries(detailCustomer.priceList.map(p => [p.code, p.price]))
              const totalAmt = isPer ? detailNote.items.reduce((s, i) => s + i.quantity * (priceMap[i.code] || 0), 0) : 0
              return (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวน</th>
                        {isPer && <th className="text-right px-3 py-2 font-medium text-slate-600">ราคา</th>}
                        {isPer && <th className="text-right px-3 py-2 font-medium text-slate-600">มูลค่า</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detailNote.items.map((item, idx) => {
                        const price = priceMap[item.code] || 0
                        return (
                          <tr key={`${item.code}-${idx}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 font-mono text-xs">{item.code}</td>
                            <td className="px-3 py-1.5">
                              {itemNameMap[item.code] || item.code}
                              {item.isClaim && <span className="ml-1 text-xs text-orange-600">(เคลม)</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right">{formatNumber(item.quantity)}</td>
                            {isPer && <td className="px-3 py-1.5 text-right">{formatNumber(price)}</td>}
                            {isPer && <td className="px-3 py-1.5 text-right">{formatNumber(item.quantity * price)}</td>}
                          </tr>
                        )
                      })}
                      <tr className="bg-slate-50 font-medium">
                        <td className="px-3 py-2" colSpan={2}>รวม</td>
                        <td className="px-3 py-2 text-right">{formatNumber(detailNote.items.reduce((s, i) => s + i.quantity, 0))}</td>
                        {isPer && <td className="px-3 py-2"></td>}
                        {isPer && <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatNumber(totalAmt)}</td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <div className="flex justify-between pt-2">
              <button onClick={() => setConfirmDeleteId(detailNote.id)}
                className="text-sm text-red-500 hover:text-red-700 transition-colors flex items-center gap-1">
                <X className="w-4 h-4" />ลบ
              </button>
              <button onClick={() => setShowPrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออก
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">ต้องการลบใบส่งของนี้หรือไม่? การลบไม่สามารถเรียกคืนได้</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={() => { if (confirmDeleteId) { deleteDeliveryNote(confirmDeleteId); setConfirmDeleteId(null); setShowDetail(null) } }}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">ลบ</button>
          </div>
        </div>
      </Modal>

      {/* Print Preview Modal */}
      <Modal open={showPrint && !!detailNote} onClose={() => setShowPrint(false)} title="พิมพ์ใบส่งของ" size="xl" className="print-target">
        {detailNote && detailCustomer && (
          <div>
            <DeliveryNotePrint note={detailNote} customer={detailCustomer} company={companyInfo} catalog={linenCatalog} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-delivery" filename={detailNote.noteNumber} onExportCSV={handleExportCSV} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
