'use client'

import { useState, useMemo, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatDate, cn, todayISO, startOfMonthISO, sanitizeNumber, scrollToActiveRow } from '@/lib/utils'
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
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState(() => todayISO())
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [showPrint, setShowPrint] = useState(false)
  const [alertFilter, setAlertFilter] = useState<'all' | 'alert' | 'no-sd'>('all')

  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  // Bulk select state (pre-populated from URL param e.g. after SD delete)
  const [selectedLfIds, setSelectedLfIds] = useState<string[]>(() => {
    const p = searchParams.get('select')
    return p ? p.split(',').filter(Boolean) : []
  })
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

  // จำนวนผ้าตามสถานะ — แสดงค่าที่ relevant ที่สุด ณ สถานะนั้น
  const getPiecesForStatus = (f: typeof linenForms[number]): number => {
    switch (f.status) {
      case 'draft':     // 1/7: ลูกค้านับส่ง + เคลม
      case 'received':  // 2/7: ยังใช้ค่าลูกค้า (รอโรงซักนับ)
        return f.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
      case 'sorting':   // 3/7: โรงซักนับเข้า
        return f.rows.reduce((s, r) => s + r.col5_factoryClaimApproved, 0)
      case 'washing':   // 4/7: ซักอบเสร็จ → ใช้ col5 (col6 ยังไม่กรอก)
        return f.rows.reduce((s, r) => s + r.col5_factoryClaimApproved, 0)
      case 'packed':    // 5/7: แพคส่ง
      case 'delivered': // 6/7: แพคส่ง
        return f.rows.reduce((s, r) => s + (r.col6_factoryPackSend || 0), 0)
      case 'confirmed': // 7/7: ลูกค้านับกลับ
        return f.rows.reduce((s, r) => s + r.col4_factoryApproved, 0)
      default:
        return f.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
    }
  }

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
        case 'pieces': va = getPiecesForStatus(a); vb = getPiecesForStatus(b); break
        case 'status': va = ALL_LINEN_STATUSES.indexOf(a.status); vb = ALL_LINEN_STATUSES.indexOf(b.status); break
        case 'alert': {
          const aScore = (hasType1Discrepancy(a) ? 1 : 0) + (hasType2Discrepancy(a) ? 2 : 0)
          const bScore = (hasType1Discrepancy(b) ? 1 : 0) + (hasType2Discrepancy(b) ? 2 : 0)
          va = aScore; vb = bScore; break
        }
        case 'isExported': va = a.isExported ? 1 : 0; vb = b.isExported ? 1 : 0; break
        case 'dept': {
          va = DEPARTMENT_CONFIG.filter(d => a[d.key]).length
          vb = DEPARTMENT_CONFIG.filter(d => b[d.key]).length
          break
        }
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
    const newLF = addLinenForm({
      customerId: newCustomerId,
      date: newDate,
      status: 'draft',
      rows: newRows,
      notes: newNotes,
      bagsSentCount: newBagsSent,
    })
    setActiveRowId(newLF.id)
    scrollToActiveRow(newLF.id)
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

    // Per-step validation (draft + received ไม่บังคับ — ข้ามได้เลย)
    if (form.status === 'washing') {
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

  // Scroll modal to top + auto-focus first editable cell (spreadsheet UX)
  // skipScroll: ไม่ scroll ขึ้นบน (เช่น confirmed → อยู่ด้านล่างกดเสร็จสมบูรณ์ได้เลย)
  // targetStatus: สถานะที่จะไปถึง (ใช้ตัดสินใจว่า focus ช่องไหน)
  const scrollAndFocusGrid = (skipScroll = false, targetStatus?: string) => {
    setTimeout(() => {
      if (!skipScroll) {
        const detailEl = document.getElementById('linen-form-detail')
        if (detailEl) {
          const scrollContainer = detailEl.closest('[class*="overflow-y"]')
          if (scrollContainer) scrollContainer.scrollTop = 0
        }
      }
      // Wait for React re-render then focus the right input
      const tryFocus = (attempt = 0) => {
        // packed → focus bagsPackCount (เฉพาะ packed เท่านั้น ไม่ใช่ delivered)
        if (targetStatus === 'packed') {
          const bagsInput = document.getElementById('bags-pack-input') as HTMLInputElement
          if (bagsInput) { bagsInput.focus(); bagsInput.select(); return }
        }
        // grid → focus first editable cell
        const firstInput = document.querySelector('#linen-form-detail input[data-row="0"]') as HTMLInputElement
        if (firstInput) { firstInput.focus(); firstInput.select(); return }
        // retry up to 3 times (waiting for re-render)
        if (attempt < 3) setTimeout(() => tryFocus(attempt + 1), 150)
      }
      setTimeout(() => tryFocus(), 200)
    }, 100)
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
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสารที่เลือก ({selectedLfIds.length})
            </button>
          )}
          <button onClick={() => setShowLfPrintList(true)} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
          </button>
          <button onClick={handleCreateOpen}
            className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
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
        {statuses.map(s => {
          const cfg = s !== 'all' ? LINEN_FORM_STATUS_CONFIG[s] : null
          return (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              statusFilter === s
                ? cfg ? `${cfg.bgColor} ${cfg.color} ring-1 ring-current` : 'bg-[#3DD8D8] text-[#1B3A5C]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}>
            {s === 'all' ? 'ทั้งหมด' : cfg!.label}
            <span className="ml-1 opacity-70">
              ({s === 'all' ? linenForms.length : linenForms.filter(f => f.status === s).length})
            </span>
          </button>
        )})}
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
                ? f.key === 'alert' ? 'bg-amber-500 text-white' : f.key === 'no-sd' ? 'bg-blue-500 text-white' : 'bg-[#3DD8D8] text-[#1B3A5C]'
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
                <SortableHeader label="⚠" sortKey="alert" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center w-12" />
                <SortableHeader label="ส่งออกเอกสาร" sortKey="isExported" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="สถานะแผนกย่อย" sortKey="dept" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="สถานะ" sortKey="status" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="จำนวน" sortKey="pieces" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="SD" sortKey="sd" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <th className="text-right px-2 py-3 font-medium text-slate-600 w-[130px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(form => {
                const customer = getCustomer(form.customerId)
                const totalPieces = getPiecesForStatus(form)
                const disc1 = hasType1Discrepancy(form)
                const disc2 = hasType2Discrepancy(form)
                const cfg = LINEN_FORM_STATUS_CONFIG[form.status] || LINEN_FORM_STATUS_CONFIG.draft
                const nextStatus = NEXT_LINEN_STATUS[form.status]
                const linkedDNInfo = linkedLFMap.get(form.id)

                return (
                  <tr key={form.id} data-row-id={form.id}
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
                    <td className={cn("px-4 py-3 text-center", sortedBg('alert'))}>
                      {disc1 && <span title="โรงซักนับเข้า ≠ นับส่ง+เคลม"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /></span>}
                      {disc2 && <span title="ลูกค้านับกลับ ≠ แพคส่ง"><AlertTriangle className="w-4 h-4 text-red-500 inline" /></span>}
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isExported'))}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        form.isExported ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400')}>
                        {form.isExported ? 'ส่งออกเอกสารแล้ว' : '-'}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('dept'))}>
                      <div className="flex flex-wrap justify-center gap-0.5">
                        {DEPARTMENT_CONFIG.filter(d => form[d.key]).map(d => (
                          <span key={d.key} className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', d.bgColor, d.color)}>
                            ✓ {d.label.replace('เสร็จ', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={cn("px-4 py-3 text-center", sortedBg('status'))}>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dotColor)} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className={cn("px-4 py-3 text-right text-slate-700", sortedBg('pieces'))}>{totalPieces}</td>
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
                    <td className="px-2 py-3 text-right w-[130px]" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {PREV_LINEN_STATUS[form.status] && (
                          <button onClick={() => handleRevertStatus(form.id)}
                            className="h-7 px-2 text-[11px] bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors flex items-center gap-0.5 font-medium flex-shrink-0"
                            title={`ย้อนกลับ → ${LINEN_FORM_STATUS_CONFIG[PREV_LINEN_STATUS[form.status]!].label}`}>
                            <ChevronLeft className="w-3 h-3" />ย้อน
                          </button>
                        )}
                        {nextStatus && (() => {
                          const nextIdx = ALL_LINEN_STATUSES.indexOf(nextStatus)
                          return (
                            <button onClick={() => handleAdvanceStatus(form.id)}
                              className="h-7 px-2.5 text-[11px] bg-[#3DD8D8] text-[#1B3A5C] rounded-md font-bold hover:bg-[#2bb8b8] transition-colors flex items-center gap-0.5 flex-shrink-0">
                              {nextIdx + 1}/7
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )
                        })()}
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
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบส่งรับผ้าใหม่ (Create New LF)" size="wide">
        <div className="space-y-4">
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5 text-sm text-teal-700">
            <span className="font-medium">สิ่งที่ทำ: {LINEN_FORM_STATUS_CONFIG.draft.todoLabel}</span>
            <span className="mx-2">|</span>
            กรอก: จำนวนถุงกระสอบส่งซัก, ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, หมายเหตุ
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
              <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
                <label className="block text-sm font-medium text-teal-800 mb-1">จำนวนถุงกระสอบส่งซัก</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*"
                  value={newBagsSent || ''}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setNewBagsSent(v === '' ? 0 : parseInt(v, 10)) }}
                  onFocus={e => e.currentTarget.select()}
                  className="w-32 px-3 py-2 border border-teal-300 rounded-lg text-sm text-center font-medium focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
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
            <div className="flex items-center gap-2">
              <button onClick={() => { handleCreate() }} disabled={!newCustomerId || newRows.length === 0 || !getLinkedQT(getCustomer(newCustomerId)?.name || '', newCustomerId)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
                บันทึก
              </button>
              <button onClick={() => {
                if (!newCustomerId || newRows.length === 0 || !getLinkedQT(getCustomer(newCustomerId)?.name || '', newCustomerId)) return
                const newLF = addLinenForm({ customerId: newCustomerId, date: newDate, status: 'draft', rows: newRows, notes: newNotes, bagsSentCount: newBagsSent })
                setActiveRowId(newLF.id)
                setShowCreate(false)
                setShowDetail(newLF.id)
                scrollAndFocusGrid(false, 'draft')
              }} disabled={!newCustomerId || newRows.length === 0 || !getLinkedQT(getCustomer(newCustomerId)?.name || '', newCustomerId)}
                className="px-3 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-50 font-medium transition-colors flex items-center gap-1">
                {LINEN_FORM_STATUS_CONFIG.draft.label}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={detailForm?.formNumber || ''} size="wide">
        {detailForm && detailCustomer && (
          <div className="space-y-4">
            <div id="linen-form-detail" className="space-y-4 bg-white p-2">
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-slate-500">ลูกค้า:</span> <strong>{detailCustomer.shortName || detailCustomer.name}</strong></div>
              <div><span className="text-slate-500">วันที่:</span> {formatDate(detailForm.date)}</div>
            </div>
            {/* Top stepper — แผนที่สถานี (train station map) */}
            {(() => {
              const currentIdx = ALL_LINEN_STATUSES.indexOf(detailForm.status)
              return (
                <div className="flex items-start overflow-x-auto pb-2 pt-1 px-1">
                  {ALL_LINEN_STATUSES.map((s, i) => {
                    const isDone = i < currentIdx
                    const isCurrent = i === currentIdx
                    const cfg = LINEN_FORM_STATUS_CONFIG[s]
                    const shortLabel = cfg.label
                    return (
                      <Fragment key={s}>
                        <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: isCurrent ? '82px' : '60px' }}>
                          <div className={cn(
                            'rounded-full flex items-center justify-center font-bold text-white transition-all',
                            isCurrent ? 'w-10 h-10 text-base ring-2 ring-offset-2 ring-[#3DD8D8] shadow-md' : 'w-8 h-8 text-sm',
                            isCurrent || isDone ? cfg.dotColor : 'bg-slate-200 !text-slate-400',
                          )}>
                            {isDone ? <Check className="w-4 h-4" /> : i + 1}
                          </div>
                          {isCurrent ? (
                            <span className={cn('mt-1.5 px-2.5 py-0.5 rounded-full text-[12px] sm:text-[13px] font-bold text-center whitespace-nowrap', cfg.bgColor, cfg.color)}>
                              {shortLabel}
                            </span>
                          ) : (
                            <span className={cn(
                              'text-[11px] sm:text-[12px] mt-1 text-center leading-tight max-w-[64px]',
                              isDone ? 'text-slate-500 font-medium' : 'text-slate-400'
                            )}>
                              {shortLabel}
                            </span>
                          )}
                        </div>
                        {i < 6 && (() => {
                          const nextCfg = LINEN_FORM_STATUS_CONFIG[ALL_LINEN_STATUSES[i + 1]]
                          const isActive = i === currentIdx
                          const isPast = i < currentIdx
                          return (
                            <div className="flex-1 flex flex-col items-center min-w-[40px] mt-[8px]">
                              <span className={cn(
                                'text-[9px] sm:text-[10px] whitespace-nowrap mb-0.5',
                                isActive ? `${nextCfg.color} font-bold animate-blink text-[11px] sm:text-[12px]`
                                  : isPast ? 'text-slate-400 font-medium'
                                  : 'text-slate-300'
                              )}>
                                {nextCfg.todoLabel}
                              </span>
                              <div className={cn('w-full h-0.5 rounded-full',
                                isPast ? 'bg-[#3DD8D8]' : isActive ? 'bg-slate-300' : 'bg-slate-200'
                              )} />
                            </div>
                          )
                        })()}
                      </Fragment>
                    )
                  })}
                </div>
              )
            })()}

            {/* จำนวนถุง — แสดงตามสถานะ */}
            <div className="flex flex-wrap gap-4">
              {['draft', 'received', 'sorting', 'washing'].includes(detailForm.status) && (() => {
                const canEdit = ['draft', 'received'].includes(detailForm.status)
                return (
                  <div className={cn('rounded-lg px-4 py-3 border',
                    canEdit ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'
                  )}>
                    <label className={cn('block text-xs font-medium mb-1',
                      canEdit ? 'text-teal-800' : 'text-slate-400'
                    )}>จำนวนถุงกระสอบส่งซัก</label>
                    {canEdit ? (
                      <input type="text" inputMode="numeric" pattern="[0-9]*"
                        value={detailForm.bagsSentCount || ''}
                        onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) updateLinenForm(detailForm.id, { bagsSentCount: v === '' ? 0 : parseInt(v, 10) }) }}
                        onFocus={e => e.currentTarget.select()}
                        className="w-28 px-3 py-1.5 border border-teal-300 rounded text-sm text-center font-medium focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                    ) : (
                      <span className="text-sm font-medium text-slate-500">{detailForm.bagsSentCount || '-'}</span>
                    )}
                  </div>
                )
              })()}
              {['packed', 'delivered', 'confirmed'].includes(detailForm.status) && (
                <div className={cn('rounded-lg px-4 py-3 border',
                  detailForm.status === 'packed' ? 'bg-teal-50 border-teal-200' : 'bg-teal-50 border-teal-200'
                )}>
                  <label className={cn('block text-xs font-medium mb-1',
                    'text-teal-800'
                  )}>จำนวนถุงแพคส่ง</label>
                  <div className="flex items-center gap-3">
                    {['packed', 'delivered'].includes(detailForm.status) ? (
                      <input type="text" inputMode="numeric" pattern="[0-9]*"
                        id="bags-pack-input"
                        value={detailForm.bagsPackCount || ''}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '' || /^\d+$/.test(v))
                            updateLinenForm(detailForm.id, { bagsPackCount: v === '' ? 0 : parseInt(v, 10) })
                        }}
                        onFocus={e => e.currentTarget.select()}
                        className={cn('w-28 px-3 py-1.5 border rounded text-sm text-center font-medium focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                          'border-teal-300'
                        )} />
                    ) : (
                      <span className="text-sm font-medium text-teal-900">{detailForm.bagsPackCount || '-'}</span>
                    )}
                    {detailForm.status === 'packed' && (
                      <button onClick={() => { handleAdvanceStatus(detailForm.id); scrollAndFocusGrid(false, 'delivered') }}
                        className="px-4 py-2.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                        นับจำนวนถุงแพคแล้ว <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Status guide — สิ่งที่ทำ + ช่องที่กรอกได้ (สีเดียวกับสถานะถัดไป) */}
            <div className={cn(
              'rounded-lg px-4 py-2.5 text-sm border',
              nextDetailStatus
                ? `${LINEN_FORM_STATUS_CONFIG[nextDetailStatus].bgColor} ${LINEN_FORM_STATUS_CONFIG[nextDetailStatus].color} border-current/20`
                : 'bg-slate-50 border-slate-200 text-slate-500'
            )}>
              <span className="font-medium">สิ่งที่ทำ: {nextDetailStatus ? LINEN_FORM_STATUS_CONFIG[nextDetailStatus].todoLabel : LINEN_FORM_STATUS_CONFIG[detailForm.status].label}</span>
              <span className="mx-2">|</span>
              {{
                draft: 'ยืนยัน หรือ แก้ไข: จำนวนถุงกระสอบส่งซัก, ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, หมายเหตุ (กรณีนับผ้าด้วยกันอีกครั้ง)',
                received: 'กรอก: จำนวนถุงกระสอบส่งซัก, ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, โรงซักนับเข้า, หมายเหตุ',
                sorting: 'แก้ได้เฉพาะหมายเหตุ',
                washing: 'กรอก: โรงซักแพคส่ง, หมายเหตุ, ติ๊กสถานะแผนกย่อยย่อยได้ด้วย',
                packed: 'ดูข้อมูลเท่านั้น',
                delivered: 'กรอก: ลูกค้านับผ้ากลับ',
                confirmed: 'ดูข้อมูลเท่านั้น',
              }[detailForm.status]}
            </div>

            {/* Department checkboxes — แสดงตั้งแต่ sorting ขึ้นไป (sorting=grey disabled, washing+=green active) */}
            {['sorting', 'washing', 'packed', 'delivered', 'confirmed'].includes(detailForm.status) && (() => {
              const isDeptActive = detailForm.status === 'washing'
              const isDeptReadOnly = detailForm.status !== 'washing'
              return (
                <div className={cn(
                  'rounded-lg px-4 py-3 border',
                  isDeptActive ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'
                )}>
                  <p className={cn('text-xs font-medium mb-2', isDeptActive ? 'text-teal-700' : 'text-slate-400')}>
                    สถานะแผนกย่อย {isDeptActive ? '(ติ๊กได้อิสระ)' : '(ยังไม่ถึงขั้นตอน)'}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {DEPARTMENT_CONFIG.map(dept => {
                      const checked = detailForm[dept.key] ?? false
                      return (
                        <label key={dept.key} className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all',
                          isDeptReadOnly ? 'cursor-default opacity-50' : 'cursor-pointer',
                          checked
                            ? isDeptActive ? `${dept.bgColor} ${dept.color} border-current` : 'bg-slate-100 text-slate-400 border-slate-200'
                            : isDeptActive ? 'bg-white border-slate-200 text-slate-500' : 'bg-white border-slate-100 text-slate-300',
                        )}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => { if (!isDeptReadOnly) updateLinenForm(detailForm.id, { [dept.key]: !checked }) }}
                            disabled={isDeptReadOnly}
                            className="w-4 h-4 rounded accent-current"
                          />
                          {dept.label}
                        </label>
                      )
                    })}
                  </div>
                  {detailForm.status === 'sorting' && (
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => { handleAdvanceStatus(detailForm.id); scrollAndFocusGrid(false, 'washing') }}
                        className="px-4 py-2.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                        ซักอบเสร็จ <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}

            <LinenFormGrid
              customer={detailCustomer}
              rows={detailForm.rows}
              onChange={(rows) => updateLinenForm(detailForm.id, { rows })}
              catalog={linenCatalog}
              qtItems={getLinkedQT(detailCustomer.name, detailForm.customerId)?.items}
              carryOver={detailCarryOver}
              headerLabel={`ลูกค้า: ${detailCustomer.shortName || detailCustomer.name}  |  วันที่: ${formatDate(detailForm.date)}`}
              formStatus={detailForm.status}
              editableColumns={
                detailForm.status === 'draft' ? ['col2', 'col3', 'note'] :
                detailForm.status === 'received' ? ['col2', 'col3', 'col5', 'note'] :
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

            </div>{/* end #linen-form-detail */}

            {/* Progress stepper + Action buttons */}
            <div className="border-t border-slate-200 pt-4 mt-2 space-y-3">
              {/* Step progress bar */}
              {/* Bottom stepper — แผนที่สถานี (train station map) */}
              {(() => {
                const currentIdx = ALL_LINEN_STATUSES.indexOf(detailForm.status)
                return (
                  <div className="flex items-start overflow-x-auto pb-2 pt-1 px-1">
                    {ALL_LINEN_STATUSES.map((s, i) => {
                      const isDone = i < currentIdx
                      const isCurrent = i === currentIdx
                      const cfg = LINEN_FORM_STATUS_CONFIG[s]
                      const shortLabel = cfg.label
                      return (
                        <Fragment key={s}>
                          <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: isCurrent ? '82px' : '60px' }}>
                            <div className={cn(
                              'rounded-full flex items-center justify-center font-bold text-white transition-all',
                              isCurrent ? 'w-10 h-10 text-base ring-2 ring-offset-2 ring-[#3DD8D8] shadow-md' : 'w-8 h-8 text-sm',
                              isCurrent || isDone ? cfg.dotColor : 'bg-slate-200 !text-slate-400',
                            )}>
                              {isDone ? <Check className="w-4 h-4" /> : i + 1}
                            </div>
                            {isCurrent ? (
                              <span className={cn('mt-1.5 px-2.5 py-0.5 rounded-full text-[12px] sm:text-[13px] font-bold text-center whitespace-nowrap', cfg.bgColor, cfg.color)}>
                                {shortLabel}
                              </span>
                            ) : (
                              <span className={cn(
                                'text-[11px] sm:text-[12px] mt-1 text-center leading-tight max-w-[64px]',
                                isDone ? 'text-slate-500 font-medium' : 'text-slate-400'
                              )}>
                                {shortLabel}
                              </span>
                            )}
                          </div>
                          {i < 6 && (() => {
                            const nextCfg = LINEN_FORM_STATUS_CONFIG[ALL_LINEN_STATUSES[i + 1]]
                            const isActive = i === currentIdx
                            const isPast = i < currentIdx
                            return (
                              <div className="flex-1 flex flex-col items-center min-w-[40px] mt-[8px]">
                                <span className={cn(
                                  'text-[9px] sm:text-[10px] whitespace-nowrap mb-0.5',
                                  isActive ? `${nextCfg.color} font-bold animate-blink text-[11px] sm:text-[12px]`
                                    : isPast ? 'text-slate-400 font-medium'
                                    : 'text-slate-300'
                                )}>
                                  {nextCfg.todoLabel}
                                </span>
                                <div className={cn('w-full h-0.5 rounded-full',
                                  isPast ? 'bg-[#3DD8D8]' : isActive ? 'bg-slate-300' : 'bg-slate-200'
                                )} />
                              </div>
                            )
                          })()}
                        </Fragment>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Action buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setConfirmDeleteId(detailForm.id)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1">
                    <X className="w-3.5 h-3.5" />ลบ
                  </button>
                  <button onClick={() => setShowPrint(true)}
                    className="text-xs text-slate-400 hover:text-[#1B3A5C] transition-colors flex items-center gap-1">
                    <Printer className="w-3.5 h-3.5" />พิมพ์/ส่งออกเอกสาร
                  </button>
                </div>

                {isLockedByDN ? (
                  <span className="px-4 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                    สถานะเปลี่ยนผ่านใบส่งของ <strong>{linkedDN!.noteNumber}</strong>
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    {PREV_LINEN_STATUS[detailForm.status] ? (
                      <button onClick={() => { const prevSt = PREV_LINEN_STATUS[detailForm.status]; handleRevertStatus(detailForm.id); scrollAndFocusGrid(false, prevSt || undefined) }}
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
                      <button onClick={() => {
                        const nextSt = NEXT_LINEN_STATUS[detailForm.status]
                        handleAdvanceStatus(detailForm.id)
                        scrollAndFocusGrid(nextSt === 'confirmed', nextSt || undefined)
                      }}
                        className="px-4 py-2.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                        {LINEN_FORM_STATUS_CONFIG[NEXT_LINEN_STATUS[detailForm.status]!].label}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => setShowDetail(null)}
                        className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1.5">
                        <Check className="w-4 h-4" />
                        เสร็จสมบูรณ์
                      </button>
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
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกเอกสารแล้ว</span>
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
      <Modal open={showLfBulkPrint} onClose={() => setShowLfBulkPrint(false)} title={`พิมพ์/ส่งออกเอกสารใบส่งรับผ้า (${selectedLfIds.length} ใบ)`} size="xl" className="print-target">
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
              <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกเอกสารแล้ว (ทุกรายการ)</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">พิมพ์ → "พิมพ์แล้ว" | JPG/PDF/CSV → "ส่งออกเอกสารแล้ว"</p>
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
                    <span className="text-xs font-medium text-violet-700">ส่งออกเอกสารแล้ว</span>
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
