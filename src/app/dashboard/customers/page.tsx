'use client'

import { useState, useMemo, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency, sanitizeNumber, scrollToActiveRow } from '@/lib/utils'
import { highlightText } from '@/lib/highlight'
import { useSearchParams, useRouter } from 'next/navigation'
import { useScrollToMark } from '@/lib/use-scroll-to-mark'
import type { Customer, CarryOverMode } from '@/types'
import { CARRY_OVER_MODE_CONFIG, WORKFLOW_MODE_CONFIG } from '@/types'
import { Plus, Search, Edit2, Trash2, Check, FileText, X, Link2, Printer, FileDown } from 'lucide-react'
import ExportButtons from '@/components/ExportButtons'
import { exportCSV } from '@/lib/export'
import Link from 'next/link'
import Modal from '@/components/Modal'
import SortableHeader from '@/components/SortableHeader'
import CustomerSearchInline from '@/components/CustomerSearchInline'
import ScheduleManager from '@/components/ScheduleManager'
import AggregateManager from '@/components/AggregateManager'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import { isFlatRateCustomer } from '@/lib/customer-pricing'
import { blockNumberArrowKeys } from '@/lib/modal-nav'
import { listTrustCandidates } from '@/lib/trust-candidate'

type PageTab = 'customers' | 'categories' | 'workflow' | 'schedule' | 'aggregate'

const EMPTY_CUSTOMER: Omit<Customer, 'id' | 'createdAt'> = {
  customerCode: '', customerType: 'hotel',
  shortName: '', name: '', nameEn: '', address: '', taxId: '', branch: 'สำนักงานใหญ่',
  contactName: '', contactPhone: '', contactEmail: '',
  creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
  enablePerPiece: true, enableMinPerTrip: false, enableWaive: false, minPerTripThreshold: 0, enableMinPerMonth: false,
  enabledItems: [], priceList: [], priceHistory: [],
  notes: '', isActive: true,
  enableVat: true, enableWithholding: true,
  workflowMode: 'cross_check',
}

