'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FocusBanner from '@/components/FocusBanner'
import { useStore } from '@/lib/store'
import { formatCurrency, formatDate, formatNumber, cn, todayISO, startOfMonthISO, endOfMonthISO, sanitizeNumber, buildPriceMapFromQT, scrollToActiveRow, formatExportFilename } from '@/lib/utils'
import { format } from 'date-fns'
import { BILLING_STATUS_CONFIG, QUOTATION_STATUS_CONFIG, type BillingStatus, type QuotationStatus, type QuotationItem, type DeliveryNote, type BillingStatement, type TaxInvoice } from '@/types'
import { aggregateDeliveryItems, aggregateDeliveryItemsByDate, aggregateDeliveryItemsByTotal, calculateBillingTotals, createFlatRateBilling } from '@/lib/billing'
import { calculateTransportFeeTrip } from '@/lib/transport-fee'
import { Plus, Search, FileText, FileDown, X, ChevronRight, ChevronUp, ChevronDown, Printer, Check, ExternalLink, Trash2, Edit2 } from 'lucide-react'
import Modal from '@/components/Modal'
import DeleteWithRedirectModal from '@/components/DeleteWithRedirectModal'
import ExportButtons from '@/components/ExportButtons'
import PaymentRecordModal from '@/components/PaymentRecordModal'
import { canViewBilling } from '@/lib/permissions'
import { trackRecentCustomer, sortCustomersWithRecent, getRecentCustomerIds } from '@/lib/recent-customers'
import { exportCSV } from '@/lib/export'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import BillingPrint from '@/components/BillingPrint'
import TaxInvoicePrint from '@/components/TaxInvoicePrint'
import QuotationPrint from '@/components/QuotationPrint'

type TabKey = 'billing' | 'invoice' | 'quotation'

