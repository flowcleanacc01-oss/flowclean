'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatCurrency, formatDate, formatNumber, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { format } from 'date-fns'
import { BILLING_STATUS_CONFIG, QUOTATION_STATUS_CONFIG, type BillingStatus, type QuotationStatus, type QuotationItem, type DeliveryNote, type BillingStatement, type TaxInvoice } from '@/types'
import { aggregateDeliveryItems, calculateBillingTotals, createFlatRateBilling } from '@/lib/billing'
import { Plus, Search, FileText, FileDown, X, ChevronRight, Printer, Check, ExternalLink } from 'lucide-react'
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
    billingStatements, addBillingStatement, updateBillingStatus, updateBillingStatement, deleteBillingStatement,
    taxInvoices, addTaxInvoice, updateTaxInvoice, deleteTaxInvoice,
    quotations, addQuotation, updateQuotationStatus,
    deliveryNotes, updateDeliveryNote, customers, getCustomer, companyInfo, linenCatalog,
    linenCategories, getCategoryLabel,
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

  // Filter tabs for WB and IV
  type WBFilter = 'all' | 'not-printed' | 'printed' | 'no-iv' | 'has-iv' | 'not-paid' | 'paid'
  type IVFilter = 'all' | 'not-printed' | 'printed' | 'not-paid' | 'paid'
  const [wbFilter, setWbFilter] = useState<WBFilter>('all')
  const [ivFilter, setIvFilter] = useState<IVFilter>('all')
  const [qtCustomerFilter, setQtCustomerFilter] = useState<string>('all')

  // Bulk select state (WB, IV)
  const [selectedWbIds, setSelectedWbIds] = useState<string[]>([])
  const [selectedIvIds, setSelectedIvIds] = useState<string[]>([])
  const [showWbPrintList, setShowWbPrintList] = useState(false)
  const [showIvPrintList, setShowIvPrintList] = useState(false)
  const [showWbBulkPrint, setShowWbBulkPrint] = useState(false)
  const [showIvBulkPrint, setShowIvBulkPrint] = useState(false)

  // IV creation confirm modal
  const [showCreateIV, setShowCreateIV] = useState<string | null>(null) // billingId
  const [ivIssueDate, setIvIssueDate] = useState(todayISO())

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
  const [quSearch, setQuSearch] = useState('')
  const [quFilterCat, setQuFilterCat] = useState<string>('all')

  const sortedCategories = useMemo(() =>
    [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
  , [linenCategories])

  // Create billing state
  const [selCustomerId, setSelCustomerId] = useState('')
  const [selMonth, setSelMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selDnIds, setSelDnIds] = useState<string[]>([])
  const [dnSortKey, setDnSortKey] = useState('date')
  const [dnSortDir, setDnSortDir] = useState<'asc' | 'desc'>('asc')
  const [billingIssueDate, setBillingIssueDate] = useState(todayISO())

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'billing', label: 'ใบวางบิล (WB)' },
    { key: 'invoice', label: 'ใบกำกับภาษี/ใบเสร็จ (IV)' },
    { key: 'quotation', label: 'ใบเสนอราคา (QT)' },
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
      // WB filter
      if (wbFilter === 'not-printed' && b.isPrinted) return false
      if (wbFilter === 'printed' && !b.isPrinted) return false
      if (wbFilter === 'no-iv' && taxInvoices.some(ti => ti.billingStatementId === b.id)) return false
      if (wbFilter === 'has-iv' && !taxInvoices.some(ti => ti.billingStatementId === b.id)) return false
      if (wbFilter === 'not-paid' && b.status === 'paid') return false
      if (wbFilter === 'paid' && b.status !== 'paid') return false
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
  }, [billingStatements, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, wbFilter, taxInvoices])

  // Preview for billing creation
  const selCustomer = selCustomerId ? getCustomer(selCustomerId) : null
  // Check if flat-rate bill already exists for this customer+month (only for minPerMonth customers)
  const flatRateBillExists = useMemo(() => {
    if (!selCustomer || !(selCustomer.enableMinPerMonth)) return false
    return billingStatements.some(b => b.customerId === selCustomerId && b.billingMonth === selMonth)
  }, [selCustomer, selCustomerId, selMonth, billingStatements])

  // Available delivery notes for billing (unbilled, matching customer+month)
  const availableDNs = useMemo((): DeliveryNote[] => {
    if (!selCustomer) return []
    const alreadyBilledIds = new Set(billingStatements.flatMap(b => b.deliveryNoteIds))
    return deliveryNotes
      .filter(dn =>
        dn.customerId === selCustomerId &&
        dn.date.startsWith(selMonth) &&
        !alreadyBilledIds.has(dn.id)
      )
      .sort((a, b) => {
        let va: string | number, vb: string | number
        switch (dnSortKey) {
          case 'noteNumber': va = a.noteNumber; vb = b.noteNumber; break
          case 'date': va = a.date; vb = b.date; break
          case 'items': va = a.items.reduce((s, i) => s + i.quantity, 0); vb = b.items.reduce((s, i) => s + i.quantity, 0); break
          default: va = a.date; vb = b.date
        }
        const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
        return dnSortDir === 'desc' ? -cmp : cmp
      })
  }, [selCustomer, selCustomerId, selMonth, deliveryNotes, billingStatements, dnSortKey, dnSortDir])

  // Auto-select all available DNs when customer/month changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelDnIds(availableDNs.map(dn => dn.id))
  }, [availableDNs])

  const previewBilling = useMemo(() => {
    if (!selCustomer) return null
    if (!(selCustomer.enablePerPiece ?? true)) {
      if (flatRateBillExists) return null
      return createFlatRateBilling(selCustomer, selMonth)
    }
    // per-piece: use only selected DNs
    const selectedNotes = deliveryNotes.filter(dn => selDnIds.includes(dn.id))
    if (selectedNotes.length === 0) return null
    const lineItems = aggregateDeliveryItems(selectedNotes, selCustomer, linenCatalog)
    return { lineItems, ...calculateBillingTotals(lineItems) }
  }, [selCustomer, selMonth, deliveryNotes, selDnIds, linenCatalog, flatRateBillExists])

  const handleCreateBilling = () => {
    if (!selCustomer || !previewBilling) return
    const dueDate = new Date(billingIssueDate)
    dueDate.setDate(dueDate.getDate() + selCustomer.creditDays)

    addBillingStatement({
      customerId: selCustomerId,
      deliveryNoteIds: selDnIds,
      billingMonth: selMonth,
      issueDate: billingIssueDate,
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

    // Mark selected delivery notes as billed
    for (const dnId of selDnIds) {
      updateDeliveryNote(dnId, { isBilled: true })
    }

    setShowCreate(false)
  }

  const handleCreateTaxInvoice = (billingId: string) => {
    if (!billingStatements.find(b => b.id === billingId)) return
    if (taxInvoices.some(ti => ti.billingStatementId === billingId)) {
      alert('ใบกำกับภาษีของบิลนี้มีอยู่แล้ว')
      return
    }
    setIvIssueDate(todayISO())
    setShowCreateIV(billingId)
  }

  const handleConfirmCreateIV = () => {
    if (!showCreateIV) return
    const billing = billingStatements.find(b => b.id === showCreateIV)
    if (!billing) return
    addTaxInvoice({
      billingStatementId: showCreateIV,
      customerId: billing.customerId,
      issueDate: ivIssueDate,
      lineItems: billing.lineItems,
      subtotal: billing.subtotal,
      vat: billing.vat,
      grandTotal: billing.grandTotal,
      notes: '',
    })
    setShowCreateIV(null)
    setShowDetail(null)
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

  // List CSV handlers for bulk export
  const handleWbListCSV = (items: BillingStatement[]) => {
    const headers = ['ลำดับ', 'เลขที่ WB', 'โรงแรม', 'เดือน', 'ยอดจ่ายสุทธิ', 'สถานะ']
    const rows = items.map((b, idx) => [
      String(idx + 1), b.billingNumber, getCustomer(b.customerId)?.name || '-',
      b.billingMonth, String(b.netPayable), BILLING_STATUS_CONFIG[b.status]?.label || b.status,
    ])
    exportCSV(headers, rows, 'รายการใบวางบิล')
  }

  const handleIvListCSV = (items: TaxInvoice[]) => {
    const headers = ['ลำดับ', 'เลขที่ IV', 'โรงแรม', 'วันที่ออก', 'ยอดรวม']
    const rows = items.map((inv, idx) => [
      String(idx + 1), inv.invoiceNumber, getCustomer(inv.customerId)?.name || '-',
      inv.issueDate, String(inv.grandTotal),
    ])
    exportCSV(headers, rows, 'รายการใบกำกับภาษี')
  }

  // Reverse WB: block if IV exists, else mark SDs unbilled + delete WB
  const handleReverseWB = (billingId: string) => {
    const billing = billingStatements.find(b => b.id === billingId)
    if (!billing) return
    const hasIV = taxInvoices.some(ti => ti.billingStatementId === billingId)
    if (hasIV) {
      alert('ไม่สามารถย้อน WB ได้ เนื่องจากมีใบกำกับภาษี (IV) อยู่แล้ว\nกรุณาย้อน IV ก่อน')
      return
    }
    const customer = getCustomer(billing.customerId)
    const dnNumbers = billing.deliveryNoteIds
      .map(id => deliveryNotes.find(d => d.id === id)?.noteNumber)
      .filter(Boolean).join(', ')
    if (confirm(`ยืนยันการลบใบวางบิล ${billing.billingNumber}?\n\nSD ที่จะถูกยกเลิกการวางบิล:\n${dnNumbers || '-'}\n\nlูกค้า: ${customer?.name || '-'}`)) {
      // Mark linked SDs as isBilled=false
      for (const dnId of billing.deliveryNoteIds) {
        updateDeliveryNote(dnId, { isBilled: false })
      }
      deleteBillingStatement(billingId)
      setShowDetail(null)
      setShowPrint(false)
    }
  }

  // Reverse IV: delete IV (unlocks WB reversal)
  const handleReverseIV = (invoiceId: string) => {
    const inv = taxInvoices.find(i => i.id === invoiceId)
    if (!inv) return
    const linkedWB = billingStatements.find(b => b.id === inv.billingStatementId)
    if (confirm(`ยืนยันการลบใบกำกับภาษี ${inv.invoiceNumber}?\n\nใบวางบิลที่เกี่ยวข้อง: ${linkedWB?.billingNumber || '-'}`)) {
      deleteTaxInvoice(invoiceId)
      setShowInvoiceDetail(null)
      setShowInvoicePrint(false)
    }
  }

  // Unique customer names from quotations (for QT customer filter)
  const qtCustomerNames = useMemo(() => {
    const names = new Set(quotations.map(q => q.customerName).filter(Boolean))
    return Array.from(names).sort()
  }, [quotations])

  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      if (qtCustomerFilter !== 'all' && q.customerName !== qtCustomerFilter) return false
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
  }, [quotations, qtCustomerFilter, search, dateFrom, dateTo, dateFilterMode, sortKey, sortDir])

  // Invoice list (filtered + sorted)
  const filteredInvoices = useMemo(() => {
    return taxInvoices.filter(inv => {
      if (search) {
        const customer = getCustomer(inv.customerId)
        const q = search.toLowerCase()
        if (!inv.invoiceNumber.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
      }
      if (!matchesDateFilter(inv.issueDate)) return false
      // IV filter
      if (ivFilter === 'not-printed' && inv.isPrinted) return false
      if (ivFilter === 'printed' && !inv.isPrinted) return false
      if (ivFilter === 'not-paid' && inv.isPaid) return false
      if (ivFilter === 'paid' && !inv.isPaid) return false
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
  }, [taxInvoices, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, ivFilter])

  // Map WB id → IV info (for badge in WB list/detail)
  const wbInvoiceMap = useMemo(() => {
    const map = new Map<string, { invoiceId: string; invoiceNumber: string }>()
    for (const ti of taxInvoices) {
      map.set(ti.billingStatementId, { invoiceId: ti.id, invoiceNumber: ti.invoiceNumber })
    }
    return map
  }, [taxInvoices])

  // Map IV id → WB info (for badge in IV list/detail)
  const ivBillingMap = useMemo(() => {
    const map = new Map<string, { billingId: string; billingNumber: string }>()
    for (const ti of taxInvoices) {
      const wb = billingStatements.find(b => b.id === ti.billingStatementId)
      if (wb) map.set(ti.id, { billingId: wb.id, billingNumber: wb.billingNumber })
    }
    return map
  }, [taxInvoices, billingStatements])

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
          <h1 className="text-2xl font-bold text-slate-800">
            {tab === 'billing' ? '3. ใบวางบิล (WB)' : tab === 'invoice' ? '4. ใบกำกับภาษี/ใบเสร็จ (IV)' : 'ใบเสนอราคา (QT)'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tab === 'billing' ? 'จัดการใบวางบิลทั้งหมด' : tab === 'invoice' ? 'จัดการใบกำกับภาษี/ใบเสร็จ ทั้งหมด' : 'จัดการใบเสนอราคาทั้งหมด'}
          </p>
        </div>
        {tab === 'billing' && (
          <div className="flex items-center gap-2">
            {selectedWbIds.length > 0 && (
              <button onClick={() => setShowWbBulkPrint(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกที่เลือก ({selectedWbIds.length})
              </button>
            )}
            <button onClick={() => setShowWbPrintList(true)} disabled={filteredBilling.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
              <Printer className="w-4 h-4" />พิมพ์/ส่งออกรายการ
            </button>
            <button onClick={() => { setShowCreate(true); setSelCustomerId(''); setBillingIssueDate(todayISO()) }}
              className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" />สร้างใบวางบิล
            </button>
          </div>
        )}
        {tab === 'invoice' && (
          <div className="flex items-center gap-2">
            {selectedIvIds.length > 0 && (
              <button onClick={() => setShowIvBulkPrint(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกที่เลือก ({selectedIvIds.length})
              </button>
            )}
            <button onClick={() => setShowIvPrintList(true)} disabled={filteredInvoices.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
              <Printer className="w-4 h-4" />พิมพ์/ส่งออกรายการ
            </button>
          </div>
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
            setQuSearch('')
            setQuFilterCat('all')
            setShowCreateQU(true)
          }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />สร้างใบเสนอราคา
          </button>
        )}
      </div>

      {/* Status cards — billing tab only */}
      {tab === 'billing' && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {(Object.entries(BILLING_STATUS_CONFIG) as [BillingStatus, typeof BILLING_STATUS_CONFIG[BillingStatus]][]).map(([status, cfg]) => (
          <div key={status} className={cn('rounded-xl border p-4', cfg.bgColor, 'border-transparent')}>
            <p className={cn('text-2xl font-bold', cfg.color)}>{statusCounts[status] || 0}</p>
            <p className="text-sm text-slate-600">{cfg.label}</p>
          </div>
        ))}
      </div>}

      {/* Tab buttons removed — sidebar handles navigation */}

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่เอกสาร, ชื่อลูกค้า..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        {tab === 'quotation' && (
          <select value={qtCustomerFilter} onChange={e => setQtCustomerFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
            <option value="all">ทุกลูกค้า</option>
            {qtCustomerNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-4">
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateFilterMode}
          onModeChange={setDateFilterMode} onDateFromChange={setDateFrom}
          onDateToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
      </div>

      {/* WB Filter tabs */}
      {tab === 'billing' && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {([
            { key: 'all' as WBFilter, label: 'ทั้งหมด' },
            { key: 'not-printed' as WBFilter, label: 'ยังไม่พิมพ์' },
            { key: 'printed' as WBFilter, label: 'พิมพ์แล้ว' },
            { key: 'no-iv' as WBFilter, label: 'ยังไม่ออก IV' },
            { key: 'has-iv' as WBFilter, label: 'ออก IV แล้ว' },
            { key: 'not-paid' as WBFilter, label: 'ยังไม่ชำระ' },
            { key: 'paid' as WBFilter, label: 'ชำระแล้ว' },
          ]).map(f => (
            <button key={f.key} onClick={() => setWbFilter(f.key)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                wbFilter === f.key ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* IV Filter tabs */}
      {tab === 'invoice' && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {([
            { key: 'all' as IVFilter, label: 'ทั้งหมด' },
            { key: 'not-printed' as IVFilter, label: 'ยังไม่พิมพ์' },
            { key: 'printed' as IVFilter, label: 'พิมพ์แล้ว' },
            { key: 'not-paid' as IVFilter, label: 'ยังไม่ชำระ' },
            { key: 'paid' as IVFilter, label: 'ชำระแล้ว' },
          ]).map(f => (
            <button key={f.key} onClick={() => setIvFilter(f.key)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                ivFilter === f.key ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Billing Tab */}
      {tab === 'billing' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-2 py-3 w-10">
                    <input type="checkbox"
                      checked={filteredBilling.length > 0 && selectedWbIds.length === filteredBilling.length}
                      onChange={e => { if (e.target.checked) setSelectedWbIds(filteredBilling.map(b => b.id)); else setSelectedWbIds([]) }}
                      className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                  </th>
                  <SortableHeader label="เลขที่" sortKey="billingNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="โรงแรม" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="เดือน" sortKey="billingMonth" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ยอดรวม" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="จ่ายสุทธิ" sortKey="netPayable" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <th className="text-center px-3 py-3 font-medium text-slate-600">พิมพ์</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">IV</th>
                  <th className="text-center px-3 py-3 font-medium text-slate-600">ชำระ</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBilling.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
                ) : filteredBilling.map(b => {
                  const customer = getCustomer(b.customerId)
                  return (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setShowDetail(b.id)}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedWbIds.includes(b.id)}
                          onChange={e => { if (e.target.checked) setSelectedWbIds(prev => [...prev, b.id]); else setSelectedWbIds(prev => prev.filter(id => id !== b.id)) }}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.billingNumber}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{b.billingMonth}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.grandTotal)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatCurrency(b.netPayable)}</td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => updateBillingStatement(b.id, { isPrinted: !b.isPrinted })}
                          className={cn('px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                            b.isPrinted ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                          {b.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const ivInfo = wbInvoiceMap.get(b.id)
                          return ivInfo ? (
                            <button onClick={() => setShowInvoiceDetail(ivInfo.invoiceId)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200">
                              <span className="font-mono">{ivInfo.invoiceNumber}</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">ยังไม่ออก</span>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => updateBillingStatus(b.id, b.status === 'paid' ? 'sent' : 'paid')}
                          className={cn('px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                            b.status === 'paid' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                          {b.status === 'paid' ? 'ชำระแล้ว' : 'ยังไม่ชำระ'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {b.status === 'draft' && (
                            <button onClick={() => updateBillingStatus(b.id, 'sent')}
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">วางบิล</button>
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
                  <th className="px-2 py-3 w-10">
                    <input type="checkbox"
                      checked={filteredInvoices.length > 0 && selectedIvIds.length === filteredInvoices.length}
                      onChange={e => { if (e.target.checked) setSelectedIvIds(filteredInvoices.map(i => i.id)); else setSelectedIvIds([]) }}
                      className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                  </th>
                  <SortableHeader label="เลขที่" sortKey="invoiceNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ยอดรวม VAT" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <th className="text-center px-3 py-3 font-medium text-slate-600">พิมพ์</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">WB</th>
                  <th className="text-center px-3 py-3 font-medium text-slate-600">ชำระ</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">ยังไม่มีใบกำกับภาษี — สร้างจากใบวางบิล</td></tr>
                ) : filteredInvoices.map(inv => {
                  const customer = getCustomer(inv.customerId)
                  const wbInfo = ivBillingMap.get(inv.id)
                  return (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setShowInvoiceDetail(inv.id)}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedIvIds.includes(inv.id)}
                          onChange={e => { if (e.target.checked) setSelectedIvIds(prev => [...prev, inv.id]); else setSelectedIvIds(prev => prev.filter(id => id !== inv.id)) }}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.issueDate)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatCurrency(inv.grandTotal)}</td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => updateTaxInvoice(inv.id, { isPrinted: !inv.isPrinted })}
                          className={cn('px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                            inv.isPrinted ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                          {inv.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {wbInfo ? (
                          <button onClick={() => setShowDetail(wbInfo.billingId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200">
                            <span className="font-mono">{wbInfo.billingNumber}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : <span className="text-xs text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => updateTaxInvoice(inv.id, { isPaid: !inv.isPaid })}
                          className={cn('px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                            inv.isPaid ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                          {inv.isPaid ? 'ชำระแล้ว' : 'ยังไม่ชำระ'}
                        </button>
                      </td>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">วันที่ออกบิล</label>
              <input type="date" value={billingIssueDate} onChange={e => setBillingIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {/* DN preview list with checkboxes */}
          {selCustomer && availableDNs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-700">ใบส่งของที่จะนำมาวางบิล ({selDnIds.length}/{availableDNs.length})</h3>
                <div className="flex gap-1">
                  <button onClick={() => setSelDnIds(availableDNs.map(d => d.id))}
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors">เลือกทั้งหมด</button>
                  <button onClick={() => setSelDnIds([])}
                    className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">ล้าง</button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="w-8 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 cursor-pointer select-none"
                        onClick={() => { if (dnSortKey === 'noteNumber') setDnSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDnSortKey('noteNumber'); setDnSortDir('asc') } }}>
                        เลขที่ {dnSortKey === 'noteNumber' && (dnSortDir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 cursor-pointer select-none"
                        onClick={() => { if (dnSortKey === 'date') setDnSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDnSortKey('date'); setDnSortDir('asc') } }}>
                        วันที่ {dnSortKey === 'date' && (dnSortDir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 cursor-pointer select-none"
                        onClick={() => { if (dnSortKey === 'items') setDnSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDnSortKey('items'); setDnSortDir('asc') } }}>
                        จำนวน {dnSortKey === 'items' && (dnSortDir === 'asc' ? '▲' : '▼')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableDNs.map(dn => {
                      const totalPcs = dn.items.reduce((s, i) => s + i.quantity, 0)
                      const checked = selDnIds.includes(dn.id)
                      return (
                        <tr key={dn.id} className={cn('border-t border-slate-100 cursor-pointer hover:bg-slate-50', checked && 'bg-blue-50/50')}
                          onClick={() => setSelDnIds(prev => checked ? prev.filter(id => id !== dn.id) : [...prev, dn.id])}>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={checked} readOnly className="rounded border-slate-300 pointer-events-none" />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs">{dn.noteNumber}</td>
                          <td className="px-3 py-1.5 text-slate-600">{formatDate(dn.date)}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(totalPcs)} ชิ้น</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
              {selDnIds.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-medium text-slate-500 mb-1">อ้างอิงใบส่งของ ({selDnIds.length} ฉบับ)</h4>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    {selDnIds.map(id => {
                      const dn = deliveryNotes.find(d => d.id === id)
                      if (!dn) return null
                      return <div key={id}>{dn.noteNumber} — {formatDate(dn.date)}</div>
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {selCustomerId && !previewBilling && (
            <div className="text-center py-8 text-slate-400 text-sm">
              {flatRateBillExists
                ? 'ลูกค้านี้มีใบวางบิลเดือนนี้แล้ว (เหมาจ่าย)'
                : availableDNs.length > 0 && selDnIds.length === 0
                  ? 'กรุณาเลือกใบส่งของอย่างน้อย 1 รายการ'
                  : 'ไม่พบใบส่งของที่ยังไม่วางบิลในเดือนนี้'}
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

            {/* Linked Delivery Notes */}
            {detailBilling.deliveryNoteIds.length > 0 && (() => {
              const linkedDNs = detailBilling.deliveryNoteIds
                .map(dnId => deliveryNotes.find(d => d.id === dnId))
                .filter(Boolean)
                .sort((a, b) => a!.date.localeCompare(b!.date))
              if (linkedDNs.length === 0) return null
              const isPer = (detailCustomer.enablePerPiece ?? true)
              const priceMap = isPer ? Object.fromEntries(detailCustomer.priceList.map(p => [p.code, p.price])) : {}
              return (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">ใบส่งของที่รวมวางบิล ({linkedDNs.length} ใบ)</h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-50 border-b border-blue-100">
                          <th className="text-left px-3 py-2 font-medium text-blue-800">เลขที่ SD</th>
                          <th className="text-left px-3 py-2 font-medium text-blue-800">วันที่</th>
                          <th className="text-right px-3 py-2 font-medium text-blue-800">จำนวน</th>
                          {isPer && <th className="text-right px-3 py-2 font-medium text-blue-800">ยอดรวม</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {linkedDNs.map(dn => {
                          const totalPcs = dn!.items.reduce((s, i) => s + i.quantity, 0)
                          const totalAmt = isPer ? dn!.items.reduce((s, i) => s + i.quantity * (priceMap[i.code] || 0), 0) : 0
                          return (
                            <tr key={dn!.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 font-mono text-xs">{dn!.noteNumber}</td>
                              <td className="px-3 py-1.5 text-slate-600">{formatDate(dn!.date)}</td>
                              <td className="px-3 py-1.5 text-right">{formatNumber(totalPcs)} ชิ้น</td>
                              {isPer && <td className="px-3 py-1.5 text-right">{formatCurrency(totalAmt)}</td>}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* IV Status Section */}
            {(() => {
              const ivInfo = wbInvoiceMap.get(detailBilling.id)
              return (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-50 border border-purple-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 font-medium">ใบกำกับภาษี (IV):</span>
                    {ivInfo ? (
                      <button onClick={() => { setShowDetail(null); setShowInvoiceDetail(ivInfo.invoiceId) }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 hover:text-purple-900">
                        <span className="font-mono">{ivInfo.invoiceNumber}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-sm text-slate-400">ยังไม่ออก IV</span>
                    )}
                  </div>
                  {!ivInfo && (
                    <button onClick={() => handleCreateTaxInvoice(detailBilling.id)}
                      className="text-sm px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />ออกใบกำกับภาษี
                    </button>
                  )}
                </div>
              )
            })()}

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
              <button onClick={() => setConfirmDeleteId(detailBilling.id)}
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                <X className="w-3.5 h-3.5" />ลบ
              </button>
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
            {/* Reverse WB checkbox */}
            <div className="flex items-center mb-2 no-print">
              {taxInvoices.some(ti => ti.billingStatementId === detailBilling.id) ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">
                  <span className="font-medium">⚠ ไม่สามารถย้อน WB ได้</span>
                  <span>— มีใบกำกับภาษี (IV) อยู่แล้ว กรุณาย้อน IV ก่อน</span>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={true}
                    onChange={() => handleReverseWB(detailBilling.id)}
                    className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700">สถานะเปลี่ยนผ่านใบวางบิล WB</span>
                </label>
              )}
            </div>
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

            {/* WB Reference Section */}
            {(() => {
              const wbInfo = ivBillingMap.get(detailInvoice.id)
              const wb = wbInfo ? billingStatements.find(b => b.id === wbInfo.billingId) : null
              if (!wbInfo || !wb) return null
              return (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 font-medium">ใบวางบิล (WB):</span>
                    <button onClick={() => { setShowInvoiceDetail(null); setShowDetail(wbInfo.billingId) }}
                      className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-900">
                      <span className="font-mono">{wbInfo.billingNumber}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-sm text-slate-500">
                    {formatDate(wb.issueDate)} · {formatCurrency(wb.netPayable)}
                  </div>
                </div>
              )
            })()}

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

            <div className="flex justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={true}
                  onChange={() => handleReverseIV(detailInvoice.id)}
                  className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-sm font-medium text-purple-700">สถานะเปลี่ยนผ่านใบกำกับภาษี IV</span>
              </label>
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
            <div className="flex items-center mb-2 no-print">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={true}
                  onChange={() => handleReverseIV(detailInvoice.id)}
                  className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-sm font-medium text-purple-700">สถานะเปลี่ยนผ่านใบกำกับภาษี IV</span>
              </label>
            </div>
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

      {/* IV Creation Confirm Modal */}
      <Modal open={!!showCreateIV} onClose={() => setShowCreateIV(null)} title="ยืนยันออกใบกำกับภาษี" size="lg">
        {(() => {
          const billing = showCreateIV ? billingStatements.find(b => b.id === showCreateIV) : null
          const customer = billing ? getCustomer(billing.customerId) : null
          if (!billing || !customer) return null
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">โรงแรม:</span> <strong>{customer.name}</strong></div>
                <div><span className="text-slate-500">ใบวางบิล:</span> <span className="font-mono font-medium">{billing.billingNumber}</span></div>
                <div><span className="text-slate-500">เดือน:</span> {billing.billingMonth}</div>
                <div>
                  <label className="block text-slate-500 mb-1">วันที่ออกใบกำกับภาษี</label>
                  <input type="date" value={ivIssueDate} onChange={e => setIvIssueDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                </div>
              </div>

              {/* WB line items preview */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">รายการจากใบวางบิล ({billing.deliveryNoteIds.length} ใบส่งของ)</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวน</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">ราคา</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billing.lineItems.map(item => (
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
                        <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">รวมก่อน VAT</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(billing.subtotal)}</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">VAT 7%</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(billing.vat)}</td>
                      </tr>
                      <tr className="bg-[#e8eef5]">
                        <td colSpan={3} className="px-3 py-2 text-right font-semibold text-[#1B3A5C]">รวมทั้งสิ้น</td>
                        <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatCurrency(billing.grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowCreateIV(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                <button onClick={handleConfirmCreateIV} disabled={!ivIssueDate}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-1">
                  <FileText className="w-4 h-4" />ออกใบกำกับภาษี
                </button>
              </div>
            </div>
          )
        })()}
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
            <label className="block text-sm font-medium text-slate-600 mb-1">รายการผ้า + ราคา ({quItems.length} รายการ)</label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={quSearch} onChange={e => setQuSearch(e.target.value)}
                  placeholder="ค้นหา..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
              <select value={quFilterCat} onChange={e => setQuFilterCat(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="all">ทุกหมวด</option>
                {sortedCategories.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อ (ไทย)</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อ (EN)</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">หมวด</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-14">หน่วย</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ราคา/หน่วย</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {quItems.map((item, idx) => {
                    const catItem = linenCatalog.find(i => i.code === item.code)
                    // Apply search + category filter
                    if (quSearch) {
                      const s = quSearch.toLowerCase()
                      if (!item.code.toLowerCase().includes(s) && !item.name.toLowerCase().includes(s) && !(catItem?.nameEn || '').toLowerCase().includes(s)) return null
                    }
                    if (quFilterCat !== 'all' && catItem?.category !== quFilterCat) return null
                    return (
                      <tr key={item.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1 font-mono text-xs text-slate-500">{item.code}</td>
                        <td className="px-3 py-1 text-slate-700">{item.name}</td>
                        <td className="px-3 py-1 text-slate-500 text-xs">{catItem?.nameEn || ''}</td>
                        <td className="px-3 py-1 text-xs text-slate-400">{catItem ? getCategoryLabel(catItem.category) : ''}</td>
                        <td className="px-3 py-1 text-xs text-slate-400">{catItem?.unit || 'ชิ้น'}</td>
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
                    )
                  })}
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

      {/* WB Print List Modal */}
      <Modal open={showWbPrintList} onClose={() => setShowWbPrintList(false)} title="รายการใบวางบิล" size="xl" className="print-target">
        {(() => {
          const printItems = selectedWbIds.length > 0
            ? filteredBilling.filter(b => selectedWbIds.includes(b.id))
            : filteredBilling
          const grandTotal = printItems.reduce((s, b) => s + b.netPayable, 0)
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500 no-print">
                {selectedWbIds.length > 0 ? `เลือก ${printItems.length} รายการ` : `ทั้งหมด ${printItems.length} รายการ`}
              </div>
              <div id="print-wb-list" className="border border-slate-200 rounded-lg overflow-hidden print:border-none">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">{companyInfo.name} — รายการใบวางบิล</h2>
                <table className="w-full text-sm print:text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่ WB</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">โรงแรม</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เดือน</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">ยอดจ่ายสุทธิ</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printItems.map((b, idx) => {
                      const customer = getCustomer(b.customerId)
                      const cfg = BILLING_STATUS_CONFIG[b.status]
                      return (
                        <tr key={b.id} className="border-t border-slate-100">
                          <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{b.billingNumber}</td>
                          <td className="px-3 py-1.5 text-slate-800">{customer?.name || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{b.billingMonth}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-medium">{formatCurrency(b.netPayable)}</td>
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
                      <td className="px-3 py-2 text-right text-[#1B3A5C]">{formatCurrency(grandTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex justify-end mt-4 no-print">
                <ExportButtons targetId="print-wb-list" filename="รายการใบวางบิล" onExportCSV={() => handleWbListCSV(printItems)} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* IV Print List Modal */}
      <Modal open={showIvPrintList} onClose={() => setShowIvPrintList(false)} title="รายการใบกำกับภาษี" size="xl" className="print-target">
        {(() => {
          const printItems = selectedIvIds.length > 0
            ? filteredInvoices.filter(i => selectedIvIds.includes(i.id))
            : filteredInvoices
          const grandTotal = printItems.reduce((s, i) => s + i.grandTotal, 0)
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500 no-print">
                {selectedIvIds.length > 0 ? `เลือก ${printItems.length} รายการ` : `ทั้งหมด ${printItems.length} รายการ`}
              </div>
              <div id="print-iv-list" className="border border-slate-200 rounded-lg overflow-hidden print:border-none">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">{companyInfo.name} — รายการใบกำกับภาษี</h2>
                <table className="w-full text-sm print:text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่ IV</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">โรงแรม</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">วันที่ออก</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">ยอดรวม VAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printItems.map((inv, idx) => {
                      const customer = getCustomer(inv.customerId)
                      return (
                        <tr key={inv.id} className="border-t border-slate-100">
                          <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{inv.invoiceNumber}</td>
                          <td className="px-3 py-1.5 text-slate-800">{customer?.name || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{formatDate(inv.issueDate)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-medium">{formatCurrency(inv.grandTotal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td className="px-3 py-2" colSpan={4}>ยอดรวมทั้งหมด</td>
                      <td className="px-3 py-2 text-right text-[#1B3A5C]">{formatCurrency(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex justify-end mt-4 no-print">
                <ExportButtons targetId="print-iv-list" filename="รายการใบกำกับภาษี" onExportCSV={() => handleIvListCSV(printItems)} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* WB Bulk Print Modal */}
      <Modal open={showWbBulkPrint} onClose={() => setShowWbBulkPrint(false)} title={`พิมพ์/ส่งออกใบวางบิล (${selectedWbIds.length} ใบ)`} size="xl" className="print-target">
        <div id="print-bulk-wb">
          {selectedWbIds.map((bId, idx) => {
            const b = billingStatements.find(x => x.id === bId)
            const cust = b ? getCustomer(b.customerId) : null
            if (!b || !cust) return null
            return (
              <div key={bId}>
                {idx > 0 && <div className="border-t-2 border-dashed border-slate-300 my-6" style={{ pageBreakBefore: 'always' }} />}
                <BillingPrint billing={b} customer={cust} company={companyInfo} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between items-center mt-4 no-print">
          <span className="text-xs text-slate-400">เมื่อส่งออก/พิมพ์ ระบบจะทำเครื่องหมาย "พิมพ์แล้ว" อัตโนมัติ</span>
          <ExportButtons
            targetId="print-bulk-wb"
            filename={`WB-bulk-${selectedWbIds.length}`}
            onExportCSV={() => handleWbListCSV(billingStatements.filter(b => selectedWbIds.includes(b.id)))}
            onExport={() => {
              for (const bId of selectedWbIds) {
                const b = billingStatements.find(x => x.id === bId)
                if (b && !b.isPrinted) updateBillingStatement(bId, { isPrinted: true })
              }
            }}
          />
        </div>
      </Modal>

      {/* IV Bulk Print Modal */}
      <Modal open={showIvBulkPrint} onClose={() => setShowIvBulkPrint(false)} title={`พิมพ์/ส่งออกใบกำกับภาษี (${selectedIvIds.length} ใบ)`} size="xl" className="print-target">
        <div id="print-bulk-iv">
          {selectedIvIds.map((ivId, idx) => {
            const inv = taxInvoices.find(x => x.id === ivId)
            const cust = inv ? getCustomer(inv.customerId) : null
            if (!inv || !cust) return null
            const wb = billingStatements.find(b => b.id === inv.billingStatementId)
            return (
              <div key={ivId}>
                {idx > 0 && <div className="border-t-2 border-dashed border-slate-300 my-6" style={{ pageBreakBefore: 'always' }} />}
                <TaxInvoicePrint invoice={inv} customer={cust} company={companyInfo} withholdingTax={wb?.withholdingTax} netPayable={wb?.netPayable} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between items-center mt-4 no-print">
          <span className="text-xs text-slate-400">เมื่อส่งออก/พิมพ์ ระบบจะทำเครื่องหมาย "พิมพ์แล้ว" อัตโนมัติ</span>
          <ExportButtons
            targetId="print-bulk-iv"
            filename={`IV-bulk-${selectedIvIds.length}`}
            onExportCSV={() => handleIvListCSV(taxInvoices.filter(i => selectedIvIds.includes(i.id)))}
            onExport={() => {
              for (const ivId of selectedIvIds) {
                const inv = taxInvoices.find(x => x.id === ivId)
                if (inv && !inv.isPrinted) updateTaxInvoice(ivId, { isPrinted: true })
              }
            }}
          />
        </div>
      </Modal>
    </div>
  )
}
