'use client'

import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import FocusBanner from '@/components/FocusBanner'
import { useStore } from '@/lib/store'
import { formatDate, cn, todayISO, startOfMonthISO, endOfMonthISO, scrollToActiveRow, formatExportFilename } from '@/lib/utils'
import { highlightText } from '@/lib/highlight'
import { matchesThaiQuery, matchesThaiQueryAnyField } from '@/lib/thai-search'
import { LINEN_FORM_STATUS_CONFIG, NEXT_LINEN_STATUS, PREV_LINEN_STATUS, ALL_LINEN_STATUSES, PROCESS_STATUSES, DEPARTMENT_CONFIG, type LinenFormStatus, type LinenFormRow } from '@/types'
import LFAiInputModal from '@/components/LFAiInputModal'
import LFBatchScanModal from '@/components/LFBatchScanModal'
import BlankFormModal from '@/components/BlankFormModal'
import PackChecklistModal from '@/components/PackChecklistModal'
import AuditLFModal from '@/components/AuditLFModal'
import type { AiFillMap } from '@/lib/ai-extract-types'
import { applyAiFillToRows } from '@/lib/ai-fill'
import { hasType1Discrepancy, hasType2Discrepancy } from '@/lib/discrepancy'
import { applyRowsSync, lfHasSyncedRows } from '@/lib/sync-discrepancy'
import { trackRecentCustomer } from '@/lib/recent-customers'
import { Plus, Search, ChevronRight, ChevronLeft, AlertTriangle, X, Check, Printer, FileDown, ExternalLink, Sparkles, ArrowUpDown, Wrench, Pencil, Calendar, Loader2, Trash2 } from 'lucide-react'
import { sortByQTOrder } from '@/lib/sort-by-qt'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRouter } from 'next/navigation'
import Modal from '@/components/Modal'
import LinenFormGrid from '@/components/LinenFormGrid'
import LinenFormPrint from '@/components/LinenFormPrint'
import CustomerPicker from '@/components/CustomerPicker'
import ExportButtons from '@/components/ExportButtons'
import DateFilter from '@/components/DateFilter'
import SortableHeader from '@/components/SortableHeader'
import { exportCSV } from '@/lib/export'
import { useScrollToMark } from '@/lib/use-scroll-to-mark'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import AddItemWizard from '@/components/AddItemWizard'
import DiscrepancyHelperModal from '@/components/DiscrepancyHelperModal'

// 404 — แถบ "ซ่อนรายการไว้" (กู้คืน item ที่ลบออกจาก LF) — ใช้ทั้งหน้า detail + สร้างใหม่
function ExcludedCodesBanner({ codes, nameOf, onRestore }: {
  codes: string[] | undefined
  nameOf: (code: string) => string
  onRestore: (code: string) => void
}) {
  if (!codes || codes.length === 0) return null
  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        <span className="font-medium text-slate-500">🗑 ซ่อนรายการไว้ {codes.length} รายการ:</span>
        {codes.map(code => (
          <button key={code} type="button" onClick={() => onRestore(code)}
            title="กดเพื่อกู้คืนรายการนี้กลับเข้าใบ"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-600 hover:border-[#3DD8D8] hover:text-[#1B3A5C] transition-colors">
            <span className="font-mono">{code}</span>
            <span className="text-slate-400 max-w-[120px] truncate">{nameOf(code)}</span>
            <span className="text-[#3DD8D8] font-semibold">↩</span>
          </button>
        ))}
        <span className="text-[10px] text-slate-400">— กดชิปเพื่อกู้คืน</span>
      </div>
    </div>
  )
}