export default function CustomersPage() {
  const {
    customers, addCustomer, updateCustomer, deleteCustomer,
    quotations, linenForms, updateLinenForm, deliveryNotes, billingStatements, checklists, taxInvoices, companyInfo, linenCatalog,
    customerCategories, addCustomerCategory, updateCustomerCategory, deleteCustomerCategory, getCustomerCategoryLabel,
  } = useStore()
  const sp = useSearchParams()
  const router = useRouter()
  const urlHighlightQ = sp.get('q') || '' // 147.2
  const urlEditId = sp.get('edit') // 286.2: ?edit=<id> → open edit modal directly
  const urlReturnTo = sp.get('returnTo') // 289: ?returnTo=<path> → after save, navigate back there
  const urlFocusId = sp.get('focus') // 322: ?focus=<id> → highlight + scroll to row
  // 180: scroll to first <mark> on arrival from global search
  useScrollToMark()
  const [showCustPrintList, setShowCustPrintList] = useState(false) // 154.2
  const [selectedCustIds, setSelectedCustIds] = useState<string[]>([]) // 154.2.1
  const [showCustBulkPrint, setShowCustBulkPrint] = useState(false)

  const hasDocuments = (custId: string) => {
    return linenForms.some(f => f.customerId === custId)
      || deliveryNotes.some(d => d.customerId === custId)
      || billingStatements.some(b => b.customerId === custId)
      || checklists.some(c => c.customerId === custId)
      || taxInvoices.some(t => t.customerId === custId)
  }

  const [pageTab, setPageTab] = useState<PageTab>('customers')
  // 270.1: Pending workflow change modal (apply trust / revert cross)
  const [pendingTrustChange, setPendingTrustChange] = useState<{
    customerId: string
    targetMode: 'trust_customer' | 'cross_check'
  } | null>(null)
  const [applyScope, setApplyScope] = useState<'none' | 'all' | 'fromDate'>('none')
  const [applyFromDate, setApplyFromDate] = useState<string>('')
  const [search, setSearch] = useState('')
  // 162.1: combine local search + URL ?q so live typing also highlights
  const highlightQ = [search, urlHighlightQ].filter(Boolean).join(' ').trim()
  const [filterCat, setFilterCat] = useState<string>('all')
  // 177.1: active/inactive filter
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [sortKey, setSortKey] = useState<string>('shortName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)

  // Category tab state
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatKey, setNewCatKey] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null)
  const [editCatLabel, setEditCatLabel] = useState('')

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortedBg = (key: string) => sortKey === key ? 'bg-[#1B3A5C]/[0.04]' : ''

  // Map customerId → linked accepted QT (must be before filtered useMemo)
  const linkedQTMap = useMemo(() => {
    const map = new Map<string, { id: string; quotationNumber: string }>()
    for (const q of quotations) {
      if (q.status === 'accepted') {
        map.set(q.customerId, { id: q.id, quotationNumber: q.quotationNumber })
      }
    }
    return map
  }, [quotations])

  const filtered = useMemo(() => {
    let list = [...customers]
    if (filterCat !== 'all') list = list.filter(c => c.customerType === filterCat)
    // 177.1: active/inactive filter
    if (filterStatus === 'active') list = list.filter(c => c.isActive)
    else if (filterStatus === 'inactive') list = list.filter(c => !c.isActive)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.shortName || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) || c.customerCode.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'shortName': va = a.shortName || ''; vb = b.shortName || ''; break
        case 'name': va = a.name; vb = b.name; break
        case 'customerType': va = getCustomerCategoryLabel(a.customerType); vb = getCustomerCategoryLabel(b.customerType); break
        // 140 fix: sort ตาม flags จริงที่ column แสดง (enablePerPiece / enableMinPerTrip / enableMinPerMonth)
        // ใช้ bitmask weight → จัด customers ที่มีรูปแบบเดียวกันไว้กลุ่มเดียวกัน
        case 'billingModel': {
          const weight = (c: typeof a) => ((c.enablePerPiece ?? true) ? 4 : 0) + (c.enableMinPerTrip ? 2 : 0) + (c.enableMinPerMonth ? 1 : 0)
          va = weight(a); vb = weight(b); break
        }
        case 'creditDays': va = a.creditDays; vb = b.creditDays; break
        case 'tax': va = (a.enableVat !== false ? 2 : 0) + (a.enableWithholding !== false ? 1 : 0); vb = (b.enableVat !== false ? 2 : 0) + (b.enableWithholding !== false ? 1 : 0); break
        case 'qt': va = linkedQTMap.has(a.id) ? 1 : 0; vb = linkedQTMap.has(b.id) ? 1 : 0; break
        case 'contact': va = a.contactName || ''; vb = b.contactName || ''; break
        case 'isActive': va = a.isActive ? 0 : 1; vb = b.isActive ? 0 : 1; break
        default: va = a.name; vb = b.name
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [customers, filterCat, filterStatus, search, sortKey, sortDir, getCustomerCategoryLabel, linkedQTMap])

  // 274.1: Workflow tab data — memoize O(N×M) heuristic + LF count map
  const workflowData = useMemo(() => {
    const activeCustomers = customers.filter(c => c.isActive)
    const trustList = activeCustomers.filter(c => c.workflowMode === 'trust_customer')
    const crossList = activeCustomers.filter(c => (c.workflowMode ?? 'cross_check') === 'cross_check')
    const candidates = listTrustCandidates(crossList.map(c => c.id), linenForms)
    const candidateMap = new Map(candidates.map(s => [s.customerId, s]))
    const candidateCusts = crossList.filter(c => candidateMap.has(c.id))
      .sort((a, b) => (candidateMap.get(b.id)!.score) - (candidateMap.get(a.id)!.score))
    // LF count per customer — single pass O(N) instead of O(C×N) on render
    const lfCountByCustomer = new Map<string, number>()
    for (const lf of linenForms) {
      lfCountByCustomer.set(lf.customerId, (lfCountByCustomer.get(lf.customerId) || 0) + 1)
    }
    return { activeCustomers, trustList, crossList, candidateMap, candidateCusts, lfCountByCustomer }
  }, [customers, linenForms])

  const handleEdit = (c: Customer) => {
    setEditId(c.id)
    setForm({
      customerCode: c.customerCode, customerType: c.customerType,
      shortName: c.shortName || '', name: c.name, nameEn: c.nameEn, address: c.address, taxId: c.taxId, branch: c.branch,
      contactName: c.contactName, contactPhone: c.contactPhone, contactEmail: c.contactEmail,
      creditDays: c.creditDays, billingModel: c.billingModel, monthlyFlatRate: c.monthlyFlatRate, minPerTrip: c.minPerTrip ?? 0, selectedBankAccountId: c.selectedBankAccountId ?? '',
      enablePerPiece: c.enablePerPiece ?? true, enableMinPerTrip: c.enableMinPerTrip ?? false,
      enableWaive: c.enableWaive ?? false, minPerTripThreshold: c.minPerTripThreshold ?? 0, enableMinPerMonth: c.enableMinPerMonth ?? false,
      enabledItems: [...c.enabledItems], priceList: [...c.priceList], priceHistory: [...c.priceHistory],
      notes: c.notes, isActive: c.isActive,
      enableVat: c.enableVat !== false, enableWithholding: c.enableWithholding !== false,
      itemNicknames: c.itemNicknames ? { ...c.itemNicknames } : {},
      workflowMode: c.workflowMode ?? 'cross_check',
      defaultCarryOverMode: c.defaultCarryOverMode,
    })
    setShowForm(true)
  }

  const handleNew = () => {
    setEditId(null)
    setForm({ ...EMPTY_CUSTOMER, enabledItems: [], priceList: [] })
    setShowForm(true)
  }

  // 286.2: ?edit=<id> URL trigger — open edit modal from detail page
  useEffect(() => {
    if (!urlEditId) return
    const c = customers.find(x => x.id === urlEditId)
    if (c) {
      setPageTab('customers')
      handleEdit(c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEditId, customers])

  // 322: ?focus=<id> URL trigger — highlight + scroll to customer row
  useEffect(() => {
    if (!urlFocusId) return
    const c = customers.find(x => x.id === urlFocusId)
    if (!c) return
    setPageTab('customers')
    setActiveCustomerId(urlFocusId)
    // Wait for render → scroll to row
    setTimeout(() => scrollToActiveRow(urlFocusId), 100)
  }, [urlFocusId, customers])

  const handleSave = () => {
    if (!form.name) return
    // 237: Derive billingModel from flags for backward compat
    // True flat-rate = !enablePerPiece && enableMinPerMonth (เหมาเดือน, ไม่มีราคา/ชิ้น)
    // per-piece + min/month floor → ยังเป็น per-piece
    const derived = {
      ...form,
      billingModel: isFlatRateCustomer(form) ? 'monthly_flat' as const : 'per_piece' as const,
    }
    const savedId = editId
    if (editId) {
      updateCustomer(editId, derived)
    } else {
      const newCust = addCustomer(derived)
      setActiveCustomerId(newCust.id)
      scrollToActiveRow(newCust.id)
    }
    setShowForm(false)
    // 289: ถ้าเปิดจาก customer detail (returnTo=/dashboard/customers/<id>) → กลับไปที่ detail
    if (savedId && urlReturnTo) {
      router.push(urlReturnTo)
    }
  }

  // Category CRUD
  const handleAddCategory = () => {
    if (!newCatKey || !newCatLabel) return
    const maxOrder = customerCategories.reduce((m, c) => Math.max(m, c.sortOrder), 0)
    addCustomerCategory({ key: newCatKey.toLowerCase().replace(/\s+/g, '_'), label: newCatLabel, sortOrder: maxOrder + 1 })
    setNewCatKey('')
    setNewCatLabel('')
    setShowAddCat(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ลูกค้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">{customers.length} ราย</p>
        </div>
        <div className="flex gap-2">
          {(['customers', 'categories', 'workflow', 'schedule', 'aggregate'] as const).map(t => (
            <button key={t} onClick={() => setPageTab(t)}
              className={cn('px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                pageTab === t ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {t === 'customers' ? 'ลูกค้า'
                : t === 'categories' ? 'หมวด'
                : t === 'workflow' ? 'Workflow'
                : t === 'schedule' ? '📅 คิวส่ง'
                : '📦 กลุ่มไซส์'}
            </button>
          ))}
          {pageTab === 'customers' && (
            <>
              {selectedCustIds.length > 0 && (
                <button onClick={() => setShowCustBulkPrint(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                  <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสารที่เลือก ({selectedCustIds.length})
                </button>
              )}
              <button onClick={() => setShowCustPrintList(true)} disabled={filtered.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
                <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
              </button>
              <button onClick={handleNew}
                className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                <Plus className="w-4 h-4" />เพิ่มลูกค้า
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== Customers Tab ===== */}
      {pageTab === 'customers' && (
        <>
          {/* 185.2.1: Quick navigate — เลือกลูกค้าแล้วกระโดดไป detail (เร็วกว่า scroll หา) */}
          <div className="mb-3">
            <CustomerSearchInline
              mode="detail"
              placeholder="กระโดดไปหน้าลูกค้า — พิมพ์ชื่อ/รหัส/เลขประจำตัวผู้เสียภาษี"
              className="max-w-xl"
            />
          </div>

          {/* Search & Category Filter (filter ตารางในหน้านี้) — 281.2 theme pass */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="กรองตาราง — ชื่อลูกค้า / รหัส"
                className="w-full pl-10 pr-4 py-2 border-2 border-[#3DD8D8] rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            {/* 281.2.1: ทุกลูกค้า toggle — accent when active filter */}
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className={cn(
                'px-3 py-2 border rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]',
                filterCat === 'all'
                  ? 'bg-[#3DD8D8] text-[#1B3A5C] border-[#3DD8D8] hover:bg-[#2bb8b8]'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-[#3DD8D8]',
              )}>
              <option value="all">ทุกลูกค้า</option>
              {customerCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            </select>
            {/* 281.2.2-4: active/inactive/all filter — theme */}
            <div className="flex items-center gap-1">
              {([
                { v: 'active' as const, label: 'ใช้งาน',
                  active: 'bg-[#3DD8D8] text-[#1B3A5C] border-[#3DD8D8] hover:bg-[#2bb8b8]',
                  inactive: 'bg-white border-slate-200 text-slate-500 hover:border-[#3DD8D8] hover:text-[#1B3A5C]' },
                { v: 'inactive' as const, label: 'ปิด',
                  active: 'bg-red-500 text-white border-red-500 hover:bg-red-600',
                  inactive: 'bg-white border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600' },
                { v: 'all' as const, label: 'ทั้งหมด',
                  active: 'bg-[#3DD8D8] text-[#1B3A5C] border-[#3DD8D8] hover:bg-[#2bb8b8]',
                  inactive: 'bg-white border-slate-200 text-slate-500 hover:border-[#3DD8D8] hover:text-[#1B3A5C]' },
              ]).map(opt => (
                <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
                  className={cn(
                    'px-3 py-2 border rounded-lg text-sm font-medium transition-colors',
                    filterStatus === opt.v ? opt.active : opt.inactive,
                  )}>
                  {opt.label}
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
                    <th className="px-2 py-3 w-10">
                      <input type="checkbox"
                        checked={filtered.length > 0 && selectedCustIds.length === filtered.length}
                        onChange={e => setSelectedCustIds(e.target.checked ? filtered.map(c => c.id) : [])}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </th>
                    <SortableHeader label="ชื่อย่อลูกค้า" sortKey="shortName" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="ชื่อบริษัท" sortKey="name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="หมวด" sortKey="customerType" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="รูปแบบบิล" sortKey="billingModel" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <SortableHeader label="เครดิต" sortKey="creditDays" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortableHeader label="ภาษี" sortKey="tax" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <SortableHeader label="QT" sortKey="qt" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <SortableHeader label="ผู้ติดต่อ" sortKey="contact" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="สถานะ" sortKey="isActive" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <th className="px-4 py-3 font-medium text-slate-600 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
                  ) : filtered.map(c => (
                    <tr key={c.id}
                      data-row-id={c.id}
                      className={cn('border-b border-slate-100 cursor-pointer',
                        activeCustomerId === c.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50',
                        !c.isActive && 'bg-red-50/30')}
                      onClick={() => { setActiveCustomerId(c.id); router.push(`/dashboard/customers/${c.id}`) }}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedCustIds.includes(c.id)}
                          onChange={e => setSelectedCustIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      <td className={cn("px-4 py-3", sortedBg('shortName'))}>
                        <span className="inline-flex items-center gap-1">
                          <Link href={`/dashboard/customers/${c.id}`} className="font-bold text-[#1B3A5C] hover:underline tracking-wide">{highlightText(c.shortName || '-', highlightQ)}</Link>
                          {c.workflowMode === 'trust_customer' && (
                            <span title="Trust Customer — โรงงานไม่นับเข้า" className="text-emerald-600 text-sm">✅</span>
                          )}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3", sortedBg('name'))}>
                        <span className="text-slate-800">{highlightText(c.name, highlightQ)}</span>
                        {c.nameEn && <p className="text-[10px] text-slate-400">{highlightText(c.nameEn, highlightQ)}</p>}
                      </td>
                      <td className={cn("px-4 py-3 text-slate-600 text-xs", sortedBg('customerType'))}>{getCustomerCategoryLabel(c.customerType)}</td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('billingModel'))}>
                        <div className="flex flex-wrap justify-center gap-1">
                          {(c.enablePerPiece ?? true) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">ตามหน่วย</span>
                          )}
                          {c.enableMinPerTrip && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">ขั้นต่ำ/ครั้ง</span>
                          )}
                          {c.enableMinPerMonth && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">ขั้นต่ำ/ด.</span>
                          )}
                          {!(c.enablePerPiece ?? true) && !c.enableMinPerTrip && !c.enableMinPerMonth && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">-</span>
                          )}
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-right text-slate-600", sortedBg('creditDays'))}>{c.creditDays} วัน</td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('tax'))}>
                        <div className="flex flex-wrap justify-center gap-1">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                            c.enableVat !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400 line-through')}>
                            VAT
                          </span>
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                            c.enableWithholding !== false ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400 line-through')}>
                            W/T
                          </span>
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('qt'))} onClick={e => e.stopPropagation()}>
                        {(() => {
                          const qt = linkedQTMap.get(c.id)
                          return qt ? (
                            <Link href={`/dashboard/billing?tab=quotation&openqt=${qt.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              title={`Link กับ ${qt.quotationNumber}`}>
                              <Link2 className="w-3 h-3" />{qt.quotationNumber}
                            </Link>
                          ) : <span className="text-xs text-slate-300">-</span>
                        })()}
                      </td>
                      <td className={cn("px-4 py-3 text-slate-600 text-xs", sortedBg('contact'))}>
                        {c.contactName && <span>{c.contactName}</span>}
                        {c.contactPhone && <span className="ml-1 text-slate-400">{c.contactPhone}</span>}
                      </td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('isActive'))}>
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                          c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                          {c.isActive ? 'ใช้งาน' : 'ปิด'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* 168: ลบปุ่ม Eye — คลิกที่แถวเปิดหน้ารายละเอียดได้เลย */}
                          <button onClick={() => handleEdit(c)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-[#1B3A5C]"
                            title="แก้ไข">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <Link href={`/dashboard/billing?tab=quotation&newqt=${c.id}`}
                            className="p-1.5 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600"
                            title="สร้างใบเสนอราคา">
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => {
                            if (hasDocuments(c.id)) {
                              alert('ไม่สามารถลบได้ — ลูกค้านี้มีเอกสารที่เกี่ยวข้อง\nปิดใช้งานแทน (แก้ไข → สถานะ = ปิด)')
                              return
                            }
                            if (confirm('ลบลูกค้านี้?')) deleteCustomer(c.id)
                          }}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                            title="ลบ">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* 185.2 (revised): floating total bar */}
          <FloatingTotalBar show={filtered.length > 0}>
            <span>รวม {filtered.length} ราย</span>
          </FloatingTotalBar>
        </>
      )}

      {/* ===== Categories Tab ===== */}
      {pageTab === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-slate-700">หมวดลูกค้า</h3>
            <button onClick={() => setShowAddCat(true)}
              className="px-3 py-1.5 text-xs bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] flex items-center gap-1">
              <Plus className="w-3 h-3" />เพิ่มหมวด
            </button>
          </div>

          {showAddCat && (
            <div className="flex gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
              <input value={newCatKey} onChange={e => setNewCatKey(e.target.value)} placeholder="key (เช่น hotel)"
                className="px-3 py-1.5 border border-slate-200 rounded text-sm flex-1 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} placeholder="ชื่อ (เช่น โรงแรม)"
                className="px-3 py-1.5 border border-slate-200 rounded text-sm flex-1 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <button onClick={handleAddCategory} disabled={!newCatKey || !newCatLabel}
                className="px-3 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] text-xs rounded hover:bg-[#2bb8b8] disabled:opacity-50">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowAddCat(false); setNewCatKey(''); setNewCatLabel('') }}
                className="px-2 py-1.5 text-slate-400 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2 font-medium text-slate-600">Key</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อหมวด</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">ลำดับ</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">จำนวนลูกค้า</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {customerCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => {
                const count = customers.filter(c => c.customerType === cat.key).length
                return (
                  <tr key={cat.key} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{cat.key}</td>
                    <td className="px-4 py-2">
                      {editingCatKey === cat.key ? (
                        <div className="flex gap-1">
                          <input value={editCatLabel} onChange={e => setEditCatLabel(e.target.value)} autoFocus
                            className="px-2 py-1 border border-slate-200 rounded text-sm flex-1 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                          <button onClick={() => { updateCustomerCategory(cat.key, { label: editCatLabel }); setEditingCatKey(null) }}
                            className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded" aria-label="ยืนยัน"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingCatKey(null)}
                            className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-red-500 rounded" aria-label="ยกเลิก"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <span>{cat.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{cat.sortOrder}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{count}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingCatKey(cat.key); setEditCatLabel(cat.label) }}
                          aria-label="แก้ไขหมวด"
                          className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-[#1B3A5C] rounded hover:bg-slate-100">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => {
                          if (count > 0) { alert(`ไม่สามารถลบได้ — มีลูกค้า ${count} รายในหมวดนี้`); return }
                          if (confirm(`ลบหมวด "${cat.label}"?`)) deleteCustomerCategory(cat.key)
                        }}
                          aria-label="ลบหมวด"
                          className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-red-500 rounded hover:bg-red-50">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Schedule Manager Tab (321.2) ===== */}
      {pageTab === 'schedule' && <ScheduleManager />}

      {/* ===== Aggregate Manager Tab (321.1) ===== */}
      {pageTab === 'aggregate' && <AggregateManager />}

      {/* ===== Workflow Tab (268) ===== */}
      {pageTab === 'workflow' && (() => {
        // 274.1: pull memoized data — avoids O(N×M) recompute on every render
        const { trustList, crossList, candidateMap, candidateCusts, lfCountByCustomer } = workflowData
        const trustIdSet = new Set(trustList.map(c => c.id))

        // 270.1: เปิด Modal เลือก scope แทน confirm dialog
        const applyTrust = (custId: string) => {
          setPendingTrustChange({ customerId: custId, targetMode: 'trust_customer' })
          setApplyScope('none')
          setApplyFromDate('')
        }
        const revertCross = (custId: string) => {
          setPendingTrustChange({ customerId: custId, targetMode: 'cross_check' })
          setApplyScope('none')
          setApplyFromDate('')
        }

        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-[#1B3A5C] mb-1">Workflow Mode Management</h2>
              <p className="text-sm text-slate-500">
                จัดการลูกค้าตาม workflow mode — <strong>Trust Customer</strong>: โรงงานไม่นับเข้า (skip col5),
                ลูกค้านับกลับยังกรอกได้ (col4) เพื่อ cross check ครั้งที่ 2
              </p>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                  <p className="text-xs text-emerald-700 font-medium">✅ Trust Customer</p>
                  <p className="text-2xl font-bold text-emerald-800">{trustList.length}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
                  <p className="text-xs text-amber-700 font-medium">⚠ Candidates (auto-detect)</p>
                  <p className="text-2xl font-bold text-amber-800">{candidateCusts.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-600 font-medium">🔄 Cross Check (default)</p>
                  <p className="text-2xl font-bold text-slate-700">{crossList.length}</p>
                </div>
              </div>
            </div>

            {/* Section A — Trust Customers (current) */}
            <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
              <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-200">
                <h3 className="text-sm font-bold text-emerald-800">
                  ✅ Trust Customers ({trustList.length} ราย)
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  ลูกค้าที่ set workflowMode = trust_customer แล้ว
                </p>
              </div>
              {trustList.length === 0 ? (
                <p className="px-5 py-6 text-center text-slate-400 text-sm">ยังไม่มีลูกค้าที่ใช้ Trust mode</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อย่อ</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อบริษัท</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">LF (รวม)</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trustList.map(c => {
                      const lfCount = lfCountByCustomer.get(c.id) || 0
                      return (
                        <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <Link href={`/dashboard/customers/${c.id}`} className="font-bold text-[#1B3A5C] hover:underline tracking-wide">
                              {c.shortName || '-'}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-slate-700">{c.name}</td>
                          <td className="px-4 py-2 text-right text-slate-500">{lfCount}</td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => revertCross(c.id)}
                              className="px-3 py-1 text-xs border border-slate-200 text-slate-600 rounded hover:bg-slate-50">
                              Revert → Cross Check
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Section B — Candidates (heuristic) */}
            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-5 py-3 bg-amber-50/60 border-b border-amber-200">
                <h3 className="text-sm font-bold text-amber-800">
                  ⚠ Candidates ({candidateCusts.length} ราย)
                </h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  ลูกค้าที่ LFs ปัจจุบันมี pattern คล้าย trust — col5 ว่างหรือเท่ากับ (col2+col3) ส่วนใหญ่
                  · ตรวจสอบก่อน apply
                </p>
              </div>
              {candidateCusts.length === 0 ? (
                <p className="px-5 py-6 text-center text-slate-400 text-sm">ไม่มี candidate (LF น้อย หรือ pattern ไม่เข้าเกณฑ์)</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อย่อ</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อบริษัท</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">LF (assess)</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">col5 ว่าง</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">col5 = ส่ง+เคลม</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">Score</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateCusts.map(c => {
                      const s = candidateMap.get(c.id)!
                      return (
                        <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <Link href={`/dashboard/customers/${c.id}`} className="font-bold text-[#1B3A5C] hover:underline tracking-wide">
                              {c.shortName || '-'}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-slate-700">{c.name}</td>
                          <td className="px-4 py-2 text-right text-slate-500">{s.totalLFs}</td>
                          <td className="px-4 py-2 text-right text-slate-600">{(s.emptyCol5Pct * 100).toFixed(0)}%</td>
                          <td className="px-4 py-2 text-right text-slate-600">{(s.matchCol5Pct * 100).toFixed(0)}%</td>
                          <td className="px-4 py-2 text-right">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                              s.score >= 0.8 ? 'bg-red-100 text-red-700' :
                              s.score >= 0.65 ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600',
                            )}>{s.score.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => applyTrust(c.id)}
                              className="px-3 py-1 text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-200 font-medium">
                              Apply Trust
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Section C — All Cross Check (collapsible) */}
            <details className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <summary className="px-5 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100">
                <span className="text-sm font-bold text-slate-700">🔄 Cross Check ({crossList.length} ราย)</span>
                <span className="ml-2 text-xs text-slate-500">— click to expand</span>
              </summary>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อย่อ</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อบริษัท</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossList.filter(c => !candidateMap.has(c.id) && !trustIdSet.has(c.id)).map(c => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <Link href={`/dashboard/customers/${c.id}`} className="font-bold text-[#1B3A5C] hover:underline tracking-wide">
                            {c.shortName || '-'}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-slate-700">{c.name}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => applyTrust(c.id)}
                            className="px-3 py-1 text-xs border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50">
                            Apply Trust
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )
      })()}

      {/* 270.1: Apply Trust / Revert Cross — Scope Modal */}
      <Modal
        open={!!pendingTrustChange}
        onClose={() => setPendingTrustChange(null)}
        title={pendingTrustChange?.targetMode === 'trust_customer' ? 'Apply Trust Customer — เลือกขอบเขต' : 'Revert → Cross Check — เลือกขอบเขต'}
        size="lg"
        closeLabel="cancel"
      >
        {pendingTrustChange && (() => {
          const cust = customers.find(c => c.id === pendingTrustChange.customerId)
          if (!cust) return null
          const targetMode = pendingTrustChange.targetMode
          const isTrust = targetMode === 'trust_customer'
          const custLFs = linenForms.filter(lf => lf.customerId === cust.id)
          const matchingLFs = custLFs.filter(lf => (lf.workflowMode ?? 'cross_check') === targetMode)
          const mismatchLFs = custLFs.filter(lf => (lf.workflowMode ?? 'cross_check') !== targetMode)
          const fromDateMatches = applyFromDate
            ? mismatchLFs.filter(lf => lf.date >= applyFromDate)
            : []

          const handleSubmit = () => {
            updateCustomer(cust.id, { workflowMode: targetMode })
            let updatedCount = 0
            if (applyScope === 'all') {
              for (const lf of mismatchLFs) {
                updateLinenForm(lf.id, { workflowMode: targetMode })
                updatedCount++
              }
            } else if (applyScope === 'fromDate' && applyFromDate) {
              for (const lf of fromDateMatches) {
                updateLinenForm(lf.id, { workflowMode: targetMode })
                updatedCount++
              }
            }
            setPendingTrustChange(null)
            if (updatedCount > 0) {
              alert(`✅ Set ${cust.shortName || cust.name} → ${isTrust ? 'Trust Customer' : 'Cross Check'}\n\nLFs ที่ apply ย้อนหลัง: ${updatedCount} ใบ`)
            }
          }

          return (
            <div className="space-y-4 text-sm">
              {/* Customer + Stats */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-slate-500 text-xs">ลูกค้า:</span>
                  <strong className="text-[#1B3A5C]">{cust.shortName || '-'}</strong>
                  <span className="text-slate-500 text-xs">— {cust.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-500">LFs ทั้งหมด:</span> <strong>{custLFs.length}</strong> ใบ</div>
                  <div>
                    <span className="text-slate-500">Snapshot {isTrust ? 'Trust' : 'Cross Check'} แล้ว:</span>{' '}
                    <strong className="text-emerald-700">{matchingLFs.length}</strong> ใบ
                  </div>
                  <div>
                    <span className="text-slate-500">Snapshot {isTrust ? 'Cross Check' : 'Trust'}:</span>{' '}
                    <strong className="text-amber-700">{mismatchLFs.length}</strong> ใบ
                  </div>
                </div>
              </div>

              {/* Impact info */}
              <div className={cn('rounded-lg border px-3 py-2 text-xs',
                isTrust ? 'border-emerald-200 bg-emerald-50/40 text-emerald-800' : 'border-blue-200 bg-blue-50/40 text-blue-800')}>
                <p className="font-medium mb-1">{isTrust ? '✅ Trust Customer Mode' : '🔄 Cross Check Mode'}</p>
                {isTrust ? (
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>col5 (โรงซักนับเข้า) จะซ่อนจาก grid (data preserved)</li>
                    <li>col4 (ลูกค้านับกลับ) ยังกรอก/แก้ไขได้ปกติ</li>
                    <li>carry-over default = Mode 2 (col6 − (col2+col3))</li>
                    <li>Type 1 discrepancy ไม่แสดง · Type 2 ยังแสดง</li>
                  </ul>
                ) : (
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>กลับมาใช้ครบ 6 columns รวม col5</li>
                    <li>carry-over default = Mode 1 (col6 − col5)</li>
                    <li>Type 1 + Type 2 discrepancy ทำงานเต็ม</li>
                  </ul>
                )}
              </div>

              {/* Scope options */}
              <div>
                <p className="font-medium text-slate-700 mb-2">ขอบเขตการ apply กับ LF เดิม:</p>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="scope" value="none" checked={applyScope === 'none'}
                      onChange={() => setApplyScope('none')} className="mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-700">ไม่ apply ย้อนหลัง</p>
                      <p className="text-xs text-slate-500">ตั้งค่า customer.workflowMode เท่านั้น · LF เก่าคง snapshot เดิม · LF ใหม่จะใช้ mode ใหม่</p>
                    </div>
                  </label>

                  <label className={cn('flex items-start gap-2 p-3 border rounded-lg cursor-pointer',
                    mismatchLFs.length === 0 ? 'opacity-50 cursor-not-allowed border-slate-200' : 'border-slate-200 hover:bg-slate-50')}>
                    <input type="radio" name="scope" value="all" checked={applyScope === 'all'}
                      disabled={mismatchLFs.length === 0}
                      onChange={() => setApplyScope('all')} className="mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-700">
                        Apply ย้อนหลังทั้งหมด ({mismatchLFs.length} ใบ)
                      </p>
                      <p className="text-xs text-slate-500">
                        เปลี่ยน snapshot ของ LF ที่ยังไม่ตรง mode → {isTrust ? 'trust_customer' : 'cross_check'} ทุกใบ
                      </p>
                    </div>
                  </label>

                  <label className={cn('flex items-start gap-2 p-3 border rounded-lg cursor-pointer',
                    mismatchLFs.length === 0 ? 'opacity-50 cursor-not-allowed border-slate-200' : 'border-slate-200 hover:bg-slate-50')}>
                    <input type="radio" name="scope" value="fromDate" checked={applyScope === 'fromDate'}
                      disabled={mismatchLFs.length === 0}
                      onChange={() => setApplyScope('fromDate')} className="mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-700">Apply ตั้งแต่วันที่...</p>
                      <p className="text-xs text-slate-500 mb-2">
                        เปลี่ยน snapshot ของ LF ที่ date ≥ วันที่กำหนด (และยังไม่ตรง mode)
                      </p>
                      {applyScope === 'fromDate' && (
                        <div className="flex items-center gap-2">
                          <input type="date" value={applyFromDate}
                            onChange={e => setApplyFromDate(e.target.value)}
                            className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                          {applyFromDate && (
                            <span className="text-xs text-slate-600">→ {fromDateMatches.length} ใบ จะถูก update</span>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Warning if billed LFs in scope */}
              {(() => {
                const targetsToUpdate = applyScope === 'all' ? mismatchLFs :
                  applyScope === 'fromDate' && applyFromDate ? fromDateMatches : []
                const billedCount = targetsToUpdate.filter(lf =>
                  deliveryNotes.some(dn => dn.linenFormIds.includes(lf.id))
                ).length
                if (billedCount === 0) return null
                return (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ มี LFs ที่มี SD ผูกอยู่แล้ว: <strong>{billedCount}</strong> ใบ
                    — เปลี่ยน snapshot จะกระทบ carry-over reports + discrepancy display ของรอบที่ผ่านมา
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button onClick={() => setPendingTrustChange(null)}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium">
                  ยกเลิก
                </button>
                <button onClick={handleSubmit}
                  disabled={applyScope === 'fromDate' && !applyFromDate}
                  className={cn('px-4 py-2 text-sm rounded-lg font-medium transition-colors',
                    applyScope === 'fromDate' && !applyFromDate
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isTrust
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700')}>
                  {isTrust ? 'Apply Trust' : 'Revert → Cross Check'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => {
        setShowForm(false)
        // 289: ถ้าเปิดจาก customer detail (returnTo) → กลับไปแม้ user กด cancel/close
        if (urlReturnTo && editId) router.push(urlReturnTo)
      }} title={editId ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'} size="xl" closeLabel="cancel">
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-medium text-slate-600 mb-1">ชื่อย่อลูกค้า * <span className="text-xs text-slate-400 font-normal">(ใช้ในงานประจำวัน เช่น WOV, Bell, SWD)</span></label>
            <input value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value.toUpperCase() })}
              placeholder="เช่น WOV, Bell"
              className={cn("w-full px-3 py-2 border rounded-lg focus:ring-1 focus:outline-none font-medium text-lg tracking-wider",
                form.shortName && customers.some(c => c.shortName.toUpperCase() === form.shortName.toUpperCase() && c.id !== editId)
                  ? 'border-red-400 focus:ring-red-300' : 'border-slate-200 focus:ring-[#3DD8D8]')} />
            {form.shortName && customers.some(c => c.shortName.toUpperCase() === form.shortName.toUpperCase() && c.id !== editId) && (
              <p className="text-red-600 text-xs mt-1">ชื่อย่อลูกค้าซ้ำ — กรุณาใช้ชื่อย่ออื่น</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบริษัท (ไทย) *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบริษัท (อังกฤษ)</label>
              <input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">หมวดลูกค้า</label>
              <select value={form.customerType} onChange={e => setForm({ ...form, customerType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                {customerCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">สถานะ</label>
              <select value={form.isActive ? 'active' : 'inactive'}
                onChange={e => setForm({ ...form, isActive: e.target.value === 'active' })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="active">ใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-600 mb-1">ที่อยู่</label>
            <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">เลขผู้เสียภาษี</label>
              <input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">สาขา</label>
              <input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">เครดิต (วัน)</label>
              <input type="number" value={form.creditDays} onChange={e => setForm({ ...form, creditDays: sanitizeNumber(e.target.value, 365) || 30 })}
                onKeyDown={blockNumberArrowKeys}
                onFocus={e => e.currentTarget.select()}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">ผู้ติดต่อ</label>
              <input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">โทรศัพท์</label>
              <input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">อีเมล</label>
              <input value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {/* Billing Conditions — read-only display */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-slate-700">รูปแบบการคิดเงิน (ปัจจุบัน)</span>
              <span className="text-xs text-slate-400">แก้ไขผ่านใบเสนอราคา (QT)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.enablePerPiece && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">คิดตามหน่วย</span>
              )}
              {form.enableMinPerTrip && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">
                  ขั้นต่ำ/ครั้ง {form.minPerTrip > 0 ? `฿${form.minPerTrip}` : ''}
                  {form.enableWaive && form.minPerTripThreshold > 0 ? ` (เวฟถ้า ≥ ฿${form.minPerTripThreshold})` : ''}
                </span>
              )}
              {form.enableMinPerMonth && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">
                  ขั้นต่ำ/เดือน {form.monthlyFlatRate > 0 ? `฿${form.monthlyFlatRate}` : ''}
                </span>
              )}
              {!form.enablePerPiece && !form.enableMinPerTrip && !form.enableMinPerMonth && (
                <span className="text-xs text-slate-400">ยังไม่ได้ตั้งค่า</span>
              )}
            </div>
          </div>

          {/* Bank Account Selection */}
          {companyInfo.bankAccounts && companyInfo.bankAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">บัญชีธนาคาร (แสดงในใบแจ้งหนี้)</label>
              <select value={form.selectedBankAccountId}
                onChange={e => setForm({ ...form, selectedBankAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">ค่าเริ่มต้น</option>
                {companyInfo.bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>{ba.bankName} — {ba.accountNumber}{ba.isDefault ? ' (ค่าเริ่มต้น)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* QT Link Status */}
          {editId && (() => {
            const qt = linkedQTMap.get(editId)
            return (
              <div className={cn('px-3 py-2.5 rounded-lg text-sm flex items-center gap-2', qt ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200')}>
                <Link2 className={cn('w-4 h-4 flex-shrink-0', qt ? 'text-emerald-600' : 'text-amber-500')} />
                {qt ? (
                  <span className="text-emerald-700 flex-1">
                    ใช้รายการผ้าและราคาจาก <strong>{qt.quotationNumber}</strong>
                  </span>
                ) : (
                  <span className="text-amber-700 flex-1 text-xs">ยังไม่มีใบเสนอราคา (QT) ที่ตกลงแล้ว — รายการผ้าและราคาจะถูกกำหนดผ่าน QT</span>
                )}
                {/* 323: ส่ง qtcustomer เพื่อ filter QT list ตามลูกค้านี้ + openqt เปิด detail · ปิดแล้วยังอยู่ใน QT list */}
                <Link
                  href={qt
                    ? `/dashboard/billing?tab=quotation&openqt=${qt.id}&qtcustomer=${editId}`
                    : `/dashboard/billing?tab=quotation&newqt=${editId}&qtcustomer=${editId}`
                  }
                  className={cn('text-xs underline ml-auto flex-shrink-0', qt ? 'text-emerald-600' : 'text-amber-600')}>
                  {qt ? 'ดู QT' : 'สร้าง QT'}
                </Link>
              </div>
            )
          })()}

          {/* 213.2 Phase 1.2 — Nickname Editor (per-customer item display alias) */}
          {editId && (() => {
            // 226.B: QT = single source of truth — ไม่ใช้ form.enabledItems เป็น fallback อีกแล้ว
            const linkedAcceptedQT = quotations.find(q => q.customerId === editId && q.status === 'accepted')
            const codes = linkedAcceptedQT ? linkedAcceptedQT.items.map(it => it.code) : []
            const uniqueCodes = Array.from(new Set(codes)).filter(Boolean)
            const nicknames = form.itemNicknames || {}
            const setNickname = (code: string, nickname: string) => {
              const next = { ...nicknames }
              if (nickname.trim()) next[code] = nickname.trim()
              else delete next[code]
              setForm({ ...form, itemNicknames: next })
            }
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="font-medium text-blue-900 inline-flex items-center gap-1.5">
                    🏷️ ชื่อย่อรายการ (per customer)
                  </span>
                  <span className="text-[11px] text-blue-700">
                    {Object.keys(nicknames).length} รายการ
                  </span>
                </div>
                <p className="text-xs text-blue-800 mb-2 leading-relaxed">
                  ตั้งชื่อรายการเฉพาะลูกค้านี้ — ใช้แสดงใน LF/SD/QT/ใบพิมพ์ของลูกค้านี้เท่านั้น<br />
                  📊 รายงาน, audit, Cmd+K → ใช้ชื่อ catalog (canonical) เสมอ ไม่กระทบ
                </p>
                {uniqueCodes.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    ⚠️ ลูกค้านี้ยังไม่มีรายการผ้า — สร้าง QT พร้อมรายการก่อน แล้วกลับมาตั้ง nickname
                  </p>
                ) : (
                  <div className="border border-blue-200 rounded-lg bg-white max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium text-blue-900 w-20">รหัส</th>
                          <th className="text-left px-3 py-1.5 font-medium text-blue-900">ชื่อ catalog (canonical)</th>
                          <th className="text-left px-3 py-1.5 font-medium text-blue-900">Nickname (ลูกค้าเรียก)</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueCodes.map(code => {
                          const def = linenCatalog.find(c => c.code === code)
                          const nickname = nicknames[code] || ''
                          return (
                            <tr key={code} className="border-t border-slate-100">
                              <td className="px-3 py-1 font-mono text-xs text-slate-600">{code}</td>
                              <td className="px-3 py-1 text-slate-700">{def?.name || <span className="text-slate-400">— ไม่อยู่ใน catalog —</span>}</td>
                              <td className="px-3 py-1">
                                <input
                                  type="text"
                                  value={nickname}
                                  onChange={e => setNickname(code, e.target.value)}
                                  placeholder={def?.name || 'พิมพ์ nickname'}
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                                />
                              </td>
                              <td className="px-1 py-1">
                                {nickname && (
                                  <button onClick={() => setNickname(code, '')}
                                    title="ลบ nickname (กลับไปใช้ชื่อ catalog)"
                                    className="text-slate-400 hover:text-red-500 p-1">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}

          <div>
            <label className="block font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          {/* VAT & หัก ณ ที่จ่าย */}
          <div className="bg-slate-50 rounded-lg p-4">
            <span className="font-medium text-slate-700 block mb-2">ภาษี</span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.enableVat} onChange={e => setForm({ ...form, enableVat: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                <span className="text-slate-700">คิด VAT</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.enableWithholding} onChange={e => setForm({ ...form, enableWithholding: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                <span className="text-slate-700">หัก ณ ที่จ่าย</span>
              </label>
            </div>
          </div>

          {/* 265 — Workflow Mode & Carry-Over Default */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <span className="font-medium text-slate-700 block">ระบบการนับ + รายงานผ้าค้าง</span>
            <div>
              <label className="block text-xs text-slate-600 mb-1">รูปแบบการนับผ้า</label>
              <div className="flex flex-wrap gap-2">
                {(['cross_check', 'trust_customer'] as const).map(m => (
                  <label key={m} className={cn(
                    'flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors flex-1 min-w-[240px]',
                    (form.workflowMode || 'cross_check') === m
                      ? 'border-[#1B3A5C] bg-[#1B3A5C]/5'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  )}>
                    <input type="radio" name="workflowMode" checked={(form.workflowMode || 'cross_check') === m}
                      onChange={() => setForm({ ...form, workflowMode: m })}
                      className="mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-slate-700">
                        {WORKFLOW_MODE_CONFIG[m].icon} {WORKFLOW_MODE_CONFIG[m].label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{WORKFLOW_MODE_CONFIG[m].description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">โหมดคำนวณผ้าค้าง default (ใช้เปิด report)</label>
              <select
                value={form.defaultCarryOverMode ?? ''}
                onChange={e => setForm({ ...form, defaultCarryOverMode: e.target.value === '' ? undefined : Number(e.target.value) as CarryOverMode })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">— Auto (Cross Check→Mode 1, Trust Customer→Mode 2)</option>
                {([1, 2, 3, 4] as CarryOverMode[]).map(m => (
                  <option key={m} value={m}>เคส {m}: {CARRY_OVER_MODE_CONFIG[m].formula}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 155: hint แสดงเหตุผลที่ปุ่มบันทึกกดไม่ได้ — ลูกค้า import จาก legacy บางรายไม่มี shortName */}
          {(() => {
            const dupShort = !!form.shortName && customers.some(c => c.shortName.toUpperCase() === form.shortName.toUpperCase() && c.id !== editId)
            const issues: string[] = []
            if (!form.shortName) issues.push('ชื่อย่อลูกค้า (ว่าง — ใส่ตัวย่อ เช่น SWD, MS, RPPT)')
            if (!form.name) issues.push('ชื่อบริษัท (ว่าง)')
            if (dupShort) issues.push(`ชื่อย่อ "${form.shortName}" ซ้ำกับลูกค้ารายอื่น`)
            if (issues.length === 0) return null
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <strong>⚠ ยังบันทึกไม่ได้ — กรุณาแก้:</strong>
                <ul className="mt-1 ml-4 list-disc">{issues.map(i => <li key={i}>{i}</li>)}</ul>
              </div>
            )
          })()}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleSave}
              disabled={!form.shortName || !form.name || customers.some(c => c.shortName.toUpperCase() === form.shortName.toUpperCase() && c.id !== editId)}
              title={!form.shortName ? 'กรุณาใส่ชื่อย่อก่อน' : !form.name ? 'กรุณาใส่ชื่อบริษัทก่อน' : 'บันทึก'}
              className="px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1">
              <Check className="w-4 h-4" />บันทึก
            </button>
          </div>
        </div>
      </Modal>

      {/* 154.2: Customer Print List Modal */}
      <Modal open={showCustPrintList} onClose={() => setShowCustPrintList(false)} title="รายการลูกค้า" size="xl" closeLabel="close" className="print-target">
        {(() => {
          const handleCSV = () => {
            const headers = ['ลำดับ', 'รหัส', 'ชื่อย่อ', 'ชื่อบริษัท', 'หมวด', 'เครดิต', 'VAT', 'หัก ณ ที่จ่าย', 'สถานะ']
            const rows = filtered.map((c, i) => [
              String(i+1), c.customerCode || '-', c.shortName || '-', c.name,
              getCustomerCategoryLabel(c.customerType),
              `${c.creditDays} วัน`,
              c.enableVat !== false ? '✓' : '-',
              c.enableWithholding !== false ? '✓' : '-',
              c.isActive ? 'ใช้งาน' : 'ปิดใช้งาน',
            ])
            exportCSV(headers, rows, 'รายการลูกค้า')
          }
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500">ทั้งหมด {filtered.length} ราย</div>
              <div id="print-cust-list" className="border border-slate-200 rounded-lg overflow-hidden">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">รายการลูกค้า</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อย่อ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อบริษัท</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">หมวด</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">เครดิต</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600">VAT</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600">หัก</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, idx) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{c.customerCode || '-'}</td>
                        <td className="px-3 py-1.5 font-bold text-[#1B3A5C]">{c.shortName || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{c.name}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">{getCustomerCategoryLabel(c.customerType)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{c.creditDays} วัน</td>
                        <td className="px-3 py-1.5 text-center">{c.enableVat !== false ? '✓' : '-'}</td>
                        <td className="px-3 py-1.5 text-center">{c.enableWithholding !== false ? '✓' : '-'}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                            {c.isActive ? 'ใช้งาน' : 'ปิด'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4">
                <ExportButtons targetId="print-cust-list" filename="รายการลูกค้า" onExportCSV={handleCSV} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 154.2.1: Customer Bulk Print Modal — รายการลูกค้าที่เลือกพร้อมรายละเอียด */}
      <Modal open={showCustBulkPrint} onClose={() => setShowCustBulkPrint(false)} title={`พิมพ์ลูกค้าที่เลือก (${selectedCustIds.length} ราย)`} size="xl" closeLabel="close" className="print-target">
        {(() => {
          const selectedCusts = customers.filter(c => selectedCustIds.includes(c.id))
          return (
            <div>
              <div id="print-cust-bulk">
                <h2 className="hidden print:block text-lg font-bold text-center mb-4">รายการลูกค้าที่เลือก ({selectedCusts.length} ราย)</h2>
                {selectedCusts.map((c, idx) => (
                  <div key={c.id}>
                    {idx > 0 && <div style={{ pageBreakBefore: 'always' }} />}
                    <div className="border border-slate-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start justify-between mb-3 pb-2 border-b border-slate-200">
                      <div>
                        <h3 className="text-lg font-bold text-[#1B3A5C]">{c.shortName || c.name}</h3>
                        {c.shortName && <p className="text-sm text-slate-600">{c.name}</p>}
                        {c.nameEn && <p className="text-xs text-slate-400">{c.nameEn}</p>}
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>#{idx + 1}</div>
                        <div className="font-mono">{c.customerCode || '-'}</div>
                        <div className="mt-1">{getCustomerCategoryLabel(c.customerType)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-slate-500">ที่อยู่:</span> {c.address || '-'}</div>
                      <div><span className="text-slate-500">เลขผู้เสียภาษี:</span> {c.taxId || '-'} {c.branch && `(${c.branch})`}</div>
                      <div><span className="text-slate-500">ผู้ติดต่อ:</span> {c.contactName || '-'}</div>
                      <div><span className="text-slate-500">เบอร์โทร:</span> {c.contactPhone || '-'}</div>
                      <div><span className="text-slate-500">อีเมล:</span> {c.contactEmail || '-'}</div>
                      <div><span className="text-slate-500">เครดิต:</span> {c.creditDays} วัน</div>
                      <div>
                        <span className="text-slate-500">รูปแบบบิล:</span>
                        {(c.enablePerPiece ?? true) && <span className="ml-1 text-blue-700">ตามหน่วย</span>}
                        {c.enableMinPerTrip && <span className="ml-1 text-amber-700">ขั้นต่ำ/ครั้ง {formatCurrency(c.minPerTrip)}</span>}
                        {c.enableMinPerMonth && <span className="ml-1 text-purple-700">ขั้นต่ำ/ด. {formatCurrency(c.monthlyFlatRate)}</span>}
                      </div>
                      <div>
                        <span className="text-slate-500">ภาษี:</span>
                        <span className={c.enableVat !== false ? 'text-emerald-700 ml-1' : 'text-slate-400 ml-1 line-through'}>VAT</span>
                        <span className={c.enableWithholding !== false ? 'text-orange-700 ml-1' : 'text-slate-400 ml-1 line-through'}>หัก ณ ที่จ่าย</span>
                      </div>
                    </div>
                    {c.priceList && c.priceList.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs font-medium text-slate-600 mb-1">ราคา ({c.priceList.length} รายการ):</p>
                        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
                          {c.priceList.map(p => (
                            <div key={p.code} className="flex justify-between">
                              <span className="font-mono text-slate-500">{p.code}</span>
                              <span className="text-slate-700">{formatCurrency(p.price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4 no-print">
                <ExportButtons targetId="print-cust-bulk" filename={`Customers-bulk-${selectedCusts.length}`} />
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
