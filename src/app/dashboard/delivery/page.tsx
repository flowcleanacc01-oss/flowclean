'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FocusBanner from '@/components/FocusBanner'
import { useStore } from '@/lib/store'
import { formatDate, formatNumber, formatCurrency, cn, todayISO, startOfMonthISO, endOfMonthISO, sanitizeNumber, buildPriceMapFromQT, scrollToActiveRow, formatExportFilename } from '@/lib/utils'
import { highlightText, matchesAmountQuery } from '@/lib/highlight'
import { type DeliveryNoteItem, LINEN_FORM_STATUS_CONFIG } from '@/types'
import { calculateTransportFeeTrip, calculateDNSubtotal } from '@/lib/transport-fee'
import { Plus, Search, X, FileDown, Check, ExternalLink, Printer, Trash2, Sparkles } from 'lucide-react'
import Modal from '@/components/Modal'
import DeleteWithRedirectModal from '@/components/DeleteWithRedirectModal'
import DeliveryNotePrint from '@/components/DeliveryNotePrint'
import TransportFeeImpactPreview from '@/components/TransportFeeImpactPreview'
import { canViewSD } from '@/lib/permissions'
import { applyRowsSync, recalcTransportAfterSync, recalcTransportAfterAdj } from '@/lib/sync-discrepancy'
import { createDNLastOfMonthCompare } from '@/lib/transport-fee'
import { trackRecentCustomer } from '@/lib/recent-customers'
import ExportButtons from '@/components/ExportButtons'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import CustomerPicker from '@/components/CustomerPicker'
import { exportCSV } from '@/lib/export'
import { useScrollToMark } from '@/lib/use-scroll-to-mark'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import AddItemWizard from '@/components/AddItemWizard'

type DNFilter = 'all' | 'not-printed' | 'printed' | 'not-billed' | 'billed'

