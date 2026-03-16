'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, formatNumber, formatCurrency, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { type DeliveryNoteItem } from '@/types'
import { calculateTransportFeeTrip, calculateTransportFeeMonth, calculateDNSubtotal } from '@/lib/transport-fee'
import { Plus, Search, X, FileDown, Check, ExternalLink, Printer } from 'lucide-react'
import Modal from '@/components/Modal'
import DeliveryNotePrint from '@/components/DeliveryNotePrint'
import ExportButtons from '@/components/ExportButtons'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import { exportCSV } from '@/lib/export'

type DNFilter = 'all' | 'not-printed' | 'printed' | 'not-billed' | 'billed'

export default function DeliveryPage() {
  const {
    deliveryNotes, addDeliveryNote, updateDeliveryNote, deleteDeliveryNote,
    linenForms, customers, getCustomer, companyInfo, linenCatalog,
    billingStatements,
  } = useStore()
  const [showPrint, setShowPrint] = useState(false)

  const [search, setSearch] = useState('')
  const [dnFilter, setDnFilter] = useState<DNFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const searchParams = useSearchParams()
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [selectedDnIds, setSelectedDnIds] = useState<string[]>([])
  const [showPrintList, setShowPrintList] = useState(false)

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
  const [dnDate, setDnDate] = useState(todayISO())

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    return deliveryNotes.filter(dn => {
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
      // Filter by printed/billed status
      if (dnFilter === 'not-printed' && dn.isPrinted) return false
      if (dnFilter === 'printed' && !dn.isPrinted) return false
      if (dnFilter === 'not-billed' && dn.isBilled) return false
      if (dnFilter === 'billed' && !dn.isBilled) return false
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'noteNumber': va = a.noteNumber; vb = b.noteNumber; break
        case 'customer': va = getCustomer(a.customerId)?.name || ''; vb = getCustomer(b.customerId)?.name || ''; break
        case 'date': va = a.date; vb = b.date; break
        case 'items': va = a.items.reduce((s, i) => s + i.quantity, 0); vb = b.items.reduce((s, i) => s + i.quantity, 0); break
        case 'amount': va = getDNTotalAmount(a); vb = getDNTotalAmount(b); break
        case 'driver': va = a.driverName || ''; vb = b.driverName || ''; break
        default: va = a.date; vb = b.date
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [deliveryNotes, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, dnFilter])

  // Forms available for delivery (confirmed status)
  const availableForms = useMemo(() => {
    if (!selCustomerId) return []
    const linkedFormIds = new Set(deliveryNotes.flatMap(dn => dn.linenFormIds))
    return linenForms.filter(f =>
      f.customerId === selCustomerId &&
      f.status === 'confirmed' &&
      !linkedFormIds.has(f.id)
    )
  }, [linenForms, selCustomerId, deliveryNotes])

  // Calculate total amount for a DN (items subtotal + transport fees)
  const getDNTotalAmount = (dn: typeof deliveryNotes[number]): number => {
    const customer = getCustomer(dn.customerId)
    if (!customer || !(customer.enablePerPiece ?? true)) return 0
    const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
    const itemSubtotal = dn.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0)
    return itemSubtotal + (dn.transportFeeTrip || 0) + (dn.transportFeeMonth || 0)
  }

  const handleCustomerSelect = (custId: string) => {
    setSelCustomerId(custId)
    setSelFormIds([])
    setDeliveryItems([])
    setDnDate(todayISO())
  }

  const handleFormToggle = (formId: string) => {
    const updated = selFormIds.includes(formId)
      ? selFormIds.filter(id => id !== formId)
      : [...selFormIds, formId]
    setSelFormIds(updated)

    // Default date from first selected LF
    if (updated.length > 0) {
      const firstForm = linenForms.find(f => f.id === updated[0])
      if (firstForm) setDnDate(firstForm.date)
    }

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
    const customer = getCustomer(selCustomerId)
    const month = dnDate.slice(0, 7)

    // Calculate item subtotal for trip fee
    let tripFee = 0
    let monthFee = 0
    if (customer) {
      const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
      const itemSubtotal = deliveryItems.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0)
      tripFee = calculateTransportFeeTrip(itemSubtotal, customer)

      // Monthly fee: find existing DNs for same customer+month
      const monthDNs = deliveryNotes.filter(d => d.customerId === selCustomerId && d.date.startsWith(month))

      // Clear transportFeeMonth from previous last DN (will recalculate for this new one)
      const prevLastDN = [...monthDNs].sort((a, b) => b.date.localeCompare(a.date))[0]
      if (prevLastDN && prevLastDN.transportFeeMonth > 0) {
        updateDeliveryNote(prevLastDN.id, { transportFeeMonth: 0 })
      }

      monthFee = calculateTransportFeeMonth(monthDNs, customer, itemSubtotal, tripFee)
    }

    addDeliveryNote({
      customerId: selCustomerId,
      linenFormIds: selFormIds,
      date: dnDate,
      items: deliveryItems,
      driverName,
      vehiclePlate,
      receiverName,
      status: 'pending',
      isPrinted: false,
      isBilled: false,
      transportFeeTrip: tripFee,
      transportFeeMonth: monthFee,
      notes: dnNotes,
    })
    setShowCreate(false)
  }

  const detailNote = showDetail ? deliveryNotes.find(d => d.id === showDetail) : null
  const detailCustomer = detailNote ? getCustomer(detailNote.customerId) : null
  const itemNameMap = Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))

  // Map DN id → billing statement (for WB badge)
  const dnBillingMap = useMemo(() => {
    const map = new Map<string, { billingId: string; billingNumber: string }>()
    for (const bs of billingStatements) {
      for (const dnId of bs.deliveryNoteIds) {
        map.set(dnId, { billingId: bs.id, billingNumber: bs.billingNumber })
      }
    }
    return map
  }, [billingStatements])

  const handleExportCSV = () => {
    if (!detailNote || !detailCustomer) return
    const isPer = (detailCustomer.enablePerPiece ?? true)
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

  // Auto-mark as printed when export/print happens
  const handlePrintExport = () => {
    if (detailNote && !detailNote.isPrinted) {
      updateDeliveryNote(detailNote.id, { isPrinted: true })
    }
  }

  const filterOptions: { key: DNFilter; label: string }[] = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'not-printed', label: 'ยังไม่พิมพ์' },
    { key: 'printed', label: 'พิมพ์แล้ว' },
    { key: 'not-billed', label: 'ยังไม่วางบิล' },
    { key: 'billed', label: 'วางบิลแล้ว' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">2. ใบส่งของชั่วคราว (SD)</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการใบส่งของชั่วคราว</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPrintList(true)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />
            พิมพ์รายการ{selectedDnIds.length > 0 ? ` (${selectedDnIds.length})` : ''}
          </button>
          <button onClick={() => { setShowCreate(true); setSelCustomerId(''); setSelFormIds([]); setDeliveryItems([]); setDriverName(''); setVehiclePlate(''); setReceiverName(''); setDnNotes(''); setDnDate(todayISO()) }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />
            สร้างใบส่งของ
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบส่งของ, โรงแรม..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {filterOptions.map(f => (
          <button key={f.key} onClick={() => setDnFilter(f.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              dnFilter === f.key ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}>
            {f.label}
          </button>
        ))}
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
                <th className="px-2 py-3 w-10">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selectedDnIds.length === filtered.length}
                    onChange={e => {
                      if (e.target.checked) setSelectedDnIds(filtered.map(d => d.id))
                      else setSelectedDnIds([])
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                </th>
                <SortableHeader label="เลขที่" sortKey="noteNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="โรงแรม" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="จำนวนชิ้น" sortKey="items" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="ยอดรวม" sortKey="amount" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="คนขับ" sortKey="driver" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(dn => {
                const customer = getCustomer(dn.customerId)
                const totalItems = dn.items.reduce((s, i) => s + i.quantity, 0)
                const dnAmount = getDNTotalAmount(dn)
                return (
                  <tr key={dn.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setShowDetail(dn.id)}>
                    <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selectedDnIds.includes(dn.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedDnIds(prev => [...prev, dn.id])
                          else setSelectedDnIds(prev => prev.filter(id => id !== dn.id))
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{dn.noteNumber}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(dn.date)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNumber(totalItems)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{dnAmount > 0 ? formatCurrency(dnAmount) : '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{dn.driverName || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {dn.isPrinted && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">พิมพ์แล้ว</span>
                        )}
                        {dn.isBilled && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">วางบิลแล้ว</span>
                        )}
                        {dn.isBilled && dnBillingMap.has(dn.id) && (
                          <button
                            onClick={e => { e.stopPropagation(); window.location.href = `/dashboard/billing?detail=${dnBillingMap.get(dn.id)!.billingId}` }}
                            className="px-1.5 py-0.5 rounded text-xs font-bold text-orange-600 hover:text-orange-800 hover:bg-orange-100 transition-colors flex items-center gap-0.5"
                            title={`ไปที่ ${dnBillingMap.get(dn.id)!.billingNumber}`}
                          >
                            WB
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                        {!dn.isPrinted && !dn.isBilled && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">รอดำเนินการ</span>
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

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">วันที่</label>
            <input type="date" value={dnDate} onChange={e => setDnDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

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
              <div className="flex items-center gap-1">
                {detailNote.isPrinted && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">พิมพ์แล้ว</span>
                )}
                {detailNote.isBilled && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">วางบิลแล้ว</span>
                )}
                {detailNote.isBilled && dnBillingMap.has(detailNote.id) && (
                  <a href={`/dashboard/billing?detail=${dnBillingMap.get(detailNote.id)!.billingId}`}
                    className="px-1.5 py-0.5 rounded text-xs font-bold text-orange-600 hover:text-orange-800 hover:bg-orange-100 transition-colors flex items-center gap-0.5">
                    WB
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {!detailNote.isPrinted && !detailNote.isBilled && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">รอดำเนินการ</span>
                )}
              </div>
            </div>

            {(() => {
              const isPer = (detailCustomer.enablePerPiece ?? true)
              const priceMap = Object.fromEntries(detailCustomer.priceList.map(p => [p.code, p.price]))
              const itemSubtotal = isPer ? detailNote.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0) : 0
              const tripFee = detailNote.transportFeeTrip || 0
              const monthFee = detailNote.transportFeeMonth || 0
              const grandTotal = itemSubtotal + tripFee + monthFee
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
                      {/* รวมค่าซัก */}
                      <tr className="bg-slate-50 font-medium">
                        <td className="px-3 py-2" colSpan={2}>รวมค่าซัก</td>
                        <td className="px-3 py-2 text-right">{formatNumber(detailNote.items.reduce((s, i) => s + i.quantity, 0))}</td>
                        {isPer && <td className="px-3 py-2"></td>}
                        {isPer && <td className="px-3 py-2 text-right">{formatNumber(itemSubtotal)}</td>}
                      </tr>
                      {/* ค่ารถ (ครั้ง) */}
                      {isPer && tripFee > 0 && (
                        <tr className="border-t border-amber-200 bg-amber-50/50">
                          <td className="px-3 py-1.5" colSpan={2}>
                            <span className="text-amber-700 font-medium">ค่ารถ (ครั้ง)</span>
                          </td>
                          <td className="px-3 py-1.5" colSpan={2}></td>
                          <td className="px-3 py-1.5 text-right">
                            <input type="number" value={tripFee}
                              onChange={e => updateDeliveryNote(detailNote.id, { transportFeeTrip: sanitizeNumber(e.target.value) })}
                              className="w-24 px-2 py-1 border border-amber-300 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-white" />
                          </td>
                        </tr>
                      )}
                      {/* ค่ารถ (เดือน) */}
                      {isPer && monthFee > 0 && (
                        <tr className="border-t border-purple-200 bg-purple-50/50">
                          <td className="px-3 py-1.5" colSpan={2}>
                            <span className="text-purple-700 font-medium">ค่ารถ (เดือน)</span>
                          </td>
                          <td className="px-3 py-1.5" colSpan={2}></td>
                          <td className="px-3 py-1.5 text-right">
                            <input type="number" value={monthFee}
                              onChange={e => updateDeliveryNote(detailNote.id, { transportFeeMonth: sanitizeNumber(e.target.value) })}
                              className="w-24 px-2 py-1 border border-purple-300 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-white" />
                          </td>
                        </tr>
                      )}
                      {/* ยอดรวมทั้งหมด */}
                      {isPer && (tripFee > 0 || monthFee > 0) && (
                        <tr className="bg-slate-100 font-bold">
                          <td className="px-3 py-2" colSpan={4}>ยอดรวมทั้งหมด</td>
                          <td className="px-3 py-2 text-right text-[#1B3A5C]">{formatNumber(grandTotal)}</td>
                        </tr>
                      )}
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
            <button onClick={() => {
              if (!confirmDeleteId) return
              const deletedDN = deliveryNotes.find(d => d.id === confirmDeleteId)
              deleteDeliveryNote(confirmDeleteId)
              // Reassign monthly fee if deleted DN had one
              if (deletedDN && deletedDN.transportFeeMonth > 0) {
                const month = deletedDN.date.slice(0, 7)
                const customer = getCustomer(deletedDN.customerId)
                const remainingDNs = deliveryNotes
                  .filter(d => d.id !== confirmDeleteId && d.customerId === deletedDN.customerId && d.date.startsWith(month))
                  .sort((a, b) => b.date.localeCompare(a.date))
                if (remainingDNs.length > 0 && customer && customer.enableMinPerMonth) {
                  const newLastDN = remainingDNs[0]
                  const otherDNs = remainingDNs.filter(d => d.id !== newLastDN.id)
                  const existingTotal = otherDNs.reduce((s, d) => {
                    return s + calculateDNSubtotal(d, customer) + (d.transportFeeTrip || 0)
                  }, 0)
                  const lastDNSubtotal = calculateDNSubtotal(newLastDN, customer) + (newLastDN.transportFeeTrip || 0)
                  const monthTotal = existingTotal + lastDNSubtotal
                  const newMonthFee = monthTotal < customer.monthlyFlatRate ? customer.monthlyFlatRate - monthTotal : 0
                  updateDeliveryNote(newLastDN.id, { transportFeeMonth: newMonthFee })
                }
              }
              setConfirmDeleteId(null)
              setShowDetail(null)
            }}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">ลบ</button>
          </div>
        </div>
      </Modal>

      {/* Print List Modal — พิมพ์รายการ SD */}
      <Modal open={showPrintList} onClose={() => setShowPrintList(false)} title="รายการใบส่งของ" size="xl" className="print-target">
        {(() => {
          const printDNs = selectedDnIds.length > 0
            ? filtered.filter(d => selectedDnIds.includes(d.id))
            : filtered
          const grandTotal = printDNs.reduce((s, dn) => s + getDNTotalAmount(dn), 0)
          const totalPieces = printDNs.reduce((s, dn) => s + dn.items.reduce((ss, i) => ss + i.quantity, 0), 0)
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500 no-print">
                {selectedDnIds.length > 0 ? `เลือก ${printDNs.length} รายการ` : `ทั้งหมด ${printDNs.length} รายการ`}
              </div>
              <div id="print-dn-list" className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">โรงแรม</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">วันที่</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวนชิ้น</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printDNs.map((dn, idx) => {
                      const customer = getCustomer(dn.customerId)
                      const pieces = dn.items.reduce((s, i) => s + i.quantity, 0)
                      const amount = getDNTotalAmount(dn)
                      return (
                        <tr key={dn.id} className="border-t border-slate-100">
                          <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{dn.noteNumber}</td>
                          <td className="px-3 py-1.5 text-slate-800">{customer?.name || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{formatDate(dn.date)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700">{formatNumber(pieces)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700">{amount > 0 ? formatCurrency(amount) : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td className="px-3 py-2" colSpan={4}>ยอดรวมทั้งหมด</td>
                      <td className="px-3 py-2 text-right">{formatNumber(totalPieces)}</td>
                      <td className="px-3 py-2 text-right text-[#1B3A5C]">{grandTotal > 0 ? formatCurrency(grandTotal) : '-'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex justify-end mt-4 no-print">
                <ExportButtons targetId="print-dn-list" filename="รายการใบส่งของ" />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Print Preview Modal — ตรวจสอบข้อมูลก่อนพิมพ์ */}
      <Modal open={showPrint && !!detailNote} onClose={() => setShowPrint(false)} title="ตรวจสอบข้อมูลก่อนพิมพ์" size="xl" className="print-target">
        {detailNote && detailCustomer && (
          <div>
            {/* SD linked status checkbox */}
            <div className="flex items-center justify-between mb-2 no-print">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => {
                    const linkedLFs = detailNote.linenFormIds.map(id => linenForms.find(f => f.id === id)).filter(Boolean)
                    const lfNumbers = linkedLFs.map(f => f!.formNumber).join(', ')
                    if (confirm(`ยืนยันการลบใบส่งของ ${detailNote.noteNumber}?\n\nLF ที่จะย้อนสถานะกลับ:\n${lfNumbers}\n\nSD badge และ link ใน LF จะหายไปด้วย`)) {
                      const deletedDN = detailNote
                      deleteDeliveryNote(deletedDN.id)
                      // Reassign monthly fee if deleted DN had one
                      if (deletedDN.transportFeeMonth > 0) {
                        const month = deletedDN.date.slice(0, 7)
                        const customer = getCustomer(deletedDN.customerId)
                        const remainingDNs = deliveryNotes
                          .filter(d => d.id !== deletedDN.id && d.customerId === deletedDN.customerId && d.date.startsWith(month))
                          .sort((a, b) => b.date.localeCompare(a.date))
                        if (remainingDNs.length > 0 && customer && customer.enableMinPerMonth) {
                          const newLastDN = remainingDNs[0]
                          const otherDNs = remainingDNs.filter(d => d.id !== newLastDN.id)
                          const existingTotal = otherDNs.reduce((s, d) => {
                            return s + calculateDNSubtotal(d, customer) + (d.transportFeeTrip || 0)
                          }, 0)
                          const lastDNSubtotal = calculateDNSubtotal(newLastDN, customer) + (newLastDN.transportFeeTrip || 0)
                          const monthTotal = existingTotal + lastDNSubtotal
                          const newMonthFee = monthTotal < customer.monthlyFlatRate ? customer.monthlyFlatRate - monthTotal : 0
                          updateDeliveryNote(newLastDN.id, { transportFeeMonth: newMonthFee })
                        }
                      }
                      setShowPrint(false)
                      setShowDetail(null)
                    }
                  }}
                  className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-emerald-700">สถานะเปลี่ยนผ่านใบส่งของ SD</span>
              </label>
            </div>

            {/* Printed checkbox */}
            <div className="flex items-center justify-between mb-4 no-print">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={detailNote.isPrinted}
                  onChange={e => updateDeliveryNote(detailNote.id, { isPrinted: e.target.checked })}
                  className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-blue-700 flex items-center gap-1">
                  <Check className="w-4 h-4" />พิมพ์แล้ว
                </span>
              </label>
              {detailNote.isPrinted && (
                <span className="text-xs text-blue-500">เอกสารนี้เคยถูกพิมพ์แล้ว</span>
              )}
            </div>

            <DeliveryNotePrint note={detailNote} customer={detailCustomer} company={companyInfo} catalog={linenCatalog} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-delivery" filename={detailNote.noteNumber} onExportCSV={handleExportCSV} onExport={handlePrintExport} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
