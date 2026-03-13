'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatCurrency, formatDate, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { format } from 'date-fns'
import { BILLING_STATUS_CONFIG, QUOTATION_STATUS_CONFIG, type BillingStatus, type QuotationStatus, type QuotationItem } from '@/types'
import { aggregateDeliveryItems, calculateBillingTotals, createFlatRateBilling } from '@/lib/billing'
import { Plus, Search, FileText, FileDown, X, ChevronRight } from 'lucide-react'
import Modal from '@/components/Modal'
import ExportButtons from '@/components/ExportButtons'
import { exportCSV } from '@/lib/export'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import BillingPrint from '@/components/BillingPrint'
import TaxInvoicePrint from '@/components/TaxInvoicePrint'
import QuotationPrint from '@/components/QuotationPrint'

type TabKey = 'billing' | 'invoice' | 'quotation'

export default function BillingPage() {
  const {
    billingStatements, addBillingStatement, updateBillingStatus, deleteBillingStatement,
    taxInvoices, addTaxInvoice,
    quotations, addQuotation, updateQuotationStatus,
    deliveryNotes, customers, getCustomer, companyInfo, linenCatalog,
  } = useStore()

  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams.get('tab')
    if (t === 'invoice' || t === 'quotation') return t
    return 'billing'
  })
  const [search, setSearch] = useState('')
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('single')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))

  // Sync tab when URL query param changes (e.g. clicking different billing menu items)
  useEffect(() => {
    const t = searchParams.get('tab')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t === 'billing' || t === 'invoice' || t === 'quotation') setTab(t)
  }, [searchParams])
  const [showPrint, setShowPrint] = useState(false)
  const [showInvoiceDetail, setShowInvoiceDetail] = useState<string | null>(null)
  const [showInvoicePrint, setShowInvoicePrint] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Quotation state
  const [showCreateQU, setShowCreateQU] = useState(false)
  const [showQuDetail, setShowQuDetail] = useState<string | null>(null)
  const [showQuPrint, setShowQuPrint] = useState(false)
  const [quCustomerName, setQuCustomerName] = useState('')
  const [quCustomerContact, setQuCustomerContact] = useState('')
  const [quDate, setQuDate] = useState(todayISO())
  const [quValidDays, setQuValidDays] = useState(30)
  const [quConditions, setQuConditions] = useState('1. ราคายังไม่รวมภาษีมูลค่าเพิ่ม 7%\n2. ระยะเวลาเครดิต 30 วัน\n3. บริการรับ-ส่งผ้าทุกวัน')
  const [quNotes, setQuNotes] = useState('')
  const [quItems, setQuItems] = useState<QuotationItem[]>([])

  // Create billing state
  const [selCustomerId, setSelCustomerId] = useState('')
  const [selMonth, setSelMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'billing', label: 'ใบวางบิล (WB)' },
    { key: 'invoice', label: 'ใบกำกับภาษี/ใบเสร็จ (IV)' },
    { key: 'quotation', label: 'ใบเสนอราคา (QU)' },
  ]

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const matchesDateFilter = (date: string) => {
    if (!dateFrom) return true
    if (dateFilterMode === 'single') return date === dateFrom
    if (date < dateFrom) return false
    if (dateTo && date > dateTo) return false
    return true
  }

  // Billing list
  const filteredBilling = useMemo(() => {
    return billingStatements.filter(b => {
      if (search) {
        const customer = getCustomer(b.customerId)
        const q = search.toLowerCase()
        if (!b.billingNumber.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
      }
      if (!matchesDateFilter(b.issueDate)) return false
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'billingNumber': va = a.billingNumber; vb = b.billingNumber; break
        case 'customer': va = getCustomer(a.customerId)?.name || ''; vb = getCustomer(b.customerId)?.name || ''; break
        case 'billingMonth': va = a.billingMonth; vb = b.billingMonth; break
        case 'grandTotal': va = a.grandTotal; vb = b.grandTotal; break
        case 'netPayable': va = a.netPayable; vb = b.netPayable; break
        default: va = a.issueDate; vb = b.issueDate
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [billingStatements, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  // Preview for billing creation
  const selCustomer = selCustomerId ? getCustomer(selCustomerId) : null
  // Check if flat-rate bill already exists for this customer+month
  const flatRateBillExists = useMemo(() => {
    if (!selCustomer || selCustomer.billingModel !== 'monthly_flat') return false
    return billingStatements.some(b => b.customerId === selCustomerId && b.billingMonth === selMonth)
  }, [selCustomer, selCustomerId, selMonth, billingStatements])

  const previewBilling = useMemo(() => {
    if (!selCustomer) return null
    if (selCustomer.billingModel === 'monthly_flat') {
      if (flatRateBillExists) return null
      return createFlatRateBilling(selCustomer, selMonth)
    }
    // per-piece: aggregate delivery notes for this customer in this month
    const alreadyBilledIds = new Set(billingStatements.flatMap(b => b.deliveryNoteIds))
    const monthNotes = deliveryNotes.filter(dn =>
      dn.customerId === selCustomerId &&
      dn.date.startsWith(selMonth) &&
      (dn.status === 'delivered' || dn.status === 'acknowledged') &&
      !alreadyBilledIds.has(dn.id)
    )
    if (monthNotes.length === 0) return null
    const lineItems = aggregateDeliveryItems(monthNotes, selCustomer, linenCatalog)
    return { lineItems, ...calculateBillingTotals(lineItems) }
  }, [selCustomer, selMonth, deliveryNotes, selCustomerId, linenCatalog, billingStatements, flatRateBillExists])

  const handleCreateBilling = () => {
    if (!selCustomer || !previewBilling) return
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + selCustomer.creditDays)

    const alreadyBilledIds = new Set(billingStatements.flatMap(b => b.deliveryNoteIds))
    addBillingStatement({
      customerId: selCustomerId,
      deliveryNoteIds: deliveryNotes
        .filter(dn => dn.customerId === selCustomerId && dn.date.startsWith(selMonth)
          && (dn.status === 'delivered' || dn.status === 'acknowledged')
          && !alreadyBilledIds.has(dn.id))
        .map(dn => dn.id),
      billingMonth: selMonth,
      issueDate: todayISO(),
      dueDate: format(dueDate, 'yyyy-MM-dd'),
      lineItems: previewBilling.lineItems,
      subtotal: previewBilling.subtotal,
      vat: previewBilling.vat,
      grandTotal: previewBilling.grandTotal,
      withholdingTax: previewBilling.withholdingTax,
      netPayable: previewBilling.netPayable,
      status: 'draft',
      paidDate: null,
      paidAmount: 0,
      notes: '',
    })
    setShowCreate(false)
  }

  const handleCreateTaxInvoice = (billingId: string) => {
    const billing = billingStatements.find(b => b.id === billingId)
    if (!billing) return
    // Prevent duplicate
    if (taxInvoices.some(ti => ti.billingStatementId === billingId)) {
      alert('ใบกำกับภาษีของบิลนี้มีอยู่แล้ว')
      return
    }
    addTaxInvoice({
      billingStatementId: billingId,
      customerId: billing.customerId,
      issueDate: todayISO(),
      lineItems: billing.lineItems,
      subtotal: billing.subtotal,
      vat: billing.vat,
      grandTotal: billing.grandTotal,
      notes: '',
    })
    setShowDetail(null)
    setTab('invoice')
  }

  const handleCreateQuotation = () => {
    if (!quCustomerName) return
    const validDate = new Date(quDate)
    validDate.setDate(validDate.getDate() + quValidDays)
    addQuotation({
      customerName: quCustomerName,
      customerContact: quCustomerContact,
      date: quDate,
      validUntil: format(validDate, 'yyyy-MM-dd'),
      items: quItems.filter(i => i.pricePerUnit > 0),
      conditions: quConditions,
      status: 'draft',
      notes: quNotes,
    })
    setShowCreateQU(false)
  }

  const detailBilling = showDetail ? billingStatements.find(b => b.id === showDetail) : null
  const detailCustomer = detailBilling ? getCustomer(detailBilling.customerId) : null

  const detailInvoice = showInvoiceDetail ? taxInvoices.find(i => i.id === showInvoiceDetail) : null
  const detailInvoiceCustomer = detailInvoice ? getCustomer(detailInvoice.customerId) : null

  const detailQuotation = showQuDetail ? quotations.find(q => q.id === showQuDetail) : null

  const handleBillingCSV = () => {
    if (!detailBilling || !detailCustomer) return
    const headers = ['รหัส', 'รายการ', 'จำนวน', 'ราคา/หน่วย', 'มูลค่า']
    const rows = detailBilling.lineItems.map(item => [
      item.code, item.name, String(item.quantity), String(item.pricePerUnit), String(item.amount),
    ])
    rows.push(['', '', '', 'รวมก่อน VAT', String(detailBilling.subtotal)])
    rows.push(['', '', '', 'VAT 7%', String(detailBilling.vat)])
    rows.push(['', '', '', 'หัก ณ ที่จ่าย 3%', String(detailBilling.withholdingTax)])
    rows.push(['', '', '', 'ยอดจ่ายสุทธิ', String(detailBilling.netPayable)])
    exportCSV(headers, rows, detailBilling.billingNumber)
  }

  const handleInvoiceCSV = () => {
    if (!detailInvoice) return
    const headers = ['รายการ', 'จำนวน', 'ราคา/หน่วย', 'รวม']
    const rows = detailInvoice.lineItems.map(item => [
      item.name, String(item.quantity), String(item.pricePerUnit), String(item.amount),
    ])
    rows.push(['', '', 'รวมก่อน VAT', String(detailInvoice.subtotal)])
    rows.push(['', '', 'VAT 7%', String(detailInvoice.vat)])
    rows.push(['', '', 'รวมทั้งสิ้น', String(detailInvoice.grandTotal)])
    exportCSV(headers, rows, detailInvoice.invoiceNumber)
  }

  const handleQuotationCSV = () => {
    if (!detailQuotation) return
    const headers = ['รหัส', 'รายการ', 'ราคา/หน่วย']
    const rows = detailQuotation.items.filter(i => i.pricePerUnit > 0).map(item => [
      item.code, item.name, String(item.pricePerUnit),
    ])
    exportCSV(headers, rows, detailQuotation.quotationNumber)
  }

  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      if (search) {
        const s = search.toLowerCase()
        if (!q.quotationNumber.toLowerCase().includes(s) && !q.customerName.toLowerCase().includes(s)) return false
      }
      if (!matchesDateFilter(q.date)) return false
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'quotationNumber': va = a.quotationNumber; vb = b.quotationNumber; break
        case 'customerName': va = a.customerName; vb = b.customerName; break
        case 'validUntil': va = a.validUntil; vb = b.validUntil; break
        default: va = a.date; vb = b.date
      }
      const cmp = String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [quotations, search, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  // Invoice list (filtered + sorted)
  const filteredInvoices = useMemo(() => {
    return taxInvoices.filter(inv => {
      if (search) {
        const customer = getCustomer(inv.customerId)
        const q = search.toLowerCase()
        if (!inv.invoiceNumber.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
      }
      if (!matchesDateFilter(inv.issueDate)) return false
      return true
    }).sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'invoiceNumber': va = a.invoiceNumber; vb = b.invoiceNumber; break
        case 'customer': va = getCustomer(a.customerId)?.name || ''; vb = getCustomer(b.customerId)?.name || ''; break
        case 'grandTotal': va = a.grandTotal; vb = b.grandTotal; break
        default: va = a.issueDate; vb = b.issueDate
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [taxInvoices, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { draft: 0, sent: 0, paid: 0, overdue: 0 }
    billingStatements.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1 })
    return counts
  }, [billingStatements])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">วางบิล / ใบเสร็จ</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการเอกสารทางการเงิน</p>
        </div>
        {tab === 'billing' && (
          <button onClick={() => { setShowCreate(true); setSelCustomerId('') }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />สร้างใบวางบิล
          </button>
        )}
        {tab === 'quotation' && (
          <button onClick={() => {
            setQuCustomerName('')
            setQuCustomerContact('')
            setQuDate(todayISO())
            setQuValidDays(30)
            setQuConditions('1. ราคายังไม่รวมภาษีมูลค่าเพิ่ม 7%\n2. ระยะเวลาเครดิต 30 วัน\n3. บริการรับ-ส่งผ้าทุกวัน')
            setQuNotes('')
            setQuItems(linenCatalog.map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice })))
            setShowCreateQU(true)
          }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />สร้างใบเสนอราคา
          </button>
        )}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {(Object.entries(BILLING_STATUS_CONFIG) as [BillingStatus, typeof BILLING_STATUS_CONFIG[BillingStatus]][]).map(([status, cfg]) => (
          <div key={status} className={cn('rounded-xl border p-4', cfg.bgColor, 'border-transparent')}>
            <p className={cn('text-2xl font-bold', cfg.color)}>{statusCounts[status] || 0}</p>
            <p className="text-sm text-slate-600">{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setDateFrom(''); setDateTo(''); setSortKey('date'); setSortDir('desc') }}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาเลขที่เอกสาร, โรงแรม..."
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
      </div>

      <div className="mb-4">
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateFilterMode}
          onModeChange={setDateFilterMode} onDateFromChange={setDateFrom}
          onDateToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
      </div>

      {/* Billing Tab */}
      {tab === 'billing' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <SortableHeader label="เลขที่" sortKey="billingNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="โรงแรม" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="เดือน" sortKey="billingMonth" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ยอดรวม" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="จ่ายสุทธิ" sortKey="netPayable" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBilling.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
                ) : filteredBilling.map(b => {
                  const customer = getCustomer(b.customerId)
                  const cfg = BILLING_STATUS_CONFIG[b.status]
                  return (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setShowDetail(b.id)}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.billingNumber}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{b.billingMonth}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.grandTotal)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatCurrency(b.netPayable)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {b.status === 'draft' && (
                            <button onClick={() => updateBillingStatus(b.id, 'sent')}
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">วางบิล</button>
                          )}
                          {b.status === 'sent' && (
                            <button onClick={() => updateBillingStatus(b.id, 'paid')}
                              className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100">ชำระแล้ว</button>
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
      )}

      {/* Invoice Tab */}
      {tab === 'invoice' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <SortableHeader label="เลขที่" sortKey="invoiceNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="โรงแรม" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ยอดรวม VAT" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-slate-400">ยังไม่มีใบกำกับภาษี — สร้างจากใบวางบิล</td></tr>
                ) : filteredInvoices.map(inv => {
                  const customer = getCustomer(inv.customerId)
                  return (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setShowInvoiceDetail(inv.id)}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.issueDate)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatCurrency(inv.grandTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quotation Tab */}
      {tab === 'quotation' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <SortableHeader label="เลขที่" sortKey="quotationNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ลูกค้า" sortKey="customerName" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ใช้ได้ถึง" sortKey="validUntil" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <th className="text-center px-4 py-3 font-medium text-slate-600">รายการ</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
                ) : filteredQuotations.map(q => {
                  const cfg = QUOTATION_STATUS_CONFIG[q.status]
                  const nextStatus: QuotationStatus | null = q.status === 'draft' ? 'sent' : q.status === 'sent' ? 'accepted' : null
                  return (
                    <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setShowQuDetail(q.id)}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{q.quotationNumber}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{q.customerName}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(q.date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(q.validUntil)}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{q.items.length}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {nextStatus && (
                            <button onClick={() => updateQuotationStatus(q.id, nextStatus)}
                              className="text-xs px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] rounded font-medium hover:bg-[#2bb8b8] inline-flex items-center gap-0.5">
                              {QUOTATION_STATUS_CONFIG[nextStatus].label} <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                          {q.status === 'sent' && (
                            <button onClick={() => updateQuotationStatus(q.id, 'rejected')}
                              className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">ปฏิเสธ</button>
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
      )}

      {/* Create Billing Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบวางบิล" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">โรงแรม</label>
              <select value={selCustomerId} onChange={e => setSelCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">เลือกโรงแรม</option>
                {customers.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">เดือน</label>
              <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {previewBilling && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">รายการ</h3>
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
                    {previewBilling.lineItems.map(item => (
                      <tr key={item.code} className="border-t border-slate-100">
                        <td className="px-3 py-1.5">{item.name}</td>
                        <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(item.pricePerUnit)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">รวม</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(previewBilling.subtotal)}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">VAT 7%</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(previewBilling.vat)}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">รวม VAT</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(previewBilling.grandTotal)}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">หัก ณ ที่จ่าย 3%</td>
                      <td className="px-3 py-1.5 text-right text-red-600">-{formatCurrency(previewBilling.withholdingTax)}</td>
                    </tr>
                    <tr className="bg-[#e8eef5]">
                      <td colSpan={3} className="px-3 py-2 text-right font-semibold text-[#1B3A5C]">ยอดจ่ายสุทธิ</td>
                      <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatCurrency(previewBilling.netPayable)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {selCustomerId && !previewBilling && (
            <div className="text-center py-8 text-slate-400 text-sm">
              {flatRateBillExists
                ? 'ลูกค้านี้มีใบวางบิลเดือนนี้แล้ว (เหมาจ่าย)'
                : 'ไม่พบใบส่งของในเดือนนี้'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreateBilling} disabled={!previewBilling}
              className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium">
              สร้างใบวางบิล
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setShowPrint(false) }} title={detailBilling?.billingNumber || ''} size="lg">
        {detailBilling && detailCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailCustomer.name}</strong></div>
              <div><span className="text-slate-500">เดือน:</span> {detailBilling.billingMonth}</div>
              <div><span className="text-slate-500">วันที่ออก:</span> {formatDate(detailBilling.issueDate)}</div>
              <div><span className="text-slate-500">ครบกำหนด:</span> {formatDate(detailBilling.dueDate)}</div>
            </div>

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
                  {detailBilling.lineItems.map(item => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{item.name}</td>
                      <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.pricePerUnit)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t">
                    <td colSpan={3} className="px-3 py-1.5 text-right">รวม</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(detailBilling.subtotal)}</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-3 py-1.5 text-right">VAT 7%</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(detailBilling.vat)}</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-3 py-1.5 text-right">หัก ณ ที่จ่าย 3%</td>
                    <td className="px-3 py-1.5 text-right text-red-600">-{formatCurrency(detailBilling.withholdingTax)}</td>
                  </tr>
                  <tr className="bg-[#e8eef5]">
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-[#1B3A5C]">ยอดจ่ายสุทธิ</td>
                    <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatCurrency(detailBilling.netPayable)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <div className="flex gap-2">
                <button onClick={() => setConfirmDeleteId(detailBilling.id)}
                  className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" />ลบ
                </button>
                {!taxInvoices.some(ti => ti.billingStatementId === detailBilling.id) && (
                  <button onClick={() => handleCreateTaxInvoice(detailBilling.id)}
                    className="text-sm px-3 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">
                    <FileText className="w-3 h-3 inline mr-1" />สร้างใบกำกับภาษี
                  </button>
                )}
              </div>
              <button onClick={() => setShowPrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออก
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">ต้องการลบใบวางบิลนี้หรือไม่? การลบไม่สามารถเรียกคืนได้</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={() => { if (confirmDeleteId) { deleteBillingStatement(confirmDeleteId); setConfirmDeleteId(null); setShowDetail(null) } }}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">ลบ</button>
          </div>
        </div>
      </Modal>

      {/* Billing Print Preview Modal */}
      <Modal open={showPrint && !!detailBilling} onClose={() => setShowPrint(false)} title="พิมพ์ใบวางบิล" size="xl" className="print-target">
        {detailBilling && detailCustomer && (
          <div>
            <BillingPrint billing={detailBilling} customer={detailCustomer} company={companyInfo} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-billing" filename={detailBilling.billingNumber} onExportCSV={handleBillingCSV} />
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal open={!!showInvoiceDetail} onClose={() => { setShowInvoiceDetail(null); setShowInvoicePrint(false) }} title={detailInvoice?.invoiceNumber || ''} size="lg">
        {detailInvoice && detailInvoiceCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailInvoiceCustomer.name}</strong></div>
              <div><span className="text-slate-500">วันที่ออก:</span> {formatDate(detailInvoice.issueDate)}</div>
            </div>

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
                  {detailInvoice.lineItems.map(item => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{item.name}</td>
                      <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.pricePerUnit)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t">
                    <td colSpan={3} className="px-3 py-1.5 text-right">รวมก่อน VAT</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(detailInvoice.subtotal)}</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-3 py-1.5 text-right">VAT 7%</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(detailInvoice.vat)}</td>
                  </tr>
                  <tr className="bg-[#e8eef5]">
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-[#1B3A5C]">รวมทั้งสิ้น</td>
                    <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatCurrency(detailInvoice.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setShowInvoicePrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออก
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Print Preview Modal */}
      <Modal open={showInvoicePrint && !!detailInvoice} onClose={() => setShowInvoicePrint(false)} title="พิมพ์ใบกำกับภาษี/ใบเสร็จรับเงิน" size="xl" className="print-target">
        {detailInvoice && detailInvoiceCustomer && (
          <div>
            <TaxInvoicePrint
              invoice={detailInvoice}
              customer={detailInvoiceCustomer}
              company={companyInfo}
              withholdingTax={billingStatements.find(b => b.id === detailInvoice.billingStatementId)?.withholdingTax}
              netPayable={billingStatements.find(b => b.id === detailInvoice.billingStatementId)?.netPayable}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-tax-invoice" filename={detailInvoice.invoiceNumber} onExportCSV={handleInvoiceCSV} />
            </div>
          </div>
        )}
      </Modal>

      {/* Create Quotation Modal */}
      <Modal open={showCreateQU} onClose={() => setShowCreateQU(false)} title="สร้างใบเสนอราคา" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ชื่อลูกค้า / โรงแรม</label>
              <input value={quCustomerName} onChange={e => setQuCustomerName(e.target.value)}
                placeholder="กรอกชื่อ หรือเลือกจากลูกค้าเดิม"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              {customers.filter(c => c.isActive).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {customers.filter(c => c.isActive).map(c => (
                    <button key={c.id} onClick={() => { setQuCustomerName(c.name); setQuCustomerContact(c.contactName) }}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">{c.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ผู้ติดต่อ</label>
              <input value={quCustomerContact} onChange={e => setQuCustomerContact(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">วันที่</label>
              <input type="date" value={quDate} onChange={e => setQuDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ใช้ได้ (วัน)</label>
              <input type="number" min={1} value={quValidDays} onChange={e => setQuValidDays(sanitizeNumber(e.target.value, 365) || 30)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">รายการผ้า + ราคา</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อรายการ</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ราคา/หน่วย</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {quItems.map((item, idx) => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-3 py-1 font-mono text-xs text-slate-500">{item.code}</td>
                      <td className="px-3 py-1 text-slate-700">{item.name}</td>
                      <td className="px-1 py-1 text-right">
                        <input type="number" min={0} step={0.5}
                          value={item.pricePerUnit || ''}
                          onChange={e => {
                            const updated = [...quItems]
                            updated[idx] = { ...item, pricePerUnit: sanitizeNumber(e.target.value) }
                            setQuItems(updated)
                          }}
                          className="w-24 px-2 py-1 border border-slate-200 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button onClick={() => setQuItems(quItems.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-500 p-1"><X className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">เงื่อนไข</label>
            <textarea value={quConditions} onChange={e => setQuConditions(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={quNotes} onChange={e => setQuNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreateQU(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreateQuotation} disabled={!quCustomerName || quItems.filter(i => i.pricePerUnit > 0).length === 0}
              className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium">
              บันทึก
            </button>
          </div>
        </div>
      </Modal>

      {/* Quotation Detail Modal */}
      <Modal open={!!showQuDetail} onClose={() => { setShowQuDetail(null); setShowQuPrint(false) }} title={detailQuotation?.quotationNumber || ''} size="lg">
        {detailQuotation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">ลูกค้า:</span> <strong>{detailQuotation.customerName}</strong></div>
              <div><span className="text-slate-500">ติดต่อ:</span> {detailQuotation.customerContact || '-'}</div>
              <div><span className="text-slate-500">วันที่:</span> {formatDate(detailQuotation.date)}</div>
              <div><span className="text-slate-500">ใช้ได้ถึง:</span> {formatDate(detailQuotation.validUntil)}</div>
              <div>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                  QUOTATION_STATUS_CONFIG[detailQuotation.status].bgColor,
                  QUOTATION_STATUS_CONFIG[detailQuotation.status].color)}>
                  {QUOTATION_STATUS_CONFIG[detailQuotation.status].label}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ราคา/หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  {detailQuotation.items.map(item => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                      <td className="px-3 py-1.5 text-slate-700">{item.name}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.pricePerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detailQuotation.conditions && (
              <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                <strong>เงื่อนไข:</strong>
                <p className="whitespace-pre-wrap mt-1">{detailQuotation.conditions}</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <div className="flex gap-2">
                {detailQuotation.status === 'draft' && (
                  <button onClick={() => updateQuotationStatus(detailQuotation.id, 'sent')}
                    className="text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">ส่งให้ลูกค้า</button>
                )}
                {detailQuotation.status === 'sent' && (
                  <>
                    <button onClick={() => updateQuotationStatus(detailQuotation.id, 'accepted')}
                      className="text-sm px-3 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100">ตกลง</button>
                    <button onClick={() => updateQuotationStatus(detailQuotation.id, 'rejected')}
                      className="text-sm px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">ปฏิเสธ</button>
                  </>
                )}
              </div>
              <button onClick={() => setShowQuPrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออก
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Quotation Print Preview Modal */}
      <Modal open={showQuPrint && !!detailQuotation} onClose={() => setShowQuPrint(false)} title="พิมพ์ใบเสนอราคา" size="xl" className="print-target">
        {detailQuotation && (
          <div>
            <QuotationPrint quotation={detailQuotation} company={companyInfo} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-quotation" filename={detailQuotation.quotationNumber} onExportCSV={handleQuotationCSV} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
