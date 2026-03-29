'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatCurrency, formatDate, formatNumber, cn, todayISO, sanitizeNumber } from '@/lib/utils'
import { format } from 'date-fns'
import { BILLING_STATUS_CONFIG, QUOTATION_STATUS_CONFIG, type BillingStatus, type QuotationStatus, type QuotationItem, type DeliveryNote, type BillingStatement, type TaxInvoice } from '@/types'
import { aggregateDeliveryItems, aggregateDeliveryItemsByDate, calculateBillingTotals, createFlatRateBilling } from '@/lib/billing'
import { Plus, Search, FileText, FileDown, X, ChevronRight, ChevronUp, ChevronDown, Printer, Check, ExternalLink, Trash2, Edit2, RefreshCw } from 'lucide-react'
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
    quotations, addQuotation, updateQuotation, updateQuotationStatus, deleteQuotation,
    deliveryNotes, updateDeliveryNote, updateCustomer, customers, getCustomer, companyInfo, linenCatalog,
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

  const router = useRouter()

  // Post-reverse toast
  const [reversedDnInfo, setReversedDnInfo] = useState<{ dnIds: string[]; wbNumber: string } | null>(null)

  // Row highlight
  const [activeWbId, setActiveWbId] = useState<string | null>(null)
  const [activeIvId, setActiveIvId] = useState<string | null>(null)
  const [activeQtId, setActiveQtId] = useState<string | null>(null)

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
  const [editQuId, setEditQuId] = useState<string | null>(null)
  const [showLoadFromQT, setShowLoadFromQT] = useState(false)
  const [quLoadQTSearch, setQuLoadQTSearch] = useState('')
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
  // Option B: QT billing conditions
  const [quCustomerId, setQuCustomerId] = useState('')
  const [quEnablePerPiece, setQuEnablePerPiece] = useState(true)
  const [quEnableMinPerTrip, setQuEnableMinPerTrip] = useState(false)
  const [quMinPerTrip, setQuMinPerTrip] = useState(0)
  const [quEnableWaive, setQuEnableWaive] = useState(false)
  const [quMinPerTripThreshold, setQuMinPerTripThreshold] = useState(0)
  const [quEnableMinPerMonth, setQuEnableMinPerMonth] = useState(false)
  const [quMonthlyFlatRate, setQuMonthlyFlatRate] = useState(0)
  const [quNeedCustomerWarn, setQuNeedCustomerWarn] = useState(false)

  // Option A: Customer → QT shortcut (newqt=customerId in URL)
  useEffect(() => {
    const newqt = searchParams.get('newqt')
    if (!newqt) return
    const cust = customers.find(c => c.id === newqt)
    if (!cust) return
    setTab('quotation')
    setQuCustomerId(cust.id)
    setQuCustomerName(cust.name)
    setQuCustomerContact(cust.contactName ? `${cust.contactName}${cust.contactPhone ? ` (${cust.contactPhone})` : ''}` : '')
    setQuDate(todayISO())
    // Pre-fill billing conditions from existing customer
    setQuEnablePerPiece(cust.enablePerPiece ?? true)
    setQuEnableMinPerTrip(cust.enableMinPerTrip ?? false)
    setQuMinPerTrip(cust.minPerTrip ?? 0)
    setQuEnableWaive(cust.enableWaive ?? false)
    setQuMinPerTripThreshold(cust.minPerTripThreshold ?? 0)
    setQuEnableMinPerMonth(cust.enableMinPerMonth ?? false)
    setQuMonthlyFlatRate(cust.monthlyFlatRate ?? 0)
    setQuValidDays(30)
    setQuConditions('1. ราคายังไม่รวมภาษีมูลค่าเพิ่ม 7%\n2. ระยะเวลาเครดิต 30 วัน\n3. บริการรับ-ส่งผ้าทุกวัน')
    setQuItems(linenCatalog.map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice })))
    setShowCreateQU(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, customers, linenCatalog])

  const sortedCategories = useMemo(() =>
    [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
  , [linenCategories])

  // Billing mode (5.1)
  const [billingMode, setBillingMode] = useState<'by_date' | 'by_item'>('by_date')

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
  const sortedBg = (key: string) => sortKey === key ? 'bg-[#1B3A5C]/[0.04]' : ''

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
        if (!b.billingNumber.toLowerCase().includes(q) && !(customer?.shortName || '').toLowerCase().includes(q) && !(customer?.name || '').toLowerCase().includes(q)) return false
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
        case 'customer': { const ca = getCustomer(a.customerId); va = ca?.shortName || ca?.name || ''; const cb = getCustomer(b.customerId); vb = cb?.shortName || cb?.name || ''; break }
        case 'issueDate': case 'date': va = a.issueDate; vb = b.issueDate; break
        case 'billingMonth': va = a.billingMonth; vb = b.billingMonth; break
        case 'grandTotal': va = a.grandTotal; vb = b.grandTotal; break
        case 'netPayable': va = a.netPayable; vb = b.netPayable; break
        case 'isPrinted': va = a.isPrinted ? 1 : 0; vb = b.isPrinted ? 1 : 0; break
        case 'iv': va = taxInvoices.find(ti => ti.billingStatementId === a.id)?.invoiceNumber || ''; vb = taxInvoices.find(ti => ti.billingStatementId === b.id)?.invoiceNumber || ''; break
        case 'paid': va = a.status === 'paid' ? 1 : 0; vb = b.status === 'paid' ? 1 : 0; break
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

  // VAT / WHT rates (from company settings + customer toggle)
  const custVatRate = (selCustomer?.enableVat !== false) ? (companyInfo.vatRate ?? 7) : 0
  const custWhtRate = (selCustomer?.enableWithholding !== false) ? (companyInfo.withholdingRate ?? 3) : 0

  const previewBilling = useMemo(() => {
    if (!selCustomer) return null
    if (!(selCustomer.enablePerPiece ?? true)) {
      if (flatRateBillExists) return null
      return createFlatRateBilling(selCustomer, selMonth, custVatRate, custWhtRate)
    }
    // per-piece: use only selected DNs
    const selectedNotes = deliveryNotes.filter(dn => selDnIds.includes(dn.id))
    if (selectedNotes.length === 0) return null
    const linkedQT = quotations.find(q => q.status === 'accepted' && q.customerId === selCustomer.id)
    const lineItems = billingMode === 'by_date'
      ? aggregateDeliveryItemsByDate(selectedNotes, selCustomer)
      : aggregateDeliveryItems(selectedNotes, selCustomer, linenCatalog, linkedQT?.items)
    return { lineItems, ...calculateBillingTotals(lineItems, custVatRate, custWhtRate) }
  }, [selCustomer, selMonth, deliveryNotes, selDnIds, linenCatalog, flatRateBillExists, billingMode, quotations, custVatRate, custWhtRate])

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
      billingMode,
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

    // 5.4.1: by_date WB → collapse service lines to single "ค่าบริการซักวันที่ start - end"
    let ivLineItems = billing.lineItems
    if (billing.billingMode === 'by_date') {
      const transportCodes = new Set(['TRANSPORT_TRIP', 'TRANSPORT_MONTH'])
      const serviceLines = billing.lineItems.filter(i => !transportCodes.has(i.code))
      const transportLines = billing.lineItems.filter(i => transportCodes.has(i.code))
      if (serviceLines.length > 0) {
        const serviceTotal = serviceLines.reduce((s, i) => s + i.amount, 0)
        const dnDates = billing.deliveryNoteIds
          .map(id => deliveryNotes.find(d => d.id === id)?.date)
          .filter(Boolean)
          .sort() as string[]
        const dateLabel = dnDates.length > 0
          ? (dnDates[0] === dnDates[dnDates.length - 1]
            ? `${dnDates[0]}`
            : `${dnDates[0]} - ${dnDates[dnDates.length - 1]}`)
          : billing.billingMonth
        ivLineItems = [
          { code: 'SERVICE', name: `ค่าบริการซักวันที่ ${dateLabel}`, quantity: 1, pricePerUnit: serviceTotal, amount: serviceTotal },
          ...transportLines,
        ]
      }
    }

    addTaxInvoice({
      billingStatementId: showCreateIV,
      customerId: billing.customerId,
      issueDate: ivIssueDate,
      lineItems: ivLineItems,
      subtotal: billing.subtotal,
      vat: billing.vat,
      grandTotal: billing.grandTotal,
      notes: '',
    })
    setShowCreateIV(null)
    setShowDetail(null)
  }

  const handleCreateQuotation = () => {
    if (!quCustomerId) return
    const validDate = new Date(quDate)
    validDate.setDate(validDate.getDate() + quValidDays)
    const qtData = {
      customerName: quCustomerName,
      customerContact: quCustomerContact,
      date: quDate,
      validUntil: format(validDate, 'yyyy-MM-dd'),
      items: quItems.filter(i => i.pricePerUnit > 0),
      conditions: quConditions,
      status: 'draft' as const,
      notes: quNotes,
      customerId: quCustomerId,
      enablePerPiece: quEnablePerPiece,
      enableMinPerTrip: quEnableMinPerTrip,
      minPerTrip: quMinPerTrip,
      enableWaive: quEnableWaive,
      minPerTripThreshold: quMinPerTripThreshold,
      enableMinPerMonth: quEnableMinPerMonth,
      monthlyFlatRate: quMonthlyFlatRate,
    }
    if (editQuId) {
      updateQuotation(editQuId, qtData)
    } else {
      addQuotation(qtData)
    }
    setEditQuId(null)
    setShowCreateQU(false)
  }

  // Open create modal with data from existing QT (edit mode — resets to draft)
  const handleEditQT = (q: typeof quotations[0]) => {
    setEditQuId(q.id)
    setQuCustomerId(q.customerId)
    setQuCustomerName(q.customerName)
    setQuCustomerContact(q.customerContact)
    setQuDate(q.date)
    const d1 = new Date(q.date)
    const d2 = new Date(q.validUntil)
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    setQuValidDays(diffDays > 0 ? diffDays : 30)
    setQuConditions(q.conditions)
    setQuNotes(q.notes)
    setQuItems([...q.items])
    setQuSearch('')
    setQuFilterCat('all')
    setQuEnablePerPiece(q.enablePerPiece ?? true)
    setQuEnableMinPerTrip(q.enableMinPerTrip ?? false)
    setQuMinPerTrip(q.minPerTrip ?? 0)
    setQuEnableWaive(q.enableWaive ?? false)
    setQuMinPerTripThreshold(q.minPerTripThreshold ?? 0)
    setQuEnableMinPerMonth(q.enableMinPerMonth ?? false)
    setQuMonthlyFlatRate(q.monthlyFlatRate ?? 0)
    setShowCreateQU(true)
  }

  // Validate only one accepted QT per customerName (6.2.4)
  const handleAcceptQT = (qtId: string) => {
    const qt = quotations.find(q => q.id === qtId)
    if (!qt) return
    const conflicting = quotations.find(q => q.id !== qtId && q.status === 'accepted' && q.customerId === qt.customerId)
    if (conflicting) {
      alert(`ลูกค้า "${qt.customerName}" มีใบเสนอราคาที่ตกลงแล้ว (${conflicting.quotationNumber}) อยู่แล้ว\nสามารถมีสถานะ "ตกลง" ได้เพียง 1 ใบต่อลูกค้าเท่านั้น`)
      return
    }
    updateQuotationStatus(qtId, 'accepted')
    // Auto sync: อัปเดต priceList + billing conditions ให้ลูกค้าอัตโนมัติ
    const cust = customers.find(c => c.id === qt.customerId)
    if (cust) {
      updateCustomer(cust.id, {
        enablePerPiece: qt.enablePerPiece ?? true,
        enableMinPerTrip: qt.enableMinPerTrip ?? false,
        minPerTrip: qt.minPerTrip ?? 0,
        enableWaive: qt.enableWaive ?? false,
        minPerTripThreshold: qt.minPerTripThreshold ?? 0,
        enableMinPerMonth: qt.enableMinPerMonth ?? false,
        monthlyFlatRate: qt.monthlyFlatRate ?? 0,
        priceList: qt.items.map(i => ({ code: i.code, price: i.pricePerUnit })),
      })
    }
  }

  const moveQuItem = (code: string, dir: 'up' | 'down') => {
    const idx = quItems.findIndex(i => i.code === code)
    if (idx < 0) return
    const newIdx = dir === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= quItems.length) return
    const arr = [...quItems]
    ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    setQuItems(arr)
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
    rows.push(['', '', '', 'รวม', String(detailBilling.subtotal)])
    if (detailBilling.vat > 0) rows.push(['', '', '', `VAT ${detailBilling.subtotal > 0 ? Math.round(detailBilling.vat / detailBilling.subtotal * 100) : 0}%`, String(detailBilling.vat)])
    rows.push(['', '', '', 'รวมทั้งสิ้น', String(detailBilling.grandTotal)])
    if (detailBilling.withholdingTax > 0) rows.push(['', '', '', `หัก ณ ที่จ่าย ${detailBilling.subtotal > 0 ? Math.round(detailBilling.withholdingTax / detailBilling.subtotal * 100) : 0}%`, String(detailBilling.withholdingTax)])
    rows.push(['', '', '', 'ยอดจ่ายสุทธิ', String(detailBilling.netPayable)])
    exportCSV(headers, rows, detailBilling.billingNumber)
  }

  const handleInvoiceCSV = () => {
    if (!detailInvoice) return
    const headers = ['รายการ', 'จำนวน', 'ราคา/หน่วย', 'รวม']
    const rows = detailInvoice.lineItems.map(item => [
      item.name, String(item.quantity), String(item.pricePerUnit), String(item.amount),
    ])
    rows.push(['', '', detailInvoice.vat > 0 ? 'รวมก่อน VAT' : 'รวม', String(detailInvoice.subtotal)])
    if (detailInvoice.vat > 0) rows.push(['', '', `VAT ${detailInvoice.subtotal > 0 ? Math.round(detailInvoice.vat / detailInvoice.subtotal * 100) : 0}%`, String(detailInvoice.vat)])
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
    if (confirm(`ยืนยันการลบใบวางบิล ${billing.billingNumber}?\n\nSD ที่จะถูกยกเลิกการวางบิล:\n${dnNumbers || '-'}\n\nลูกค้า: ${customer?.name || '-'}`)) {
      const dnIds = [...billing.deliveryNoteIds]
      const wbNumber = billing.billingNumber
      for (const dnId of billing.deliveryNoteIds) {
        updateDeliveryNote(dnId, { isBilled: false })
      }
      deleteBillingStatement(billingId)
      setShowDetail(null)
      setShowPrint(false)
      setReversedDnInfo({ dnIds, wbNumber })
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
        case 'items': va = a.items.length; vb = b.items.length; break
        case 'notes': va = a.notes || ''; vb = b.notes || ''; break
        case 'status': { const order = ['draft', 'sent', 'accepted', 'rejected']; va = order.indexOf(a.status); vb = order.indexOf(b.status); break }
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
        if (!inv.invoiceNumber.toLowerCase().includes(q) && !(customer?.shortName || '').toLowerCase().includes(q) && !(customer?.name || '').toLowerCase().includes(q)) return false
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
        case 'customer': { const ca = getCustomer(a.customerId); va = ca?.shortName || ca?.name || ''; const cb = getCustomer(b.customerId); vb = cb?.shortName || cb?.name || ''; break }
        case 'grandTotal': va = a.grandTotal; vb = b.grandTotal; break
        case 'isPrinted': va = a.isPrinted ? 1 : 0; vb = b.isPrinted ? 1 : 0; break
        case 'wb': va = billingStatements.find(bs => bs.id === a.billingStatementId)?.billingNumber || ''; vb = billingStatements.find(bs => bs.id === b.billingStatementId)?.billingNumber || ''; break
        case 'isPaid': va = a.isPaid ? 1 : 0; vb = b.isPaid ? 1 : 0; break
        default: va = a.issueDate; vb = b.issueDate
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [taxInvoices, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, ivFilter, billingStatements])

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
      {/* Post-Reverse WB Toast */}
      {reversedDnInfo && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
          <div className="flex items-center gap-2 text-emerald-800">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>ย้อน <span className="font-semibold">{reversedDnInfo.wbNumber}</span> สำเร็จ — SD {reversedDnInfo.dnIds.length} ใบ พร้อมวางบิลใหม่แล้ว</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const ids = reversedDnInfo.dnIds.join(',')
                setReversedDnInfo(null)
                router.push(`/dashboard/delivery?preselect=${ids}`)
              }}
              className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1">
              ดู SD ที่เกี่ยวข้อง →
            </button>
            <button onClick={() => setReversedDnInfo(null)} className="text-emerald-500 hover:text-emerald-700 p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
            setEditQuId(null)
            setQuCustomerId('')
            setQuCustomerName('')
            setQuCustomerContact('')
            setQuDate(todayISO())
            setQuValidDays(30)
            setQuConditions('1. ราคายังไม่รวมภาษีมูลค่าเพิ่ม 7%\n2. ระยะเวลาเครดิต 30 วัน\n3. บริการรับ-ส่งผ้าทุกวัน')
            setQuNotes('')
            setQuItems([...linenCatalog].sort((a, b) => a.sortOrder - b.sortOrder).map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice })))
            setQuSearch('')
            setQuFilterCat('all')
            setQuEnablePerPiece(true)
            setQuEnableMinPerTrip(false)
            setQuMinPerTrip(0)
            setQuEnableWaive(false)
            setQuMinPerTripThreshold(0)
            setQuEnableMinPerMonth(false)
            setQuMonthlyFlatRate(0)
            setQuNeedCustomerWarn(false)
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
                  <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="เลขที่" sortKey="billingNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="เดือน" sortKey="billingMonth" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ยอดรวม" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="จ่ายสุทธิ" sortKey="netPayable" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                  <SortableHeader label="IV" sortKey="iv" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                  <SortableHeader label="ชำระ" sortKey="paid" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBilling.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
                ) : filteredBilling.map(b => {
                  const customer = getCustomer(b.customerId)
                  return (
                    <tr key={b.id}
                      className={cn("border-b border-slate-100 cursor-pointer", activeWbId === b.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                      onClick={() => { setActiveWbId(b.id); setShowDetail(b.id) }}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedWbIds.includes(b.id)}
                          onChange={e => { if (e.target.checked) setSelectedWbIds(prev => [...prev, b.id]); else setSelectedWbIds(prev => prev.filter(id => id !== b.id)) }}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      <td className={cn("px-4 py-3 text-slate-600", sortedBg('date'))}>{formatDate(b.issueDate)}</td>
                      <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{customer?.shortName || customer?.name || '-'}</td>
                      <td className={cn("px-4 py-3 font-mono text-xs text-slate-600", sortedBg('billingNumber'))}>{b.billingNumber}</td>
                      <td className={cn("px-4 py-3 text-slate-600", sortedBg('billingMonth'))}>{b.billingMonth}</td>
                      <td className={cn("px-4 py-3 text-right text-slate-700", sortedBg('grandTotal'))}>{formatCurrency(b.grandTotal)}</td>
                      <td className={cn("px-4 py-3 text-right text-slate-700 font-medium", sortedBg('netPayable'))}>{formatCurrency(b.netPayable)}</td>
                      <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          b.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                          {b.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('iv'))} onClick={e => e.stopPropagation()}>
                        {(() => {
                          const ivInfo = wbInvoiceMap.get(b.id)
                          return ivInfo ? (
                            <button onClick={() => setShowInvoiceDetail(ivInfo.invoiceId)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                              <span className="font-mono">{ivInfo.invoiceNumber}</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">ยังไม่ออก</span>
                          )
                        })()}
                      </td>
                      <td className={cn("px-3 py-3 text-center", sortedBg('paid'))} onClick={e => e.stopPropagation()}>
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
                  <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="เลขที่" sortKey="invoiceNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ยอดรวม VAT" sortKey="grandTotal" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                  <SortableHeader label="WB" sortKey="wb" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                  <SortableHeader label="ชำระ" sortKey="isPaid" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">ยังไม่มีใบกำกับภาษี — สร้างจากใบวางบิล</td></tr>
                ) : filteredInvoices.map(inv => {
                  const customer = getCustomer(inv.customerId)
                  const wbInfo = ivBillingMap.get(inv.id)
                  return (
                    <tr key={inv.id}
                      className={cn("border-b border-slate-100 cursor-pointer", activeIvId === inv.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                      onClick={() => { setActiveIvId(inv.id); setShowInvoiceDetail(inv.id) }}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedIvIds.includes(inv.id)}
                          onChange={e => { if (e.target.checked) setSelectedIvIds(prev => [...prev, inv.id]); else setSelectedIvIds(prev => prev.filter(id => id !== inv.id)) }}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      <td className={cn("px-4 py-3 text-slate-600", sortedBg('date'))}>{formatDate(inv.issueDate)}</td>
                      <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{customer?.shortName || customer?.name || '-'}</td>
                      <td className={cn("px-4 py-3 font-mono text-xs text-slate-600", sortedBg('invoiceNumber'))}>{inv.invoiceNumber}</td>
                      <td className={cn("px-4 py-3 text-right text-slate-700 font-medium", sortedBg('grandTotal'))}>{formatCurrency(inv.grandTotal)}</td>
                      <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          inv.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                          {inv.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('wb'))} onClick={e => e.stopPropagation()}>
                        {wbInfo ? (
                          <button onClick={() => setShowDetail(wbInfo.billingId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200">
                            <span className="font-mono">{wbInfo.billingNumber}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : <span className="text-xs text-slate-400">-</span>}
                      </td>
                      <td className={cn("px-3 py-3 text-center", sortedBg('isPaid'))} onClick={e => e.stopPropagation()}>
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
                  <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customerName" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="เลขที่" sortKey="quotationNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="รายการ" sortKey="items" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                  <SortableHeader label="หมายเหตุ" sortKey="notes" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                  <SortableHeader label="สถานะ" sortKey="status" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
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
                    <tr key={q.id}
                      className={cn("border-b border-slate-100 cursor-pointer", activeQtId === q.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                      onClick={() => { setActiveQtId(q.id); setShowQuDetail(q.id) }}>
                      <td className={cn("px-4 py-3 text-slate-600", sortedBg('date'))}>{formatDate(q.date)}</td>
                      <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customerName'))}>{getCustomer(q.customerId)?.shortName || q.customerName}</td>
                      <td className={cn("px-4 py-3 font-mono text-xs text-slate-600", sortedBg('quotationNumber'))}>{q.quotationNumber}</td>
                      <td className={cn("px-4 py-3 text-center text-slate-500", sortedBg('items'))}>{q.items.length}</td>
                      <td className={cn("px-4 py-3 text-slate-500 text-sm max-w-[160px] truncate", sortedBg('notes'))}>{q.notes || '-'}</td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('status'))}>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end items-center">
                          {nextStatus && (
                            <button onClick={() => nextStatus === 'accepted' ? handleAcceptQT(q.id) : updateQuotationStatus(q.id, nextStatus)}
                              className="text-xs px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] rounded font-medium hover:bg-[#2bb8b8] inline-flex items-center gap-0.5">
                              {QUOTATION_STATUS_CONFIG[nextStatus].label} <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                          {q.status === 'sent' && (
                            <button onClick={() => updateQuotationStatus(q.id, 'rejected')}
                              className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">ปฏิเสธ</button>
                          )}
                          <button onClick={() => handleEditQT(q)}
                            title="แก้ไข (ย้อนสถานะกลับเป็นร่าง)"
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 inline-flex items-center gap-0.5">
                            <Edit2 className="w-3 h-3" />แก้ไข
                          </button>
                          <button onClick={() => {
                            if (confirm(`ลบใบเสนอราคา ${q.quotationNumber}?`)) deleteQuotation(q.id)
                          }}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                  <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
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

          {/* 5.1: Billing mode toggle */}
          {selCustomer && (selCustomer.enablePerPiece ?? true) && selDnIds.length > 0 && (
            <div className="flex items-center gap-4 py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-sm font-medium text-slate-600">รูปแบบวางบิล:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="billingMode" value="by_date" checked={billingMode === 'by_date'}
                  onChange={() => setBillingMode('by_date')} className="text-[#1B3A5C]" />
                <span className="text-sm text-slate-700">ตามวันที่ใบส่งของ</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="billingMode" value="by_item" checked={billingMode === 'by_item'}
                  onChange={() => setBillingMode('by_item')} className="text-[#1B3A5C]" />
                <span className="text-sm text-slate-700">แยกตามรายการผ้า</span>
              </label>
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
                    {previewBilling.vat > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">VAT {custVatRate}%</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(previewBilling.vat)}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">รวมทั้งสิ้น</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(previewBilling.grandTotal)}</td>
                    </tr>
                    {previewBilling.withholdingTax > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">หัก ณ ที่จ่าย {custWhtRate}%</td>
                        <td className="px-3 py-1.5 text-right text-red-600">-{formatCurrency(previewBilling.withholdingTax)}</td>
                      </tr>
                    )}
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
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailCustomer.shortName || detailCustomer.name}</strong></div>
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
                  {detailBilling.lineItems.map((item, idx) => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-2 py-1">
                        <input
                          value={item.name}
                          onChange={e => {
                            const updated = detailBilling.lineItems.map((li, i) => i === idx ? { ...li, name: e.target.value } : li)
                            updateBillingStatement(detailBilling.id, { lineItems: updated })
                          }}
                          className="w-full px-2 py-0.5 border border-transparent hover:border-slate-200 focus:border-[#3DD8D8] rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-transparent"
                        />
                      </td>
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
                  {detailBilling.vat > 0 && (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right">VAT {detailBilling.subtotal > 0 ? `${Math.round(detailBilling.vat / detailBilling.subtotal * 100)}%` : ''}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(detailBilling.vat)}</td>
                    </tr>
                  )}
                  {detailBilling.withholdingTax > 0 && (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right">หัก ณ ที่จ่าย {detailBilling.subtotal > 0 ? `${Math.round(detailBilling.withholdingTax / detailBilling.subtotal * 100)}%` : ''}</td>
                      <td className="px-3 py-1.5 text-right text-red-600">-{formatCurrency(detailBilling.withholdingTax)}</td>
                    </tr>
                  )}
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
      <Modal open={showPrint && !!detailBilling} onClose={() => setShowPrint(false)} title="ตรวจสอบข้อมูลก่อนพิมพ์" size="xl" className="print-target">
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
            <div className="flex items-center gap-6 mb-4 no-print">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!detailBilling.isPrinted}
                  onChange={e => updateBillingStatement(detailBilling.id, { isPrinted: e.target.checked })}
                  className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-blue-700 flex items-center gap-1"><Check className="w-4 h-4" />พิมพ์แล้ว</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!detailBilling.isExported}
                  onChange={e => updateBillingStatement(detailBilling.id, { isExported: e.target.checked })}
                  className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกแล้ว</span>
              </label>
            </div>
            <BillingPrint billing={detailBilling} customer={detailCustomer} company={companyInfo} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-billing" filename={detailBilling.billingNumber} onExportCSV={handleBillingCSV}
                onPrint={() => { if (!detailBilling.isPrinted) updateBillingStatement(detailBilling.id, { isPrinted: true }) }}
                onExportFile={() => { if (!detailBilling.isExported) updateBillingStatement(detailBilling.id, { isExported: true }) }} />
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal open={!!showInvoiceDetail} onClose={() => { setShowInvoiceDetail(null); setShowInvoicePrint(false) }} title={detailInvoice?.invoiceNumber || ''} size="lg">
        {detailInvoice && detailInvoiceCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">โรงแรม:</span> <strong>{detailInvoiceCustomer.shortName || detailInvoiceCustomer.name}</strong></div>
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
                  {detailInvoice.lineItems.map((item, idx) => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-2 py-1">
                        <input
                          value={item.name}
                          onChange={e => {
                            const updated = detailInvoice.lineItems.map((li, i) => i === idx ? { ...li, name: e.target.value } : li)
                            updateTaxInvoice(detailInvoice.id, { lineItems: updated })
                          }}
                          className="w-full px-2 py-0.5 border border-transparent hover:border-slate-200 focus:border-[#3DD8D8] rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-transparent"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.pricePerUnit)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t">
                    <td colSpan={3} className="px-3 py-1.5 text-right">{detailInvoice.vat > 0 ? 'รวมก่อน VAT' : 'รวม'}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(detailInvoice.subtotal)}</td>
                  </tr>
                  {detailInvoice.vat > 0 && (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-1.5 text-right">VAT {detailInvoice.subtotal > 0 ? `${Math.round(detailInvoice.vat / detailInvoice.subtotal * 100)}%` : ''}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(detailInvoice.vat)}</td>
                    </tr>
                  )}
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
            <div className="flex items-center gap-6 mb-4 no-print">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!detailInvoice.isPrinted}
                  onChange={e => updateTaxInvoice(detailInvoice.id, { isPrinted: e.target.checked })}
                  className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-blue-700 flex items-center gap-1"><Check className="w-4 h-4" />พิมพ์แล้ว</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!detailInvoice.isExported}
                  onChange={e => updateTaxInvoice(detailInvoice.id, { isExported: e.target.checked })}
                  className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกแล้ว</span>
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
              <ExportButtons targetId="print-tax-invoice" filename={detailInvoice.invoiceNumber} onExportCSV={handleInvoiceCSV}
                onPrint={() => { if (!detailInvoice.isPrinted) updateTaxInvoice(detailInvoice.id, { isPrinted: true }) }}
                onExportFile={() => { if (!detailInvoice.isExported) updateTaxInvoice(detailInvoice.id, { isExported: true }) }} />
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
                        <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">{billing.vat > 0 ? 'รวมก่อน VAT' : 'รวม'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(billing.subtotal)}</td>
                      </tr>
                      {billing.vat > 0 && (
                        <tr className="bg-slate-50">
                          <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">VAT {billing.subtotal > 0 ? `${Math.round(billing.vat / billing.subtotal * 100)}%` : ''}   </td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(billing.vat)}</td>
                        </tr>
                      )}
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

      {/* Create/Edit Quotation Modal */}
      <Modal open={showCreateQU} onClose={() => { setShowCreateQU(false); setEditQuId(null); setShowLoadFromQT(false) }} title={editQuId ? 'แก้ไขใบเสนอราคา (ย้อนกลับเป็นร่าง)' : 'สร้างใบเสนอราคา'} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ชื่อย่อลูกค้า</label>
              <select value={quCustomerId} onChange={e => {
                const cust = customers.find(c => c.id === e.target.value)
                setQuCustomerId(e.target.value)
                setQuCustomerName(cust?.name || '')
                setQuCustomerContact(cust?.contactName ? `${cust.contactName}${cust.contactPhone ? ` (${cust.contactPhone})` : ''}` : '')
                setQuNeedCustomerWarn(false)
                if (cust) {
                  setQuEnablePerPiece(cust.enablePerPiece ?? true)
                  setQuEnableMinPerTrip(cust.enableMinPerTrip ?? false)
                  setQuMinPerTrip(cust.minPerTrip ?? 0)
                  setQuEnableWaive(cust.enableWaive ?? false)
                  setQuMinPerTripThreshold(cust.minPerTripThreshold ?? 0)
                  setQuEnableMinPerMonth(cust.enableMinPerMonth ?? false)
                  setQuMonthlyFlatRate(cust.monthlyFlatRate ?? 0)
                  const linkedQT = quotations.find(q => q.status === 'accepted' && q.customerId === cust.id)
                  if (linkedQT) setQuItems([...linkedQT.items])
                }
              }}
                className={cn("w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none",
                  !quCustomerId ? "border-[#3DD8D8] ring-2 ring-[#3DD8D8]/40 bg-[#3DD8D8]/5" : "border-slate-200")}>
                <option value="">— เลือกจากลูกค้าในระบบ —</option>
                {customers.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
                ))}
              </select>
              {!quCustomerId && <p className="text-xs text-[#1B3A5C] mt-1 font-medium animate-pulse">↑ เริ่มต้นเลือกลูกค้าที่นี่ก่อน</p>}
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
          </div>

          {quNeedCustomerWarn && !quCustomerId && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              กรุณาเลือก "ชื่อย่อลูกค้า" ก่อนดำเนินการ
            </div>
          )}
          <div className="relative">
            {!quCustomerId && (
              <div className="absolute inset-0 z-10 cursor-not-allowed rounded-lg"
                onClick={() => setQuNeedCustomerWarn(true)} />
            )}
            <div className={cn(!quCustomerId && 'opacity-40 select-none')}>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-600">รายการผ้า + ราคา ({quItems.length} รายการ)</label>
              <div className="relative">
                <button type="button" onClick={() => { setShowLoadFromQT(!showLoadFromQT); setQuLoadQTSearch('') }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                  <FileText className="w-3.5 h-3.5" />โหลดจากใบเสนอราคา
                </button>
                {showLoadFromQT && (
                  <div className="absolute z-20 mt-1 right-0 w-80 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 flex flex-col">
                    <div className="sticky top-0 p-2 border-b border-slate-100 bg-white">
                      <input value={quLoadQTSearch} onChange={e => setQuLoadQTSearch(e.target.value)}
                        placeholder="พิมพ์ค้นหา..."
                        autoFocus
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {(() => {
                        const s = quLoadQTSearch.toLowerCase()
                        const filtered = quotations.filter(q => {
                          if (!s) return true
                          const cust = customers.find(c => c.id === q.customerId)
                          const shortName = cust?.shortName || ''
                          return q.quotationNumber.toLowerCase().includes(s) || shortName.toLowerCase().includes(s) || q.customerName.toLowerCase().includes(s)
                        })
                        if (filtered.length === 0) return <div className="px-3 py-2 text-xs text-slate-400">{quotations.length === 0 ? 'ไม่มีใบเสนอราคา' : 'ไม่พบรายการ'}</div>
                        return filtered.map(q => {
                          const cust = customers.find(c => c.id === q.customerId)
                          const displayName = cust?.shortName || q.customerName
                          return (
                            <button key={q.id} type="button" onClick={() => { setQuItems([...q.items]); setShowLoadFromQT(false) }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center gap-2">
                              <span className="font-mono font-medium text-slate-700">{q.quotationNumber}</span>
                              <span className="text-slate-500 truncate">{displayName}</span>
                              <span className={cn('ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px]', q.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                                {q.items.length} รายการ
                              </span>
                            </button>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mb-2">
              การแก้ไข ราคา และลำดับที่นี่มีผลกับใบเสนอราคานี้เท่านั้น — หากต้องการแก้ฐานข้อมูลรายการผ้า ไปที่เมนู "รายการผ้า"
            </div>
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
              <button type="button" onClick={() => {
                const existingCodes = new Set(quItems.map(i => i.code))
                const newItems = [...linenCatalog]
                  .filter(i => !existingCodes.has(i.code))
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice }))
                setQuItems([...quItems, ...newItems])
              }}
                className="text-xs px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                เลือกทั้งหมด
              </button>
              <button type="button" onClick={() => setQuItems([])}
                className="text-xs px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                ไม่เลือกเลย
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50">
                    <th className="text-center px-1 py-2 w-8"><Check className="w-3.5 h-3.5 mx-auto text-slate-400" /></th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
                    <th className="text-center px-1 py-2 font-medium text-slate-600 w-8">ลำดับ</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อ (ไทย)</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อ (EN)</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">หมวด</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-14">หน่วย</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ราคา/หน่วย</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Checked items — in quItems order */}
                  {quItems.map((item, idx) => {
                    const catItem = linenCatalog.find(i => i.code === item.code)
                    if (quSearch) {
                      const s = quSearch.toLowerCase()
                      if (!item.code.toLowerCase().includes(s) && !item.name.toLowerCase().includes(s) && !(catItem?.nameEn || '').toLowerCase().includes(s)) return null
                    }
                    if (quFilterCat !== 'all' && catItem?.category !== quFilterCat) return null
                    return (
                      <tr key={item.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-1 py-1 text-center">
                          <input type="checkbox" checked={true}
                            onChange={() => setQuItems(quItems.filter(i => i.code !== item.code))}
                            className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8] cursor-pointer" />
                        </td>
                        <td className="px-3 py-1 font-mono text-xs text-slate-600">{item.code}</td>
                        <td className="px-1 py-1 text-center text-xs text-slate-400">{idx + 1}</td>
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
                            className={cn("w-24 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none",
                              !item.pricePerUnit ? "border-red-400 bg-red-50" : "border-slate-200")} />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button type="button" onClick={() => moveQuItem(item.code, 'up')} disabled={idx === 0}
                              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 disabled:cursor-default transition-colors">
                              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button type="button" onClick={() => moveQuItem(item.code, 'down')} disabled={idx === quItems.length - 1}
                              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 disabled:cursor-default transition-colors">
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Unchecked items — catalog items not in quItems */}
                  {(() => {
                    const checkedCodes = new Set(quItems.map(i => i.code))
                    return [...linenCatalog]
                      .filter(cat => !checkedCodes.has(cat.code))
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map(catItem => {
                        if (quSearch) {
                          const s = quSearch.toLowerCase()
                          if (!catItem.code.toLowerCase().includes(s) && !catItem.name.toLowerCase().includes(s) && !(catItem.nameEn || '').toLowerCase().includes(s)) return null
                        }
                        if (quFilterCat !== 'all' && catItem.category !== quFilterCat) return null
                        return (
                          <tr key={catItem.code} className="border-t border-slate-100 opacity-40 hover:opacity-70">
                            <td className="px-1 py-1 text-center">
                              <input type="checkbox" checked={false}
                                onChange={() => setQuItems([...quItems, { code: catItem.code, name: catItem.name, pricePerUnit: catItem.defaultPrice }])}
                                className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8] cursor-pointer" />
                            </td>
                            <td className="px-3 py-1 font-mono text-xs text-slate-600">{catItem.code}</td>
                            <td className="px-1 py-1 text-center text-xs text-slate-400">-</td>
                            <td className="px-3 py-1 text-slate-700">{catItem.name}</td>
                            <td className="px-3 py-1 text-slate-500 text-xs">{catItem.nameEn || ''}</td>
                            <td className="px-3 py-1 text-xs text-slate-400">{getCategoryLabel(catItem.category)}</td>
                            <td className="px-3 py-1 text-xs text-slate-400">{catItem.unit || 'ชิ้น'}</td>
                            <td className="px-1 py-1 text-right text-xs text-slate-400">{catItem.defaultPrice ? formatCurrency(catItem.defaultPrice) : '-'}</td>
                            <td className="px-1 py-1"></td>
                          </tr>
                        )
                      })
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Option B: Billing conditions */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium text-slate-700">รูปแบบคิดเงิน</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={quEnablePerPiece} onChange={e => setQuEnablePerPiece(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
              <span className="text-sm text-slate-700">คิดตามหน่วย (per piece)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={quEnableMinPerTrip} onChange={e => setQuEnableMinPerTrip(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
              <span className="text-sm text-slate-700">มีขั้นต่ำ/ครั้ง</span>
            </label>
            {quEnableMinPerTrip && (
              <div className="ml-6 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 w-24">ขั้นต่ำ/ครั้ง (฿)</span>
                  <input type="number" min={0} value={quMinPerTrip || ''} onChange={e => setQuMinPerTrip(sanitizeNumber(e.target.value))}
                    className="w-28 px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={quEnableWaive} onChange={e => setQuEnableWaive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                  <span className="text-sm text-slate-600">เวฟขั้นต่ำถ้ายอดถึง (฿)</span>
                  {quEnableWaive && (
                    <input type="number" min={0} value={quMinPerTripThreshold || ''} onChange={e => setQuMinPerTripThreshold(sanitizeNumber(e.target.value))}
                      className="w-24 px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  )}
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={quEnableMinPerMonth} onChange={e => setQuEnableMinPerMonth(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
              <span className="text-sm text-slate-700">มีขั้นต่ำ/เดือน</span>
            </label>
            {quEnableMinPerMonth && (
              <div className="ml-6 flex items-center gap-2">
                <span className="text-sm text-slate-600 w-24">ขั้นต่ำ/เดือน (฿)</span>
                <input type="number" min={0} value={quMonthlyFlatRate || ''} onChange={e => setQuMonthlyFlatRate(sanitizeNumber(e.target.value))}
                  className="w-28 px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
            )}
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

            </div>{/* end opacity wrapper */}
          </div>{/* end relative wrapper */}

          <div className="space-y-2 pt-2">
            {quCustomerId && quItems.length > 0 && quItems.some(i => !i.pricePerUnit) && (
              <p className="text-xs text-red-500 text-right">กรุณาใส่ราคาให้ครบทุกรายการ — รายการที่ยังไม่มีราคาแสดงกรอบแดง</p>
            )}
            {quCustomerId && quItems.length === 0 && (
              <p className="text-xs text-red-500 text-right">ไม่มีรายการผ้า — กรุณาเพิ่มอย่างน้อย 1 รายการ</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreateQU(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={handleCreateQuotation} disabled={!quCustomerId || quItems.length === 0 || quItems.some(i => !i.pricePerUnit)}
                className="px-4 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium">
                บันทึก
              </button>
            </div>
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
              <div className="flex gap-2 items-center flex-wrap">
                {detailQuotation.status === 'draft' && (
                  <button onClick={() => updateQuotationStatus(detailQuotation.id, 'sent')}
                    className="text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">ส่งให้ลูกค้า</button>
                )}
                {detailQuotation.status === 'sent' && (
                  <>
                    <button onClick={() => handleAcceptQT(detailQuotation.id)}
                      className="text-sm px-3 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100">ตกลง</button>
                    <button onClick={() => updateQuotationStatus(detailQuotation.id, 'rejected')}
                      className="text-sm px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">ปฏิเสธ</button>
                  </>
                )}
                {detailQuotation.status === 'accepted' && detailQuotation.customerId && (() => {
                  const cust = getCustomer(detailQuotation.customerId!)
                  return cust ? (
                    <button onClick={() => {
                      updateCustomer(cust.id, {
                        enablePerPiece: detailQuotation.enablePerPiece ?? true,
                        enableMinPerTrip: detailQuotation.enableMinPerTrip ?? false,
                        minPerTrip: detailQuotation.minPerTrip ?? 0,
                        enableWaive: detailQuotation.enableWaive ?? false,
                        minPerTripThreshold: detailQuotation.minPerTripThreshold ?? 0,
                        enableMinPerMonth: detailQuotation.enableMinPerMonth ?? false,
                        monthlyFlatRate: detailQuotation.monthlyFlatRate ?? 0,
                        priceList: detailQuotation.items.map(i => ({ code: i.code, price: i.pricePerUnit })),
                      })
                      alert(`Sync ราคาให้ ${cust.shortName || cust.name} แล้ว`)
                    }}
                      className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 flex items-center gap-1"
                      title="Sync ราคาอีกครั้ง (ปกติ auto sync ตอนกดตกลงแล้ว)">
                      <RefreshCw className="w-3 h-3" />Sync ราคาซ้ำ
                    </button>
                  ) : null
                })()}
                <button onClick={() => {
                  if (confirm(`ลบใบเสนอราคา ${detailQuotation.quotationNumber}?`)) {
                    deleteQuotation(detailQuotation.id)
                    setShowQuDetail(null)
                  }
                }}
                  className="text-sm px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" />ลบ
                </button>
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
                          <td className="px-3 py-1.5 text-slate-800">{customer?.shortName || customer?.name || '-'}</td>
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
                          <td className="px-3 py-1.5 text-slate-800">{customer?.shortName || customer?.name || '-'}</td>
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
        {/* Select All row */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200 no-print">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedWbIds.every(id => billingStatements.find(b => b.id === id)?.isPrinted)}
                onChange={e => { for (const bId of selectedWbIds) updateBillingStatement(bId, { isPrinted: e.target.checked }) }}
                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-blue-700 flex items-center gap-1"><Check className="w-4 h-4" />พิมพ์แล้ว (ทุกรายการ)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedWbIds.every(id => billingStatements.find(b => b.id === id)?.isExported)}
                onChange={e => { for (const bId of selectedWbIds) updateBillingStatement(bId, { isExported: e.target.checked }) }}
                className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกแล้ว (ทุกรายการ)</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">พิมพ์ → "พิมพ์แล้ว" | JPG/PDF/CSV → "ส่งออกแล้ว"</p>
        </div>
        <div id="print-bulk-wb">
          {selectedWbIds.map((bId, idx) => {
            const b = billingStatements.find(x => x.id === bId)
            const cust = b ? getCustomer(b.customerId) : null
            if (!b || !cust) return null
            return (
              <div key={bId}>
                {idx > 0 && <div className="border-t-2 border-dashed border-slate-300 my-6 no-print" style={{ pageBreakBefore: 'always' }} />}
                {/* Per-doc status row */}
                <div className="flex items-center gap-4 mb-2 no-print">
                  <span className="text-xs font-mono text-slate-400">{b.billingNumber}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!b.isPrinted}
                      onChange={e => updateBillingStatement(b.id, { isPrinted: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-xs font-medium text-blue-700">พิมพ์แล้ว</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!b.isExported}
                      onChange={e => updateBillingStatement(b.id, { isExported: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs font-medium text-violet-700">ส่งออกแล้ว</span>
                  </label>
                </div>
                <BillingPrint billing={b} customer={cust} company={companyInfo} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-end mt-4 no-print">
          <ExportButtons
            targetId="print-bulk-wb"
            filename={`WB-bulk-${selectedWbIds.length}`}
            onExportCSV={() => handleWbListCSV(billingStatements.filter(b => selectedWbIds.includes(b.id)))}
            onPrint={() => { for (const bId of selectedWbIds) updateBillingStatement(bId, { isPrinted: true }) }}
            onExportFile={() => { for (const bId of selectedWbIds) updateBillingStatement(bId, { isExported: true }) }}
          />
        </div>
      </Modal>

      {/* IV Bulk Print Modal */}
      <Modal open={showIvBulkPrint} onClose={() => setShowIvBulkPrint(false)} title={`พิมพ์/ส่งออกใบกำกับภาษี (${selectedIvIds.length} ใบ)`} size="xl" className="print-target">
        {/* Select All row */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200 no-print">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedIvIds.every(id => taxInvoices.find(i => i.id === id)?.isPrinted)}
                onChange={e => { for (const ivId of selectedIvIds) updateTaxInvoice(ivId, { isPrinted: e.target.checked }) }}
                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-blue-700 flex items-center gap-1"><Check className="w-4 h-4" />พิมพ์แล้ว (ทุกรายการ)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedIvIds.every(id => taxInvoices.find(i => i.id === id)?.isExported)}
                onChange={e => { for (const ivId of selectedIvIds) updateTaxInvoice(ivId, { isExported: e.target.checked }) }}
                className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกแล้ว (ทุกรายการ)</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">พิมพ์ → "พิมพ์แล้ว" | JPG/PDF/CSV → "ส่งออกแล้ว"</p>
        </div>
        <div id="print-bulk-iv">
          {selectedIvIds.map((ivId, idx) => {
            const inv = taxInvoices.find(x => x.id === ivId)
            const cust = inv ? getCustomer(inv.customerId) : null
            if (!inv || !cust) return null
            const wb = billingStatements.find(b => b.id === inv.billingStatementId)
            return (
              <div key={ivId}>
                {idx > 0 && <div className="border-t-2 border-dashed border-slate-300 my-6 no-print" style={{ pageBreakBefore: 'always' }} />}
                {/* Per-doc status row */}
                <div className="flex items-center gap-4 mb-2 no-print">
                  <span className="text-xs font-mono text-slate-400">{inv.invoiceNumber}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!inv.isPrinted}
                      onChange={e => updateTaxInvoice(inv.id, { isPrinted: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-xs font-medium text-blue-700">พิมพ์แล้ว</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!!inv.isExported}
                      onChange={e => updateTaxInvoice(inv.id, { isExported: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs font-medium text-violet-700">ส่งออกแล้ว</span>
                  </label>
                </div>
                <TaxInvoicePrint invoice={inv} customer={cust} company={companyInfo} withholdingTax={wb?.withholdingTax} netPayable={wb?.netPayable} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-end mt-4 no-print">
          <ExportButtons
            targetId="print-bulk-iv"
            filename={`IV-bulk-${selectedIvIds.length}`}
            onExportCSV={() => handleIvListCSV(taxInvoices.filter(i => selectedIvIds.includes(i.id)))}
            onPrint={() => { for (const ivId of selectedIvIds) updateTaxInvoice(ivId, { isPrinted: true }) }}
            onExportFile={() => { for (const ivId of selectedIvIds) updateTaxInvoice(ivId, { isExported: true }) }}
          />
        </div>
      </Modal>
    </div>
  )
}