export default function DeliveryPage() {
  const {
    currentUser,
    deliveryNotes, addDeliveryNote, updateDeliveryNote, deleteDeliveryNote,
    linenForms, updateLinenForm, customers, getCustomer, companyInfo, linenCatalog,
    billingStatements, quotations,
  } = useStore()
  const [showPrint, setShowPrint] = useState(false)

  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlHighlightQ = searchParams.get('q') || '' // 147.2
  // 162.1: combine local search + URL ?q so live typing also highlights
  const highlightQ = [search, urlHighlightQ].filter(Boolean).join(' ').trim()
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // 207: AddItemWizard state สำหรับ SD detail
  const [sdWizardOpen, setSdWizardOpen] = useState(false)
  // 171.1: scroll to <mark> on arrival from global search
  useScrollToMark([showDetail])
  const [dnFilter, setDnFilter] = useState<DNFilter>('all')

  // Focus mode (50): from ?focus=ID1,ID2 — override all filters + auto-open detail
  const [focusIds, setFocusIds] = useState<string[]>(() => {
    const f = searchParams.get('focus')
    return f ? f.split(',').filter(Boolean) : []
  })
  const focusMode = focusIds.length > 0

  const [selectedDnIds, setSelectedDnIds] = useState<string[]>(() => {
    const f = searchParams.get('focus')
    return f ? f.split(',').filter(Boolean) : []
  })
  const [activeRowId, setActiveRowId] = useState<string | null>(() => searchParams.get('detail'))

  // Auto-open detail modal if focusing on single document (only on mount)
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (!autoOpenedRef.current && focusIds.length === 1) {
      autoOpenedRef.current = true
      setShowDetail(focusIds[0])
    }
  }, [focusIds])

  const exitFocus = () => {
    setFocusIds([])
    setSelectedDnIds([])
    router.replace('/dashboard/delivery')
  }
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false)
  const [showPrintList, setShowPrintList] = useState(false)
  const [showBulkPrint, setShowBulkPrint] = useState(false)

  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState(() => endOfMonthISO())
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
  const [dnDiscount, setDnDiscount] = useState(0)
  const [dnDiscountNote, setDnDiscountNote] = useState('')
  const [dnExtraCharge, setDnExtraCharge] = useState(0)
  const [dnExtraChargeNote, setDnExtraChargeNote] = useState('')

  // 84: SD edit sync confirmation modal — แก้ quantity → recalc transport fees
  const [pendingSdSync, setPendingSdSync] = useState<{
    dnId: string
    lfId: string
    itemCode: string
    oldQty: number
    newQty: number
  } | null>(null)
  // 115: 2 checkbox แยก (แทน radio) — pattern เดียวกับ Feature 111
  const [sdSyncRecalcTrip, setSdSyncRecalcTrip] = useState(true)
  const [sdSyncRecalcMonth, setSdSyncRecalcMonth] = useState(true)
  // 119.2: Toggle "รวม extra/discount ที่มีอยู่แล้วใน SD ในเกณฑ์ขั้นต่ำค่ารถ"
  const [sdSyncApplyAdj, setSdSyncApplyAdj] = useState(true)

  // 106: Local state for SD adjustment editing (ไม่ save ทันที — รอ confirm)
  const [adjExtra, setAdjExtra] = useState(0)
  const [adjExtraNote, setAdjExtraNote] = useState('')
  const [adjDiscount, setAdjDiscount] = useState(0)
  const [adjDiscountNote, setAdjDiscountNote] = useState('')
  const [adjRecalcTrip, setAdjRecalcTrip] = useState(false)
  const [adjRecalcMonth, setAdjRecalcMonth] = useState(false)
  // 119.1: Toggle "รวม extra/discount ที่กำลังปรับในเกณฑ์ขั้นต่ำค่ารถ"
  const [adjApplyAdj, setAdjApplyAdj] = useState(true)
  const [showAdjustConfirm, setShowAdjustConfirm] = useState(false)
  const adjInitRef = useRef({ extra: 0, extraNote: '', discount: 0, discountNote: '', tripFee: 0, monthFee: 0 })

  // Init adjust fields when detail modal opens
  useEffect(() => {
    if (showDetail) {
      const dn = deliveryNotes.find(d => d.id === showDetail)
      if (dn) {
        const init = { extra: dn.extraCharge || 0, extraNote: dn.extraChargeNote || '', discount: dn.discount || 0, discountNote: dn.discountNote || '', tripFee: dn.transportFeeTrip || 0, monthFee: dn.transportFeeMonth || 0 }
        adjInitRef.current = init
        setAdjExtra(init.extra)
        setAdjExtraNote(init.extraNote)
        setAdjDiscount(init.discount)
        setAdjDiscountNote(init.discountNote)
        setAdjRecalcTrip(false)
        setAdjRecalcMonth(false)
        setAdjApplyAdj(true)
      }
    }
    setShowAdjustConfirm(false)
  }, [showDetail, deliveryNotes])

  // 115: Reset SD Sync Modal checkboxes เมื่อเปิด modal
  useEffect(() => {
    if (pendingSdSync) {
      setSdSyncRecalcTrip(true)
      setSdSyncRecalcMonth(true)
      setSdSyncApplyAdj(true)
    }
  }, [pendingSdSync])

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortedBg = (key: string) => sortKey === key ? 'bg-[#1B3A5C]/[0.04]' : ''

  // Resolve price for a DN: snapshot (locked) → current QT → legacy
  // ⚠️ ต้องประกาศก่อน getDNTotalAmount + filtered useMemo (ไม่งั้น TDZ ตอน amountMatch)
  const getDNPrices = (dn: typeof deliveryNotes[number]): Record<string, number> => {
    if (dn.priceSnapshot && Object.keys(dn.priceSnapshot).length > 0) return dn.priceSnapshot
    return buildPriceMapFromQT(dn.customerId, quotations)
  }

  // Calculate total amount for a DN (items subtotal + transport fees + adjustments)
  const getDNTotalAmount = (dn: typeof deliveryNotes[number]): number => {
    const customer = getCustomer(dn.customerId)
    if (!customer) return 0
    const isPer = customer.enablePerPiece ?? true
    const itemSubtotal = isPer ? (() => {
      const priceMap = getDNPrices(dn)
      return dn.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0)
    })() : 0
    return itemSubtotal + (dn.transportFeeTrip || 0) + (dn.transportFeeMonth || 0) + (dn.extraCharge || 0) - (dn.discount || 0)
  }

  const filtered = useMemo(() => {
    return deliveryNotes.filter(dn => {
      // Focus mode (50): bypass all other filters
      if (focusMode) return focusIds.includes(dn.id)

      if (customerFilter !== 'all' && dn.customerId !== customerFilter) return false
      if (search) {
        const customer = getCustomer(dn.customerId)
        const q = search.toLowerCase()
        const textMatch = (dn.noteNumber || '').toLowerCase().includes(q)
          || (customer?.shortName || '').toLowerCase().includes(q)
          || (customer?.name || '').toLowerCase().includes(q)
        // 214: รหัส + ชื่อรายการ (audit: หา SD ที่มี item code นี้)
        const itemMatch = !textMatch && (dn.items || []).some(it => {
          if (!it) return false
          if ((it.code || '').toLowerCase().includes(q)) return true
          const def = it.code ? linenCatalog.find(c => c.code === it.code) : null
          if (def && ((def.name || '').toLowerCase().includes(q) || (def.nameEn || '').toLowerCase().includes(q))) return true
          if (it.isAdhoc && (it.adhocName || '').toLowerCase().includes(q)) return true
          if ((it.displayName || '').toLowerCase().includes(q)) return true
          return false
        })
        // 166.3.1: match by ยอดรวม
        const amountMatch = !textMatch && !itemMatch && matchesAmountQuery(search, [getDNTotalAmount(dn)])
        if (!textMatch && !itemMatch && !amountMatch) return false
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
        case 'customer': { const ca = getCustomer(a.customerId); va = ca?.shortName || ca?.name || ''; const cb = getCustomer(b.customerId); vb = cb?.shortName || cb?.name || ''; break }
        case 'date': va = a.date; vb = b.date; break
        case 'items': va = a.items.reduce((s, i) => s + i.quantity, 0); vb = b.items.reduce((s, i) => s + i.quantity, 0); break
        case 'amount': va = getDNTotalAmount(a); vb = getDNTotalAmount(b); break
        case 'driver': va = a.driverName || ''; vb = b.driverName || ''; break
        case 'isPrinted': va = a.isPrinted ? 1 : 0; vb = b.isPrinted ? 1 : 0; break
        case 'wb': va = billingStatements.find(bs => bs.deliveryNoteIds?.includes(a.id))?.billingNumber || ''; vb = billingStatements.find(bs => bs.deliveryNoteIds?.includes(b.id))?.billingNumber || ''; break
        default: va = a.date; vb = b.date
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [deliveryNotes, customerFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, dnFilter, billingStatements, selectedDnIds, focusMode, focusIds])

  // Forms available for delivery (confirmed status) — sorted oldest first (122.4b)
  const availableForms = useMemo(() => {
    if (!selCustomerId) return []
    const linkedFormIds = new Set(deliveryNotes.flatMap(dn => dn.linenFormIds))
    return linenForms
      .filter(f =>
        f.customerId === selCustomerId &&
        f.status === 'confirmed' &&
        !linkedFormIds.has(f.id)
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.formNumber.localeCompare(b.formNumber))
  }, [linenForms, selCustomerId, deliveryNotes])

  // 122.4.1: Stuck LFs — ยังไม่ถึง 7/7 + customer เดียวกัน (ไม่มี SD ผูกแล้ว)
  const stuckFormsForCustomer = useMemo(() => {
    if (!selCustomerId) return []
    const linkedFormIds = new Set(deliveryNotes.flatMap(dn => dn.linenFormIds))
    return linenForms
      .filter(f =>
        f.customerId === selCustomerId &&
        f.status !== 'confirmed' &&
        !linkedFormIds.has(f.id)
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.formNumber.localeCompare(b.formNumber))
  }, [linenForms, selCustomerId, deliveryNotes])

  // 131: รวม confirmed (เลือกได้) + stuck (แสดงสีเทา) เรียงตาม date asc — ให้ user เห็น sequence LF เต็ม
  const allFormsForSelect = useMemo(() => {
    const items: Array<{ form: typeof linenForms[number]; selectable: boolean }> = []
    for (const f of availableForms) items.push({ form: f, selectable: true })
    for (const f of stuckFormsForCustomer) items.push({ form: f, selectable: false })
    return items.sort((a, b) =>
      a.form.date.localeCompare(b.form.date) || a.form.formNumber.localeCompare(b.form.formNumber)
    )
  }, [availableForms, stuckFormsForCustomer])

  const handleCustomerSelect = (custId: string) => {
    setSelCustomerId(custId)
    if (custId) trackRecentCustomer(custId)
    setSelFormIds([])
    setDeliveryItems([])
    setDnDate(todayISO())
  }

  const handleFormToggle = (formId: string) => {
    // 122.4(a): Enforce 1:1 LF→SD — ใช้ radio pattern (เลือกแล้วเลือกใหม่แทน ไม่ใช่ toggle)
    const isCurrentlySelected = selFormIds.includes(formId)
    const updated = isCurrentlySelected ? [] : [formId]
    setSelFormIds(updated)

    // Default date from selected LF
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
      .map(([code, quantity]) => ({ code, quantity, isClaim: false, displayName: 'ค่าบริการซัก ' + (itemNameMap[code] || code) }))
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

    // Warn if no accepted QT → prices will be 0
    const hasAcceptedQT = quotations.some(q => q.customerId === selCustomerId && q.status === 'accepted')
    if (!hasAcceptedQT) {
      if (!confirm('⚠ ลูกค้านี้ไม่มีใบเสนอราคาที่ตกลงแล้ว — ราคาทุกรายการจะเป็น 0\n\nกรุณาสร้างและกดตกลง QT ก่อน\n\nยืนยันสร้าง SD ต่อหรือไม่?')) return
    }

    // 70+73+74+75: Detect overwrite (SD quantity ≠ LF.col6) → sync LF
    const isMultiLF = selFormIds.length > 1
    const overwrites: { code: string; oldQty: number; newQty: number }[] = []
    if (selFormIds.length === 1) {
      const lf = linenForms.find(f => f.id === selFormIds[0])
      if (lf) {
        for (const item of deliveryItems) {
          if (item.isClaim) continue
          const lfRow = lf.rows.find(r => r.code === item.code)
          if (lfRow && (lfRow.col6_factoryPackSend || 0) !== item.quantity) {
            overwrites.push({
              code: item.code,
              oldQty: lfRow.col6_factoryPackSend || 0,
              newQty: item.quantity,
            })
          }
        }
      }
    } else if (isMultiLF) {
      // Multi-LF: ห้ามแก้จำนวน — block ถ้า aggregated qty ≠ deliveryItems
      const aggregatedQty: Record<string, number> = {}
      for (const fId of selFormIds) {
        const f = linenForms.find(lf => lf.id === fId)
        if (!f) continue
        for (const r of f.rows) {
          aggregatedQty[r.code] = (aggregatedQty[r.code] || 0) + (r.col6_factoryPackSend || 0)
        }
      }
      for (const item of deliveryItems) {
        if (item.isClaim) continue
        if (item.quantity !== (aggregatedQty[item.code] || 0)) {
          alert(`⚠ ไม่สามารถแก้จำนวน ${item.code} ได้\n\nSD นี้ link กับ ${selFormIds.length} LF — ห้ามแก้จำนวน เพราะระบบไม่รู้ว่าจะ apply กับ LF ไหน\n\nกรุณาไปแก้ที่ LF ตรงๆ`)
          return
        }
      }
    }

    if (overwrites.length > 0) {
      const summary = overwrites.map(o => `• ${o.code}: ${o.oldQty} → ${o.newQty}`).join('\n')
      if (!confirm(`คุณกำลังแก้จำนวนใน SD จากค่าเดิมใน LF:\n\n${summary}\n\nระบบจะอัพเดต LF.col6 + col4 = ค่าใหม่ (sync ทั้ง 2)\n+ บันทึก audit log\n\nดำเนินการต่อ?`)) return
      // Apply sync to LF
      const lf = linenForms.find(f => f.id === selFormIds[0])
      if (lf) {
        const updatedRows = applyRowsSync(
          lf.rows,
          overwrites.map(o => ({ code: o.code, newQty: o.newQty })),
          'sd_create',
          currentUser?.name || 'unknown',
        )
        updateLinenForm(lf.id, { rows: updatedRows })
      }
    }

    // Calculate item subtotal for trip fee
    let tripFee = 0
    if (customer) {
      const priceMap = buildPriceMapFromQT(selCustomerId, quotations)
      const itemSubtotal = deliveryItems.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0)
      tripFee = calculateTransportFeeTrip(itemSubtotal, customer)
    }

    // 133: Create SD first (month fee = 0 initially) — post-process จะกำหนดค่ารถเดือนใบที่ถูกต้อง
    const newDN = addDeliveryNote({
      customerId: selCustomerId,
      linenFormIds: selFormIds,
      date: dnDate,
      items: deliveryItems,
      driverName,
      vehiclePlate,
      receiverName,
      status: 'pending',
      isPrinted: false,
      isExported: false,
      isBilled: false,
      transportFeeTrip: tripFee,
      transportFeeMonth: 0,
      discount: dnDiscount,
      discountNote: dnDiscountNote,
      extraCharge: dnExtraCharge,
      extraChargeNote: dnExtraChargeNote,
      priceSnapshot: buildPriceMapFromQT(selCustomerId, quotations),
      notes: dnNotes,
    })

    // 133: Month fee post-process — robust against out-of-order SD creation
    // เดิม: สมมติว่า SD ใหม่จะเป็นใบสุดท้ายเสมอ → เมื่อ user สร้าง SD สลับวัน, fee ค้างที่ใบผิด
    // ใหม่: สร้าง SD ก่อน แล้ว (1) clear ALL stale month fees ในเดือน (2) re-sort หา true last (3) apply ครั้งเดียว
    if (customer && customer.enableMinPerMonth && customer.monthlyFlatRate > 0) {
      const monthDNsBeforeNew = deliveryNotes.filter(d => d.customerId === selCustomerId && d.date.startsWith(month))
      const allDNsInMonth = [...monthDNsBeforeNew, newDN]

      // (1) Clear ทุก stale month fee ในเดือน (defensive — กัน bug เก่า)
      for (const d of monthDNsBeforeNew) {
        if ((d.transportFeeMonth || 0) > 0) {
          updateDeliveryNote(d.id, { transportFeeMonth: 0 })
        }
      }

      // (2) หา true last-of-month โดยใช้ LF-based sort (รวม SD ใหม่ด้วย)
      const lastDN = [...allDNsInMonth].sort(createDNLastOfMonthCompare(linenForms))[0]

      // (3) คำนวณ month fee จากยอดรวมทั้งเดือน แล้ว apply ให้ใบที่ถูกต้อง
      const monthTotal = allDNsInMonth.reduce((s, d) => {
        const dPriceMap = d.priceSnapshot && Object.keys(d.priceSnapshot).length > 0
          ? d.priceSnapshot
          : buildPriceMapFromQT(d.customerId, quotations)
        return s + calculateDNSubtotal(d, customer, dPriceMap) + (d.transportFeeTrip || 0)
      }, 0)
      const computedMonthFee = monthTotal < customer.monthlyFlatRate
        ? Math.max(0, customer.monthlyFlatRate - monthTotal)
        : 0

      if (computedMonthFee > 0) {
        updateDeliveryNote(lastDN.id, { transportFeeMonth: computedMonthFee })
      }
    }
    setActiveRowId(newDN.id)
    scrollToActiveRow(newDN.id)
    setShowCreate(false)
  }

  const detailNote = showDetail ? deliveryNotes.find(d => d.id === showDetail) : null
  const detailCustomer = detailNote ? getCustomer(detailNote.customerId) : null
  // 213.2 Phase 1.2 — display name resolves per-customer nickname (detail) หรือ catalog (default)
  // detail context: ใช้ detailCustomer; create context: ใช้ selCustomerId
  const ctxCustomer = detailCustomer || (selCustomerId ? getCustomer(selCustomerId) : null)
  const itemNameMap = Object.fromEntries(
    linenCatalog.map(i => [i.code, ctxCustomer?.itemNicknames?.[i.code] || i.name])
  )

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
    const priceMap = getDNPrices(detailNote)
    const headers = isPer
      ? ['รหัส', 'รายการ', 'จำนวน', 'ราคา/หน่วย', 'มูลค่า']
      : ['รหัส', 'รายการ', 'จำนวน']
    const rows = detailNote.items.map(item => {
      const price = priceMap[item.code] || 0
      return isPer
        ? [item.code, itemNameMap[item.code] || item.code, String(item.quantity), String(price), String(item.quantity * price)]
        : [item.code, itemNameMap[item.code] || item.code, String(item.quantity)]
    })
    exportCSV(headers, rows, formatExportFilename(detailNote.noteNumber, detailCustomer.shortName || detailCustomer.name, detailNote.date))
  }

  // Mark isPrinted when print button is clicked
  const handlePrintExport = () => {
    if (detailNote && !detailNote.isPrinted) {
      updateDeliveryNote(detailNote.id, { isPrinted: true })
    }
  }
  // Mark isExported when file export (JPG/PDF/CSV) is used
  const handleExportFile = () => {
    if (detailNote && !detailNote.isExported) {
      updateDeliveryNote(detailNote.id, { isExported: true })
    }
  }

  const handleDnListCSV = (items: typeof filtered) => {
    const headers = ['ลำดับ', 'เลขที่ SD', 'ลูกค้า', 'วันที่', 'จำนวนชิ้น', 'ยอดรวม']
    const rows = items.map((dn, idx) => {
      const customer = getCustomer(dn.customerId)
      const pieces = dn.items.reduce((s, i) => s + i.quantity, 0)
      const amount = getDNTotalAmount(dn)
      return [String(idx + 1), dn.noteNumber, customer?.shortName || customer?.name || '-', dn.date, String(pieces), String(amount)]
    })
    exportCSV(headers, rows, 'รายการใบส่งของ')
  }

  /**
   * 50.5: Bulk delete SD — เพิ่ม redirect logic ให้ตรงกับ single delete
   * - ถ้ามี linked LFs → redirect ไป LF page ใน focus mode
   * - ถ้าไม่มี → stay บน SD page
   */
  const handleBulkDeleteAndStay = () => {
    const billedCount = selectedDnIds.filter(id =>
      billingStatements.some(b => b.deliveryNoteIds.includes(id))
    ).length
    if (billedCount > 0) {
      alert(`ไม่สามารถลบได้ — มี SD ที่วางบิลแล้ว ${billedCount} ใบ\nกรุณายกเลิกการเลือก SD ที่วางบิลแล้วก่อน`)
      return
    }
    for (const id of selectedDnIds) {
      deleteDeliveryNote(id)
    }
    setSelectedDnIds([])
    setConfirmBulkDeleteOpen(false)
  }

  const handleBulkDeleteAndRedirect = () => {
    const billedCount = selectedDnIds.filter(id =>
      billingStatements.some(b => b.deliveryNoteIds.includes(id))
    ).length
    if (billedCount > 0) {
      alert(`ไม่สามารถลบได้ — มี SD ที่วางบิลแล้ว ${billedCount} ใบ\nกรุณายกเลิกการเลือก SD ที่วางบิลแล้วก่อน`)
      return
    }
    // Collect linked LF IDs from all selected SDs before deleting
    const linkedLfIds = new Set<string>()
    for (const id of selectedDnIds) {
      const dn = deliveryNotes.find(d => d.id === id)
      if (dn) for (const lfId of dn.linenFormIds) linkedLfIds.add(lfId)
    }
    // Delete
    for (const id of selectedDnIds) {
      deleteDeliveryNote(id)
    }
    setSelectedDnIds([])
    setConfirmBulkDeleteOpen(false)
    // Redirect to LF page in focus mode
    if (linkedLfIds.size > 0) {
      router.push(`/dashboard/linen-forms?focus=${[...linkedLfIds].join(',')}`)
    }
  }

  const filterOptions: { key: DNFilter; label: string }[] = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'not-printed', label: 'ยังไม่พิมพ์' },
    { key: 'printed', label: 'พิมพ์แล้ว' },
    { key: 'not-billed', label: 'ยังไม่วางบิล' },
    { key: 'billed', label: 'วางบิลแล้ว' },
  ]

  // 69: Page-level guard
  if (!canViewSD(currentUser)) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Driver/Staff/Accountant/Admin เท่านั้น</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">2. ใบส่งของชั่วคราว (SD)</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการใบส่งของชั่วคราวทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedDnIds.length > 0 && (
            <>
              <button onClick={() => setShowBulkPrint(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                <FileDown className="w-4 h-4" />
                พิมพ์/ส่งออกเอกสารที่เลือก ({selectedDnIds.length})
              </button>
              <button onClick={() => setConfirmBulkDeleteOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">
                <Trash2 className="w-4 h-4" />
                ลบที่เลือก ({selectedDnIds.length})
              </button>
            </>
          )}
          <button onClick={() => setShowPrintList(true)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />
            พิมพ์/ส่งออกเอกสารรายการ
          </button>
          <button onClick={() => { setShowCreate(true); setSelCustomerId(''); setSelFormIds([]); setDeliveryItems([]); setDriverName(''); setVehiclePlate(''); setReceiverName(''); setDnNotes(''); setDnDate(todayISO()); setDnDiscount(0); setDnDiscountNote(''); setDnExtraCharge(0); setDnExtraChargeNote('') }}
            className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />
            สร้างใบส่งของชั่วคราว
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบส่งของ, ชื่อลูกค้า, รหัสสินค้า, รายการสินค้า, จำนวนเงิน"
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        {/* 162.2: searchable CustomerPicker */}
        <CustomerPicker
          value={customerFilter === 'all' ? '' : customerFilter}
          onChange={id => setCustomerFilter(id || 'all')}
          allowAll
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {filterOptions.map(f => (
          <button key={f.key} onClick={() => setDnFilter(f.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              dnFilter === f.key ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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

      {/* Focus Mode Banner (50, 71: ใต้ filters เหนือ table) */}
      {focusMode && (
        <FocusBanner
          count={focusIds.length}
          docNumbers={focusIds.map(id => deliveryNotes.find(d => d.id === id)?.noteNumber).filter(Boolean) as string[]}
          docType="ใบส่งของ"
          onExit={exitFocus}
        />
      )}

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
                <SortableHeader label="วันที่" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="ชื่อย่อลูกค้า" sortKey="customer" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="เลขที่" sortKey="noteNumber" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="จำนวน" sortKey="items" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="ยอดรวม" sortKey="amount" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortableHeader label="คนขับ" sortKey="driver" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                <SortableHeader label="พิมพ์" sortKey="isPrinted" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                <SortableHeader label="WB" sortKey="wb" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(dn => {
                const customer = getCustomer(dn.customerId)
                const totalItems = dn.items.reduce((s, i) => s + i.quantity, 0)
                const dnAmount = getDNTotalAmount(dn)
                const wbInfo = dnBillingMap.get(dn.id)
                return (
                  <tr key={dn.id}
                    data-row-id={dn.id}
                    className={cn(
                      'border-b border-slate-100 cursor-pointer transition-colors',
                      activeRowId === dn.id
                        ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]'
                        : 'hover:bg-slate-50'
                    )}
                    onClick={() => { setShowDetail(dn.id); setActiveRowId(dn.id) }}>
                    <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selectedDnIds.includes(dn.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedDnIds(prev => [...prev, dn.id])
                          else setSelectedDnIds(prev => prev.filter(id => id !== dn.id))
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </td>
                    {/* 135.4 + 147.2: highlight Q */}
                    <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(dn.date)}</td>
                    <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}><span className="truncate block max-w-[120px]">{highlightText(customer?.shortName || customer?.name || '-', highlightQ)}</span></td>
                    <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('noteNumber'))}>{highlightText(dn.noteNumber, highlightQ)}</td>
                    <td className={cn("px-4 py-3 text-right text-slate-700", sortedBg('items'))}>{formatNumber(totalItems)}</td>
                    <td className={cn("px-4 py-3 text-right text-slate-700", sortedBg('amount'))}>{dnAmount > 0 ? formatCurrency(dnAmount) : '-'}</td>
                    <td className={cn("px-4 py-3 text-slate-600", sortedBg('driver'))}>{dn.driverName || '-'}</td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('isPrinted'))}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        dn.isPrinted ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
                        {dn.isPrinted ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-center", sortedBg('wb'))} onClick={e => e.stopPropagation()}>
                      {wbInfo ? (
                        <button
                          onClick={() => { window.location.href = `/dashboard/billing?detail=${wbInfo.billingId}` }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                          title={`ไปที่ ${wbInfo.billingNumber}`}
                        >
                          <span className="font-mono">{wbInfo.billingNumber}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 185.5 (revised): floating total bar */}
      {filtered.length > 0 && (() => {
        const totalItems = filtered.reduce((s, dn) => s + dn.items.reduce((ss, i) => ss + i.quantity, 0), 0)
        const totalAmount = filtered.reduce((s, dn) => s + getDNTotalAmount(dn), 0)
        return (
          <FloatingTotalBar>
            <span>รวม {formatNumber(filtered.length)} รายการ</span>
            <span className="ml-auto flex items-center gap-6">
              <span>จำนวน <span className="text-slate-900">{formatNumber(totalItems)}</span></span>
              <span>ยอดรวม <span className="text-[#1B3A5C]">{formatCurrency(totalAmount)}</span></span>
            </span>
          </FloatingTotalBar>
        )
      })()}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบส่งของชั่วคราว" size="lg" closeLabel="cancel">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">ลูกค้า</label>
            {/* 162.2.1: searchable CustomerPicker */}
            <CustomerPicker
              value={selCustomerId}
              onChange={id => handleCustomerSelect(id)}
              allowAll={false}
              themed={false}
              fullWidth
            />
          </div>

          {selCustomerId && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                เลือกใบส่งรับผ้า <span className="text-slate-400 font-normal">(1 LF → 1 SD · เลือกได้ 1 ใบ · LF สีเทา = ยังไม่พร้อม)</span>
              </label>
              {allFormsForSelect.length > 0 ? (
                <div className="space-y-1.5">
                  {allFormsForSelect.map(({ form: f, selectable }) => {
                    const isSelected = selFormIds.includes(f.id)
                    const firstSelectableId = availableForms[0]?.id
                    const isOldestSelectable = f.id === firstSelectableId
                    const selLf = selFormIds[0] ? linenForms.find(lf => lf.id === selFormIds[0]) : null
                    const isSkippedOlder = selectable && selLf && f.date < selLf.date && !isSelected
                    const statusCfg = LINEN_FORM_STATUS_CONFIG[f.status]
                    const qty = f.rows.reduce((s, r) => s + (r.col6_factoryPackSend || 0), 0)

                    if (!selectable) {
                      // 131: stuck LF (non-confirmed) — แสดงสีเทา, disabled, มี status badge ด้านหลัง
                      return (
                        <div key={f.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-slate-200 bg-slate-50/50 opacity-70 cursor-not-allowed"
                          title="LF นี้ยังไม่ถึงสถานะ 7/7 — ออก SD ยังไม่ได้ ต้องเลื่อนสถานะก่อน"
                        >
                          <input type="radio" disabled className="opacity-40" />
                          <span className="text-sm flex-1 text-slate-500">
                            <span className="font-medium text-slate-500 line-through decoration-slate-300">{f.formNumber}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-500">{formatDate(f.date)}</span>
                            {qty > 0 && <span className="text-slate-400 ml-2">({qty} ชิ้น)</span>}
                            <span className={cn('ml-2 text-[10px] px-1.5 py-0.5 rounded', statusCfg.bgColor, statusCfg.color)}>
                              {statusCfg.label}
                            </span>
                            <span className="ml-1.5 text-[10px] text-slate-400 italic">ยังออก SD ไม่ได้</span>
                          </span>
                        </div>
                      )
                    }

                    return (
                      <label key={f.id} className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border',
                        isSelected ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-transparent hover:bg-slate-50',
                        isSkippedOlder && 'bg-amber-50 border-amber-200',
                      )}>
                        <input type="radio" name="lfSelect" checked={isSelected}
                          onChange={() => handleFormToggle(f.id)}
                          className="text-[#1B3A5C]" />
                        <span className="text-sm flex-1">
                          <span className="font-medium">{f.formNumber}</span>
                          <span className="text-slate-500 mx-1.5">·</span>
                          {formatDate(f.date)}
                          <span className="text-slate-400 ml-2">({qty} ชิ้น)</span>
                          {isOldestSelectable && <span className="ml-2 text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">เก่าสุด · แนะนำ</span>}
                          {isSkippedOlder && <span className="ml-2 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">⚠ เก่ากว่าที่เลือก</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                  ไม่มีใบส่งรับผ้าที่สถานะ &quot;ลูกค้านับผ้ากลับแล้ว&quot; — ต้องเลื่อนสถานะใบส่งรับผ้าให้ถึง &quot;ลูกค้านับผ้ากลับแล้ว&quot; ก่อนจึงจะสร้างใบส่งของได้
                </div>
              )}

              {/* 122.4(b): Warn if user picked non-oldest confirmed LF */}
              {(() => {
                if (selFormIds.length === 0) return null
                const selLf = linenForms.find(lf => lf.id === selFormIds[0])
                if (!selLf) return null
                const olderConfirmed = availableForms.filter(f => f.date < selLf.date)
                if (olderConfirmed.length === 0) return null
                return (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <strong>⚠ ข้ามลำดับ LF:</strong> ยังมี LF confirmed ที่เก่ากว่ายังไม่ได้ออก SD ({olderConfirmed.length} ใบ) — แนะนำออก LF เก่าก่อน
                    <ul className="mt-1 ml-4 list-disc">
                      {olderConfirmed.slice(0, 5).map(f => (
                        <li key={f.id}>{f.formNumber} · {formatDate(f.date)}</li>
                      ))}
                    </ul>
                  </div>
                )
              })()}

              {/* 122.4.1: Warn if older LFs stuck at non-confirmed status (can't be selected) */}
              {(() => {
                if (selFormIds.length === 0) return null
                const selLf = linenForms.find(lf => lf.id === selFormIds[0])
                if (!selLf) return null
                const olderStuck = stuckFormsForCustomer.filter(f => f.date < selLf.date)
                if (olderStuck.length === 0) return null
                return (
                  <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
                    <strong>⚠ LF เก่ากว่ายังไม่ถึง 7/7 (อาจตกค้าง):</strong> มี {olderStuck.length} ใบที่ยังไม่ confirmed — SD นี้ออกได้ แต่กรุณาตรวจสอบ LF ด้านล่างด้วย
                    <ul className="mt-1 ml-4 list-disc">
                      {olderStuck.slice(0, 5).map(f => (
                        <li key={f.id}>
                          {f.formNumber} · {formatDate(f.date)} ·{' '}
                          <span className="font-medium">{(LINEN_FORM_STATUS_CONFIG[f.status]?.label) || f.status}</span>
                        </li>
                      ))}
                      {olderStuck.length > 5 && <li className="italic">...และอีก {olderStuck.length - 5} ใบ</li>}
                    </ul>
                  </div>
                )
              })()}
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

          {/* ค่าใช้จ่ายเพิ่มเติม + ส่วนลด */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">การปรับยอด (ถ้ามี)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ค่าใช้จ่ายเพิ่มเติม (บาท)</label>
                <input type="number" min={0} step={0.01} value={dnExtraCharge || ''}
                  onChange={e => setDnExtraCharge(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุค่าใช้จ่าย</label>
                <input type="text" value={dnExtraChargeNote} onChange={e => setDnExtraChargeNote(e.target.value)}
                  placeholder="เช่น ค่าส่งพิเศษ"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ส่วนลด (บาท)</label>
                <input type="number" min={0} step={0.01} value={dnDiscount || ''}
                  onChange={e => setDnDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:ring-1 focus:ring-orange-300 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุส่วนลด</label>
                <input type="text" value={dnDiscountNote} onChange={e => setDnDiscountNote(e.target.value)}
                  placeholder="เช่น หักค่าเสียหาย"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!selCustomerId || deliveryItems.length === 0}
              className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-50 transition-colors font-medium">
              บันทึก
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={`ใบส่งของชั่วคราว ${detailNote?.noteNumber || ''}`} size="lg" closeLabel="saved">
        {detailNote && detailCustomer && (
          <div className="space-y-4">
            {/* Navy bar — ลูกค้า + วันที่ (ID ของเอกสาร) pattern เดียวกับ LF Grid headerLabel */}
            <div className="bg-[#1B3A5C] rounded-lg px-4 py-2.5 sticky top-0 z-10">
              <span className="text-sm font-semibold text-white tracking-wide">
                ลูกค้า: {detailCustomer.shortName || detailCustomer.name} | วันที่: {formatDate(detailNote.date)}
              </span>
            </div>

            {/* 122.5: Mismatch banner — SD ถือ month fee แต่ไม่ใช่ใบสุดท้ายของเดือนตาม LF.date */}
            {(() => {
              if (!(detailNote.transportFeeMonth > 0)) return null
              if (detailNote.isBilled) return null
              const month = detailNote.date.slice(0, 7)
              const monthDNs = deliveryNotes
                .filter(d => d.customerId === detailNote.customerId && d.date.startsWith(month))
                .sort(createDNLastOfMonthCompare(linenForms))
              const lastDN = monthDNs[0]
              if (!lastDN || lastDN.id === detailNote.id) return null
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  <strong>⚠ ค่ารถเดือนอาจอยู่ผิดใบ:</strong> SD นี้ถือค่ารถเดือน ({formatCurrency(detailNote.transportFeeMonth)}) แต่ตาม logic ใหม่ (LF-based) ใบสุดท้ายของเดือนคือ{' '}
                  <button onClick={() => { setShowDetail(null); setTimeout(() => setShowDetail(lastDN.id), 50) }}
                    className="font-mono font-medium text-amber-900 hover:underline">
                    {lastDN.noteNumber}
                  </button>
                  {' '}— แนะนำปรับยอดเพื่อย้ายค่ารถเดือนไปใบที่ถูกต้อง
                </div>
              )
            })()}

            {/* 122.4(a) legacy: Multi-LF SD warning — เคสเดิมที่มี linenFormIds > 1 */}
            {detailNote.linenFormIds.length > 1 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
                <strong>⚠ SD นี้ผูกกับ {detailNote.linenFormIds.length} LF:</strong> ระบบใหม่บังคับ 1:1 (1 LF → 1 SD) — แนะนำลบ SD นี้แล้วสร้างใหม่แยกตาม LF
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
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
                {!detailNote.isPrinted && !detailNote.isBilled && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">ยังไม่พิมพ์</span>
                )}
              </div>
            </div>

            {/* 94.3.1: LF Reference Section — link ย้อนกลับไปดู LF ที่เกี่ยวข้อง */}
            {detailNote.linenFormIds.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-teal-50 border border-teal-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 font-medium">ใบรับส่งผ้า (LF):</span>
                  <button onClick={() => {
                    setShowDetail(null)
                    router.push(`/dashboard/linen-forms?focus=${detailNote.linenFormIds.join(',')}`)
                  }}
                    className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900">
                    <span>{detailNote.linenFormIds.length} ใบ</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-sm text-slate-500">ย้อนไปดูใบรับส่งผ้าที่เกี่ยวข้อง</div>
              </div>
            )}

            {/* 94.3.2: LF Source Table — แสดง LF ที่ SD นี้นำเข้าข้อมูลจาก */}
            {detailNote.linenFormIds.length > 0 && (() => {
              const linkedLFs = detailNote.linenFormIds
                .map(lfId => linenForms.find(f => f.id === lfId))
                .filter(Boolean)
                .sort((a, b) => a!.date.localeCompare(b!.date))
              if (linkedLFs.length === 0) return null
              return (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">ใบรับส่งผ้าที่นำเข้าข้อมูล ({linkedLFs.length} ใบ)</h3>
                  {/* 136: วันที่ col แรก + เด่นกว่าเลขที่ LF */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-teal-50 border-b border-teal-100">
                          <th className="text-left px-3 py-2 font-medium text-teal-800">วันที่</th>
                          <th className="text-left px-3 py-2 font-medium text-teal-800">เลขที่ LF</th>
                          <th className="text-right px-3 py-2 font-medium text-teal-800">จำนวนชิ้น (col6)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linkedLFs.map(lf => {
                          const totalPcs = lf!.rows.reduce((s, r) => s + (r.col6_factoryPackSend || 0), 0)
                          return (
                            <tr key={lf!.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 text-slate-700 font-medium whitespace-nowrap">{formatDate(lf!.date)}</td>
                              <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{lf!.formNumber}</td>
                              <td className="px-3 py-1.5 text-right">{formatNumber(totalPcs)} ชิ้น</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* 94.3.3: WB Reference Section — link เดินหน้าไปดู WB ที่เกี่ยวข้อง (pattern เดียวกับ 94.2.3) */}
            {(() => {
              const wbInfo = dnBillingMap.get(detailNote.id)
              const wb = wbInfo ? billingStatements.find(b => b.id === wbInfo.billingId) : null
              return (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 font-medium">ใบวางบิล (WB):</span>
                    {wbInfo && wb ? (
                      <button onClick={() => {
                        setShowDetail(null)
                        router.push(`/dashboard/billing?detail=${wbInfo.billingId}`)
                      }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-900">
                        <span className="font-mono">{wbInfo.billingNumber}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-sm text-slate-400">ยังไม่ได้วางบิล</span>
                    )}
                  </div>
                  {wb && (
                    <div className="text-sm text-slate-500">
                      {formatDate(wb.issueDate)} · {formatCurrency(wb.netPayable)}
                    </div>
                  )}
                </div>
              )
            })()}

            {(() => {
              const isPer = (detailCustomer.enablePerPiece ?? true)
              const priceMap = getDNPrices(detailNote)
              const itemSubtotal = isPer ? detailNote.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0) : 0
              const tripFee = detailNote.transportFeeTrip || 0
              const monthFee = detailNote.transportFeeMonth || 0
              const dnDiscount = detailNote.discount || 0
              const dnExtraCharge = detailNote.extraCharge || 0
              const grandTotal = itemSubtotal + tripFee + monthFee + dnExtraCharge - dnDiscount
              return (
                <div className="border border-[#3DD8D8] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600" title="ชื่อในเอกสารใบนี้ (แก้ได้เฉพาะใบนี้ ไม่กระทบ catalog)">ชื่อในเอกสาร</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">จำนวน</th>
                        {isPer && <th className="text-right px-3 py-2 font-medium text-slate-600">ราคา</th>}
                        {isPer && <th className="text-right px-3 py-2 font-medium text-slate-600">มูลค่า</th>}
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailNote.items.map((item, idx) => {
                        const isAdhoc = !!item.isAdhoc
                        const price = isAdhoc ? (item.adhocPrice ?? 0) : (priceMap[item.code] || 0)
                        const isBilled = !!detailNote.isBilled
                        return (
                          <tr key={`${item.code}-${idx}`} className={cn(
                            'border-t border-slate-100',
                            isAdhoc && 'bg-orange-50/40',
                          )}>
                            <td className="px-3 py-1.5 font-mono text-xs">
                              {isAdhoc ? <span className="text-orange-700 font-semibold">★ พิเศษ</span> : item.code}
                            </td>
                            <td className="px-2 py-1">
                              {isAdhoc ? (
                                <input
                                  value={item.adhocName || ''}
                                  placeholder="ชื่อรายการพิเศษ"
                                  disabled={isBilled}
                                  onChange={e => {
                                    const updated = detailNote.items.map((di, i) => i === idx ? { ...di, adhocName: e.target.value } : di)
                                    updateDeliveryNote(detailNote.id, { items: updated })
                                  }}
                                  className="w-full px-2 py-0.5 border border-orange-200 focus:border-orange-400 rounded text-sm focus:ring-1 focus:ring-orange-300 focus:outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
                                />
                              ) : (
                                <input
                                  value={item.displayName ?? ('ค่าบริการซัก ' + (itemNameMap[item.code] || item.code))}
                                  title="ชื่อในเอกสารใบนี้ (รหัส+ราคาถูก lock จาก QT)"
                                  onChange={e => {
                                    const updated = detailNote.items.map((di, i) => i === idx ? { ...di, displayName: e.target.value } : di)
                                    updateDeliveryNote(detailNote.id, { items: updated })
                                  }}
                                  className="w-full px-2 py-0.5 border border-transparent hover:border-slate-200 focus:border-[#3DD8D8] rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-transparent"
                                />
                              )}
                              {item.isClaim && <span className="ml-1 text-xs text-orange-600">(เคลม)</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {(() => {
                                // 70+73+74+75: editable quantity ใน SD detail (sync to LF)
                                const isBilled = !!detailNote.isBilled
                                const isMultiLF = detailNote.linenFormIds.length > 1
                                const canEdit = !isBilled && !isMultiLF && !item.isClaim
                                if (!canEdit) {
                                  return (
                                    <span title={isBilled ? 'SD วางบิลแล้ว — ลบ WB ก่อนจึงจะแก้ได้' : isMultiLF ? 'SD link หลาย LF — ห้ามแก้จำนวน' : ''}>
                                      {formatNumber(item.quantity)}
                                    </span>
                                  )
                                }
                                return (
                                  <input type="number" min={0} value={item.quantity}
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={e => {
                                      const newQty = parseInt(e.target.value) || 0
                                      const updated = detailNote.items.map((di, i) => i === idx ? { ...di, quantity: newQty } : di)
                                      updateDeliveryNote(detailNote.id, { items: updated })
                                    }}
                                    onBlur={() => {
                                      // 84: เปิด modal แสดง preview + recalc transport fees
                                      const lf = linenForms.find(f => f.id === detailNote.linenFormIds[0])
                                      if (!lf) return
                                      const lfRow = lf.rows.find(r => r.code === item.code)
                                      if (!lfRow) return
                                      const oldQty = lfRow.col6_factoryPackSend || 0
                                      if (oldQty === item.quantity) return
                                      setPendingSdSync({
                                        dnId: detailNote.id,
                                        lfId: lf.id,
                                        itemCode: item.code,
                                        oldQty,
                                        newQty: item.quantity,
                                      })
                                      // Reset 2 checkbox (115) — effect [pendingSdSync] จัดการด้วย
                                    }}
                                    className="w-20 px-2 py-0.5 border border-slate-200 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                                )
                              })()}
                            </td>
                            {isPer && (
                              <td className="px-3 py-1.5 text-right">
                                {isAdhoc ? (
                                  <input type="number" min={0} step="0.01"
                                    value={item.adhocPrice ?? 0}
                                    disabled={isBilled}
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={e => {
                                      const newPrice = parseFloat(e.target.value) || 0
                                      const updated = detailNote.items.map((di, i) => i === idx ? { ...di, adhocPrice: newPrice } : di)
                                      updateDeliveryNote(detailNote.id, { items: updated })
                                    }}
                                    className="w-20 px-2 py-0.5 border border-orange-200 rounded text-right text-sm focus:ring-1 focus:ring-orange-300 focus:outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400" />
                                ) : (
                                  formatCurrency(price)
                                )}
                              </td>
                            )}
                            {isPer && <td className="px-3 py-1.5 text-right">{formatCurrency(item.quantity * price)}</td>}
                            <td className="px-2 py-1.5 text-center">
                              {isAdhoc && !isBilled && (
                                <button
                                  title="ลบรายการพิเศษ"
                                  onClick={() => {
                                    const updated = detailNote.items.filter((_, i) => i !== idx)
                                    updateDeliveryNote(detailNote.id, { items: updated })
                                  }}
                                  className="p-1 text-orange-400 hover:text-red-500 hover:bg-red-50 rounded">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {/* รวมค่าซัก */}
                      <tr className="bg-slate-50 font-medium">
                        <td className="px-3 py-2" colSpan={2}>รวมค่าซัก</td>
                        <td className="px-3 py-2 text-right">{formatNumber(detailNote.items.reduce((s, i) => s + i.quantity, 0))}</td>
                        {isPer && <td className="px-3 py-2"></td>}
                        {isPer && <td className="px-3 py-2 text-right">{formatCurrency(itemSubtotal)}</td>}
                        <td></td>
                      </tr>
                      {/* Layer 3: ปุ่มเพิ่มรายการพิเศษ */}
                      {!detailNote.isBilled && (
                        <tr className="border-t border-orange-100">
                          <td colSpan={isPer ? 6 : 4} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => setSdWizardOpen(true)}
                                className="text-xs px-2.5 py-1 border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg font-medium inline-flex items-center gap-1"
                                title="เพิ่มรายการใหม่ใน catalog + QT (Wizard) — แนะนำเมื่อจะใช้ซ้ำ">
                                <Sparkles className="w-3.5 h-3.5" /> รายการใหม่ (Wizard)
                              </button>
                              <button
                                onClick={() => {
                                  const updated = [...detailNote.items, {
                                    code: '',
                                    quantity: 1,
                                    isClaim: false,
                                    isAdhoc: true,
                                    adhocName: '',
                                    adhocPrice: 0,
                                  }]
                                  updateDeliveryNote(detailNote.id, { items: updated })
                                }}
                                className="text-xs px-2.5 py-1 border border-orange-300 text-orange-700 hover:bg-orange-50 rounded-lg font-medium inline-flex items-center gap-1"
                                title="เพิ่มรายการครั้งเดียว ไม่อยากใส่ catalog ถาวร">
                                <Plus className="w-3.5 h-3.5" /> รายการพิเศษ (one-off)
                              </button>
                              <span className="text-[11px] text-slate-400">Wizard = ใช้ซ้ำ + ตรวจซ้ำ · พิเศษ = ครั้งเดียว ไม่นับ stock</span>
                            </div>
                          </td>
                        </tr>
                      )}
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
                          <td></td>
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
                          <td></td>
                        </tr>
                      )}
                      {/* ค่าใช้จ่ายเพิ่มเติม — read-only display in table */}
                      {isPer && dnExtraCharge > 0 && (
                        <tr className="border-t border-blue-200 bg-blue-50/50">
                          <td className="px-3 py-1.5" colSpan={2}>
                            <span className="text-blue-700 font-medium">ค่าใช้จ่ายเพิ่มเติม</span>
                            {detailNote.extraChargeNote && <span className="ml-1 text-xs text-blue-500">({detailNote.extraChargeNote})</span>}
                          </td>
                          <td className="px-3 py-1.5" colSpan={2}></td>
                          <td className="px-3 py-1.5 text-right text-blue-700">{formatCurrency(dnExtraCharge)}</td>
                          <td></td>
                        </tr>
                      )}
                      {/* ส่วนลด — read-only display in table */}
                      {isPer && dnDiscount > 0 && (
                        <tr className="border-t border-orange-200 bg-orange-50/50">
                          <td className="px-3 py-1.5" colSpan={2}>
                            <span className="text-orange-700 font-medium">ส่วนลด</span>
                            {detailNote.discountNote && <span className="ml-1 text-xs text-orange-500">({detailNote.discountNote})</span>}
                          </td>
                          <td className="px-3 py-1.5" colSpan={2}></td>
                          <td className="px-3 py-1.5 text-right text-orange-700">-{formatCurrency(dnDiscount)}</td>
                          <td></td>
                        </tr>
                      )}
                      {/* ยอดรวมทั้งหมด */}
                      {isPer && (tripFee > 0 || monthFee > 0 || dnExtraCharge > 0 || dnDiscount > 0) && (
                        <tr className="bg-slate-100 font-bold">
                          <td className="px-3 py-2" colSpan={4}>ยอดรวมทั้งหมด</td>
                          <td className="px-3 py-2 text-right text-[#1B3A5C]">{formatCurrency(grandTotal)}</td>
                          <td></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {/* 101+106: การปรับยอด — local state + ปุ่มยืนยัน (ไม่ save ทันที) */}
            {!detailNote.isBilled ? (() => {
              const adjChanged = adjExtra !== adjInitRef.current.extra || adjDiscount !== adjInitRef.current.discount
                || adjExtraNote !== adjInitRef.current.extraNote || adjDiscountNote !== adjInitRef.current.discountNote
              return (
                <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">การปรับยอด (ถ้ามี)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">ค่าใช้จ่ายเพิ่มเติม (บาท)</label>
                      <input type="number" min={0} step={0.01} value={adjExtra || ''}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setAdjExtra(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0.00"
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุค่าใช้จ่าย</label>
                      <input type="text" value={adjExtraNote}
                        onChange={e => setAdjExtraNote(e.target.value)}
                        placeholder="เช่น ค่าส่งพิเศษ"
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">ส่วนลด (บาท)</label>
                      <input type="number" min={0} step={0.01} value={adjDiscount || ''}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setAdjDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0.00"
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:ring-1 focus:ring-orange-300 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุส่วนลด</label>
                      <input type="text" value={adjDiscountNote}
                        onChange={e => setAdjDiscountNote(e.target.value)}
                        placeholder="เช่น หักค่าเสียหาย"
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                    </div>
                  </div>
                  {adjChanged && (
                    <div className="flex justify-end pt-1">
                      <button onClick={() => setShowAdjustConfirm(true)}
                        className="px-4 py-1.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium transition-colors">
                        ยืนยันการปรับยอด
                      </button>
                    </div>
                  )}
                </div>
              )
            })() : (
              (detailNote.extraCharge || 0) > 0 || (detailNote.discount || 0) > 0 ? (
                <div className="border border-slate-200 rounded-lg p-3 space-y-1 bg-slate-50">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">การปรับยอด <span className="text-orange-600">(ล็อค — SD วางบิลแล้ว)</span></p>
                  {(detailNote.extraCharge || 0) > 0 && (
                    <p className="text-sm text-blue-700">ค่าใช้จ่ายเพิ่มเติม: {formatCurrency(detailNote.extraCharge || 0)} {detailNote.extraChargeNote && `(${detailNote.extraChargeNote})`}</p>
                  )}
                  {(detailNote.discount || 0) > 0 && (
                    <p className="text-sm text-orange-700">ส่วนลด: -{formatCurrency(detailNote.discount || 0)} {detailNote.discountNote && `(${detailNote.discountNote})`}</p>
                  )}
                </div>
              ) : null
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setConfirmDeleteId(detailNote.id)}
                className="text-sm text-red-500 hover:text-red-700 transition-colors flex items-center gap-1">
                <X className="w-4 h-4" />ลบ
              </button>
              <button onClick={() => setShowPrint(true)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Delete Confirmation Modal — 2 ปุ่ม (50.5) */}
      <Modal open={confirmBulkDeleteOpen} onClose={() => setConfirmBulkDeleteOpen(false)} title="ยืนยันการลบ" closeLabel="cancel">
        {(() => {
          const linkedLfCount = new Set(selectedDnIds.flatMap(id =>
            deliveryNotes.find(d => d.id === id)?.linenFormIds || []
          )).size
          return (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                ต้องการลบใบส่งของที่เลือกทั้งหมด <span className="font-semibold text-red-600">{selectedDnIds.length} ใบ</span> หรือไม่?
              </p>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                ⚠️ SD ที่มีใบวางบิลอยู่จะไม่ถูกลบ — ระบบจะหยุดและแจ้งเตือนให้ยกเลิกการเลือกก่อน
              </p>
              {linkedLfCount > 0 && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                  หลังลบ ระบบจะปลดล็อค LF ที่เกี่ยวข้อง <strong>{linkedLfCount} ใบ</strong> ให้กลับไปแก้ไขได้
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setConfirmBulkDeleteOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                <button onClick={handleBulkDeleteAndStay}
                  className="px-4 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-lg flex items-center gap-1.5 font-medium">
                  <Trash2 className="w-3.5 h-3.5" />ลบ + อยู่หน้านี้
                </button>
                {linkedLfCount > 0 && (
                  <button onClick={handleBulkDeleteAndRedirect}
                    className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg flex items-center gap-1.5 font-medium">
                    <Trash2 className="w-3.5 h-3.5" />ลบ + ไปแก้ LF
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Delete SD Confirmation Modal (50.3) — DeleteWithRedirectModal */}
      {(() => {
        const dnToDelete = deliveryNotes.find(d => d.id === confirmDeleteId)
        const hasLinkedWB = billingStatements.some(b => b.deliveryNoteIds.includes(confirmDeleteId || ''))
        const linkedLfIds = dnToDelete?.linenFormIds || []

        const doDelete = () => {
          if (!confirmDeleteId || !dnToDelete) return
          deleteDeliveryNote(confirmDeleteId)
          // Reassign monthly fee if deleted DN had one
          if (dnToDelete.transportFeeMonth > 0) {
            const month = dnToDelete.date.slice(0, 7)
            const customer = getCustomer(dnToDelete.customerId)
            const remainingDNs = deliveryNotes
              .filter(d => d.id !== confirmDeleteId && d.customerId === dnToDelete.customerId && d.date.startsWith(month))
              .sort(createDNLastOfMonthCompare(linenForms))
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
          if (linkedLfIds.length > 0) {
            router.push(`/dashboard/linen-forms?focus=${linkedLfIds.join(',')}`)
          }
        }

        return (
          <DeleteWithRedirectModal
            open={!!confirmDeleteId}
            onClose={() => setConfirmDeleteId(null)}
            docNumber={dnToDelete?.noteNumber || ''}
            message="ต้องการลบใบส่งของนี้หรือไม่? หลังลบ ระบบจะปลดล็อค LF ที่เกี่ยวข้องให้กลับไปแก้ไขได้"
            warning={linkedLfIds.length > 0 ? `LF ที่เกี่ยวข้อง: ${linkedLfIds.length} ใบ` : undefined}
            redirectLabel={linkedLfIds.length > 0 ? 'ไปแก้ LF' : undefined}
            onDeleteAndStay={handleDeleteAndStay}
            onDeleteAndRedirect={linkedLfIds.length > 0 ? handleDeleteAndRedirect : undefined}
            blocked={hasLinkedWB}
            blockedReason="SD นี้มีใบวางบิล (WB) อยู่ — กรุณาย้อน WB ก่อน แล้วค่อยลบ SD"
          />
        )
      })()}

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
              <div id="print-dn-list" className="border border-slate-200 rounded-lg overflow-hidden print:border-none">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">{companyInfo.name} — รายการใบส่งของชั่วคราว</h2>
                <table className="w-full text-sm print:text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">เลขที่</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
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
                          <td className="px-3 py-1.5 text-slate-800">{customer?.shortName || customer?.name || '-'}</td>
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
                <ExportButtons targetId="print-dn-list" filename="รายการใบส่งของ" onExportCSV={() => handleDnListCSV(printDNs)} />
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
              {detailNote.isBilled && billingStatements.some(b => b.deliveryNoteIds.includes(detailNote.id)) ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">
                  <span className="font-medium">⚠ ไม่สามารถย้อน SD ได้</span>
                  <span>— SD นี้วางบิลแล้ว กรุณาย้อน WB ก่อน</span>
                </div>
              ) : (
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
                          .sort(createDNLastOfMonthCompare(linenForms))
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
              )}
            </div>

            {/* Printed / Exported status */}
            <div className="flex items-center gap-6 mb-4 no-print">
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
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!detailNote.isExported}
                  onChange={e => updateDeliveryNote(detailNote.id, { isExported: e.target.checked })}
                  className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm font-medium text-violet-700 flex items-center gap-1">
                  <Check className="w-4 h-4" />ส่งออกเอกสารแล้ว
                </span>
              </label>
            </div>

            <DeliveryNotePrint note={detailNote} customer={detailCustomer} company={companyInfo} catalog={linenCatalog} priceMap={buildPriceMapFromQT(detailCustomer.id, quotations)} />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-delivery" filename={formatExportFilename(detailNote.noteNumber, detailCustomer.shortName || detailCustomer.name, detailNote.date)} onExportCSV={handleExportCSV} onPrint={handlePrintExport} onExportFile={handleExportFile} />
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Print Modal — พิมพ์เอกสารหลายใบ */}
      <Modal open={showBulkPrint} onClose={() => setShowBulkPrint(false)} title={`พิมพ์เอกสาร (${selectedDnIds.length} ใบ)`} size="xl" className="print-target">
        <div id="print-bulk-dn">
          {selectedDnIds.map((dnId, idx) => {
            const dn = deliveryNotes.find(d => d.id === dnId)
            const cust = dn ? getCustomer(dn.customerId) : null
            if (!dn || !cust) return null
            return (
              <div key={dnId}>
                {idx > 0 && <div className="border-t-2 border-dashed border-slate-300 my-6" style={{ pageBreakBefore: 'always' }} />}
                <DeliveryNotePrint note={dn} customer={cust} company={companyInfo} catalog={linenCatalog} priceMap={buildPriceMapFromQT(cust.id, quotations)} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between items-center mt-4 no-print">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedDnIds.every(id => deliveryNotes.find(d => d.id === id)?.isPrinted)}
                onChange={e => {
                  for (const dnId of selectedDnIds) updateDeliveryNote(dnId, { isPrinted: e.target.checked })
                }}
                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-blue-700">พิมพ์แล้ว (ทุกรายการ)</span>
            </label>
            <p className="text-xs text-slate-400">พิมพ์ → สถานะ "พิมพ์แล้ว" | ส่งออกเอกสาร JPG/PDF/CSV → สถานะ "ส่งออกเอกสารแล้ว"</p>
          </div>
          <ExportButtons
            targetId="print-bulk-dn"
            filename={`SD-bulk-${selectedDnIds.length}`}
            onExportCSV={() => handleDnListCSV(deliveryNotes.filter(d => selectedDnIds.includes(d.id)))}
            onPrint={() => {
              for (const dnId of selectedDnIds) updateDeliveryNote(dnId, { isPrinted: true })
            }}
            onExportFile={() => {
              for (const dnId of selectedDnIds) updateDeliveryNote(dnId, { isExported: true })
            }}
          />
        </div>
      </Modal>

      {/* 106: Modal ยืนยันการปรับ SD — extraCharge / discount / transport fees */}
      <Modal
        open={showAdjustConfirm && !!showDetail}
        onClose={() => setShowAdjustConfirm(false)}
        title="ยืนยันการปรับ SD"
        size="lg"
        closeLabel="cancel"
      >
        {(() => {
          const dn = showDetail ? deliveryNotes.find(d => d.id === showDetail) : null
          const cust = dn ? getCustomer(dn.customerId) : null
          if (!dn || !cust) return null
          const init = adjInitRef.current
          const extraChanged = adjExtra !== init.extra || adjExtraNote !== init.extraNote
          const discountChanged = adjDiscount !== init.discount || adjDiscountNote !== init.discountNote

          // 111: Auto-recalc preview
          // 119.1: respect adjApplyAdj toggle — pass 0,0 if user chose ignore
          const effAdjExtra = adjApplyAdj ? adjExtra : 0
          const effAdjDiscount = adjApplyAdj ? adjDiscount : 0
          const recalcResults111 = recalcTransportAfterAdj(dn, cust, deliveryNotes, quotations, linenForms, effAdjExtra, effAdjDiscount)
          const thisDnRecalc111 = recalcResults111.find(r => r.dnId === dn.id)
          const otherDnRecalc111 = recalcResults111.find(r => r.dnId !== dn.id)
          const otherDn111 = otherDnRecalc111 ? deliveryNotes.find(d => d.id === otherDnRecalc111.dnId) : null
          const newTripFeeCalc = thisDnRecalc111?.newTripFee ?? init.tripFee
          const newMonthFeeCalc = thisDnRecalc111?.newMonthFee        // defined only when this DN is last of month
          const otherNewMonthFee = otherDnRecalc111?.newMonthFee      // defined only when other DN is last of month
          const tripFeeWillChange = newTripFeeCalc !== init.tripFee
          const monthFeeWillChange = newMonthFeeCalc !== undefined && newMonthFeeCalc !== init.monthFee
          const otherMonthFeeWillChange = otherNewMonthFee !== undefined && otherNewMonthFee !== (otherDn111?.transportFeeMonth || 0)

          // Effective fees for this SD's total preview
          const effectiveTripFee = adjRecalcTrip && tripFeeWillChange ? newTripFeeCalc : init.tripFee
          const effectiveMonthFee = adjRecalcMonth && monthFeeWillChange ? (newMonthFeeCalc ?? init.monthFee) : init.monthFee

          const priceMap = getDNPrices(dn)
          const itemSubtotal = dn.items.reduce((s, i) => i.isClaim ? s : s + i.quantity * (priceMap[i.code] || 0), 0)
          const oldTotal = itemSubtotal + init.tripFee + init.monthFee + init.extra - init.discount
          const newTotal = itemSubtotal + effectiveTripFee + effectiveMonthFee + adjExtra - adjDiscount

          const tripChanged = adjRecalcTrip && tripFeeWillChange
          const monthChanged = adjRecalcMonth && monthFeeWillChange

          return (
            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                ลูกค้า: <strong>{cust.shortName || cust.name}</strong> | SD: <strong>{dn.noteNumber}</strong>
              </div>

              {/* Changes table */}
              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <div className="bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">การเปลี่ยนแปลง</div>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-xs"><th className="text-left px-3 py-1.5">รายการ</th><th className="text-right px-3 py-1.5">เดิม</th><th className="text-center px-2 py-1.5">→</th><th className="text-right px-3 py-1.5">ใหม่</th></tr></thead>
                  <tbody>
                    {tripChanged && (
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-amber-700">ค่ารถ (ครั้ง)</td>
                        <td className="px-3 py-1.5 text-right text-red-500 line-through">{formatCurrency(init.tripFee)}</td>
                        <td className="px-3 py-1.5 text-center text-slate-400">→</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(newTripFeeCalc)}</td>
                      </tr>
                    )}
                    {monthChanged && (
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-purple-700">ค่ารถ (เดือน)</td>
                        <td className="px-3 py-1.5 text-right text-red-500 line-through">{formatCurrency(init.monthFee)}</td>
                        <td className="px-3 py-1.5 text-center text-slate-400">→</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(newMonthFeeCalc || 0)}</td>
                      </tr>
                    )}
                    {extraChanged && (
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-blue-700">extra {adjExtraNote && `(${adjExtraNote})`}</td>
                        <td className="px-3 py-1.5 text-right text-red-500 line-through">{formatCurrency(init.extra)}</td>
                        <td className="px-3 py-1.5 text-center text-slate-400">→</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{formatCurrency(adjExtra)}</td>
                      </tr>
                    )}
                    {discountChanged && (
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-orange-700">ส่วนลด {adjDiscountNote && `(${adjDiscountNote})`}</td>
                        <td className="px-3 py-1.5 text-right text-red-500 line-through">-{formatCurrency(init.discount)}</td>
                        <td className="px-3 py-1.5 text-center text-slate-400">→</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">-{formatCurrency(adjDiscount)}</td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
                      <td className="px-3 py-2">ยอดรวม SD นี้</td>
                      <td className="px-3 py-2 text-right text-red-500 line-through">{formatCurrency(oldTotal)}</td>
                      <td className="px-3 py-2 text-center text-slate-400">→</td>
                      <td className="px-3 py-2 text-right text-emerald-600 font-bold">{formatCurrency(newTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 115 v2 + 119.1: Shared preview component + extra/discount threshold toggle */}
              <TransportFeeImpactPreview
                affectedDn={dn}
                customer={cust}
                allDeliveryNotes={deliveryNotes}
                linenForms={linenForms}
                recalcResults={recalcResults111}
                recalcTrip={adjRecalcTrip}
                setRecalcTrip={setAdjRecalcTrip}
                recalcMonth={adjRecalcMonth}
                setRecalcMonth={setAdjRecalcMonth}
                adjInfo={(adjExtra > 0 || adjDiscount > 0) ? {
                  extra: adjExtra,
                  discount: adjDiscount,
                  applyToThreshold: adjApplyAdj,
                  setApplyToThreshold: setAdjApplyAdj,
                  variant: 'editing',
                } : undefined}
              />

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAdjustConfirm(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                <button onClick={() => {
                  const saveTrip = adjRecalcTrip && tripFeeWillChange
                  const saveThisMonth = adjRecalcMonth && monthFeeWillChange
                  const saveOtherMonth = adjRecalcMonth && otherMonthFeeWillChange
                  updateDeliveryNote(dn.id, {
                    extraCharge: adjExtra,
                    extraChargeNote: adjExtraNote,
                    discount: adjDiscount,
                    discountNote: adjDiscountNote,
                    ...(saveTrip ? { transportFeeTrip: newTripFeeCalc } : {}),
                    ...(saveThisMonth ? { transportFeeMonth: newMonthFeeCalc } : {}),
                  })
                  if (saveOtherMonth && otherDn111) {
                    updateDeliveryNote(otherDn111.id, { transportFeeMonth: otherNewMonthFee })
                  }
                  adjInitRef.current = {
                    extra: adjExtra, extraNote: adjExtraNote,
                    discount: adjDiscount, discountNote: adjDiscountNote,
                    tripFee: saveTrip ? newTripFeeCalc : init.tripFee,
                    monthFee: saveThisMonth ? (newMonthFeeCalc ?? init.monthFee) : init.monthFee,
                  }
                  setShowAdjustConfirm(false)
                }}
                  className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium transition-colors">
                  ยืนยัน
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 84: SD Sync Confirmation Modal — แก้ quantity → preview + recalc transport fees */}
      <Modal
        open={!!pendingSdSync}
        onClose={() => {
          // Cancel: revert DN items
          if (pendingSdSync) {
            const dn = deliveryNotes.find(d => d.id === pendingSdSync.dnId)
            if (dn) {
              const reverted = dn.items.map(di =>
                di.code === pendingSdSync.itemCode ? { ...di, quantity: pendingSdSync.oldQty } : di
              )
              updateDeliveryNote(dn.id, { items: reverted })
            }
          }
          setPendingSdSync(null)
        }}
        title="ยืนยันการแก้ไข SD"
        size="lg"
        closeLabel="cancel"
      >
        {(() => {
          if (!pendingSdSync) return null
          const p = pendingSdSync
          const dn = deliveryNotes.find(d => d.id === p.dnId)
          const lf = linenForms.find(f => f.id === p.lfId)
          const cust = dn ? getCustomer(dn.customerId) : null
          if (!dn || !lf || !cust) return null

          // Recalc preview — pass existing extra/discount so threshold is accurate (115)
          // 119.2: respect sdSyncApplyAdj toggle — pass 0,0 if user chose ignore
          const effExtra = sdSyncApplyAdj ? (dn.extraCharge || 0) : 0
          const effDiscount = sdSyncApplyAdj ? (dn.discount || 0) : 0
          const recalcResults = recalcTransportAfterSync(dn, cust, deliveryNotes, quotations, linenForms, effExtra, effDiscount)
          const hasAdj = (dn.extraCharge || 0) > 0 || (dn.discount || 0) > 0
          const itemName = linenCatalog.find(i => i.code === p.itemCode)?.name || p.itemCode

          return (
            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                ลูกค้า: <strong>{cust.shortName || cust.name}</strong> | SD: <strong>{dn.noteNumber}</strong> | LF: <strong>{lf.formNumber}</strong>
              </div>

              {/* Quantity diff */}
              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <div className="bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  จะ sync col6 (โรงซักแพคส่ง) + col4 (ลูกค้านับกลับ) ใน LF
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-xs"><th className="text-left px-3 py-1.5">รายการ</th><th className="text-right px-3 py-1.5">เดิม</th><th className="text-center px-3 py-1.5">→</th><th className="text-right px-3 py-1.5">ใหม่</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-400 mr-1">{p.itemCode}</span>{itemName}</td>
                      <td className="px-3 py-1.5 text-right text-red-600 line-through">{formatNumber(p.oldQty)}</td>
                      <td className="px-3 py-1.5 text-center text-slate-400">→</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600 font-medium">{formatNumber(p.newQty)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 115: Transport fee preview — shared pattern เดียวกับ Feature 111 */}
              {/* 119.2: adjInfo toggle — ให้ user เลือกว่า extra/discount ที่มีอยู่ต้องคิดเข้าเกณฑ์ค่ารถไหม */}
              <TransportFeeImpactPreview
                affectedDn={dn}
                customer={cust}
                allDeliveryNotes={deliveryNotes}
                linenForms={linenForms}
                recalcResults={recalcResults}
                recalcTrip={sdSyncRecalcTrip}
                setRecalcTrip={setSdSyncRecalcTrip}
                recalcMonth={sdSyncRecalcMonth}
                setRecalcMonth={setSdSyncRecalcMonth}
                hasAdj={hasAdj}
                adjInfo={hasAdj ? {
                  extra: dn.extraCharge || 0,
                  discount: dn.discount || 0,
                  applyToThreshold: sdSyncApplyAdj,
                  setApplyToThreshold: setSdSyncApplyAdj,
                  variant: 'existing',
                } : undefined}
              />

              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                <strong>หมายเหตุ:</strong> ระบบจะ sync LF.col6 + col4 = {formatNumber(p.newQty)} (ทั้ง 2 ค่า) + บันทึก audit log
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    // Cancel: revert DN items
                    const reverted = dn.items.map(di =>
                      di.code === p.itemCode ? { ...di, quantity: p.oldQty } : di
                    )
                    updateDeliveryNote(dn.id, { items: reverted })
                    setPendingSdSync(null)
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    // Confirm: apply sync to LF + recalc fees ตาม 2 checkbox แยกกัน (115)
                    const updatedRows = applyRowsSync(
                      lf.rows,
                      [{ code: p.itemCode, newQty: p.newQty }],
                      'sd_edit',
                      currentUser?.name || 'unknown',
                    )
                    updateLinenForm(lf.id, { rows: updatedRows })

                    for (const r of recalcResults) {
                      const update: { transportFeeTrip?: number; transportFeeMonth?: number } = {}
                      if (r.dnId === dn.id) {
                        if (sdSyncRecalcTrip) update.transportFeeTrip = r.newTripFee
                        if (sdSyncRecalcMonth && r.newMonthFee !== undefined) update.transportFeeMonth = r.newMonthFee
                      } else {
                        if (sdSyncRecalcMonth && r.newMonthFee !== undefined) update.transportFeeMonth = r.newMonthFee
                      }
                      if (Object.keys(update).length > 0) {
                        updateDeliveryNote(r.dnId, update)
                      }
                    }

                    setPendingSdSync(null)
                  }}
                  className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium transition-colors"
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 207: AddItemWizard for SD — เพิ่มรายการใหม่ใน catalog + QT + DN ปัจจุบัน */}
      <AddItemWizard
        open={sdWizardOpen}
        onClose={() => setSdWizardOpen(false)}
        context="sd"
        customerId={detailNote?.customerId || null}
        onComplete={(result) => {
          if (!detailNote) return
          if (detailNote.items.some(i => i.code === result.code && !i.isAdhoc)) return
          const updated = [...detailNote.items, {
            code: result.code,
            quantity: 1,
            isClaim: false,
          }]
          updateDeliveryNote(detailNote.id, { items: updated })
        }}
      />
    </div>
  )
}