export default function BillingPage() {
  const {
    currentUser,
    billingStatements, addBillingStatement, updateBillingStatus, updateBillingStatement, deleteBillingStatement,
    taxInvoices, addTaxInvoice, updateTaxInvoice, deleteTaxInvoice,
    receipts, addReceipt, // 148
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
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState(() => endOfMonthISO())
  // 64: QT tab uses separate date filter state — default = empty (show all)
  const [qtDateFilterMode, setQtDateFilterMode] = useState<'single' | 'range'>('range')
  const [qtDateFrom, setQtDateFrom] = useState('')
  const [qtDateTo, setQtDateTo] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))

  // Sync tab + auto-open detail from URL params (cross-page navigation)
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'billing' || t === 'invoice' || t === 'quotation') setTab(t)

    // Auto-open WB detail
    const detailParam = searchParams.get('detail')
    if (detailParam) {
      setTab('billing')
      setActiveWbId(detailParam)
      setShowDetail(detailParam)
      scrollToActiveRow(detailParam)
    }
    // Auto-open QT detail (from customers page link)
    const openqt = searchParams.get('openqt')
    if (openqt) {
      setTab('quotation')
      setActiveQtId(openqt)
      setShowQuDetail(openqt)
      scrollToActiveRow(openqt)
    }
    // Auto-open IV detail
    const openiv = searchParams.get('openiv')
    if (openiv) {
      setTab('invoice')
      setActiveIvId(openiv)
      setShowInvoiceDetail(openiv)
      scrollToActiveRow(openiv)
    }
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
  // 138: customer filter สำหรับ WB + IV (pattern เดียวกับ QT/LF/SD)
  const [wbCustomerFilter, setWbCustomerFilter] = useState<string>('all')
  const [ivCustomerFilter, setIvCustomerFilter] = useState<string>('all')

  const router = useRouter()

  // Row highlight
  const [activeWbId, setActiveWbId] = useState<string | null>(null)
  const [activeIvId, setActiveIvId] = useState<string | null>(null)
  const [activeQtId, setActiveQtId] = useState<string | null>(null)

  // Bulk select state (WB, IV)
  const [selectedWbIds, setSelectedWbIds] = useState<string[]>([])
  const [selectedIvIds, setSelectedIvIds] = useState<string[]>([])

  // Focus mode (50): from ?focus=ID1,ID2 — apply to active tab (billing/invoice/quotation)
  const [focusIds, setFocusIds] = useState<string[]>(() => {
    const f = searchParams.get('focus')
    return f ? f.split(',').filter(Boolean) : []
  })
  const focusMode = focusIds.length > 0

  // Auto-open detail modal if focusing on single document (only on mount)
  const focusAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (focusAutoOpenedRef.current || focusIds.length !== 1) return
    focusAutoOpenedRef.current = true
    const id = focusIds[0]
    // Detect which entity this ID belongs to + open it
    if (billingStatements.some(b => b.id === id)) {
      setTab('billing')
      setActiveWbId(id)
      setShowDetail(id)
    } else if (taxInvoices.some(i => i.id === id)) {
      setTab('invoice')
      setActiveIvId(id)
      setShowInvoiceDetail(id)
    }
  }, [focusIds, billingStatements, taxInvoices])

  const exitFocus = () => {
    setFocusIds([])
    router.replace('/dashboard/billing')
  }
  const [showWbPrintList, setShowWbPrintList] = useState(false)
  const [showIvPrintList, setShowIvPrintList] = useState(false)
  const [showWbBulkPrint, setShowWbBulkPrint] = useState(false)
  const [showIvBulkPrint, setShowIvBulkPrint] = useState(false)

  // IV creation confirm modal
  const [showCreateIV, setShowCreateIV] = useState<string | null>(null) // billingId
  const [ivIssueDate, setIvIssueDate] = useState(todayISO())
  // 72: เลือก WB เพื่อสร้าง IV (จาก IV tab)
  const [showSelectWbForIv, setShowSelectWbForIv] = useState(false)
  // 82: Payment Record Modal
  const [paymentModalWbId, setPaymentModalWbId] = useState<string | null>(null)

  // Quotation state
  const [showCreateQU, setShowCreateQU] = useState(false)
  const [editQuId, setEditQuId] = useState<string | null>(null)
  const [showLoadFromQT, setShowLoadFromQT] = useState(false)
  const [quLoadQTSearch, setQuLoadQTSearch] = useState('')
  const [showQuDetail, setShowQuDetail] = useState<string | null>(null)
  const [showQuPrint, setShowQuPrint] = useState(false)

  // QT Accept confirmation modal
  const [pendingAcceptQTId, setPendingAcceptQTId] = useState<string | null>(null)
  const [sdUpdateMode, setSdUpdateMode] = useState<'none' | 'from_date' | 'this_month'>('none')
  const [sdUpdateFromDate, setSdUpdateFromDate] = useState(todayISO())
  const [quCustomerName, setQuCustomerName] = useState('')
  const [quCustomerContact, setQuCustomerContact] = useState('')
  const [quDate, setQuDate] = useState(todayISO())
  const [quValidDays, setQuValidDays] = useState(30)
  const [quConditions, setQuConditions] = useState('1. ราคายังไม่รวมภาษีมูลค่าเพิ่ม 7%\n2. ระยะเวลาเครดิต 30 วัน\n3. บริการรับ-ส่งผ้าทุกวัน')
  const [quNotes, setQuNotes] = useState('')
  const [quItems, setQuItems] = useState<{ code: string; name: string; pricePerUnit: number | null }[]>([])
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
    setQuItems(linenCatalog.map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice > 0 ? i.defaultPrice : null })))
    setShowCreateQU(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, customers, linenCatalog])

  const sortedCategories = useMemo(() =>
    [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
  , [linenCategories])

  // Billing mode (5.1)
  const [billingMode, setBillingMode] = useState<'by_date' | 'by_item' | 'by_total'>('by_date')

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
  const [billingDiscount, setBillingDiscount] = useState(0)
  const [billingDiscountNote, setBillingDiscountNote] = useState('')
  const [billingExtraCharge, setBillingExtraCharge] = useState(0)
  const [billingExtraChargeNote, setBillingExtraChargeNote] = useState('')

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

  // 64: separate matcher for QT tab (uses qtDate* state)
  const matchesQtDateFilter = (date: string) => {
    if (!qtDateFrom) return true
    if (qtDateFilterMode === 'single') return date === qtDateFrom
    if (date < qtDateFrom) return false
    if (qtDateTo && date > qtDateTo) return false
    return true
  }

  // Billing list
  const filteredBilling = useMemo(() => {
    return billingStatements.filter(b => {
      // Focus mode (50): bypass all other filters
      if (focusMode && tab === 'billing') return focusIds.includes(b.id)

      // 138: customer filter
      if (wbCustomerFilter !== 'all' && b.customerId !== wbCustomerFilter) return false

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
  }, [billingStatements, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, wbFilter, wbCustomerFilter, taxInvoices, focusMode, focusIds, tab])

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
    let baseItems: ReturnType<typeof aggregateDeliveryItems>
    if (!(selCustomer.enablePerPiece ?? true)) {
      if (flatRateBillExists) return null
      const flatResult = createFlatRateBilling(selCustomer, selMonth, custVatRate, custWhtRate)
      baseItems = flatResult.lineItems
    } else {
      const selectedNotes = deliveryNotes.filter(dn => selDnIds.includes(dn.id))
      if (selectedNotes.length === 0) return null
      const linkedQT = quotations.find(q => q.status === 'accepted' && q.customerId === selCustomer.id)
      baseItems = billingMode === 'by_date'
        ? aggregateDeliveryItemsByDate(selectedNotes, selCustomer, linkedQT?.items)
        : billingMode === 'by_total'
          ? aggregateDeliveryItemsByTotal(selectedNotes, selCustomer, linkedQT?.items)
          : aggregateDeliveryItems(selectedNotes, selCustomer, linenCatalog, linkedQT?.items)
    }
    let lineItems = [...baseItems]
    if (billingExtraCharge > 0) {
      lineItems.push({ code: 'EXTRA_CHARGE', name: `ค่าใช้จ่ายเพิ่มเติม${billingExtraChargeNote ? ` (${billingExtraChargeNote})` : ''}`, quantity: 1, pricePerUnit: billingExtraCharge, amount: billingExtraCharge })
    }
    if (billingDiscount > 0) {
      lineItems.push({ code: 'DISCOUNT', name: `ส่วนลด${billingDiscountNote ? ` (${billingDiscountNote})` : ''}`, quantity: 1, pricePerUnit: -billingDiscount, amount: -billingDiscount })
    }
    return { lineItems, ...calculateBillingTotals(lineItems, custVatRate, custWhtRate) }
  }, [selCustomer, selMonth, deliveryNotes, selDnIds, linenCatalog, flatRateBillExists, billingMode, quotations, custVatRate, custWhtRate, billingDiscount, billingDiscountNote, billingExtraCharge, billingExtraChargeNote])

  const handleCreateBilling = () => {
    if (!selCustomer || !previewBilling) return
    const dueDate = new Date(billingIssueDate)
    dueDate.setDate(dueDate.getDate() + selCustomer.creditDays)

    const newWB = addBillingStatement({
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
      status: 'sent',
      paidDate: null,
      paidAmount: 0,
      notes: '',
      billingMode,
    })
    setActiveWbId(newWB.id)
    scrollToActiveRow(newWB.id)

    // Mark selected delivery notes as billed
    for (const dnId of selDnIds) {
      updateDeliveryNote(dnId, { isBilled: true })
    }

    setShowCreate(false)
  }

  const handleCreateTaxInvoice = (billingId: string) => {
    const billing = billingStatements.find(b => b.id === billingId)
    if (!billing) return
    if (taxInvoices.some(ti => ti.billingStatementId === billingId)) {
      alert('ใบกำกับภาษีของบิลนี้มีอยู่แล้ว')
      return
    }
    // 145: ลูกค้าที่ไม่คิด VAT → ออกใบกำกับภาษีไม่ได้ (fail-safe guard)
    const customer = getCustomer(billing.customerId)
    if (customer && customer.enableVat === false) {
      alert('⚠ ลูกค้าที่ไม่คิด VAT จะออกใบกำกับภาษีไม่ได้\n\nใบกำกับภาษี (Tax Invoice) ต้องมี VAT ตามกฎหมายภาษี — ถ้าต้องการเปิดใช้งาน VAT ให้ไปแก้ที่หน้าลูกค้า\n\n→ ใช้ "ออกใบเสร็จรับเงิน (RC)" แทน')
      return
    }
    setIvIssueDate(todayISO())
    setShowCreateIV(billingId)
  }

  // 148: Receipt (RC) — เฉพาะลูกค้าไม่คิด VAT
  const handleCreateReceipt = (billingId: string) => {
    const billing = billingStatements.find(b => b.id === billingId)
    if (!billing) return
    if (receipts.some(rc => rc.billingStatementId === billingId)) {
      alert('ใบเสร็จรับเงินของบิลนี้มีอยู่แล้ว')
      return
    }
    const customer = getCustomer(billing.customerId)
    if (!customer) return
    // Guard: เฉพาะลูกค้า enableVat=false
    if (customer.enableVat !== false) {
      alert('⚠ ลูกค้านี้คิด VAT — ใช้ "ออกใบกำกับภาษี (IV)" แทน')
      return
    }

    // Confirm
    if (!confirm(`ออกใบเสร็จรับเงิน (RC) สำหรับ ${customer.shortName || customer.name}?\n\nยอด: ${formatCurrency(billing.netPayable)}\n\n⚠ ใบเสร็จนี้ไม่ใช่ใบกำกับภาษี — ใช้เป็นหลักฐานการชำระเงินเท่านั้น`)) return

    // Build line items — collapse service lines + transport + adjustments (เหมือน IV pattern)
    let rcLineItems = billing.lineItems
    if (billing.deliveryNoteIds.length > 0) {
      const transportCodes = new Set(['TRANSPORT_TRIP', 'TRANSPORT_MONTH'])
      const adjustmentCodes = new Set(['EXTRA_CHARGE', 'DISCOUNT'])
      const serviceLines = billing.lineItems.filter(i => !transportCodes.has(i.code) && !adjustmentCodes.has(i.code))
      const transportLines = billing.lineItems.filter(i => transportCodes.has(i.code))
      const adjustmentLines = billing.lineItems.filter(i => adjustmentCodes.has(i.code))
      if (serviceLines.length > 0) {
        const serviceTotal = serviceLines.reduce((s, i) => s + i.amount, 0)
        const dnDates = billing.deliveryNoteIds
          .map(id => deliveryNotes.find(d => d.id === id)?.date)
          .filter(Boolean)
          .sort() as string[]
        const dateLabel = dnDates.length > 0
          ? (dnDates[0] === dnDates[dnDates.length - 1] ? `${dnDates[0]}` : `${dnDates[0]} - ${dnDates[dnDates.length - 1]}`)
          : billing.billingMonth
        rcLineItems = [
          { code: 'SERVICE', name: `ค่าบริการซักวันที่ ${dateLabel}`, quantity: 1, pricePerUnit: serviceTotal, amount: serviceTotal },
          ...transportLines,
          ...adjustmentLines,
        ]
      }
    }

    const newRC = addReceipt({
      billingStatementId: billingId,
      customerId: billing.customerId,
      issueDate: todayISO(),
      lineItems: rcLineItems,
      subtotal: billing.subtotal,
      grandTotal: billing.subtotal, // no VAT
      notes: '',
    })
    // Navigate to RC detail
    setShowDetail(null)
    router.push(`/dashboard/receipts?detail=${newRC.id}`)
  }

  const handleConfirmCreateIV = () => {
    if (!showCreateIV) return
    const billing = billingStatements.find(b => b.id === showCreateIV)
    if (!billing) return

    // 85: Collapse service lines → 1 line สำหรับ ทุก billing mode (by_date / by_item / by_total)
    // ค่าบริการซัก = 1 บรรทัดเดียวตามช่วงเวลา (ก่อน discount/extra)
    // ค่ารถ + DN-level/billing-level discount/extra → แสดงแยกบรรทัดเพื่อชี้แจง
    // Skip flat-rate (no DN) — keep original line as-is
    let ivLineItems = billing.lineItems
    if (billing.deliveryNoteIds.length > 0) {
      const transportCodes = new Set(['TRANSPORT_TRIP', 'TRANSPORT_MONTH'])
      const adjustmentCodes = new Set(['EXTRA_CHARGE', 'DISCOUNT'])
      const serviceLines = billing.lineItems.filter(i => !transportCodes.has(i.code) && !adjustmentCodes.has(i.code))
      const transportLines = billing.lineItems.filter(i => transportCodes.has(i.code))
      const adjustmentLines = billing.lineItems.filter(i => adjustmentCodes.has(i.code))
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
          ...adjustmentLines,
        ]
      }
    }

    const newIV = addTaxInvoice({
      billingStatementId: showCreateIV,
      customerId: billing.customerId,
      issueDate: ivIssueDate,
      lineItems: ivLineItems,
      subtotal: billing.subtotal,
      vat: billing.vat,
      grandTotal: billing.grandTotal,
      notes: '',
    })
    // 65: หลังออก IV → switch ไป IV tab + เปิด IV detail modal ทันที
    setShowCreateIV(null)
    setShowDetail(null)
    setTab('invoice')
    setActiveIvId(newIV.id)
    setShowInvoiceDetail(newIV.id)
    scrollToActiveRow(newIV.id)
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
      items: quItems.filter(i => i.pricePerUnit !== null).map(i => ({ code: i.code, name: i.name, pricePerUnit: i.pricePerUnit as number })),
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
      setActiveQtId(editQuId)
    } else {
      const newQT = addQuotation(qtData)
      setActiveQtId(newQT.id)
      scrollToActiveRow(newQT.id)
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

  // Accept QT — show confirmation modal with price diff + SD update options
  const handleAcceptQT = (qtId: string) => {
    setSdUpdateMode('none')
    setSdUpdateFromDate(startOfMonthISO())
    setPendingAcceptQTId(qtId)
  }

  // Actually execute QT accept after user confirms
  const confirmAcceptQT = () => {
    const qtId = pendingAcceptQTId
    if (!qtId) return
    const qt = quotations.find(q => q.id === qtId)
    if (!qt) return

    // Auto-reject old accepted QT for same customer (ลบช่องว่าง)
    const oldAccepted = quotations.find(q => q.id !== qtId && q.status === 'accepted' && q.customerId === qt.customerId)
    if (oldAccepted) {
      updateQuotationStatus(oldAccepted.id, 'rejected')
    }

    // Record priceHistory
    const cust = customers.find(c => c.id === qt.customerId)
    if (cust) {
      const oldPriceMap = buildPriceMapFromQT(qt.customerId, quotations)
      const newPriceMap = Object.fromEntries(qt.items.map(i => [i.code, i.pricePerUnit]))
      const priceChanges: { code: string; oldPrice: number; newPrice: number; effectiveDate: string; changedBy: string }[] = []
      for (const item of qt.items) {
        const oldP = oldPriceMap[item.code] ?? 0
        if (oldP !== item.pricePerUnit) {
          priceChanges.push({ code: item.code, oldPrice: oldP, newPrice: item.pricePerUnit, effectiveDate: todayISO(), changedBy: `QT ${qt.quotationNumber}` })
        }
      }
      for (const code of Object.keys(oldPriceMap)) {
        if (!newPriceMap[code]) {
          priceChanges.push({ code, oldPrice: oldPriceMap[code], newPrice: 0, effectiveDate: todayISO(), changedBy: `QT ${qt.quotationNumber}` })
        }
      }
      if (priceChanges.length > 0) {
        updateCustomer(cust.id, { priceHistory: [...cust.priceHistory, ...priceChanges] })
      }
    }

    updateQuotationStatus(qtId, 'accepted')

    // Auto sync billing conditions
    if (cust) {
      updateCustomer(cust.id, {
        enablePerPiece: qt.enablePerPiece ?? true,
        enableMinPerTrip: qt.enableMinPerTrip ?? false,
        minPerTrip: qt.minPerTrip ?? 0,
        enableWaive: qt.enableWaive ?? false,
        minPerTripThreshold: qt.minPerTripThreshold ?? 0,
        enableMinPerMonth: qt.enableMinPerMonth ?? false,
        monthlyFlatRate: qt.monthlyFlatRate ?? 0,
      })
    }

    // Update SD priceSnapshots + recalculate transport fees if requested
    if (sdUpdateMode !== 'none' && cust) {
      const newSnapshot = Object.fromEntries(qt.items.map(i => [i.code, i.pricePerUnit]))
      const fromDate = sdUpdateMode === 'this_month' ? startOfMonthISO() : sdUpdateFromDate
      const targetDNs = deliveryNotes.filter(dn =>
        dn.customerId === qt.customerId && dn.date >= fromDate && !dn.isBilled
      )
      // Build customer with ALL billing conditions from new QT (63: complete coverage)
      const updatedCust: typeof cust = {
        ...cust,
        enablePerPiece: qt.enablePerPiece ?? true,
        enableMinPerTrip: qt.enableMinPerTrip ?? false,
        minPerTrip: qt.minPerTrip ?? 0,
        enableWaive: qt.enableWaive ?? false,
        minPerTripThreshold: qt.minPerTripThreshold ?? 0,
        enableMinPerMonth: qt.enableMinPerMonth ?? false,
        monthlyFlatRate: qt.monthlyFlatRate ?? 0,
      }
      // Step 1: Update each target DN — new priceSnapshot + recalc transportFeeTrip
      // (transportFeeTrip uses enableWaive + minPerTripThreshold inside calculateTransportFeeTrip)
      const targetIds = new Set(targetDNs.map(d => d.id))
      for (const dn of targetDNs) {
        const newSubtotal = dn.items.reduce((s, item) => item.isClaim ? s : s + item.quantity * (newSnapshot[item.code] || 0), 0)
        const newTripFee = calculateTransportFeeTrip(newSubtotal, updatedCust)
        updateDeliveryNote(dn.id, { priceSnapshot: newSnapshot, transportFeeTrip: newTripFee })
      }

      // Step 2 (63): Recalc transportFeeMonth for affected months
      // Month fee goes on the LAST DN of each month (if not billed)
      if (updatedCust.enableMinPerMonth && updatedCust.monthlyFlatRate > 0) {
        const affectedMonths = new Set(targetDNs.map(d => d.date.slice(0, 7)))
        const fallbackPriceMap = Object.fromEntries(cust.priceList.map(p => [p.code, p.price]))

        for (const month of affectedMonths) {
          // All DNs in this month for this customer (sorted newest first)
          const monthDNs = deliveryNotes
            .filter(d => d.customerId === qt.customerId && d.date.startsWith(month))
            .sort((a, b) => b.date.localeCompare(a.date))

          const lastDN = monthDNs[0]
          if (!lastDN || lastDN.isBilled) continue // ห้ามแก้ DN ที่ billed แล้ว

          // Calc subtotal + tripFee for each DN — use new values for target DNs, original for others
          const calcDN = (d: typeof lastDN) => {
            const isTarget = targetIds.has(d.id)
            const pm = isTarget ? newSnapshot : (d.priceSnapshot || fallbackPriceMap)
            const subtotal = d.items.reduce((s, item) => item.isClaim ? s : s + item.quantity * (pm[item.code] || 0), 0)
            const tripFee = isTarget ? calculateTransportFeeTrip(subtotal, updatedCust) : (d.transportFeeTrip || 0)
            return { subtotal, tripFee }
          }

          // Sum month total = all DNs except last + last DN
          const otherDNs = monthDNs.filter(d => d.id !== lastDN.id)
          const otherTotal = otherDNs.reduce((sum, d) => {
            const { subtotal, tripFee } = calcDN(d)
            return sum + subtotal + tripFee
          }, 0)
          const last = calcDN(lastDN)
          const monthTotal = otherTotal + last.subtotal + last.tripFee

          const newMonthFee = monthTotal < updatedCust.monthlyFlatRate
            ? updatedCust.monthlyFlatRate - monthTotal
            : 0

          updateDeliveryNote(lastDN.id, { transportFeeMonth: newMonthFee })
        }
      }
    }

    setPendingAcceptQTId(null)
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
    exportCSV(headers, rows, formatExportFilename(detailBilling.billingNumber, detailCustomer?.shortName || detailCustomer?.name, detailBilling.issueDate))
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
    exportCSV(headers, rows, formatExportFilename(detailInvoice.invoiceNumber, getCustomer(detailInvoice.customerId)?.shortName || getCustomer(detailInvoice.customerId)?.name, detailInvoice.issueDate))
  }

  const handleQuotationCSV = () => {
    if (!detailQuotation) return
    const headers = ['รหัส', 'รายการ', 'ราคา/หน่วย']
    const rows = detailQuotation.items.map(item => [
      item.code, item.name, String(item.pricePerUnit),
    ])
    exportCSV(headers, rows, formatExportFilename(detailQuotation.quotationNumber, detailQuotation.customerName, detailQuotation.date))
  }

  // List CSV handlers for bulk export
  const handleWbListCSV = (items: BillingStatement[]) => {
    const headers = ['ลำดับ', 'เลขที่ WB', 'ลูกค้า', 'เดือน', 'ยอดจ่ายสุทธิ', 'สถานะ']
    const rows = items.map((b, idx) => [
      String(idx + 1), b.billingNumber, getCustomer(b.customerId)?.name || '-',
      b.billingMonth, String(b.netPayable), BILLING_STATUS_CONFIG[b.status]?.label || b.status,
    ])
    exportCSV(headers, rows, 'รายการใบวางบิล')
  }

  const handleIvListCSV = (items: TaxInvoice[]) => {
    const headers = ['ลำดับ', 'เลขที่ IV', 'ลูกค้า', 'วันที่ออก', 'ยอดรวม']
    const rows = items.map((inv, idx) => [
      String(idx + 1), inv.invoiceNumber, getCustomer(inv.customerId)?.name || '-',
      inv.issueDate, String(inv.grandTotal),
    ])
    exportCSV(headers, rows, 'รายการใบกำกับภาษี')
  }

  // Reverse IV (50.2): use DeleteWithRedirectModal — เลือก "อยู่หน้านี้" หรือ "ไปแก้ WB"
  const [pendingReverseIV, setPendingReverseIV] = useState<{ id: string; number: string; linkedWbId: string; linkedWbNumber: string } | null>(null)

  const openReverseIVConfirm = (invoiceId: string) => {
    const inv = taxInvoices.find(i => i.id === invoiceId)
    if (!inv) return
    const linkedWB = billingStatements.find(b => b.id === inv.billingStatementId)
    setPendingReverseIV({
      id: invoiceId,
      number: inv.invoiceNumber,
      linkedWbId: inv.billingStatementId,
      linkedWbNumber: linkedWB?.billingNumber || '-',
    })
  }

  const handleReverseIVAndStay = () => {
    if (!pendingReverseIV) return
    deleteTaxInvoice(pendingReverseIV.id)
    setShowInvoiceDetail(null)
    setShowInvoicePrint(false)
    setPendingReverseIV(null)
  }

  const handleReverseIVAndRedirect = () => {
    if (!pendingReverseIV) return
    const wbId = pendingReverseIV.linkedWbId
    deleteTaxInvoice(pendingReverseIV.id)
    setShowInvoiceDetail(null)
    setShowInvoicePrint(false)
    setPendingReverseIV(null)
    // Switch to billing tab + focus mode + auto-open detail
    if (wbId) {
      setTab('billing')
      setFocusIds([wbId])
      setActiveWbId(wbId)
      setShowDetail(wbId)
      scrollToActiveRow(wbId)
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
      if (!matchesQtDateFilter(q.date)) return false
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
  }, [quotations, qtCustomerFilter, search, qtDateFrom, qtDateTo, qtDateFilterMode, sortKey, sortDir])

  // Invoice list (filtered + sorted)
  const filteredInvoices = useMemo(() => {
    return taxInvoices.filter(inv => {
      // 138: customer filter
      if (ivCustomerFilter !== 'all' && inv.customerId !== ivCustomerFilter) return false

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
  }, [taxInvoices, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, ivFilter, ivCustomerFilter, billingStatements])

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

  // 69: Page-level guard
  if (!canViewBilling(currentUser)) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Accountant และ Admin เท่านั้น</p>
      </div>
    )
  }

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
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสารที่เลือก ({selectedWbIds.length})
              </button>
            )}
            <button onClick={() => setShowWbPrintList(true)} disabled={filteredBilling.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
              <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
            </button>
            <button onClick={() => { setShowCreate(true); setSelCustomerId(''); setBillingIssueDate(todayISO()) }}
              className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" />สร้างใบวางบิล
            </button>
          </div>
        )}
        {tab === 'invoice' && (
          <div className="flex items-center gap-2">
            {selectedIvIds.length > 0 && (
              <button onClick={() => setShowIvBulkPrint(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสารที่เลือก ({selectedIvIds.length})
              </button>
            )}
            <button onClick={() => setShowIvPrintList(true)} disabled={filteredInvoices.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
              <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
            </button>
            {/* 72: เพิ่มปุ่มสร้าง IV ใน IV tab — pattern เดียวกับ WB/QT */}
            <button onClick={() => setShowSelectWbForIv(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" />สร้างใบกำกับภาษี
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
            setQuItems([...linenCatalog].sort((a, b) => a.sortOrder - b.sortOrder).map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice > 0 ? i.defaultPrice : null })))
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
            className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
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
        {/* 138: customer filter toggle — teal เมื่อ active (ตรงกับปุ่มสร้าง) */}
        {tab === 'quotation' && (
          <select value={qtCustomerFilter} onChange={e => setQtCustomerFilter(e.target.value)}
            className={cn(
              'px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none font-medium transition-colors',
              qtCustomerFilter === 'all'
                ? 'border-slate-200 text-slate-600'
                : 'bg-[#3DD8D8] border-[#3DD8D8] text-[#1B3A5C]',
            )}>
            <option value="all">ทุกลูกค้า</option>
            {qtCustomerNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        {tab === 'billing' && (
          <select value={wbCustomerFilter} onChange={e => setWbCustomerFilter(e.target.value)}
            className={cn(
              'px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none font-medium transition-colors',
              wbCustomerFilter === 'all'
                ? 'border-slate-200 text-slate-600'
                : 'bg-[#3DD8D8] border-[#3DD8D8] text-[#1B3A5C]',
            )}>
            <option value="all">ทุกลูกค้า</option>
            {customers.filter(c => c.isActive).map(c => (
              <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
            ))}
          </select>
        )}
        {tab === 'invoice' && (
          <select value={ivCustomerFilter} onChange={e => setIvCustomerFilter(e.target.value)}
            className={cn(
              'px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none font-medium transition-colors',
              ivCustomerFilter === 'all'
                ? 'border-slate-200 text-slate-600'
                : 'bg-[#3DD8D8] border-[#3DD8D8] text-[#1B3A5C]',
            )}>
            <option value="all">ทุกลูกค้า</option>
            {customers.filter(c => c.isActive).map(c => (
              <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-4">
        {tab === 'quotation' ? (
          // 64: QT tab uses separate date state — default = empty (show all)
          <DateFilter dateFrom={qtDateFrom} dateTo={qtDateTo} mode={qtDateFilterMode}
            onModeChange={setQtDateFilterMode} onDateFromChange={setQtDateFrom}
            onDateToChange={setQtDateTo} onClear={() => { setQtDateFrom(''); setQtDateTo('') }} />
        ) : (
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} mode={dateFilterMode}
            onModeChange={setDateFilterMode} onDateFromChange={setDateFrom}
            onDateToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
        )}
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
                wbFilter === f.key ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
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
                ivFilter === f.key ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Focus Mode Banner (50, 67: ตำแหน่งเดียวกับ SD/LF — เหนือตาราง) */}
      {focusMode && (
        <FocusBanner
          count={focusIds.length}
          docNumbers={focusIds.map(id =>
            billingStatements.find(b => b.id === id)?.billingNumber ||
            taxInvoices.find(i => i.id === id)?.invoiceNumber ||
            ''
          ).filter(Boolean)}
          docType={tab === 'billing' ? 'ใบวางบิล' : tab === 'invoice' ? 'ใบกำกับภาษี' : 'เอกสาร'}
          onExit={exitFocus}
        />
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
                      data-row-id={b.id}
                      className={cn("border-b border-slate-100 cursor-pointer", activeWbId === b.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                      onClick={() => { setActiveWbId(b.id); setShowDetail(b.id) }}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedWbIds.includes(b.id)}
                          onChange={e => { if (e.target.checked) setSelectedWbIds(prev => [...prev, b.id]); else setSelectedWbIds(prev => prev.filter(id => id !== b.id)) }}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      {/* 135.4: date + customer = เด่น, billingNumber = muted */}
                      <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(b.issueDate)}</td>
                      <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{customer?.shortName || customer?.name || '-'}</td>
                      <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('billingNumber'))}>{b.billingNumber}</td>
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
                            <button onClick={() => {
                              // 81: switch ไป IV tab + open detail
                              setTab('invoice')
                              setActiveIvId(ivInfo.invoiceId)
                              setShowInvoiceDetail(ivInfo.invoiceId)
                              scrollToActiveRow(ivInfo.invoiceId)
                            }}
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
                        {(() => {
                          // 82: คลิก → เปิด PaymentRecordModal
                          const isPaid = b.status === 'paid'
                          const hasPartial = !isPaid && b.paidAmount > 0
                          return (
                            <button
                              onClick={() => setPaymentModalWbId(b.id)}
                              title={hasPartial ? `รับเงินบางส่วน: ${formatCurrency(b.paidAmount)}` : ''}
                              className={cn('px-2 py-0.5 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1',
                                isPaid ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : hasPartial ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                              {hasPartial && <span title="รับเงินบางส่วน">⚠</span>}
                              {isPaid ? 'ชำระแล้ว' : hasPartial ? 'ยังไม่ชำระ' : 'ยังไม่ชำระ'}
                            </button>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {/* 93/Option B: ลบปุ่ม "วางบิล" — สร้าง WB → status='sent' เลย ไม่ผ่าน draft */}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* 127: Totals footer — sum of displayed WBs */}
              {filteredBilling.length > 0 && (() => {
                const totalGrand = filteredBilling.reduce((s, b) => s + b.grandTotal, 0)
                const totalNet = filteredBilling.reduce((s, b) => s + b.netPayable, 0)
                return (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                      <td className="px-2 py-3"></td>
                      <td colSpan={4} className="px-4 py-3 text-slate-700">
                        รวม {filteredBilling.length} รายการ
                      </td>
                      <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(totalGrand)}</td>
                      <td className="px-4 py-3 text-right text-[#1B3A5C]">{formatCurrency(totalNet)}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                )
              })()}
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
                      data-row-id={inv.id}
                      className={cn("border-b border-slate-100 cursor-pointer", activeIvId === inv.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                      onClick={() => { setActiveIvId(inv.id); setShowInvoiceDetail(inv.id) }}>
                      <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedIvIds.includes(inv.id)}
                          onChange={e => { if (e.target.checked) setSelectedIvIds(prev => [...prev, inv.id]); else setSelectedIvIds(prev => prev.filter(id => id !== inv.id)) }}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                      </td>
                      {/* 135.4: date + customer = เด่น, invoiceNumber = muted */}
                      <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(inv.issueDate)}</td>
                      <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>{customer?.shortName || customer?.name || '-'}</td>
                      <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('invoiceNumber'))}>{inv.invoiceNumber}</td>
                      <td className={cn("px-4 py-3 text-right text-slate-700 font-medium", sortedBg('grandTotal'))}>{formatCurrency(inv.grandTotal)}</td>
                      <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          inv.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                          {inv.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 text-center", sortedBg('wb'))} onClick={e => e.stopPropagation()}>
                        {wbInfo ? (
                          <button onClick={() => {
                            // 68: switch ไป WB tab + auto open WB detail
                            setTab('billing')
                            setActiveWbId(wbInfo.billingId)
                            setShowDetail(wbInfo.billingId)
                            scrollToActiveRow(wbInfo.billingId)
                          }}
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
              {/* 127: Totals footer — sum of displayed IVs */}
              {filteredInvoices.length > 0 && (() => {
                const totalGrand = filteredInvoices.reduce((s, inv) => s + inv.grandTotal, 0)
                return (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                      <td className="px-2 py-3"></td>
                      <td colSpan={3} className="px-4 py-3 text-slate-700">
                        รวม {filteredInvoices.length} รายการ
                      </td>
                      <td className="px-4 py-3 text-right text-[#1B3A5C]">{formatCurrency(totalGrand)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </div>
      )}

      {/* Quotation Tab */}
      {tab === 'quotation' && (() => {
        // Warn: customers with SDs but no accepted QT (prices would be 0)
        const customersWithoutQT = customers.filter(c => {
          const hasAcceptedQT = quotations.some(q => q.customerId === c.id && q.status === 'accepted')
          const hasSD = deliveryNotes.some(d => d.customerId === c.id)
          return !hasAcceptedQT && hasSD && c.isActive
        })
        return <>
        {customersWithoutQT.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-red-800 mb-1">⚠ ลูกค้าที่มี SD แต่ไม่มี QT ตกลง — ราคาจะเป็น 0!</p>
            <div className="flex flex-wrap gap-2">
              {customersWithoutQT.map(c => (
                <span key={c.id} className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{c.shortName || c.name}</span>
              ))}
            </div>
            <p className="text-xs text-red-600 mt-1">กรุณาสร้างและกดตกลง QT ให้ลูกค้าเหล่านี้ก่อนออก SD/WB ใหม่</p>
          </div>
        )}
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
                      data-row-id={q.id}
                      className={cn("border-b border-slate-100 cursor-pointer", activeQtId === q.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                      onClick={() => { setActiveQtId(q.id); setShowQuDetail(q.id) }}>
                      {/* 135.4: date + customer = เด่น, quotationNumber = muted */}
                      <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(q.date)}</td>
                      <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customerName'))}>{getCustomer(q.customerId)?.shortName || q.customerName}</td>
                      <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('quotationNumber'))}>{q.quotationNumber}</td>
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
      </>})()}

      {/* Create Billing Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setBillingDiscount(0); setBillingDiscountNote(''); setBillingExtraCharge(0); setBillingExtraChargeNote('') }} title="สร้างใบวางบิล" size="lg" closeLabel="cancel">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ลูกค้า</label>
              <select value={selCustomerId} onChange={e => { setSelCustomerId(e.target.value); if (e.target.value) trackRecentCustomer(e.target.value) }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">เลือกลูกค้า</option>
                {(() => {
                  // A2: Recent customers ด้านบน
                  const sorted = sortCustomersWithRecent(customers)
                  const recentIds = new Set(getRecentCustomerIds())
                  const hasRecent = sorted.some(c => recentIds.has(c.id))
                  const recents = sorted.filter(c => recentIds.has(c.id))
                  const rest = sorted.filter(c => !recentIds.has(c.id))
                  return (
                    <>
                      {hasRecent && (
                        <optgroup label="⭐ ใช้ล่าสุด">
                          {recents.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label={hasRecent ? 'ทั้งหมด' : ''}>
                        {rest.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                      </optgroup>
                    </>
                  )
                })()}
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
            <div className="flex flex-wrap items-center gap-4 py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
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
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="billingMode" value="by_total" checked={billingMode === 'by_total'}
                  onChange={() => setBillingMode('by_total')} className="text-[#1B3A5C]" />
                <span className="text-sm text-slate-700">ยอดรวม (เหมือน IV)</span>
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
                      <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">ยอดรวมก่อนปรับ</td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        {formatCurrency(previewBilling.lineItems
                          .filter(i => i.code !== 'DISCOUNT' && i.code !== 'EXTRA_CHARGE')
                          .reduce((s, i) => s + i.amount, 0))}
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="px-3 py-1.5 text-right text-blue-600">ค่าใช้จ่ายเพิ่มเติม</td>
                      <td className="px-3 py-1 text-right">
                        <input type="text" value={billingExtraChargeNote}
                          onChange={e => setBillingExtraChargeNote(e.target.value)}
                          placeholder="หมายเหตุ..."
                          className="w-full text-right border border-slate-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                      </td>
                      <td className="px-3 py-1 text-right">
                        <input type="number" min="0" step="0.01" value={billingExtraCharge || ''}
                          onChange={e => setBillingExtraCharge(Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="0.00"
                          className="w-28 text-right border border-slate-200 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="px-3 py-1.5 text-right text-orange-600">ส่วนลด</td>
                      <td className="px-3 py-1 text-right">
                        <input type="text" value={billingDiscountNote}
                          onChange={e => setBillingDiscountNote(e.target.value)}
                          placeholder="หมายเหตุ..."
                          className="w-full text-right border border-slate-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300" />
                      </td>
                      <td className="px-3 py-1 text-right">
                        <input type="number" min="0" step="0.01" value={billingDiscount || ''}
                          onChange={e => setBillingDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="0.00"
                          className="w-28 text-right border border-slate-200 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300" />
                      </td>
                    </tr>
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
                ? 'ลูกค้านี้มีใบวางบิลเดือนนี้แล้ว'
                : availableDNs.length > 0 && selDnIds.length === 0
                  ? 'กรุณาเลือกใบส่งของอย่างน้อย 1 รายการ'
                  : 'ไม่พบใบส่งของที่ยังไม่วางบิลในเดือนนี้'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowCreate(false); setBillingDiscount(0); setBillingDiscountNote(''); setBillingExtraCharge(0); setBillingExtraChargeNote('') }}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreateBilling} disabled={!previewBilling}
              className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-50 transition-colors font-medium">
              สร้างใบวางบิล
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setShowPrint(false) }} title={`ใบวางบิล ${detailBilling?.billingNumber || ''}`} size="lg" closeLabel="saved">
        {detailBilling && detailCustomer && (
          <div className="space-y-4">
            {/* Navy bar — ลูกค้า + วันที่ออก (ID ของเอกสาร) pattern เดียวกับ LF Grid headerLabel */}
            <div className="bg-[#1B3A5C] rounded-lg px-4 py-2.5 sticky top-0 z-10">
              <span className="text-sm font-semibold text-white tracking-wide">
                ลูกค้า: {detailCustomer.shortName || detailCustomer.name} | เดือน: {detailBilling.billingMonth}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">วันที่ออก:</span> {formatDate(detailBilling.issueDate)}</div>
              <div><span className="text-slate-500">ครบกำหนด:</span> {formatDate(detailBilling.dueDate)}</div>
            </div>

            {/* 94.2.1: SD Reference Section — link ย้อนกลับไปดู SD ที่เกี่ยวข้องในหน้า delivery */}
            {detailBilling.deliveryNoteIds.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 font-medium">ใบส่งของ (SD):</span>
                  <button onClick={() => {
                    setShowDetail(null)
                    router.push(`/dashboard/delivery?focus=${detailBilling.deliveryNoteIds.join(',')}`)
                  }}
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
                    <span>{detailBilling.deliveryNoteIds.length} ใบ</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-sm text-slate-500">ย้อนไปดูใบส่งของที่เกี่ยวข้อง</div>
              </div>
            )}

            {/* Linked Delivery Notes */}
            {detailBilling.deliveryNoteIds.length > 0 && (() => {
              const linkedDNs = detailBilling.deliveryNoteIds
                .map(dnId => deliveryNotes.find(d => d.id === dnId))
                .filter(Boolean)
                .sort((a, b) => a!.date.localeCompare(b!.date))
              if (linkedDNs.length === 0) return null
              const isPer = (detailCustomer.enablePerPiece ?? true)
              const priceMap = isPer ? buildPriceMapFromQT(detailCustomer.id, quotations) : {}
              return (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">ใบส่งของที่รวมวางบิล ({linkedDNs.length} ใบ)</h3>
                  {/* 136: วันที่ col แรก + เด่นกว่าเลขที่ SD */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-50 border-b border-blue-100">
                          <th className="text-left px-3 py-2 font-medium text-blue-800">วันที่</th>
                          <th className="text-left px-3 py-2 font-medium text-blue-800">เลขที่ SD</th>
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
                              <td className="px-3 py-1.5 text-slate-700 font-medium whitespace-nowrap">{formatDate(dn!.date)}</td>
                              <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{dn!.noteNumber}</td>
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
                      <button onClick={() => {
                        // 81: switch ไป IV tab + open detail
                        setShowDetail(null)
                        setTab('invoice')
                        setActiveIvId(ivInfo.invoiceId)
                        setShowInvoiceDetail(ivInfo.invoiceId)
                        scrollToActiveRow(ivInfo.invoiceId)
                      }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 hover:text-purple-900">
                        <span className="font-mono">{ivInfo.invoiceNumber}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ) : detailCustomer.enableVat === false ? (
                      // 148: ลูกค้าไม่คิด VAT → แสดง "ใบเสร็จรับเงิน (RC)" แทน IV
                      <span className="text-sm text-slate-500 italic">— (ลูกค้าไม่คิด VAT)</span>
                    ) : (
                      <span className="text-sm text-slate-400">ยังไม่ออก IV</span>
                    )}
                  </div>
                  {/* 145: ซ่อนปุ่มลัดถ้าลูกค้าไม่คิด VAT */}
                  {!ivInfo && detailCustomer.enableVat !== false && (
                    <button onClick={() => handleCreateTaxInvoice(detailBilling.id)}
                      className="text-sm px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />ออกใบกำกับภาษี
                    </button>
                  )}
                </div>
              )
            })()}

            {/* 148: Receipt (RC) section — ลูกค้าไม่คิด VAT เท่านั้น */}
            {detailCustomer.enableVat === false && (() => {
              const rcInfo = receipts.find(r => r.billingStatementId === detailBilling.id)
              return (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 font-medium">ใบเสร็จรับเงิน (RC):</span>
                    {rcInfo ? (
                      <button onClick={() => {
                        setShowDetail(null)
                        router.push(`/dashboard/receipts?detail=${rcInfo.id}`)
                      }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900">
                        <span className="font-mono">{rcInfo.receiptNumber}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-sm text-slate-400">ยังไม่ออก RC</span>
                    )}
                  </div>
                  {!rcInfo && (
                    <button onClick={() => handleCreateReceipt(detailBilling.id)}
                      className="text-sm px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />ออกใบเสร็จรับเงิน
                    </button>
                  )}
                </div>
              )
            })()}

            <div className="border border-[#3DD8D8] rounded-lg overflow-hidden">
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
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete WB Confirmation Modal (50.1) — DeleteWithRedirectModal */}
      {(() => {
        const wbToDelete = billingStatements.find(b => b.id === confirmDeleteId)
        const hasLinkedIV = taxInvoices.some(ti => ti.billingStatementId === confirmDeleteId)
        const linkedDnIds = wbToDelete?.deliveryNoteIds || []

        const doDelete = () => {
          if (!confirmDeleteId || !wbToDelete) return
          for (const dnId of wbToDelete.deliveryNoteIds) {
            updateDeliveryNote(dnId, { isBilled: false })
          }
          deleteBillingStatement(confirmDeleteId)
        }

        const handleDeleteAndStay = () => {
          doDelete()
          setConfirmDeleteId(null)
          setShowDetail(null)
        }

        const handleDeleteAndRedirect = () => {
          doDelete()
          setConfirmDeleteId(null)
          setShowDetail(null)
          if (linkedDnIds.length > 0) {
            router.push(`/dashboard/delivery?focus=${linkedDnIds.join(',')}`)
          }
        }

        return (
          <DeleteWithRedirectModal
            open={!!confirmDeleteId}
            onClose={() => setConfirmDeleteId(null)}
            docNumber={wbToDelete?.billingNumber || ''}
            message="ต้องการลบใบวางบิลนี้หรือไม่? หลังลบ ระบบจะปลดล็อค SD ที่เกี่ยวข้องให้กลับไปแก้ไขได้"
            warning={linkedDnIds.length > 0 ? `SD ที่เกี่ยวข้อง ${linkedDnIds.length} ใบจะถูกยกเลิกการวางบิลโดยอัตโนมัติ` : undefined}
            redirectLabel={linkedDnIds.length > 0 ? 'ไปแก้ SD' : undefined}
            onDeleteAndStay={handleDeleteAndStay}
            onDeleteAndRedirect={linkedDnIds.length > 0 ? handleDeleteAndRedirect : undefined}
            blocked={hasLinkedIV}
            blockedReason="มีใบกำกับภาษี (IV) อยู่แล้ว — กรุณาย้อน IV ก่อน แล้วค่อยลบ WB"
          />
        )
      })()}

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
                    onChange={() => setConfirmDeleteId(detailBilling.id)}
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
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกเอกสารแล้ว</span>
              </label>
            </div>
            <BillingPrint billing={detailBilling} customer={detailCustomer} company={companyInfo} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-billing" filename={formatExportFilename(detailBilling.billingNumber, detailCustomer?.shortName || detailCustomer?.name, detailBilling.issueDate)} onExportCSV={handleBillingCSV}
                onPrint={() => { if (!detailBilling.isPrinted) updateBillingStatement(detailBilling.id, { isPrinted: true }) }}
                onExportFile={() => { if (!detailBilling.isExported) updateBillingStatement(detailBilling.id, { isExported: true }) }} />
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal open={!!showInvoiceDetail} onClose={() => { setShowInvoiceDetail(null); setShowInvoicePrint(false) }} title={`ใบกำกับภาษี ${detailInvoice?.invoiceNumber || ''}`} size="lg" closeLabel="saved">
        {detailInvoice && detailInvoiceCustomer && (
          <div className="space-y-4">
            {/* Navy bar — ลูกค้า + วันที่ออก (ID ของเอกสาร) pattern เดียวกับ LF Grid headerLabel */}
            <div className="bg-[#1B3A5C] rounded-lg px-4 py-2.5 sticky top-0 z-10">
              <span className="text-sm font-semibold text-white tracking-wide">
                ลูกค้า: {detailInvoiceCustomer.shortName || detailInvoiceCustomer.name} | วันที่ออก: {formatDate(detailInvoice.issueDate)}
              </span>
            </div>

            {/* 94.1.1: WB Reference Section — link ย้อนกลับไปดู WB */}
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

            {/* 94.1.2: WB Source Table — แสดง WB ที่ IV นี้นำเข้าข้อมูลจาก */}
            {(() => {
              const wbInfo = ivBillingMap.get(detailInvoice.id)
              const wb = wbInfo ? billingStatements.find(b => b.id === wbInfo.billingId) : null
              if (!wb) return null
              return (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">ใบวางบิลที่นำเข้าข้อมูล (1 ใบ)</h3>
                  {/* 136: วันที่ col แรก + เด่นกว่าเลขที่ WB */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-orange-50 border-b border-orange-100">
                          <th className="text-left px-3 py-2 font-medium text-orange-800">วันที่ออก</th>
                          <th className="text-left px-3 py-2 font-medium text-orange-800">เลขที่ WB</th>
                          <th className="text-left px-3 py-2 font-medium text-orange-800">เดือน</th>
                          <th className="text-right px-3 py-2 font-medium text-orange-800">ยอดสุทธิ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-700 font-medium whitespace-nowrap">{formatDate(wb.issueDate)}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{wb.billingNumber}</td>
                          <td className="px-3 py-1.5 text-slate-600">{wb.billingMonth}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(wb.netPayable)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            <div className="border border-[#3DD8D8] rounded-lg overflow-hidden">
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
              <button onClick={() => openReverseIVConfirm(detailInvoice.id)}
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                <X className="w-3.5 h-3.5" />ลบ
              </button>
              <button onClick={() => setShowInvoicePrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
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
                  onChange={() => openReverseIVConfirm(detailInvoice.id)}
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
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกเอกสารแล้ว</span>
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
              <ExportButtons targetId="print-tax-invoice" filename={formatExportFilename(detailInvoice.invoiceNumber, getCustomer(detailInvoice.customerId)?.shortName || getCustomer(detailInvoice.customerId)?.name, detailInvoice.issueDate)} onExportCSV={handleInvoiceCSV}
                onPrint={() => { if (!detailInvoice.isPrinted) updateTaxInvoice(detailInvoice.id, { isPrinted: true }) }}
                onExportFile={() => { if (!detailInvoice.isExported) updateTaxInvoice(detailInvoice.id, { isExported: true }) }} />
            </div>
          </div>
        )}
      </Modal>

      {/* IV Creation Confirm Modal */}
      <Modal open={!!showCreateIV} onClose={() => setShowCreateIV(null)} title="ยืนยันออกใบกำกับภาษี" size="lg" closeLabel="cancel">
        {(() => {
          const billing = showCreateIV ? billingStatements.find(b => b.id === showCreateIV) : null
          const customer = billing ? getCustomer(billing.customerId) : null
          if (!billing || !customer) return null
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">ลูกค้า:</span> <strong>{customer.name}</strong></div>
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
      <Modal open={showCreateQU} onClose={() => { setShowCreateQU(false); setEditQuId(null); setShowLoadFromQT(false) }} title={editQuId ? 'แก้ไขใบเสนอราคา (ย้อนกลับเป็นร่าง)' : 'สร้างใบเสนอราคา'} size="xl" closeLabel="cancel">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ชื่อย่อลูกค้า</label>
              <select value={quCustomerId} onChange={e => {
                const cust = customers.find(c => c.id === e.target.value)
                setQuCustomerId(e.target.value)
                if (e.target.value) trackRecentCustomer(e.target.value)
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
                {(() => {
                  const sorted = sortCustomersWithRecent(customers)
                  const recentIds = new Set(getRecentCustomerIds())
                  const recents = sorted.filter(c => recentIds.has(c.id))
                  const rest = sorted.filter(c => !recentIds.has(c.id))
                  return (
                    <>
                      {recents.length > 0 && (
                        <optgroup label="⭐ ใช้ล่าสุด">
                          {recents.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label={recents.length > 0 ? 'ทั้งหมด' : ''}>
                        {rest.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                      </optgroup>
                    </>
                  )
                })()}
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
                // 77: เลือกทั้งหมด — เคารพ filter ปัจจุบัน (search + category)
                const existingCodes = new Set(quItems.map(i => i.code))
                const matchesFilter = (item: typeof linenCatalog[number]) => {
                  if (quFilterCat !== 'all' && item.category !== quFilterCat) return false
                  if (quSearch) {
                    const s = quSearch.toLowerCase()
                    if (!item.code.toLowerCase().includes(s) && !item.name.toLowerCase().includes(s) && !(item.nameEn || '').toLowerCase().includes(s)) return false
                  }
                  return true
                }
                const newItems = [...linenCatalog]
                  .filter(i => !existingCodes.has(i.code) && matchesFilter(i))
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(i => ({ code: i.code, name: i.name, pricePerUnit: i.defaultPrice > 0 ? i.defaultPrice : null }))
                setQuItems([...quItems, ...newItems])
              }}
                className="text-xs px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                title="เลือกทุกรายการที่ตรงกับ filter ปัจจุบัน">
                เลือกทั้งหมด
              </button>
              <button type="button" onClick={() => {
                // 77: ไม่เลือกเลย — เคารพ filter ปัจจุบัน (ลบเฉพาะที่ match filter)
                const matchesFilter = (item: { code: string; name: string }) => {
                  const cat = linenCatalog.find(c => c.code === item.code)
                  if (quFilterCat !== 'all' && cat?.category !== quFilterCat) return false
                  if (quSearch) {
                    const s = quSearch.toLowerCase()
                    if (!item.code.toLowerCase().includes(s) && !item.name.toLowerCase().includes(s) && !(cat?.nameEn || '').toLowerCase().includes(s)) return false
                  }
                  return true
                }
                setQuItems(quItems.filter(i => !matchesFilter(i)))
              }}
                className="text-xs px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                title="ยกเลิกเฉพาะรายการที่ตรงกับ filter ปัจจุบัน">
                ไม่เลือกเลย
              </button>
              {/* 59: Clear all prices */}
              {quItems.length > 0 && (
                <button type="button" onClick={() => {
                  if (!confirm('ต้องการเคลียร์ราคาทั้งหมดหรือไม่?\n\nระบบจะรีเซ็ตช่อง "ราคา/หน่วย" ของทุกรายการเป็นว่าง\n\n⚠ ไม่สามารถเรียกคืนได้')) return
                  setQuItems(quItems.map(i => ({ ...i, pricePerUnit: null })))
                }}
                  title="เคลียร์ราคาทุกรายการ"
                  className="text-xs px-2 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1">
                  <Trash2 className="w-3 h-3" />เคลียร์ราคาทั้งหมด
                </button>
              )}
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
                            data-qt-row={idx}
                            value={item.pricePerUnit === null ? '' : item.pricePerUnit}
                            onFocus={e => e.currentTarget.select()}
                            onChange={e => {
                              const updated = [...quItems]
                              updated[idx] = { ...item, pricePerUnit: e.target.value === '' ? null : sanitizeNumber(e.target.value) }
                              setQuItems(updated)
                            }}
                            onKeyDown={e => {
                              // Keyboard navigation (57-58): Arrow Up/Down + Enter (= next row first cell)
                              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                e.preventDefault()
                                const next = document.querySelector<HTMLInputElement>(`input[data-qt-row="${idx + 1}"]`)
                                if (next) { next.focus(); next.select() }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                const prev = document.querySelector<HTMLInputElement>(`input[data-qt-row="${idx - 1}"]`)
                                if (prev) { prev.focus(); prev.select() }
                              }
                            }}
                            className={cn("w-24 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none",
                              item.pricePerUnit === null ? "border-red-400 bg-red-50"
                              : item.pricePerUnit === 0 ? "border-orange-300 bg-orange-50"
                              : "border-slate-200")} />
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
                                onChange={() => setQuItems([...quItems, { code: catItem.code, name: catItem.name, pricePerUnit: catItem.defaultPrice > 0 ? catItem.defaultPrice : null }])}
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
            {quCustomerId && quItems.length > 0 && quItems.some(i => i.pricePerUnit === null) && (
              <p className="text-xs text-red-500 text-right">กรุณาใส่ราคาให้ครบทุกรายการ — รายการที่ยังไม่มีราคาแสดงกรอบแดง</p>
            )}
            {quCustomerId && quItems.length > 0 && !quItems.some(i => i.pricePerUnit === null) && quItems.some(i => i.pricePerUnit === 0) && (
              <p className="text-xs text-orange-500 text-right">มีรายการราคา 0 (ฟรี) — กรอบสีส้ม ระบบจะบันทึกเป็นบริการฟรี</p>
            )}
            {quCustomerId && quItems.length === 0 && (
              <p className="text-xs text-red-500 text-right">ไม่มีรายการผ้า — กรุณาเพิ่มอย่างน้อย 1 รายการ</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreateQU(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={handleCreateQuotation} disabled={!quCustomerId || quItems.length === 0 || quItems.some(i => i.pricePerUnit === null)}
                className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-50 transition-colors font-medium">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Quotation Detail Modal */}
      <Modal open={!!showQuDetail} onClose={() => { setShowQuDetail(null); setShowQuPrint(false) }} title={`ใบเสนอราคา ${detailQuotation?.quotationNumber || ''}`} size="lg">
        {detailQuotation && (
          <div className="space-y-4">
            {/* 102+103: Navy bar sticky header — ลูกค้า + วันที่ */}
            <div className="bg-[#1B3A5C] rounded-lg px-4 py-2.5 sticky top-0 z-10">
              <span className="text-sm font-semibold text-white tracking-wide">
                ลูกค้า: {detailQuotation.customerName} | วันที่: {formatDate(detailQuotation.date)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">ติดต่อ:</span> {detailQuotation.customerContact || '-'}</div>
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

            {/* Info: price change scope */}
            {detailQuotation.status === 'sent' && deliveryNotes.some(d => d.customerId === detailQuotation.customerId) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                <strong>หมายเหตุ:</strong> ราคาใหม่จะมีผลเฉพาะ SD ที่สร้างหลังกดตกลงเท่านั้น — SD/WB/IV ที่ออกไปแล้วจะใช้ราคาเดิม (ล็อคไว้ตอนสร้าง)
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
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
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
              <ExportButtons targetId="print-quotation" filename={formatExportFilename(detailQuotation.quotationNumber, detailQuotation.customerName, detailQuotation.date)} onExportCSV={handleQuotationCSV} />
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
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
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
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
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
      <Modal open={showWbBulkPrint} onClose={() => setShowWbBulkPrint(false)} title={`พิมพ์/ส่งออกเอกสารใบวางบิล (${selectedWbIds.length} ใบ)`} size="xl" className="print-target">
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
              <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกเอกสารแล้ว (ทุกรายการ)</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">พิมพ์ → "พิมพ์แล้ว" | JPG/PDF/CSV → "ส่งออกเอกสารแล้ว"</p>
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
                    <span className="text-xs font-medium text-violet-700">ส่งออกเอกสารแล้ว</span>
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
      <Modal open={showIvBulkPrint} onClose={() => setShowIvBulkPrint(false)} title={`พิมพ์/ส่งออกเอกสารใบกำกับภาษี (${selectedIvIds.length} ใบ)`} size="xl" className="print-target">
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
              <span className="text-sm font-medium text-violet-700 flex items-center gap-1"><Check className="w-4 h-4" />ส่งออกเอกสารแล้ว (ทุกรายการ)</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">พิมพ์ → "พิมพ์แล้ว" | JPG/PDF/CSV → "ส่งออกเอกสารแล้ว"</p>
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
                    <span className="text-xs font-medium text-violet-700">ส่งออกเอกสารแล้ว</span>
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

      {/* QT Accept Confirmation Modal — price diff + SD update options */}
      <Modal open={!!pendingAcceptQTId} onClose={() => setPendingAcceptQTId(null)} title="ยืนยันตกลงใบเสนอราคา" size="lg" closeLabel="cancel">
        {(() => {
          const qt = pendingAcceptQTId ? quotations.find(q => q.id === pendingAcceptQTId) : null
          if (!qt) return null
          const oldPriceMap = buildPriceMapFromQT(qt.customerId, quotations)
          const hasOldPrices = Object.keys(oldPriceMap).length > 0
          const diffs = qt.items.map(i => ({ code: i.code, name: i.name, oldPrice: oldPriceMap[i.code] ?? 0, newPrice: i.pricePerUnit }))
          const changed = diffs.filter(d => d.oldPrice !== d.newPrice)
          const unchanged = diffs.filter(d => d.oldPrice === d.newPrice)
          const custDNs = deliveryNotes.filter(dn => dn.customerId === qt.customerId && !dn.isBilled)
          const cust = getCustomer(qt.customerId)

          return (
            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                ลูกค้า: <strong>{cust?.shortName || qt.customerName}</strong> | QT: <strong>{qt.quotationNumber}</strong>
              </div>

              {/* Price diff table */}
              {hasOldPrices && changed.length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">ราคาที่เปลี่ยน ({changed.length} รายการ)</div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-xs"><th className="text-left px-3 py-1.5">รายการ</th><th className="text-right px-3 py-1.5">ราคาเดิม</th><th className="text-center px-3 py-1.5">→</th><th className="text-right px-3 py-1.5">ราคาใหม่</th></tr></thead>
                    <tbody>
                      {changed.map(d => (
                        <tr key={d.code} className="border-t border-slate-100">
                          <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-400 mr-1">{d.code}</span>{d.name}</td>
                          <td className="px-3 py-1.5 text-right text-red-600 line-through">{formatCurrency(d.oldPrice)}</td>
                          <td className="px-3 py-1.5 text-center text-slate-400">→</td>
                          <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(d.newPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {unchanged.length > 0 && (
                <p className="text-xs text-slate-400">ราคาไม่เปลี่ยน: {unchanged.length} รายการ</p>
              )}
              {!hasOldPrices && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">
                  QT แรกของลูกค้านี้ — ตั้งราคาใหม่ทั้งหมด
                </div>
              )}

              {/* SD update options */}
              {custDNs.length > 0 && changed.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-3">
                  <p className="text-sm font-medium text-blue-800">อัปเดตราคาใน SD เก่าด้วยไหม? ({custDNs.length} ใบที่ยังไม่วางบิล)</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="sdUpdate" checked={sdUpdateMode === 'none'} onChange={() => setSdUpdateMode('none')} className="accent-[#1B3A5C]" />
                      <span className="text-slate-700">ไม่อัปเดต <span className="text-slate-400">(SD เก่าใช้ราคาเดิม)</span></span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="sdUpdate" checked={sdUpdateMode === 'this_month'} onChange={() => setSdUpdateMode('this_month')} className="accent-[#1B3A5C]" />
                      <span className="text-slate-700">อัปเดต SD ทั้งหมดของเดือนนี้ <span className="text-slate-400">({custDNs.filter(d => d.date >= startOfMonthISO()).length} ใบ)</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="radio" name="sdUpdate" checked={sdUpdateMode === 'from_date'} onChange={() => setSdUpdateMode('from_date')} className="accent-[#1B3A5C] mt-1" />
                      <span className="text-slate-700">
                        อัปเดต SD ตั้งแต่วันที่
                        <input type="date" value={sdUpdateFromDate} onChange={e => { setSdUpdateFromDate(e.target.value); setSdUpdateMode('from_date') }}
                          className="ml-2 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        <span className="text-slate-400 ml-1">({custDNs.filter(d => d.date >= sdUpdateFromDate).length} ใบ)</span>
                      </span>
                    </label>
                  </div>
                  <p className="text-[11px] text-blue-600">⚠ SD ที่วางบิลแล้วจะไม่ถูกอัปเดต (ราคาล็อคแล้ว)</p>
                </div>
              )}

              {/* Warning */}
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                <strong>หมายเหตุ:</strong> SD ที่สร้างหลังจากนี้จะใช้ราคาใหม่โดยอัตโนมัติ (priceSnapshot)
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setPendingAcceptQTId(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                <button onClick={confirmAcceptQT}
                  className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium transition-colors">
                  ยืนยันตกลง
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* IV Reverse Confirm Modal (50.2) */}
      <DeleteWithRedirectModal
        open={!!pendingReverseIV}
        onClose={() => setPendingReverseIV(null)}
        docNumber={pendingReverseIV?.number || ''}
        message={`ต้องการลบใบกำกับภาษีนี้หรือไม่? หลังลบ ระบบจะปลดล็อคใบวางบิล (WB) ที่เกี่ยวข้องให้กลับไปแก้ไขได้`}
        warning={pendingReverseIV ? `ใบวางบิลที่เกี่ยวข้อง: ${pendingReverseIV.linkedWbNumber}` : undefined}
        redirectLabel="ไปแก้ WB"
        onDeleteAndStay={handleReverseIVAndStay}
        onDeleteAndRedirect={handleReverseIVAndRedirect}
      />

      {/* 82: Payment Record Modal */}
      {(() => {
        const wb = paymentModalWbId ? billingStatements.find(b => b.id === paymentModalWbId) : null
        const cust = wb ? getCustomer(wb.customerId) : null
        if (!wb || !cust) return null
        return (
          <PaymentRecordModal
            open={!!paymentModalWbId}
            onClose={() => setPaymentModalWbId(null)}
            billing={wb}
            customer={cust}
          />
        )
      })()}

      {/* 72: Select WB to create IV (จาก IV tab) */}
      <Modal open={showSelectWbForIv} onClose={() => setShowSelectWbForIv(false)} title="เลือกใบวางบิลที่จะออกใบกำกับภาษี" size="lg" closeLabel="cancel">
        {(() => {
          // WB ที่ยังไม่มี IV
          const allAvailableWbs = billingStatements
            .filter(b => !taxInvoices.some(ti => ti.billingStatementId === b.id))
            .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
          // 145: กรอง WB ของลูกค้าที่ไม่คิด VAT ออก (ออก IV ไม่ได้)
          const availableWbs = allAvailableWbs.filter(b => {
            const c = getCustomer(b.customerId)
            return !c || c.enableVat !== false
          })
          // 146: binary flag — มีการกรองออกไหม (ไม่แสดงจำนวน เพราะ N ใหญ่ๆ ดูเหมือน bug และ user แก้ไขไม่ได้)
          const hasNonVatSkipped = availableWbs.length < allAvailableWbs.length

          if (availableWbs.length === 0) {
            return (
              <div className="text-center py-12 text-slate-500 text-sm">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                ไม่มีใบวางบิลที่ยังไม่ได้ออกใบกำกับภาษี
                <p className="text-xs text-slate-400 mt-1">ใบวางบิลทุกใบมี IV แล้ว หรือยังไม่มีใบวางบิลในระบบ</p>
                {hasNonVatSkipped && (
                  <p className="text-xs text-amber-600 mt-3">⚠ ไม่แสดงใบวางบิลของลูกค้าที่ไม่คิด VAT — ออกใบกำกับภาษีไม่ได้</p>
                )}
              </div>
            )
          }

          return (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">เลือกใบวางบิลที่ต้องการออกใบกำกับภาษี ({availableWbs.length} ใบที่ยังไม่ได้ออก IV)</p>
              {hasNonVatSkipped && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                  ⚠ ไม่แสดงใบวางบิลของลูกค้าที่ไม่คิด VAT — ออกใบกำกับภาษีไม่ได้
                </p>
              )}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่ WB</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-24">วันที่ออก</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ยอดรวม</th>
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableWbs.map(wb => {
                      const customer = getCustomer(wb.customerId)
                      return (
                        <tr key={wb.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{wb.billingNumber}</td>
                          <td className="px-3 py-2 text-slate-700">{customer?.shortName || customer?.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(wb.issueDate)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(wb.grandTotal)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => {
                              setShowSelectWbForIv(false)
                              setIvIssueDate(todayISO())
                              setShowCreateIV(wb.id)
                            }}
                              className="px-3 py-1 text-xs bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium">
                              เลือก
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
