'use client'

import { useState, useMemo, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { LINEN_FORM_STATUS_CONFIG, NEXT_LINEN_STATUS, PREV_LINEN_STATUS, ALL_LINEN_STATUSES, PROCESS_STATUSES, DEPARTMENT_CONFIG, type LinenFormStatus, type LinenFormRow } from '@/types'
import { hasType1Discrepancy, hasType2Discrepancy } from '@/lib/discrepancy'
import { Plus, Search, ChevronRight, ChevronLeft, AlertTriangle, X, Check, Printer, FileText, FileDown, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
    customers, getCustomer, getCarryOver, linenCatalog, quotations, deliveryNotes, companyInfo,
  } = useStore()

  const router = useRouter()
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
  const [alertFilter, setAlertFilter] = useState<'all' | 'alert' | 'no-sd'>('all')

  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  // Bulk select state
  const [selectedLfIds, setSelectedLfIds] = useState<string[]>([])
  const [showLfPrintList, setShowLfPrintList] = useState(false)
  const [showLfBulkPrint, setShowLfBulkPrint] = useState(false)

  // Map: lfId → deliveryNote (for SD badge)
  const linkedLFMap = useMemo(() => {
    const map = new Map<string, { dnId: string; noteNumber: string }>()
    for (const dn of deliveryNotes) {
      for (const lfId of dn.linenFormIds) {
        map.set(lfId, { dnId: dn.id, noteNumber: dn.noteNumber })
      }
    }
    return map
  }, [deliveryNotes])

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortedBg = (key: string) => sortKey === key ? 'bg-[#1B3A5C]/[0.04]' : ''

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

  const handleLfListCSV = (items: typeof filtered) => {
    const headers = ['ลำดับ', 'เลขที่ LF', 'โรงแรม', 'วันที่', 'จำนวนชิ้น', 'สถานะ']
    const rows = items.map((f, idx) => {
      const customer = getCustomer(f.customerId)
      const pieces = f.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
      return [String(idx + 1), f.formNumber, customer?.shortName || customer?.name || '-', f.date, String(pieces), LINEN_FORM_STATUS_CONFIG[f.status]?.label || f.status]
    })
    exportCSV(headers, rows, 'รายการใบส่งรับผ้า')
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
        if (!f.formNumber.toLowerCase().includes(q) && !(customer?.shortName || '').toLowerCase().includes(q) && !(customer?.name || '').toLowerCase().includes(q)) return false
      }
      if (dateFrom) {
        if (dateFilterMode === 'single') {
          if (f.date !== dateFrom) return false
        } else {
          if (f.date < dateFrom) return false
          if (dateTo && f.date > dateTo) return false
        }
      }
      // Alert filters
      if (alertFilter === 'alert') {
        if (!hasType1Discrepancy(f) && !hasType2Discrepancy(f)) return false
      } else if (alertFilter === 'no-sd') {
        if (linkedLFMap.has(f.id)) return false
      }
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'formNumber': va = a.formNumber; vb = b.formNumber; break
        case 'customer': { const ca = getCustomer(a.customerId); va = ca?.shortName || ca?.name || ''; const cb = getCustomer(b.customerId); vb = cb?.shortName || cb?.name || ''; break }
        case 'date': va = a.date; vb = b.date; break
        case 'pieces': va = a.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0); vb = b.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0); break
        case 'status': va = ALL_LINEN_STATUSES.indexOf(a.status); vb = ALL_LINEN_STATUSES.indexOf(b.status); break
        case 'alert': {
          const aScore = (hasType1Discrepancy(a) ? 1 : 0) + (hasType2Discrepancy(a) ? 2 : 0)
          const bScore = (hasType1Discrepancy(b) ? 1 : 0) + (hasType2Discrepancy(b) ? 2 : 0)
          va = aScore; vb = bScore; break
        }
        case 'isExported': va = a.isExported ? 1 : 0; vb = b.isExported ? 1 : 0; break
        case 'isPrinted': va = a.isPrinted ? 1 : 0; vb = b.isPrinted ? 1 : 0; break
        case 'sd': {
          va = linkedLFMap.get(a.id)?.noteNumber || ''
          vb = linkedLFMap.get(b.id)?.noteNumber || ''
          break
        }
        default: va = a.date; vb = b.date
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [linenForms, statusFilter, customerFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, alertFilter, linkedLFMap])

  const statuses: (LinenFormStatus | 'all')[] = ['all', ...ALL_LINEN_STATUSES]

  // Helper: get the linked accepted QT for a customer (match by customerId first, then customerName)
  const getLinkedQT = (custName: string, custId?: string) =>
    quotations.find(q =>
      q.status === 'accepted' &&
      ((custId && q.customerId === custId) || q.customerName === custName)
    ) || null

  const buildRows = (codes: string[]) => codes.map(code => ({
    code,
    col1_carryOver: 0,
    col2_hotelCountIn: 0,
    col3_hotelClaimCount: 0,
    col4_factoryApproved: 0,
    col5_factoryClaimApproved: 0,
    col6_factoryPackSend: 0,
    note: '',
  }))

  const handleCreateOpen = () => {
    const firstCustomer = customers.filter(c => c.isActive)[0]
    setNewCustomerId(firstCustomer?.id || '')
    setNewDate(todayISO())
    if (firstCustomer) {
      const linkedQT = getLinkedQT(firstCustomer.name, firstCustomer.id)
      const codes = linkedQT ? linkedQT.items.map(i => i.code) : firstCustomer.enabledItems
      setNewRows(buildRows(codes))
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
      const linkedQT = getLinkedQT(cust.name, custId)
      const codes = linkedQT ? linkedQT.items.map(i => i.code) : cust.enabledItems
      setNewRows(buildRows(codes))
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
          <h1 className="text-2xl font-bold text-slate-800">1. ใบส่งรับผ้า (LF)</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการใบส่งรับผ้าทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedLfIds.length > 0 && (
            <button onClick={() => setShowLfBulkPrint(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกที่เลือก ({selectedLfIds.length})
            </button>
          )}
          <button onClick={() => setShowLfPrintList(true)} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />พิมพ์/ส่งออกรายการ
          </button>
          <button onClick={handleCreateOpen}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />สร้างใบส่งรับผ้าใหม่
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ฟอร์ม, ชื่อลูกค้า..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
          />
        </div>
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
          <option value="all">ทุกลูกค้า</option>
          {customers.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
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

      {/* Alert / SD filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([
          { key: 'all' as const, label: 'ทั้งหมด' },
          { key: 'alert' as const, label: '⚠ ยอดไม่ตรง' },
          { key: 'no-sd' as const, label: 'ยังไม่มีใบส่งของ' },
        ]).map(f => (
          <button key={f.key} onClick={() => setAlertFilter(f.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              alertFilter === f.key
                ? f.key === 'alert' ? 'bg-amber-500 text-white' : f.key === 'no-sd' ? 'bg-blue-500 text-white' : 'bg-[#1B3A5C] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}>
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
                    checked={filtered.length > 0 && selectedLfIds.length === filtered.length}
                    onChange={e => { if (e.target.checked) setSelectedLfIds(filtered.map(f => f.id)); else setSelectedLfIds([]) }}
                    className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                </th>
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="เลขที่" sortKey="formNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="จำนวน" sortKey="pieces" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="สถานะ" sortKey="status" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="⚠" sortKey="alert" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center w-12" />
                <SortableHeader label="ส่งออก" sortKey="isExported" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="SD" sortKey="sd" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <th className="text-right px-4 py-3 font-medium text-slate-600 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(form => {
                const customer = getCustomer(form.customerId)
                const totalPieces = form.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
                const disc1 = hasType1Discrepancy(form)
                const disc2 = hasType2Discrepancy(form)
                const cfg = LINEN_FORM_STATUS_CONFIG[form.status] || LINEN_FORM_STATUS_CONFIG.draft
                const nextStatus = NEXT_LINEN_STATUS[form.status]
                const linkedDNInfo = linkedLFMap.get(form.id)

                return (
                  <tr key={form.id}
                    className={cn("border-b border-slate-100 cursor-pointer", activeRowId === form.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                    onClick={() => { setActiveRowId(form.id); setShowDetail(form.id) }}>
                    <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selectedLfIds.includes(form.id)}
                        onChange={e => { if (e.target.checked) setSelectedLfIds(prev => [...prev, form.id]); else setSelectedLfIds(prev => prev.filter(id => id !== form.id)) }}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </td>
                    <td className={cn("px-4 py-3 text-slate-600", sortedBg('date'))}>{formatDate(form.date)}</td>
                    <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{customer?.shortName || customer?.name || '-'}</td>
                    <td className={cn("px-4 py-3 font-mono text-xs text-slate-600", sortedBg('formNumber'))}>{form.formNumber}</td>
                    <td className={cn("px-4 py-3 text-right text-slate-700", sortedBg('pieces'))}>{totalPieces}</td>
                    <td className={cn("px-4 py-3 text-center", sortedBg('status'))}>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dotColor)} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className={cn("px-4 py-3 text-center", sortedBg('alert'))}>
                      {disc1 && <span title="โรงซักนับเข้า ≠ นับส่ง+เคลม"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /></span>}
                      {disc2 && <span title="ลูกค้านับกลับ ≠ แพคส่ง"><AlertTriangle className="w-4 h-4 text-red-500 inline" /></span>}
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isExported'))}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        form.isExported ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400')}>
                        {form.isExported ? 'ส่งออกแล้ว' : 'ยังไม่ส่งออก'}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        form.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                        {form.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('sd'))} onClick={e => e.stopPropagation()}>
                      {linkedDNInfo ? (
                        <button
                          onClick={() => router.push(`/dashboard/delivery?detail=${linkedDNInfo.dnId}`)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        >
                          <span className="font-mono">{linkedDNInfo.noteNumber}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
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
                  <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">วันที่</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {newCustomerId && getCustomer(newCustomerId) && !getLinkedQT(getCustomer(newCustomerId)!.name, newCustomerId) && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-700">
              <strong>ไม่สามารถสร้างใบรับส่งผ้าได้</strong> — ลูกค้านี้ยังไม่มีใบเสนอราคา (QT) ที่มีสถานะ &quot;ตกลง&quot; กรุณาสร้างและยืนยัน QT ก่อน
            </div>
          )}

          {newCustomerId && getCustomer(newCustomerId) && getLinkedQT(getCustomer(newCustomerId)!.name, newCustomerId) && (
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
                qtItems={getLinkedQT(getCustomer(newCustomerId)!.name, newCustomerId)?.items}
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
            <button onClick={handleCreate} disabled={!newCustomerId || newRows.length === 0 || !getLinkedQT(getCustomer(newCustomerId)?.name || '', newCustomerId)}
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
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailCustomer.shortName || detailCustomer.name}</strong></div>
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
              qtItems={getLinkedQT(detailCustomer.name, detailForm.customerId)?.items}
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
            <div className="flex items-center gap-6 mb-4 no-print">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!detailForm.isPrinted}
                  onChange={e => updateLinenForm(detailForm.id, { isPrinted: e.target.checked })}
                  className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-blue-700 flex items-center gap-1"><Check className="w-4 h-4" />พิมพ์แล้ว</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!detailForm.isExported}
                  onChange={e => updateLinenForm(detailForm.id, { isExported: e.target.checked })}
                  className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกแล้ว</span>
              </label>
            </div>
            <LinenFormPrint form={detailForm} customer={detailCustomer} company={companyInfo} catalog={linenCatalog} carryOver={detailCarryOver} qtItems={getLinkedQT(detailCustomer.name, detailForm.customerId)?.items} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-lf" filename={detailForm.formNumber} onExportCSV={handleExportCSV}
                onPrint={() => { if (!detailForm.isPrinted) updateLinenForm(detailForm.id, { isPrinted: true }) }}
                onExportFile={() => { if (!detailForm.isExported) updateLinenForm(detailForm.id, { isExported: true }) }} />
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

      {/* LF Print List Modal */}
      <Modal open={showLfPrintList} onClose={() => setShowLfPrintList(false)} title="รายการใบส่งรับผ้า" size="xl" className="print-target">
        {(() => {
          const printItems = selectedLfIds.length > 0
            ? filtered.filter(f => selectedLfIds.includes(f.id))
            : filtered
          const totalPieces = printItems.reduce((s, f) => s + f.rows.reduce((ss, r) => ss + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0), 0)
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500 no-print">
                {selectedLfIds.length > 0 ? `เลือก ${printItems.length} รายการ` : `ทั้งหมด ${printItems.length} รายการ`}
              </div>
              <div id="print-lf-list" className="border border-slate-200 rounded-lg overflow-hidden print:border-none">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">{companyInfo.name} — รายการใบส่งรับผ้า</h2>
                <table className="w-full text-sm print:text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่ LF</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">โรงแรม</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">วันที่</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวนชิ้น</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printItems.map((f, idx) => {
                      const customer = getCustomer(f.customerId)
                      const pieces = f.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
                      const cfg = LINEN_FORM_STATUS_CONFIG[f.status]
                      return (
                        <tr key={f.id} className="border-t border-slate-100">
                          <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{f.formNumber}</td>
                          <td className="px-3 py-1.5 text-slate-800">{customer?.shortName || customer?.name || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{formatDate(f.date)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700">{pieces}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td className="px-3 py-2" colSpan={4}>ยอดรวมทั้งหมด</td>
                      <td className="px-3 py-2 text-right">{totalPieces.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex justify-end mt-4 no-print">
                <ExportButtons targetId="print-lf-list" filename="รายการใบส่งรับผ้า" onExportCSV={() => handleLfListCSV(printItems)} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* LF Bulk Print Modal */}
      <Modal open={showLfBulkPrint} onClose={() => setShowLfBulkPrint(false)} title={`พิมพ์/ส่งออกใบส่งรับผ้า (${selectedLfIds.length} ใบ)`} size="xl" className="print-target">
        {/* Select All row */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200 no-print">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedLfIds.every(id => linenForms.find(f => f.id === id)?.isPrinted)}
                onChange={e => { for (const lfId of selectedLfIds) updateLinenForm(lfId, { isPrinted: e.target.checked }) }}
                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-blue-700 flex items-center gap-1"><Check className="w-4 h-4" />พิมพ์แล้ว (ทุกรายการ)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedLfIds.every(id => linenForms.find(f => f.id === id)?.isExported)}
                onChange={e => { for (const lfId of selectedLfIds) updateLinenForm(lfId, { isExported: e.target.checked }) }}
                className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกแล้ว (ทุกรายการ)</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">พิมพ์ → "พิมพ์แล้ว" | JPG/PDF/CSV → "ส่งออกแล้ว"</p>
        </div>
        <div id="print-bulk-lf">
          {selectedLfIds.map((lfId, idx) => {
            const form = linenForms.find(f => f.id === lfId)
            const cust = form ? getCustomer(form.customerId) : null
            if (!form || !cust) return null
            const carryOver = getCarryOver(form.customerId, form.date)
            return (
              <div key={lfId} style={idx > 0 ? { pageBreakBefore: 'always', breakBefore: 'page' } : {}}>
                {idx > 0 && <div className="border-t-2 border-dashed border-slate-300 my-6 no-print" />}
                {/* Per-doc status row */}
                <div className="flex items-center gap-4 mb-2 no-print">
                  <span className="text-xs font-mono text-slate-400">{form.formNumber}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!form.isPrinted}
                      onChange={e => updateLinenForm(form.id, { isPrinted: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-xs font-medium text-blue-700">พิมพ์แล้ว</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!form.isExported}
                      onChange={e => updateLinenForm(form.id, { isExported: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs font-medium text-violet-700">ส่งออกแล้ว</span>
                  </label>
                </div>
                <LinenFormPrint form={form} customer={cust} company={companyInfo} catalog={linenCatalog} carryOver={carryOver} qtItems={getLinkedQT(cust.name, form.customerId)?.items} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-end mt-4 no-print">
          <ExportButtons
            targetId="print-bulk-lf"
            filename={`LF-bulk-${selectedLfIds.length}`}
            onExportCSV={() => handleLfListCSV(linenForms.filter(f => selectedLfIds.includes(f.id)))}
            onPrint={() => { for (const lfId of selectedLfIds) updateLinenForm(lfId, { isPrinted: true }) }}
            onExportFile={() => { for (const lfId of selectedLfIds) updateLinenForm(lfId, { isExported: true }) }}
          />
        </div>
      </Modal>
    </div>
  )
}