export default function LinenFormsPage() {
  const {
    currentUser,
    linenForms, addLinenForm, addLinenFormsBatch, updateLinenForm, updateLinenFormStatus, deleteLinenForm, deleteLinenFormsBatch,
    customers, getCustomer, getCarryOver, linenCatalog, quotations, deliveryNotes, companyInfo,
  } = useStore()

  const router = useRouter()
  const searchParams = useSearchParams()
  const urlHighlightQ = searchParams.get('q') || '' // 147.2
  const [search, setSearch] = useState('')
  // 162.1: combine local search + URL ?q so live typing also highlights
  const highlightQ = [search, urlHighlightQ].filter(Boolean).join(' ').trim()
  const [statusFilter, setStatusFilter] = useState<LinenFormStatus | 'all'>(() => {
    const s = searchParams.get('status')
    return s && ALL_LINEN_STATUSES.includes(s as LinenFormStatus) ? s as LinenFormStatus : 'all'
  })
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  // 358 — LF Input by AI
  const [showAiInput, setShowAiInput] = useState(false)
  const [showAiInputDetail, setShowAiInputDetail] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [showBlankForm, setShowBlankForm] = useState(false)  // 366.1 — Form Generator (ฟอร์มเปล่าล้อ QT)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  // 297.1: Discrepancy helper — ย้ายมาจาก dashboard (เกี่ยวข้องกับสถานะ ลูกค้านับผ้ากลับแล้ว)
  const [helperOpen, setHelperOpen] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(() => searchParams.get('detail'))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // 292: LF ที่ user กดย้อนแต่มี SD ผูกอยู่ — block + แสดง modal ขอให้ลบ SD ก่อน
  const [revertBlockedFor, setRevertBlockedFor] = useState<string | null>(null)
  // 171.1: scroll to <mark> on arrival from global search
  useScrollToMark([showDetail])
  // 236: watch ?detail= URL changes — เปิด modal เมื่อ Cmd+K ส่ง link มาจาก same page
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam && detailParam !== showDetail) {
      setShowDetail(detailParam)
      setActiveRowId(detailParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Date filter & sort state
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')
  const [dateFrom, setDateFrom] = useState(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState(() => endOfMonthISO())
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [showPrint, setShowPrint] = useState(false)
  const [alertFilter, setAlertFilter] = useState<'all' | 'alert' | 'no-sd'>('all')
  const [printFilter, setPrintFilter] = useState<'all' | 'unprinted' | 'printed'>('all')  // 384

  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  // Focus mode (50): from ?focus=ID1,ID2 — override date filter + auto-open detail
  const [focusIds, setFocusIds] = useState<string[]>(() => {
    const f = searchParams.get('focus')
    return f ? f.split(',').filter(Boolean) : []
  })
  const focusMode = focusIds.length > 0

  // Bulk select state — pre-populated from focus mode
  const [selectedLfIds, setSelectedLfIds] = useState<string[]>(() => {
    const f = searchParams.get('focus')
    return f ? f.split(',').filter(Boolean) : []
  })

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
    setSelectedLfIds([])
    router.replace('/dashboard/linen-forms')
  }
  const [showLfPrintList, setShowLfPrintList] = useState(false)
  const [showLfBulkPrint, setShowLfBulkPrint] = useState(false)
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false)  // 416 — bulk ลบ LF
  // 384.1 — Quick Print LF (multi-customer) — mirror Quick Print SD (303/310)
  const [showQuickPrintLf, setShowQuickPrintLf] = useState(false)
  const [qpLfSelectedCusts, setQpLfSelectedCusts] = useState<Set<string>>(new Set())
  const [qpLfDateMode, setQpLfDateMode] = useState<'this_month' | 'last_30d' | 'all'>('this_month')
  const [qpLfShowPrinted, setQpLfShowPrinted] = useState(false)
  const [qpLfTarget, setQpLfTarget] = useState<{ snapshotGroups: { customerId: string; lfIds: string[] }[]; mode: 'single' | 'multi' } | null>(null)
  const [qpLfReady, setQpLfReady] = useState(false)

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

  // 384.1 — Quick Print LF: group LF by customer (filtered by date + printed status)
  type QpLf = (typeof linenForms)[number]
  const printableLfByCustomer = useMemo(() => {
    const today = new Date()
    let cutoffISO: string | null = null
    if (qpLfDateMode === 'this_month') cutoffISO = `${today.toISOString().slice(0, 7)}-01`
    else if (qpLfDateMode === 'last_30d') { const d = new Date(today); d.setDate(d.getDate() - 30); cutoffISO = d.toISOString().slice(0, 10) }
    const map = new Map<string, { all: QpLf[]; unprinted: QpLf[] }>()
    for (const f of linenForms) {
      if (cutoffISO && f.date < cutoffISO) continue
      if (!qpLfShowPrinted && f.isPrinted) continue
      const bucket = map.get(f.customerId) || { all: [], unprinted: [] }
      bucket.all.push(f)
      if (!f.isPrinted) bucket.unprinted.push(f)
      map.set(f.customerId, bucket)
    }
    for (const b of map.values()) {
      b.all.sort((a, c) => a.date.localeCompare(c.date) || a.formNumber.localeCompare(c.formNumber))
      b.unprinted.sort((a, c) => a.date.localeCompare(c.date) || a.formNumber.localeCompare(c.formNumber))
    }
    return map
  }, [linenForms, qpLfDateMode, qpLfShowPrinted])

  // 310-style snapshot: lock lfIds ตอน click — กัน DOM clear เมื่อ mark isPrinted แล้ว filter ตัดออก
  const quickPrintLfGroups = useMemo(() => {
    if (!qpLfTarget) return []
    const lfMap = new Map(linenForms.map(f => [f.id, f]))
    return qpLfTarget.snapshotGroups.map(g => {
      const c = getCustomer(g.customerId)
      if (!c) return null
      const forms = g.lfIds.map(id => lfMap.get(id)).filter((f): f is QpLf => f !== undefined)
        .sort((a, b) => a.date.localeCompare(b.date) || a.formNumber.localeCompare(b.formNumber))
      return { customer: c, forms }
    }).filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => (a.customer.shortName || a.customer.name).localeCompare(b.customer.shortName || b.customer.name))
  }, [qpLfTarget, linenForms, getCustomer])

  // 308-style contentReady — block print จน DOM paint commit (กัน blank preview ครั้งแรก)
  useEffect(() => {
    if (!qpLfTarget) { setQpLfReady(false); return }
    setQpLfReady(false)
    let raf1 = 0, raf2 = 0, timer = 0
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => { timer = window.setTimeout(() => setQpLfReady(true), 150) }) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(timer) }
  }, [qpLfTarget])

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
    exportCSV(headers, rows, formatExportFilename(detailForm.formNumber, detailCustomer.shortName || detailCustomer.name, detailForm.date))
  }

  const handleLfListCSV = (items: typeof filtered) => {
    const headers = ['ลำดับ', 'เลขที่ LF', 'ลูกค้า', 'วันที่', 'จำนวนชิ้น', 'สถานะ']
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
  const [newExcludedCodes, setNewExcludedCodes] = useState<string[]>([])  // 404

  // 207: AddItemWizard state — เปิดได้ทั้งใน create + detail modal
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardCustomerId, setWizardCustomerId] = useState<string | null>(null)
  // 209: track ว่า wizard ถูกเปิดจาก create หรือ detail (เพื่อรู้จะเพิ่ม row ที่ไหน)
  const [wizardTarget, setWizardTarget] = useState<'create' | 'detail' | null>(null)
  const [wizardTargetLfId, setWizardTargetLfId] = useState<string | null>(null)

  // 344: edit date state — pencil icon ใน detail modal เปิด inline date input
  //   confirm ก่อน save (carry-over จะ recalc บนช่วง date เก่า/ใหม่)
  const [editingDate, setEditingDate] = useState<string>('')   // empty = not editing, ISO = editing value
  const [dateConfirm, setDateConfirm] = useState<{ newDate: string; oldDate: string } | null>(null)

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
      // Focus mode (50): bypass all other filters except focus IDs
      if (focusMode) return focusIds.includes(f.id)

      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      // 384 — filter สถานะพิมพ์
      if (printFilter === 'unprinted' && f.isPrinted) return false
      if (printFilter === 'printed' && !f.isPrinted) return false
      if (customerFilter !== 'all' && f.customerId !== customerFilter) return false
      if (search) {
        const customer = getCustomer(f.customerId)
        // 241: Thai-aware tolerant filter — substring → phonetic fallback (Thai only)
        const textMatch = matchesThaiQueryAnyField([f.formNumber, customer?.shortName, customer?.name], search)
        // 214: รหัส + ชื่อรายการ (audit: หา LF ที่มี code นี้)
        const itemMatch = !textMatch && (f.rows || []).some(r => {
          if (!r) return false
          if (matchesThaiQuery(r.code || '', search)) return true
          const def = r.code ? linenCatalog.find(c => c.code === r.code) : null
          if (def && matchesThaiQueryAnyField([def.name, def.nameEn], search)) return true
          return false
        })
        if (!textMatch && !itemMatch) return false
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
    // getPiecesForStatus เป็น pure ต่อ argument (อ่านแค่ f.rows/f.status ไม่มี external state) / linenCatalog เพิ่มเป็น store value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linenForms, statusFilter, customerFilter, search, getCustomer, dateFrom, dateTo, dateFilterMode, sortKey, sortDir, alertFilter, printFilter, linkedLFMap, focusMode, focusIds, linenCatalog])

  // 417.2 — virtualize ตาราง LF (รองรับหลักหมื่นแถวไม่ค้าง) · element-scroll + spacer rows + เก็บ row JSX เดิม
  const listScrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 57,
    overscan: 12,
    getItemKey: (index) => filtered[index]?.id ?? index,
  })

  const statuses: (LinenFormStatus | 'all')[] = ['all', ...ALL_LINEN_STATUSES]

  // Helper: get the linked accepted QT for a customer (match by customerId)
  const getLinkedQT = (custName: string, custId?: string) =>
    quotations.find(q =>
      q.status === 'accepted' &&
      custId && q.customerId === custId
    ) || null

  // 413: dedupe codes — กัน row code ซ้ำตั้งแต่ต้นทาง (QT มี code ซ้ำ → buildRows เคยสร้าง row ซ้ำ
  //   → SD รวม col6 ข้าม row ซ้ำ = qty เกิน ไม่ตรง LF · invariant: 1 row ต่อ 1 code เสมอ)
  const buildRows = (codes: string[]) => {
    const seen = new Set<string>()
    return codes.filter(code => {
      if (seen.has(code)) return false
      seen.add(code)
      return true
    }).map(code => ({
      code,
      col1_carryOver: 0,
      col2_hotelCountIn: 0,
      col3_hotelClaimCount: 0,
      col4_factoryApproved: 0,
      col5_factoryClaimApproved: 0,
      col6_factoryPackSend: 0,
      note: '',
    }))
  }

  const handleCreateOpen = () => {
    // 181: เริ่มแบบ blank — ผู้ใช้เลือกลูกค้าเอง (กัน default หลุดเป็นรายอื่น)
    setNewCustomerId('')
    setNewRows([])
    setNewDate(todayISO())
    setNewNotes('')
    setNewBagsSent(0)
    setNewExcludedCodes([])  // 404
    setShowCreate(true)
  }

  const handleCustomerSelect = (custId: string) => {
    setNewCustomerId(custId)
    if (custId) trackRecentCustomer(custId)
    const cust = getCustomer(custId)
    if (cust) {
      // 226.B: QT = single source of truth — ถ้าไม่มี QT ให้ user เห็น empty + prompt
      const linkedQT = getLinkedQT(cust.name, custId)
      const codes = linkedQT ? linkedQT.items.map(i => i.code) : []
      setNewRows(buildRows(codes))
    }
  }

  const handleCreate = () => {
    if (!newCustomerId || newRows.length === 0) return
    // 265 — snapshot workflowMode ตอนสร้าง (กัน drift เมื่อ customer toggle ภายหลัง)
    const cust = getCustomer(newCustomerId)
    const newLF = addLinenForm({
      customerId: newCustomerId,
      date: newDate,
      status: 'draft',
      rows: newRows,
      notes: newNotes,
      bagsSentCount: newBagsSent,
      workflowMode: cust?.workflowMode ?? 'cross_check',
      excludedCodes: newExcludedCodes.length > 0 ? newExcludedCodes : undefined,  // 404
    })
    setActiveRowId(newLF.id)
    scrollToActiveRow(newLF.id)
    setShowCreate(false)
  }

  const aiCust = newCustomerId ? getCustomer(newCustomerId) : null
  const aiItems = newRows.map(r => ({
    code: r.code,
    name: aiCust?.itemNicknames?.[r.code] || linenCatalog.find(c => c.code === r.code)?.name || r.code,
  }))

  // 358/362/364.1 — เติมผล AI ลง newRows: col2/col3/col5/col6 + consolidate aggregate (col2/col5) ที่ anchor
  //   customer config = source of truth → ทนทานแม้ AI อ่านปีกกาไม่ออก / ลงเลขผิดแถว / ลืมเขียนปีกกา
  const handleAiAccept = (fill: AiFillMap) => {
    setNewRows(rows => (aiCust ? applyAiFillToRows(rows, fill, aiCust, linenCatalog) : rows))
  }

  const detailForm = showDetail ? linenForms.find(f => f.id === showDetail) : null
  const detailCustomer = detailForm ? getCustomer(detailForm.customerId) : null
  const detailCarryOver = detailForm ? getCarryOver(detailForm.customerId, detailForm.date) : {}
  const nextDetailStatus = detailForm ? NEXT_LINEN_STATUS[detailForm.status] : null
  const linkedDN = detailForm ? deliveryNotes.find(dn => dn.linenFormIds.includes(detailForm.id)) : null
  const isLockedByDN = !!linkedDN && detailForm?.status === 'confirmed'

  // 362.2 — AI input ใน LF detail (ใช้ได้ถึง 4/7) — เติม col2/col3/col5/col6 ของ detailForm
  const aiItemsDetail = detailForm
    ? detailForm.rows.map(r => ({
        code: r.code,
        name: detailCustomer?.itemNicknames?.[r.code] || linenCatalog.find(c => c.code === r.code)?.name || r.code,
      }))
    : []
  const handleAiAcceptDetail = (fill: AiFillMap) => {
    if (!detailForm || !detailCustomer) return
    updateLinenForm(detailForm.id, { rows: applyAiFillToRows(detailForm.rows, fill, detailCustomer, linenCatalog) })
  }

  // 368 — Batch Scan Wizard helpers
  const batchCatalogHints = useMemo(() => linenCatalog.map(c => ({ code: c.code, name: c.name })), [linenCatalog])
  const matchCustomerByName = (nameRaw: string): string => {
    const q = (nameRaw || '').trim()
    if (!q) return ''
    const exact = customers.find(c => [c.customerCode, c.shortName, c.name].some(f => f && f.toLowerCase() === q.toLowerCase()))
    if (exact) return exact.id
    return customers.find(c => matchesThaiQueryAnyField([c.name, c.shortName, c.customerCode, c.nameEn], q))?.id || ''
  }
  const itemsForCustomerBatch = (custId: string) => {
    const cust = getCustomer(custId)
    if (!cust) return []
    const qt = getLinkedQT(cust.name, custId)
    return (qt ? qt.items.map(i => i.code) : []).map(code => ({
      code, name: cust.itemNicknames?.[code] || linenCatalog.find(c => c.code === code)?.name || code,
    }))
  }
  const hasExistingLFBatch = (custId: string, date: string) => linenForms.some(f => f.customerId === custId && f.date === date)
  const handleBatchComplete = (items: { customerId: string; date: string; fill: AiFillMap }[]) => {
    // 372: รวบเป็น array แล้วเรียก batch ครั้งเดียว — กัน formNumber ซ้ำ (closure-stale) + fire-and-forget race
    const toCreate: Parameters<typeof addLinenFormsBatch>[0] = []
    let skipped = 0
    for (const it of items) {
      const cust = getCustomer(it.customerId)
      const qt = cust ? getLinkedQT(cust.name, it.customerId) : null
      if (!cust || !qt) { skipped++; continue }  // MPD: ไม่มี QT → สร้างไม่ได้
      const rows = applyAiFillToRows(buildRows(qt.items.map(i => i.code)), it.fill, cust, linenCatalog)
      toCreate.push({ customerId: it.customerId, date: it.date, status: 'washing', rows, notes: 'นำเข้าด้วย AI (batch)', bagsSentCount: 0, workflowMode: cust.workflowMode ?? 'cross_check' })
    }
    addLinenFormsBatch(toCreate)
    alert(`สร้าง LF สำเร็จ ${toCreate.length} ใบ (สถานะ 4/7 ซักอบเสร็จ)${skipped ? `\nข้าม ${skipped} ใบ (ไม่มีลูกค้า/QT)` : ''}`)
  }

  // 363 — ลงยอด col6 (โรงซักแพคส่ง) + เก็บ breakdown จากใบเช็คผ้า
  const checklistCurrentCol6 = detailForm
    ? Object.fromEntries(detailForm.rows.map(r => [r.code, r.col6_factoryPackSend]))
    : {}
  const handleChecklistApply = (updates: { code: string; col6: number; breakdown: number[] }[]) => {
    if (!detailForm) return
    const m = new Map(updates.map(u => [u.code, u]))
    const newRows = detailForm.rows.map(r => {
      const u = m.get(r.code)
      return u ? { ...r, col6_factoryPackSend: u.col6, col6Breakdown: u.breakdown } : r
    })
    updateLinenForm(detailForm.id, { rows: newRows })
  }

  // 366.2 — Audit LF: apply ค่าจากเอกสารที่สแกน (form 4col + checklist col6) ลง LF
  const handleAuditApply = (updates: { code: string; vals: Partial<{ col2: number | null; col3: number | null; col5: number | null; col6: number | null }>; col6Breakdown?: number[] }[]) => {
    if (!detailForm) return
    const m = new Map(updates.map(u => [u.code, u]))
    const newRows = detailForm.rows.map(r => {
      const u = m.get(r.code)
      if (!u) return r
      const patch: Partial<LinenFormRow> = {}
      if (u.vals.col2 != null) patch.col2_hotelCountIn = u.vals.col2
      if (u.vals.col3 != null) patch.col3_hotelClaimCount = u.vals.col3
      if (u.vals.col5 != null) patch.col5_factoryClaimApproved = u.vals.col5
      if (u.vals.col6 != null) patch.col6_factoryPackSend = u.vals.col6
      if (u.col6Breakdown) patch.col6Breakdown = u.col6Breakdown
      return { ...r, ...patch }
    })
    updateLinenForm(detailForm.id, { rows: newRows })
  }

  /**
   * 261: Re-sort LF rows ตามลำดับ accepted QT ล่าสุด
   * — สำหรับ LFs ที่สร้างก่อน QT reorder
   */
  const handleResortLFByQT = () => {
    if (!detailForm || !detailCustomer) return
    const { sorted, latestQT, sameOrder } = sortByQTOrder(detailForm.rows, detailForm.customerId, quotations, linenCatalog)
    if (!latestQT) {
      alert('ลูกค้านี้ไม่มี QT ที่สถานะ "ตกลง" — ไม่สามารถ re-sort ได้\n\nกรุณาสร้าง/accept QT ก่อน')
      return
    }
    if (sameOrder) {
      alert(`ลำดับ rows ใน LF ${detailForm.formNumber} ตรงกับ QT ${latestQT.quotationNumber} แล้ว — ไม่ต้อง re-sort`)
      return
    }
    const itemNameMap = Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))
    const preview = sorted.slice(0, 8).map((row, idx) => {
      const oldIdx = detailForm.rows.findIndex(r => r.code === row.code)
      const changed = oldIdx !== idx
      const name = itemNameMap[row.code] || row.code
      return `${idx + 1}. ${changed ? '↻' : '  '} ${row.code} · ${name}`
    }).join('\n')
    const overflow = sorted.length > 8 ? `\n... + อีก ${sorted.length - 8} รายการ` : ''
    if (!confirm(`Re-sort rows ใน LF ${detailForm.formNumber} ตามลำดับ QT ${latestQT.quotationNumber}?\n\nลำดับใหม่ (8 รายการแรก):\n${preview}${overflow}\n\n— เปลี่ยนเฉพาะลำดับ ไม่กระทบจำนวน col1-col6 / note —`)) return
    updateLinenForm(detailForm.id, { rows: sorted })
  }

  // 416 — bulk ลบ LF + guard กัน orphan SD: ข้าม LF ที่มีใบส่งของ (SD) ผูกอยู่
  //   (SD ผูก LF ผ่าน dn.linenFormIds — ถ้าลบ LF ทิ้ง SD จะกลายเป็นกำพร้า/ยอดเพี้ยน)
  //   partial pattern เดียวกับ SD→WB / WB→IV: ลบเฉพาะที่ปลอดภัย ข้ามที่ผูก แจ้งจำนวน
  const splitDeletableLfs = () => {
    const lfWithSd = new Set(deliveryNotes.flatMap(d => d.linenFormIds || []))
    const lockedIds = selectedLfIds.filter(id => lfWithSd.has(id))
    const lockedSet = new Set(lockedIds)
    return { deletableIds: selectedLfIds.filter(id => !lockedSet.has(id)), lockedIds }
  }

  const handleBulkDeleteLF = () => {
    const { deletableIds, lockedIds } = splitDeletableLfs()
    if (deletableIds.length === 0) {
      alert(`ลบไม่ได้ — LF ที่เลือกทั้งหมด ${lockedIds.length} ใบมีใบส่งของ (SD) ผูกอยู่\nต้องลบ SD ก่อน ถึงจะลบ LF ได้ (กัน SD กำพร้า)`)
      return
    }
    deleteLinenFormsBatch(deletableIds)
    setSelectedLfIds([])
    setConfirmBulkDeleteOpen(false)
    if (lockedIds.length > 0) {
      alert(`ลบ LF ${deletableIds.length} ใบ\n\n⏭️ ข้าม ${lockedIds.length} ใบ — มี SD ผูกอยู่ (ต้องลบ SD ก่อน กัน SD กำพร้า)`)
    }
  }

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
    // 292: ถ้ามี SD ผูกอยู่ → ห้ามย้อน (ป้องกันข้อมูล LF/SD ไม่ตรงกัน) — แจ้ง user ลบ SD ก่อน
    if (linkedLFMap.has(formId)) {
      setRevertBlockedFor(formId)
      return
    }
    const prev = PREV_LINEN_STATUS[form.status]
    if (prev) updateLinenFormStatus(formId, prev)
  }

  // Scroll modal to top + auto-focus first editable cell (spreadsheet UX)
  const scrollAndFocusGrid = (skipScroll = false, targetStatus?: string) => {
    setTimeout(() => {
      // Scroll modal body to top
      if (!skipScroll) {
        const modalBody = document.querySelector('.max-h-\\[94vh\\] > .overflow-auto') as HTMLElement | null
        if (modalBody) modalBody.scrollTop = 0
      }
      // Wait for React re-render then focus the right input
      const tryFocus = (attempt = 0) => {
        if (targetStatus === 'packed') {
          const bagsInput = document.getElementById('bags-pack-input') as HTMLInputElement
          if (bagsInput) { bagsInput.focus(); bagsInput.select(); return }
        }
        const firstInput = document.querySelector('#linen-form-detail input[data-row="0"]') as HTMLInputElement
        if (firstInput) { firstInput.focus(); firstInput.select(); return }
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
            <>
              <button onClick={() => setShowLfBulkPrint(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
                <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสารที่เลือก ({selectedLfIds.length})
              </button>
              <button onClick={() => setConfirmBulkDeleteOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">
                <Trash2 className="w-4 h-4" />ลบที่เลือก ({selectedLfIds.length})
              </button>
            </>
          )}
          {/* 388 — พิมพ์ฟอร์มเปล่า ย้ายมาซ้ายสุด (ก่อน Discrepancy) — flow เริ่มจาก "พิมพ์ฟอร์มเปล่า → เขียนมือ → scan กลับ" */}
          <button onClick={() => setShowBlankForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
            title="พิมพ์ฟอร์มเปล่า (ใบเช็คผ้า/ใบส่งรับผ้า) รายการล้อ QT ลูกค้า — ให้พนักงานกรอก แล้ว scan กลับ ลดภาระ AI + audit ตรง">
            <FileDown className="w-4 h-4" />พิมพ์ฟอร์มเปล่า
          </button>
          {/* 297.1: Discrepancy helper — ย้ายมาจาก dashboard */}
          <button onClick={() => setHelperOpen(true)}
            title="ใช้เมื่อลูกค้าแจ้งว่านับผ้ากลับไม่ตรง — sync col6 ↔ col4 + recalc fees อัตโนมัติ"
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium">
            <Wrench className="w-4 h-4" />ลูกค้าแจ้งนับผ้าไม่ตรง
          </button>
          <button onClick={() => setShowLfPrintList(true)} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
          </button>
          {/* 384.1 — Quick Print LF (multi-customer) */}
          <button onClick={() => setShowQuickPrintLf(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors text-sm font-medium"
            title="เห็นลูกค้าทุกรายที่มี LF รอพิมพ์ → เลือกหลายราย → พิมพ์ทีเดียว แยกตามลูกค้า (แบบเดียวกับพิมพ์ SD เร่งด่วน)">
            <Sparkles className="w-4 h-4" />พิมพ์ LF เร่งด่วน
          </button>
          <button onClick={() => setShowBatch(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium"
            title="อัปโหลดใบส่งรับผ้าหลายใบ → AI อ่านลูกค้า/วันที่/ยอด → สร้าง LF ที่ 4/7 รวดเดียว">
            📷 นำเข้าหลายใบ (AI)
          </button>
          {/* 388.1 — สร้างใบส่งรับผ้าใหม่ ย้ายมาขวาสุด (หลัง 📷 นำเข้าหลายใบ) — primary action ของหน้านี้ */}
          <button onClick={handleCreateOpen}
            className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />สร้างใบส่งรับผ้าใหม่
          </button>
        </div>
      </div>

      {/* 297.1: Discrepancy Helper Modal (moved from dashboard) */}
      <DiscrepancyHelperModal open={helperOpen} onClose={() => setHelperOpen(false)} />
      {/* 366.1 — Form Generator (ฟอร์มเปล่าล้อ QT — เริ่มจากข้อมูลต้นทางที่ดีก่อน scan) */}
      <BlankFormModal open={showBlankForm} onClose={() => setShowBlankForm(false)} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่ใบส่งรับผ้า, ชื่อลูกค้า, รหัสสินค้า, รายการสินค้า"
            className="w-full pl-10 pr-4 py-2 border-2 border-[#3DD8D8] rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
          />
        </div>
        {/* 138: customer filter — teal เมื่อ active (ตรงกับปุ่มสร้าง) */}
        {/* 162.2: searchable CustomerPicker */}
        <CustomerPicker
          value={customerFilter === 'all' ? '' : customerFilter}
          onChange={id => setCustomerFilter(id || 'all')}
          allowAll
        />
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

      {/* 384 — Print status filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([
          { key: 'all' as const, label: 'ทั้งหมด' },
          { key: 'unprinted' as const, label: '🖨 ยังไม่พิมพ์' },
          { key: 'printed' as const, label: '✓ พิมพ์แล้ว' },
        ]).map(f => (
          <button key={f.key} onClick={() => setPrintFilter(f.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              printFilter === f.key
                ? f.key === 'unprinted' ? 'bg-blue-500 text-white' : f.key === 'printed' ? 'bg-emerald-500 text-white' : 'bg-[#3DD8D8] text-[#1B3A5C]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}>
            {f.label}
            <span className="ml-1 opacity-70">
              ({f.key === 'all' ? linenForms.length : f.key === 'unprinted' ? linenForms.filter(x => !x.isPrinted).length : linenForms.filter(x => x.isPrinted).length})
            </span>
          </button>
        ))}
      </div>

      {/* Focus Mode Banner (62: ตำแหน่งเดียวกับ SD page — หลัง filters, ก่อน table) */}
      {focusMode && (
        <FocusBanner
          count={focusIds.length}
          docNumbers={focusIds.map(id => linenForms.find(f => f.id === id)?.formNumber).filter(Boolean) as string[]}
          docType="ใบรับส่งผ้า"
          onExit={exitFocus}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* 417.2 — inner-scroll container (virtualize ทำงานบน scroll นี้) · thead sticky */}
        <div ref={listScrollRef} className="overflow-auto" style={{ maxHeight: '72vh' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50">
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
              ) : (() => {
                const vItems = rowVirtualizer.getVirtualItems()
                const padTop = vItems.length > 0 ? vItems[0].start : 0
                const padBottom = vItems.length > 0 ? rowVirtualizer.getTotalSize() - vItems[vItems.length - 1].end : 0
                return (
                  <>
                    {padTop > 0 && <tr aria-hidden><td colSpan={12} style={{ height: padTop, padding: 0, border: 0 }} /></tr>}
                    {vItems.map(vi => {
                const form = filtered[vi.index]
                const customer = getCustomer(form.customerId)
                const totalPieces = getPiecesForStatus(form)
                const disc1 = hasType1Discrepancy(form)
                const disc2 = hasType2Discrepancy(form)
                const cfg = LINEN_FORM_STATUS_CONFIG[form.status] || LINEN_FORM_STATUS_CONFIG.draft
                const nextStatus = NEXT_LINEN_STATUS[form.status]
                const linkedDNInfo = linkedLFMap.get(form.id)

                return (
                  <tr key={form.id} data-row-id={form.id} data-index={vi.index} ref={rowVirtualizer.measureElement}
                    className={cn("border-b border-slate-100 cursor-pointer", activeRowId === form.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50')}
                    onClick={() => { setActiveRowId(form.id); setShowDetail(form.id) }}>
                    <td className="px-2 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selectedLfIds.includes(form.id)}
                        onChange={e => { if (e.target.checked) setSelectedLfIds(prev => [...prev, form.id]); else setSelectedLfIds(prev => prev.filter(id => id !== form.id)) }}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </td>
                    {/* 135.4: date + customer = เด่น, formNumber = muted */}
                    {/* 147.2: highlight keyword จาก Global Search ?q= */}
                    <td className={cn("px-4 py-3 text-slate-700 font-medium whitespace-nowrap", sortedBg('date'))}>{formatDate(form.date)}</td>
                    <td className={cn("px-4 py-3 text-slate-800 font-medium", sortedBg('customer'))}>
                      <span className="truncate block max-w-[120px]">
                        {highlightText(customer?.shortName || customer?.name || '-', highlightQ)}
                        {form.workflowMode === 'trust_customer' && (
                          <span title="Trust Customer — LF snapshot ไม่มี col5" className="ml-1 text-emerald-600">✅</span>
                        )}
                      </span>
                    </td>
                    <td className={cn("px-4 py-3 font-mono text-[11px] text-slate-400", sortedBg('formNumber'))}>
                      <span className="inline-flex items-center gap-1">
                        {highlightText(form.formNumber, highlightQ)}
                        {/* 70+73+74+75: Synced badge — เคยมี discrepancy + sync แล้ว */}
                        {lfHasSyncedRows(form) && (
                          <span title="LF นี้ มีรายการที่เคยปรับ จำนวนผ้าลูกค้านับกลับไม่ตรง แล้ว">📝</span>
                        )}
                      </span>
                    </td>
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
                        {(() => {
                          const prevSt = PREV_LINEN_STATUS[form.status]
                          return prevSt && (
                            <button onClick={() => handleRevertStatus(form.id)}
                              className="h-7 px-2 text-[11px] bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors flex items-center gap-0.5 font-medium flex-shrink-0"
                              title={`ย้อนกลับ → ${LINEN_FORM_STATUS_CONFIG[prevSt].label}`}>
                              <ChevronLeft className="w-3 h-3" />ย้อน
                            </button>
                          )
                        })()}
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
                    {padBottom > 0 && <tr aria-hidden><td colSpan={12} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>}
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* 185.4 (revised): floating total bar */}
      <FloatingTotalBar show={filtered.length > 0}>
        <span>รวม {filtered.length} รายการ</span>
      </FloatingTotalBar>

      {/* 416 — ยืนยัน bulk ลบ LF (guard กัน orphan SD: ข้ามใบที่มี SD ผูก) */}
      <Modal open={confirmBulkDeleteOpen} onClose={() => setConfirmBulkDeleteOpen(false)} title="ยืนยันการลบ LF" closeLabel="cancel">
        {(() => {
          const { deletableIds, lockedIds } = splitDeletableLfs()
          return (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                เลือกไว้ <span className="font-semibold">{selectedLfIds.length} ใบ</span> —
                ลบได้ <span className="font-semibold text-red-600">{deletableIds.length} ใบ</span>
              </p>
              {lockedIds.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⏭️ ข้าม <strong>{lockedIds.length} ใบ</strong> — มีใบส่งของ (SD) ผูกอยู่ (ลบไม่ได้ ต้องลบ SD ก่อน เพื่อกัน SD กำพร้า)
                </p>
              )}
              <p className="text-xs text-slate-400">การลบ LF เป็นการลบถาวร — ตรวจให้แน่ใจก่อนยืนยัน</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setConfirmBulkDeleteOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                <button onClick={handleBulkDeleteLF} disabled={deletableIds.length === 0}
                  className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 rounded-lg flex items-center gap-1.5 font-medium">
                  <Trash2 className="w-3.5 h-3.5" />ลบ {deletableIds.length} ใบ
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Create Modal */}
      <LFAiInputModal
        open={showAiInput}
        onClose={() => setShowAiInput(false)}
        items={aiItems}
        onAccept={handleAiAccept}
      />
      {/* Detail Modal (362.2 — ใช้ได้ถึง 4/7) */}
      <LFAiInputModal
        open={showAiInputDetail}
        onClose={() => setShowAiInputDetail(false)}
        items={aiItemsDetail}
        onAccept={handleAiAcceptDetail}
      />
      {/* 368 — Batch Scan Wizard */}
      <LFBatchScanModal
        open={showBatch}
        onClose={() => setShowBatch(false)}
        customers={customers}
        catalogHints={batchCatalogHints}
        matchCustomer={matchCustomerByName}
        itemsForCustomer={itemsForCustomerBatch}
        hasExistingLF={hasExistingLFBatch}
        onComplete={handleBatchComplete}
      />
      {/* 363 — Pack Checklist audit */}
      <PackChecklistModal
        open={showChecklist}
        onClose={() => setShowChecklist(false)}
        items={aiItemsDetail}
        currentCol6={checklistCurrentCol6}
        expectCustomer={detailCustomer?.shortName || detailCustomer?.name}
        expectDate={detailForm?.date}
        onApply={handleChecklistApply}
      />
      {/* 366.2 — Audit LF (สแกน 2 ใบเทียบ) */}
      <AuditLFModal
        open={showAudit}
        onClose={() => setShowAudit(false)}
        lfRows={detailForm?.rows || []}
        items={aiItemsDetail}
        itemName={(code) => linenCatalog.find(c => c.code === code)?.name || code}
        expectCustomer={detailCustomer?.shortName || detailCustomer?.name}
        expectDate={detailForm?.date}
        onApply={handleAuditApply}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างใบส่งรับผ้าใหม่ (Create New LF)" size="wide" closeLabel="cancel">
        {/* 181.1: min-h ให้ panel ของ CustomerPicker (~400px) ไม่ดูใหญ่กว่า modal */}
        <div className="space-y-4 min-h-[480px]">
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5 text-sm text-teal-700">
            <span className="font-medium">สิ่งที่ทำ: {LINEN_FORM_STATUS_CONFIG.draft.todoLabel}</span>
            <span className="mx-2">|</span>
            กรอก: จำนวนถุงกระสอบส่งซัก, ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, หมายเหตุ
            <span className="ml-2 text-xs text-teal-500">(บันทึกแล้วจะเข้าสถานะ &quot;{LINEN_FORM_STATUS_CONFIG.draft.label}&quot;+ปิดหน้าต่างอัตโนมัติ) , (คลิกปุ่ม {LINEN_FORM_STATUS_CONFIG.draft.label} เพื่อกรอกข้อมูลสถานะถัดไป)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">ลูกค้า</label>
              {/* 162.2.1: searchable CustomerPicker */}
              <CustomerPicker
                value={newCustomerId}
                onChange={id => handleCustomerSelect(id)}
                allowAll={false}
                themed={false}
                fullWidth
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">วันที่</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {/* 181.1: empty state เมื่อยังไม่เลือกลูกค้า — กัน modal "ว่าง" ดูแปลก */}
          {!newCustomerId && (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg px-4 py-12 text-center text-sm text-slate-500">
              เลือกลูกค้าเพื่อเริ่มสร้างใบส่งรับผ้า
            </div>
          )}

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
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAiInput(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#3DD8D8]/15 text-[#1B3A5C] border border-[#3DD8D8] rounded-lg hover:bg-[#3DD8D8]/25 transition-colors"
                  title="ถ่ายรูป/อัปโหลดใบนับผ้า → AI อ่าน + กรอกให้ (ตรวจก่อนบันทึก)">
                  📷 กรอกด้วย AI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWizardCustomerId(newCustomerId)
                    setWizardTarget('create')
                    setWizardTargetLfId(null)
                    setWizardOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                  title="ถ้าเจอผ้ารายการใหม่ที่ไม่มีใน catalog/QT — เพิ่มได้ทันทีที่นี่">
                  <Sparkles className="w-3.5 h-3.5" /> เพิ่มผ้ารายการใหม่ (Wizard)
                </button>
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
                highlightQ={highlightQ}
                excludedCodes={newExcludedCodes}
                onDeleteRow={(code) => {
                  setNewRows(prev => prev.filter(r => r.code !== code))
                  setNewExcludedCodes(prev => Array.from(new Set([...prev, code])))
                }}
              />
              {/* 404: รายการที่ถูกลบในใบใหม่ — กู้คืนได้ */}
              <ExcludedCodesBanner
                codes={newExcludedCodes}
                nameOf={(code) => linenCatalog.find(c => c.code === code)?.name || ''}
                onRestore={(code) => setNewExcludedCodes(prev => prev.filter(c => c !== code))}
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
                const cust = getCustomer(newCustomerId)
                const newLF = addLinenForm({ customerId: newCustomerId, date: newDate, status: 'draft', rows: newRows, notes: newNotes, bagsSentCount: newBagsSent, workflowMode: cust?.workflowMode ?? 'cross_check' })
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
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setEditingDate(''); setDateConfirm(null) }} title={`ใบส่งรับผ้า ${detailForm?.formNumber || ''}`} size="wide" closeLabel="saved">
        {detailForm && detailCustomer && (
          <div className="space-y-4">
            <div id="linen-form-detail" className="space-y-4 bg-white p-2">
            <div className="flex flex-wrap gap-4 text-sm items-center">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">ลูกค้า:</span>
                <strong>{detailCustomer.shortName || detailCustomer.name}</strong>
                {detailForm.workflowMode === 'trust_customer' && (
                  <span
                    title="LF นี้ snapshot โหมด Trust Customer ตอนสร้าง — col5 (โรงซักนับเข้า) ไม่มี · col4 (ลูกค้านับกลับ) ยังกรอกได้"
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    ✅ Trust Customer
                  </span>
                )}
              </div>
              {/* 344: editable date — pencil → inline date input → confirm modal */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500">วันที่:</span>
                {editingDate ? (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#3DD8D8]" />
                    <input
                      type="date"
                      value={editingDate}
                      onChange={e => setEditingDate(e.target.value)}
                      className="px-2 py-1 border border-[#3DD8D8] rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!editingDate || editingDate === detailForm.date) {
                          setEditingDate('')
                          return
                        }
                        setDateConfirm({ newDate: editingDate, oldDate: detailForm.date })
                      }}
                      className="px-2 py-1 text-xs bg-[#3DD8D8] text-[#1B3A5C] rounded hover:bg-[#2bb8b8] font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> ยืนยัน
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDate('')}
                      className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded"
                    >
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <>
                    <strong>{formatDate(detailForm.date)}</strong>
                    <button
                      type="button"
                      onClick={() => setEditingDate(detailForm.date)}
                      title="เปลี่ยนวันที่ของ LF นี้"
                      className="p-1 text-slate-400 hover:text-[#1B3A5C] hover:bg-slate-100 rounded transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
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
                sorting: 'เมื่อซักอบเสร็จแล้ว ให้คลิกที่ปุ่ม "ซักอบเสร็จ"',
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

            <div className="flex items-center justify-end gap-2">
              {/* 261: Re-sort by QT (สำหรับ LFs ที่สร้างก่อน QT reorder) */}
              {detailForm.rows.length > 1 && (
                <button
                  type="button"
                  onClick={handleResortLFByQT}
                  title="จัดเรียง rows ใหม่ตามลำดับ QT ล่าสุดที่ตกลงแล้ว (ลำดับเท่านั้น ไม่กระทบจำนวน)"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#1B3A5C] hover:bg-[#3DD8D8]/15 rounded-lg border border-[#3DD8D8]/40"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Re-sort by QT
                </button>
              )}
              {(() => {
                // 209: status guard
                const hasSD = !!linkedDN
                const isLateStatus = !['draft', 'received'].includes(detailForm.status)
                const disabled = hasSD
                const blockMsg = hasSD
                  ? `ไม่สามารถเพิ่มรายการได้ — LF นี้สร้างใบส่งของ (${linkedDN?.noteNumber}) ไปแล้ว`
                  : ''
                const warnMsg = isLateStatus
                  ? `LF อยู่สถานะ "${LINEN_FORM_STATUS_CONFIG[detailForm.status].label}" — เพิ่มรายการอาจกระทบยอดที่นับไปแล้ว ยืนยันต่อ?`
                  : ''
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) { alert(blockMsg); return }
                      if (warnMsg && !confirm(warnMsg)) return
                      setWizardCustomerId(detailForm.customerId)
                      setWizardTarget('detail')
                      setWizardTargetLfId(detailForm.id)
                      setWizardOpen(true)
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors',
                      disabled
                        ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    )}
                    title={disabled ? blockMsg : 'ถ้าเจอผ้ารายการใหม่ที่ไม่มีใน catalog/QT — เพิ่มได้ทันทีที่นี่'}>
                    <Sparkles className="w-3.5 h-3.5" /> เพิ่มผ้ารายการใหม่ (Wizard)
                    {hasSD && <span className="text-[10px] ml-1">(ปิดเพราะมี SD แล้ว)</span>}
                  </button>
                )
              })()}
            </div>
            {['draft', 'received', 'sorting', 'washing', 'packed', 'delivered', 'confirmed'].includes(detailForm.status) && (
              <div className="flex items-center justify-end gap-2 mb-2">
                {['draft', 'received', 'sorting', 'washing'].includes(detailForm.status) && (
                  <button
                    type="button"
                    onClick={() => setShowAiInputDetail(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#3DD8D8]/15 text-[#1B3A5C] border border-[#3DD8D8] rounded-lg hover:bg-[#3DD8D8]/25 transition-colors"
                    title="ถ่ายรูป/อัปโหลดใบนับ → AI อ่าน + กรอก นับส่ง/เคลม/นับเข้า/แพคส่ง (ตรวจก่อนบันทึก)">
                    📷 กรอกด้วย AI
                  </button>
                )}
                {['washing', 'packed', 'delivered', 'confirmed'].includes(detailForm.status) && (
                  <button
                    type="button"
                    onClick={() => setShowChecklist(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1B3A5C]/10 text-[#1B3A5C] border border-[#1B3A5C]/30 rounded-lg hover:bg-[#1B3A5C]/15 transition-colors"
                    title="สแกนใบเช็คผ้า → AI อ่านจำนวนต่อถุง → บวกลงช่องแพคส่ง + ตรวจยอด">
                    📋 ตรวจใบเช็คผ้า
                  </button>
                )}
                {['washing', 'packed', 'delivered', 'confirmed'].includes(detailForm.status) && (
                  <button
                    type="button"
                    onClick={() => setShowAudit(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    title="สแกนใบส่งรับผ้า + ใบเช็คผ้า → เทียบกับ LF ทุกคอลัมน์ + ยืนยันลูกค้า/วันที่">
                    🔍 ตรวจสอบ LF
                  </button>
                )}
              </div>
            )}
            <LinenFormGrid
              customer={detailCustomer}
              rows={detailForm.rows}
              onChange={(rows) => updateLinenForm(detailForm.id, { rows })}
              catalog={linenCatalog}
              qtItems={getLinkedQT(detailCustomer.name, detailForm.customerId)?.items}
              carryOver={detailCarryOver}
              headerLabel={`ลูกค้า: ${detailCustomer.shortName || detailCustomer.name}  |  วันที่: ${formatDate(detailForm.date)}`}
              formStatus={detailForm.status}
              highlightQ={highlightQ}
              workflowModeOverride={detailForm.workflowMode}
              excludedCodes={detailForm.excludedCodes}
              onDeleteRow={
                // 404: ลบแถวได้เฉพาะช่วงกรอกข้อมูล (กัน desync หลังแพค/วางบิล)
                ['draft', 'received', 'washing', 'delivered'].includes(detailForm.status)
                  ? (code) => updateLinenForm(detailForm.id, {
                      rows: detailForm.rows.filter(r => r.code !== code),
                      excludedCodes: Array.from(new Set([...(detailForm.excludedCodes ?? []), code])),
                    })
                  : undefined
              }
              editableColumns={
                detailForm.status === 'draft' ? ['col2', 'col3', 'note'] :
                detailForm.status === 'received' ? ['col2', 'col3', 'col5', 'note'] :
                PROCESS_STATUSES.includes(detailForm.status) ? [] :
                detailForm.status === 'washing' ? ['col2', 'col3', 'col5', 'col6', 'note'] :
                detailForm.status === 'delivered' ? ['col4'] :
                []
              }
              onApproveSync={(code) => {
                // 70+73+74+75: One-click sync — col6 = col4 = newQty
                const row = detailForm.rows.find(r => r.code === code)
                if (!row) return
                const newQty = row.col4_factoryApproved
                const oldCol6 = row.col6_factoryPackSend
                if (!confirm(`Sync ค่า ${code}:\n\ncol6 (โรงซักแพคส่ง): ${oldCol6} → ${newQty}\ncol4 (ลูกค้านับกลับ): ${newQty} (เดิม)\n\nระบบจะบันทึก audit log + ค่าเดิมเก็บไว้สำหรับรายงาน Type 2`)) return
                const updatedRows = applyRowsSync(
                  detailForm.rows,
                  [{ code, newQty }],
                  'lf_manual',
                  currentUser?.name || 'unknown',
                )
                updateLinenForm(detailForm.id, { rows: updatedRows })
              }}
            />

            {/* 404: รายการที่ถูกลบ — กดกู้คืนได้ */}
            <ExcludedCodesBanner
              codes={detailForm.excludedCodes}
              nameOf={(code) => linenCatalog.find(c => c.code === code)?.name || ''}
              onRestore={(code) => updateLinenForm(detailForm.id, {
                excludedCodes: (detailForm.excludedCodes ?? []).filter(c => c !== code),
              })}
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
                    {(() => {
                      const prevSt = PREV_LINEN_STATUS[detailForm.status]
                      return prevSt ? (
                        <button onClick={() => { handleRevertStatus(detailForm.id); scrollAndFocusGrid(false, prevSt) }}
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
                      )
                    })()}

                    {(() => {
                      const nextSt = NEXT_LINEN_STATUS[detailForm.status]
                      return nextSt ? (
                        <button onClick={() => {
                          handleAdvanceStatus(detailForm.id)
                          scrollAndFocusGrid(nextSt === 'confirmed', nextSt)
                        }}
                          className="px-4 py-2.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                          {LINEN_FORM_STATUS_CONFIG[nextSt].label}
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => setShowDetail(null)}
                          className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1.5">
                          <Check className="w-4 h-4" />
                          เสร็จสมบูรณ์
                        </button>
                      )
                    })()}
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
              <ExportButtons targetId="print-lf" filename={formatExportFilename(detailForm.formNumber, detailCustomer.shortName || detailCustomer.name, detailForm.date)} onExportCSV={handleExportCSV}
                onPrint={() => { if (!detailForm.isPrinted) updateLinenForm(detailForm.id, { isPrinted: true }) }}
                onExportFile={() => { if (!detailForm.isExported) updateLinenForm(detailForm.id, { isExported: true }) }} />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal — ต้องอยู่หลัง Detail Modal เพื่อให้แสดงด้านหน้า */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="ยืนยันการลบ" closeLabel="cancel">
        {(() => {
          const hasLinkedSD = confirmDeleteId ? linkedLFMap.has(confirmDeleteId) : false
          const linkedSD = confirmDeleteId ? linkedLFMap.get(confirmDeleteId) : null
          return (
            <div className="space-y-4">
              {hasLinkedSD ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-sm font-medium text-red-800">ไม่สามารถลบได้</p>
                  <p className="text-sm text-red-700 mt-1">LF นี้มีใบส่งของ (SD) ที่เกี่ยวข้อง: <strong>{linkedSD?.noteNumber}</strong></p>
                  <p className="text-xs text-red-600 mt-1">กรุณาลบ SD ก่อน แล้วจึงลบ LF ได้</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">ต้องการลบใบรับส่งผ้านี้หรือไม่? การลบไม่สามารถเรียกคืนได้</p>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                {!hasLinkedSD && (
                  <button onClick={() => { if (confirmDeleteId) { deleteLinenForm(confirmDeleteId); setConfirmDeleteId(null); setShowDetail(null) } }}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">ลบ</button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 344: Date Change Confirm Modal — เปลี่ยนวันที่ LF กระทบ carry-over */}
      <Modal open={!!dateConfirm} onClose={() => setDateConfirm(null)} title="ยืนยันเปลี่ยนวันที่" closeLabel="cancel">
        {(() => {
          if (!dateConfirm || !detailForm || !detailCustomer) return null
          const linkedDN = deliveryNotes.find(dn => dn.linenFormIds.includes(detailForm.id))
          const hasLinkedDN = !!linkedDN
          const isConfirmed = detailForm.status === 'confirmed'
          const earlier = dateConfirm.oldDate < dateConfirm.newDate ? dateConfirm.oldDate : dateConfirm.newDate
          const later = dateConfirm.oldDate < dateConfirm.newDate ? dateConfirm.newDate : dateConfirm.oldDate
          return (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> เปลี่ยนวันที่ของ LF
                </p>
                <div className="mt-2 text-sm text-amber-800 space-y-1">
                  <div>LF: <strong className="font-mono">{detailForm.formNumber}</strong></div>
                  <div>ลูกค้า: <strong>{detailCustomer.shortName || detailCustomer.name}</strong></div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <code className="px-2 py-0.5 rounded bg-white border border-amber-300">{formatDate(dateConfirm.oldDate)}</code>
                    <span className="text-amber-700">→</span>
                    <code className="px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold">{formatDate(dateConfirm.newDate)}</code>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-900 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> ผลกระทบ
                </p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>Carry-over ของลูกค้า {detailCustomer.shortName} ในช่วง <strong>{formatDate(earlier)} ถึง {formatDate(later)}</strong> จะ recalc</li>
                  <li>รายงานที่ filter ตามช่วงวันที่ → LF ใบนี้จะย้ายไปอยู่ในช่วงใหม่</li>
                  <li>เลข LF ({detailForm.formNumber}) ไม่เปลี่ยน — เปลี่ยนเฉพาะ date field</li>
                </ul>
              </div>

              {(hasLinkedDN || isConfirmed) && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg px-3 py-2.5 text-xs text-red-900 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> ⚠ มีความเสี่ยงสูง
                  </p>
                  {hasLinkedDN && (
                    <p>LF นี้ผูกกับใบส่งของ (SD) <strong className="font-mono">{linkedDN?.noteNumber}</strong> วันที่ <strong>{formatDate(linkedDN!.date)}</strong> — SD ไม่เปลี่ยน แต่ความสัมพันธ์อาจขัด</p>
                  )}
                  {isConfirmed && (
                    <p>สถานะปัจจุบัน = ✓ confirmed (ลูกค้านับกลับเสร็จ) — การย้ายวันที่อาจกระทบบิลที่ออกแล้ว</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDateConfirm(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!detailForm) return
                    updateLinenForm(detailForm.id, { date: dateConfirm.newDate })
                    setDateConfirm(null)
                    setEditingDate('')
                  }}
                  className={cn(
                    'px-4 py-2 text-sm rounded-lg font-semibold flex items-center gap-1.5',
                    (hasLinkedDN || isConfirmed)
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8]',
                  )}
                >
                  <Check className="w-4 h-4" />
                  {(hasLinkedDN || isConfirmed) ? '⚠ ยืนยัน (high impact)' : 'ยืนยันเปลี่ยนวันที่'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 292: Revert Blocked Modal — แจ้งว่ามี SD ผูกอยู่ ต้องลบ SD ก่อนถึงจะย้อน LF ได้ */}
      <Modal open={!!revertBlockedFor} onClose={() => setRevertBlockedFor(null)} title="ย้อนสถานะเอกสาร" closeLabel="cancel">
        {(() => {
          if (!revertBlockedFor) return null
          const form = linenForms.find(f => f.id === revertBlockedFor)
          const linkedSD = linkedLFMap.get(revertBlockedFor)
          return (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-red-800">ไม่สามารถย้อนได้</p>
                <p className="text-sm text-red-700 mt-1">
                  LF <strong className="font-mono">{form?.formNumber}</strong> นี้มีใบส่งของชั่วคราว (SD) อยู่: <strong>{linkedSD?.noteNumber}</strong>
                </p>
                <p className="text-xs text-red-600 mt-1">กรุณาลบ SD ก่อน แล้วค่อยย้อน LF</p>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRevertBlockedFor(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                {linkedSD && (
                  <button onClick={() => { setRevertBlockedFor(null); router.push(`/dashboard/delivery?detail=${linkedSD.dnId}`) }}
                    className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors font-medium flex items-center gap-1.5">
                    ไปที่ SD <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* LF Print List Modal */}
      <Modal open={showLfPrintList} onClose={() => setShowLfPrintList(false)} title="รายการใบส่งรับผ้า" size="xl" className="print-target">
        {(() => {
          // 412 — เรียงวันที่น้อยสุดอยู่ใบแรกเสมอ
          const printItems = [...(selectedLfIds.length > 0
            ? filtered.filter(f => selectedLfIds.includes(f.id))
            : filtered)].sort((a, b) => a.date.localeCompare(b.date) || a.formNumber.localeCompare(b.formNumber))
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
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
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
          {/* 412 — เรียงวันที่น้อยสุดอยู่ใบแรกเสมอ */}
          {(() => {
            const dateOf = new Map(linenForms.map(f => [f.id, f.date] as const))
            return [...selectedLfIds].sort((a, b) => (dateOf.get(a) || '').localeCompare(dateOf.get(b) || ''))
          })().map((lfId, idx) => {
            const form = linenForms.find(f => f.id === lfId)
            const cust = form ? getCustomer(form.customerId) : null
            if (!form || !cust) return null
            const carryOver = getCarryOver(form.customerId, form.date)
            return (
              <div key={lfId} style={idx > 0 ? { pageBreakBefore: 'always', breakBefore: 'page' } : {}}>
                {/* 314.1: pattern เดียวกับ Quick Print SD — pageBreak อย่างเดียว ไม่มี dashed line */}
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

      {/* 384.1 — Quick Print LF Modal — multi-customer selector (mirror Quick Print SD 303) */}
      <Modal open={showQuickPrintLf} onClose={() => setShowQuickPrintLf(false)} title="พิมพ์ LF เร่งด่วน (Multi-customer)" size="lg" closeLabel="cancel">
        {(() => {
          const entries = Array.from(printableLfByCustomer.entries())
            .map(([custId, bucket]) => {
              const c = getCustomer(custId)
              if (!c) return null
              return { custId, customer: c, all: bucket.all, unprinted: bucket.unprinted }
            })
            .filter((e): e is NonNullable<typeof e> => e !== null && e.all.length > 0)
            .sort((a, b) => (a.customer.shortName || a.customer.name).localeCompare(b.customer.shortName || b.customer.name))

          const allSelected = entries.length > 0 && entries.every(e => qpLfSelectedCusts.has(e.custId))
          const toggleOne = (custId: string) => {
            setQpLfSelectedCusts(prev => { const next = new Set(prev); if (next.has(custId)) next.delete(custId); else next.add(custId); return next })
          }
          const toggleAll = () => { if (allSelected) setQpLfSelectedCusts(new Set()); else setQpLfSelectedCusts(new Set(entries.map(e => e.custId))) }
          const totalSelected = Array.from(qpLfSelectedCusts).reduce((s, cid) => { const b = printableLfByCustomer.get(cid); return s + (b ? b.all.length : 0) }, 0)

          const openPrintFor = (customerIds: string[], mode: 'single' | 'multi') => {
            const snapshotGroups = customerIds.map(cid => {
              const bucket = printableLfByCustomer.get(cid)
              return { customerId: cid, lfIds: bucket ? bucket.all.map(f => f.id) : [] }
            }).filter(g => g.lfIds.length > 0)
            if (snapshotGroups.length === 0) return
            setQpLfTarget({ snapshotGroups, mode })
            setShowQuickPrintLf(false)
          }

          const dateChips: Array<{ key: typeof qpLfDateMode; label: string }> = [
            { key: 'this_month', label: 'เดือนนี้' },
            { key: 'last_30d', label: '30 วันล่าสุด' },
            { key: 'all', label: 'ทั้งหมด' },
          ]

          return (
            <div className="space-y-4 text-sm">
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-800">
                <p className="font-medium mb-1">🖨️ พิมพ์ใบส่งรับผ้าแยกตามลูกค้า — ทีเดียวจบ</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>คลิก <strong>&quot;พิมพ์&quot;</strong> ที่แถวลูกค้า → พิมพ์เฉพาะรายนั้น</li>
                  <li>หรือ ☑ เลือกหลายลูกค้า → <strong>&quot;พิมพ์รวมทั้งหมด&quot;</strong> → ขึ้นหน้าใหม่ระหว่างลูกค้า</li>
                  <li>LF ที่พิมพ์แล้วถูก mark <code>isPrinted=true</code> + หายจาก list ครั้งต่อไป</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="flex items-center gap-1">
                  {dateChips.map(chip => (
                    <button key={chip.key} type="button" onClick={() => setQpLfDateMode(chip.key)}
                      className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors',
                        qpLfDateMode === chip.key ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100')}>
                      {chip.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
                  <input type="checkbox" checked={qpLfShowPrinted} onChange={e => setQpLfShowPrinted(e.target.checked)}
                    className="rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                  <span className="text-slate-600">แสดงที่พิมพ์แล้วด้วย</span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-slate-700">ลูกค้าที่มี LF รอพิมพ์ ({entries.length} ราย)</p>
                  <button onClick={toggleAll} className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">
                    {allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>
                <div className="border border-slate-200 rounded-lg max-h-[45vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">LF รอ</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">ทั้งหมด</th>
                        <th className="text-center px-2 py-2 font-medium text-slate-600 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(({ custId, customer, all, unprinted }) => {
                        const checked = qpLfSelectedCusts.has(custId)
                        return (
                          <tr key={custId} className={cn('border-t border-slate-100 cursor-pointer hover:bg-slate-50', checked && 'bg-[#3DD8D8]/10')}
                            onClick={() => toggleOne(custId)}>
                            <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={checked} onChange={() => toggleOne(custId)}
                                className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-bold text-[#1B3A5C] tracking-wide">{customer.shortName || '-'}</span>
                              <span className="text-slate-500 text-xs ml-2">{customer.name}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-mono font-semibold text-slate-700">{unprinted.length}</span>
                              {unprinted.length > 0 && <span className="text-[10px] text-amber-600 ml-1">รอพิมพ์</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500 text-xs">{all.length}</td>
                            <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <button onClick={() => openPrintFor([custId], 'single')}
                                className="px-2.5 py-1 text-[11px] bg-violet-100 text-violet-700 rounded hover:bg-violet-200 font-medium inline-flex items-center gap-1">
                                <Printer className="w-3 h-3" />พิมพ์
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {entries.length === 0 && (<tr><td colSpan={5} className="text-center py-12 text-slate-400">ไม่มี LF รอพิมพ์ในช่วงนี้</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  {qpLfSelectedCusts.size > 0 && (<>เลือก <strong className="text-[#1B3A5C]">{qpLfSelectedCusts.size}</strong> ลูกค้า · รวม <strong className="text-[#1B3A5C]">{totalSelected}</strong> ใบ</>)}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowQuickPrintLf(false)} className="px-3 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium">ยกเลิก</button>
                  <button onClick={() => openPrintFor(Array.from(qpLfSelectedCusts), 'multi')} disabled={qpLfSelectedCusts.size === 0}
                    className={cn('px-4 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5',
                      qpLfSelectedCusts.size === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8]')}>
                    <Sparkles className="w-4 h-4" />พิมพ์รวมทั้งหมด ({totalSelected} ใบ)
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 384.1 — Quick Print LF View — render LF grouped by customer + pageBreak + auto-mark isPrinted */}
      <Modal open={!!qpLfTarget} onClose={() => setQpLfTarget(null)} title={
        qpLfTarget?.mode === 'multi' ? `พิมพ์ LF รวม ${qpLfTarget.snapshotGroups.length} ลูกค้า` : 'พิมพ์ใบส่งรับผ้า'
      } size="xl" className="print-target">
        {(() => {
          if (!qpLfTarget) return null
          const groups = quickPrintLfGroups
          const allLfIds = groups.flatMap(g => g.forms.map(f => f.id))
          const allPrinted = allLfIds.length > 0 && allLfIds.every(id => linenForms.find(f => f.id === id)?.isPrinted)
          const totalCount = allLfIds.length
          const markAll = (printed: boolean) => { for (const id of allLfIds) updateLinenForm(id, { isPrinted: printed }) }

          return (
            <div className="space-y-4 relative">
              {!qpLfReady && (
                <div className="absolute inset-0 z-10 bg-white/85 flex items-center justify-center no-print">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 text-[#3DD8D8] animate-spin mx-auto mb-3" />
                    <div className="text-sm font-medium text-slate-700">กำลังเตรียมเอกสาร...</div>
                    <div className="text-xs text-slate-400 mt-1">รอสักครู่ก่อนกดพิมพ์ — {totalCount} ใบ</div>
                  </div>
                </div>
              )}
              <div id="print-quick-lf">
                {groups.map((g, gIdx) => (
                  <div key={g.customer.id}>
                    {g.forms.map((form, fIdx) => {
                      const carryOver = getCarryOver(form.customerId, form.date)
                      return (
                        <div key={form.id}>
                          {(fIdx > 0 || gIdx > 0) && <div style={{ pageBreakBefore: 'always', breakBefore: 'page' }} />}
                          <LinenFormPrint form={form} customer={g.customer} company={companyInfo} catalog={linenCatalog} carryOver={carryOver} qtItems={getLinkedQT(g.customer.name, form.customerId)?.items} />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-4 no-print">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={allPrinted} onChange={e => markAll(e.target.checked)}
                      className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-blue-700">พิมพ์แล้ว (ทุกรายการ {totalCount} ใบ)</span>
                  </label>
                  <p className="text-xs text-slate-400">พิมพ์ → mark <code>isPrinted=true</code> อัตโนมัติ · จาก list ครั้งต่อไปหาย</p>
                </div>
                <ExportButtons
                  targetId="print-quick-lf"
                  filename={`LF-quickprint-${groups.length}cust-${totalCount}lf`}
                  onPrint={() => markAll(true)}
                  onExportFile={() => { for (const id of allLfIds) updateLinenForm(id, { isExported: true }) }}
                />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* 207+209: Universal Add-Item Wizard — push row เข้า LF ปัจจุบัน */}
      <AddItemWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        context="lf"
        customerId={wizardCustomerId}
        onComplete={(result) => {
          // 209: ถ้า code นี้ยังไม่อยู่ใน rows ของ LF ปัจจุบัน → push row ใหม่ค่า 0
          const emptyRow: LinenFormRow = {
            code: result.code,
            col1_carryOver: 0,
            col2_hotelCountIn: 0,
            col3_hotelClaimCount: 0,
            col4_factoryApproved: 0,
            col5_factoryClaimApproved: 0,
            col6_factoryPackSend: 0,
            note: '',
          }
          if (wizardTarget === 'create') {
            if (!newRows.some(r => r.code === result.code)) {
              setNewRows([...newRows, emptyRow])
            }
            // 404: เพิ่มกลับ = ยกเลิกการซ่อน
            setNewExcludedCodes(prev => prev.filter(c => c !== result.code))
          } else if (wizardTarget === 'detail' && wizardTargetLfId) {
            const lf = linenForms.find(f => f.id === wizardTargetLfId)
            if (lf) {
              // 404: เพิ่ม row (ถ้ายังไม่มี) + ปลดออกจาก excludedCodes (กัน grid filter ทิ้ง)
              const patch: { rows?: LinenFormRow[]; excludedCodes?: string[] } = {}
              if (!lf.rows.some(r => r.code === result.code)) patch.rows = [...lf.rows, emptyRow]
              if (lf.excludedCodes?.includes(result.code)) patch.excludedCodes = lf.excludedCodes.filter(c => c !== result.code)
              if (Object.keys(patch).length > 0) updateLinenForm(wizardTargetLfId, patch)
            }
          }
        }}
      />
    </div>
  )
}
