'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatCurrency, formatNumber, cn, buildPriceMapFromQT, formatDate, todayISO, startOfMonthISO, endOfMonthISO } from '@/lib/utils'
import { FileDown, ExternalLink, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import ExportButtons from '@/components/ExportButtons'
import Link from 'next/link'
import MonthlySummaryGrid from '@/components/MonthlySummaryGrid'
import MonthlyDeliveryReportPrint from '@/components/MonthlyDeliveryReportPrint'
import MonthlyStockReportPrint from '@/components/MonthlyStockReportPrint'
import MonthlyConsolidationPrint from '@/components/MonthlyConsolidationPrint'
import CustomerPicker from '@/components/CustomerPicker'
import CarryOverReportPrint from '@/components/CarryOverReportPrint'
import { groupCarryOver, customerUsesAggregateGroups } from '@/lib/carry-over-groups'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'
import Modal from '@/components/Modal'
import CarryOverAdjustModal from '@/components/CarryOverAdjustModal'
import UndoPanel from '@/components/UndoPanel'
import { pushUndoAction } from '@/lib/undo-stack'
import { CARRY_OVER_MODE_CONFIG, CARRY_OVER_REASON_CONFIG } from '@/types'
import { canViewReports, canViewExecutiveDashboard } from '@/lib/permissions'
import { useTabUrlSync } from '@/lib/use-tab-url-sync'
import PriceAudit from '@/components/PriceAudit'
import SDAudit from '@/components/SDAudit'
import WBAudit from '@/components/WBAudit'
import CarryDriftAudit from '@/components/CarryDriftAudit'
import MonthlyClosingChecklist from '@/components/MonthlyClosingChecklist'
import TrustModeAudit from '@/components/TrustModeAudit'
import AggregateModeAudit from '@/components/AggregateModeAudit'
import AggregateAnchorAudit from '@/components/AggregateAnchorAudit'
import ScheduleAudit from '@/components/ScheduleAudit'
import LFRowAudit from '@/components/LFRowAudit'
import ExecutiveDashboard from '@/components/executive/ExecutiveDashboard'
import RoundPnLReport from '@/components/RoundPnLReport'
import CustomerValueReport from '@/components/CustomerValueReport'
import type { CarryOverMode, CarryOverAdjustment, BillingStatement } from '@/types'

type TabKey = 'monthly' | 'revenue' | 'customer' | 'item' | 'pnl' | 'roundpnl' | 'custvalue' | 'aging' | 'carryover' | 'discrepancy' | 'delivery' | 'stock' | 'consolidation' | 'priceaudit' | 'sdaudit' | 'wbaudit' | 'driftaudit' | 'lfrowaudit' | 'closing' | 'trustaudit' | 'aggaudit' | 'anchoraudit' | 'scheduleaudit' | 'executive'

const REPORTS_TABS = ['monthly', 'revenue', 'customer', 'item', 'pnl', 'roundpnl', 'custvalue', 'aging', 'carryover', 'discrepancy', 'delivery', 'stock', 'consolidation', 'priceaudit', 'sdaudit', 'wbaudit', 'driftaudit', 'lfrowaudit', 'closing', 'trustaudit', 'aggaudit', 'anchoraudit', 'scheduleaudit', 'executive'] as const

export default function ReportsPage() {
  const { currentUser, linenForms, deliveryNotes, billingStatements, expenses, customers, getCustomer, getCarryOver, linenCatalog, companyInfo, quotations, carryOverAdjustments, deleteCarryOverAdjustment } = useStore()
  // 219: tab synced with URL — supports browser back/forward
  const [tab, setTab] = useTabUrlSync<TabKey>(REPORTS_TABS, 'monthly')
  const [showDeliveryPrint, setShowDeliveryPrint] = useState(false)
  const [showStockPrint, setShowStockPrint] = useState(false)
  const [showConsolidationPrint, setShowConsolidationPrint] = useState(false)
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('landscape')
  const [printMargin, setPrintMargin] = useState<'normal' | 'narrow'>('narrow')
  const [selCustomerIdRaw, setSelCustomerId] = useState('')
  const [selMonth, setSelMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ---- Carry-over (51-53) state ----
  // 265: default = 1 — reset เมื่อเปลี่ยนลูกค้า ใช้ customer.defaultCarryOverMode (ดู useEffect ด้านล่าง)
  const [coMode, setCoMode] = useState<CarryOverMode | 'compare'>(1)
  const [coView, setCoView] = useState<'monthly' | 'yearly'>('monthly')
  const [coStartDate, setCoStartDate] = useState(() => startOfMonthISO())
  const [coEndDate, setCoEndDate] = useState(() => endOfMonthISO())
  const [coShowAdjustments, setCoShowAdjustments] = useState(true)
  const [coAdjustModalOpen, setCoAdjustModalOpen] = useState(false)
  const [coEditingAdjustment, setCoEditingAdjustment] = useState<CarryOverAdjustment | undefined>(undefined)
  const [showCarryOverPrint, setShowCarryOverPrint] = useState(false)

  // 400 — deep-link จาก Closing checklist: ?openAdj=<id> → เลือกลูกค้า+เดือน + เปิด modal เอกสารปรับยอด
  //   strip param หลังเปิด → re-click ตัวเดิมได้อีก + refresh ไม่ re-open (ref กัน loop ระหว่าง replace)
  const searchParams = useSearchParams()
  const router = useRouter()
  const deepLinkAdjRef = useRef<string | null>(null)
  useEffect(() => {
    const adjId = searchParams.get('openAdj')
    if (!adjId) { deepLinkAdjRef.current = null; return }
    if (deepLinkAdjRef.current === adjId) return
    const adj = carryOverAdjustments.find(a => a.id === adjId && !a.isDeleted)
    if (!adj) return
    deepLinkAdjRef.current = adjId
    setSelCustomerId(adj.customerId)
    setSelMonth(adj.date.slice(0, 7))
    setCoEditingAdjustment(adj)
    setCoAdjustModalOpen(true)
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    sp.delete('openAdj')
    router.replace(`/dashboard/reports?${sp.toString()}`, { scroll: false })
  }, [searchParams, carryOverAdjustments, router])

  // 210.1: เมื่อเปลี่ยนเดือนด้านบน (selMonth) บน carryover tab → sync ช่องวันที่ด้านล่าง
  useEffect(() => {
    if (tab !== 'carryover') return
    const [yStr, mStr] = selMonth.split('-')
    const y = Number(yStr), m = Number(mStr)
    if (!y || !m) return
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setCoStartDate(fmt(start))
    setCoEndDate(fmt(end))
  }, [selMonth, tab])

  const activeCustomers = customers.filter(c => c.isActive)
  // Derive effective customer ID — validate against active list
  const selCustomerId = selCustomerIdRaw && activeCustomers.some(c => c.id === selCustomerIdRaw)
    ? selCustomerIdRaw
    : ''
  // For per-customer tabs, auto-select first customer
  const perCustomerTabs: TabKey[] = ['monthly', 'delivery', 'stock', 'consolidation', 'carryover']
  const needsCustomer = perCustomerTabs.includes(tab) && !selCustomerId

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'monthly', label: 'สรุปรายเดือน' },
    { key: 'revenue', label: 'รายได้' },
    { key: 'customer', label: 'ตามลูกค้า' },
    { key: 'item', label: 'ตามสินค้า' },
    { key: 'pnl', label: 'กำไร-ขาดทุน' },
    { key: 'roundpnl', label: '💰 กำไรตามรอบ' },
    { key: 'custvalue', label: '⚖️ ลูกค้าคุ้ม/ไม่คุ้ม' },
    { key: 'aging', label: 'บิลค้างชำระ' },
    { key: 'carryover', label: 'ผ้าค้าง' },
    { key: 'discrepancy', label: 'ความแตกต่างการนับ' },
    { key: 'delivery', label: 'รายงานส่งของ' },
    { key: 'stock', label: 'สต็อกรายเดือน' },
    { key: 'consolidation', label: 'รวบเดือน' },
    { key: 'priceaudit', label: '🛡️ Price Audit' },
    { key: 'sdaudit', label: '🔍 SD Audit' },
    { key: 'wbaudit', label: '🔍 WB Audit' },
    { key: 'driftaudit', label: '🔍 Drift Audit' },
    { key: 'lfrowaudit', label: '⚠️ LF Row ซ้ำ' },
    { key: 'closing', label: '📋 Closing' },
    { key: 'trustaudit', label: '🔍 Trust Mode' },
    { key: 'aggaudit', label: '📦 Aggregate Mode' },
    { key: 'anchoraudit', label: '⚓ Anchor Drift' },
    { key: 'scheduleaudit', label: '📅 Schedule Audit' },
    ...(canViewExecutiveDashboard(currentUser) ? [{ key: 'executive' as TabKey, label: '✨ Executive' }] : []),
  ]

  const selCustomer = selCustomerId ? getCustomer(selCustomerId) : null

  // 265 — เมื่อเปลี่ยนลูกค้า → ใช้ customer.defaultCarryOverMode (ถ้ามี) หรือ derive จาก workflowMode
  // - trust_customer ปกติใช้ Mode 2 (col6 − (col2+col3))
  // - cross_check ปกติใช้ Mode 1 (col6 − col5)
  useEffect(() => {
    if (!selCustomer) return
    const def = selCustomer.defaultCarryOverMode
      ?? (selCustomer.workflowMode === 'trust_customer' ? 2 : 1)
    setCoMode(def)
  }, [selCustomerId, selCustomer?.defaultCarryOverMode, selCustomer?.workflowMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Revenue by customer
  const revenueByCustomer = useMemo(() => {
    const map: Record<string, number> = {}
    let bills = billingStatements.filter(b => b.billingMonth === selMonth)
    if (selCustomerId) bills = bills.filter(b => b.customerId === selCustomerId)
    for (const bs of bills) {
      map[bs.customerId] = (map[bs.customerId] || 0) + bs.subtotal
    }
    return Object.entries(map)
      .map(([id, amount]) => ({ customer: getCustomer(id), amount }))
      .filter(r => r.customer)
      .sort((a, b) => b.amount - a.amount)
  }, [billingStatements, selMonth, selCustomerId, getCustomer])

  // Item usage
  const itemUsage = useMemo(() => {
    const map: Record<string, number> = {}
    for (const dn of deliveryNotes.filter(d => d.date.startsWith(selMonth))) {
      for (const item of dn.items) {
        map[item.code] = (map[item.code] || 0) + item.quantity
      }
    }
    const nameMap = Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))
    return Object.entries(map)
      .map(([code, qty]) => ({ code, name: nameMap[code] || code, qty }))
      .sort((a, b) => b.qty - a.qty)
  }, [deliveryNotes, selMonth, linenCatalog])

  // P&L
  const pnl = useMemo(() => {
    const revenue = billingStatements
      .filter(b => b.billingMonth === selMonth)
      .reduce((s, b) => s + b.subtotal, 0)
    const totalExpense = expenses
      .filter(e => e.date.startsWith(selMonth))
      .reduce((s, e) => s + e.amount, 0)
    return { revenue, totalExpense, profit: revenue - totalExpense }
  }, [billingStatements, expenses, selMonth])

  // ============================================================
  // Carry-over Report (51.1 + 51.2 + 52)
  // ============================================================

  /** Helper: get next-day ISO string (used for inclusive end-of-range carry-over) */
  const nextDay = (iso: string): string => {
    const d = new Date(iso)
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  /** Get codes ที่ active สำหรับลูกค้านี้ใน date range
   *  รวม: LF rows + adjustments + 210.2: items จาก accepted QT ของลูกค้า
   *  (กัน edge case: เพิ่มรายการใน QT หลัง LF ถูกสร้าง — รายการใหม่ไม่มีใน LF.rows
   *   แต่ user ต้องเห็นใน carry-over report เพื่อตรวจ)
   */
  // 336: helper — เช็คว่า code นี้อยู่ใน aggregate group ของ customer ไหม
  //   ใช้ filter coActiveCodes + decide aggregation ใน computeDailyDiff
  const getAggInfoForCode = useCallback((code: string): { groupKey: string; anchorCode: string; groupSize: number } | null => {
    if (!selCustomer?.aggregateSizeGroups || selCustomer.aggregateSizeGroups.length === 0) return null
    const item = linenCatalog.find(c => c.code === code)
    if (!item?.sizeGroup) return null
    const cfg = selCustomer.aggregateSizeGroups.find(c => c.groupKey === item.sizeGroup)
    if (!cfg) return null
    // ต้องมีอย่างน้อย col5 หรือ col2 = aggregate
    const col5Agg = (cfg.col5Mode ?? 'aggregate') === 'aggregate'
    const col2Agg = cfg.col2Mode === 'aggregate'
    if (!col5Agg && !col2Agg) return null
    const groupItems = linenCatalog.filter(i => i.sizeGroup === item.sizeGroup)
    const anchorCode = getGroupAnchorCode(groupItems, cfg.anchorCode)
    return { groupKey: item.sizeGroup, anchorCode, groupSize: groupItems.length }
  }, [selCustomer, linenCatalog])

  const coActiveCodes = useMemo(() => {
    if (!selCustomerId) return [] as string[]
    const codes = new Set<string>()
    for (const f of linenForms) {
      if (f.customerId !== selCustomerId) continue
      if (f.date < coStartDate || f.date > coEndDate) continue
      for (const r of f.rows) codes.add(r.code)
    }
    // Also include codes that have adjustments in range
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== selCustomerId) continue
      if (a.date < coStartDate || a.date > coEndDate) continue
      for (const it of a.items) codes.add(it.code)
    }
    // 210.2: include items จาก accepted QT (เห็นรายการใหม่ที่ยังไม่ได้ใช้ใน LF)
    const acceptedQT = quotations.find(q => q.customerId === selCustomerId && q.status === 'accepted')
    if (acceptedQT) {
      for (const it of acceptedQT.items) codes.add(it.code)
    }
    // 339: รักษา non-anchor rows + expand group ให้ครบ (เห็น size อื่นในกลุ่ม)
    //   336 เดิม collapse → ลบ row → ใช้ pattern LF (326-332) คือเก็บ row + arrow ↑/↓ ชี้ anchor
    //   เพื่อให้ visual brace ทำงาน expand ให้ครบทุก size ใน group ที่ active
    const expanded = new Set<string>(codes)
    for (const c of codes) {
      const agg = getAggInfoForCode(c)
      if (!agg) continue
      const groupItems = linenCatalog.filter(i => i.sizeGroup === agg.groupKey)
      for (const gi of groupItems) expanded.add(gi.code)
    }
    // Sort with group cohesion: groups contiguous (anchor + members ติดกัน — ตาม LF Grid pattern)
    const orderMap = new Map(linenCatalog.map((it, i) => [it.code, i]))
    const baseSorted = [...expanded].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999))
    const result: string[] = []
    const seen = new Set<string>()
    for (const code of baseSorted) {
      if (seen.has(code)) continue
      const agg = getAggInfoForCode(code)
      if (agg) {
        // dump group members sorted by sortOrder
        const groupCodes = linenCatalog
          .filter(i => i.sizeGroup === agg.groupKey && expanded.has(i.code))
          .map(i => i.code)
          .sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999))
        for (const gc of groupCodes) {
          if (!seen.has(gc)) {
            result.push(gc)
            seen.add(gc)
          }
        }
      } else {
        result.push(code)
        seen.add(code)
      }
    }
    return result
  }, [selCustomerId, linenForms, carryOverAdjustments, linenCatalog, coStartDate, coEndDate, quotations, getAggInfoForCode])

  /** 339: per-code metadata สำหรับ render arrow pattern + visual brace
   *  isAnchor / isInGroup / first/last in group → drive arrow direction + border classes
   */
  const coRowAggMeta = useMemo(() => {
    type RowMeta = {
      isInGroup: boolean
      isAnchor: boolean
      anchorCode: string
      anchorIndex: number       // index ใน coActiveCodes
      indexInList: number       // index ของ row นี้ใน coActiveCodes
      groupSize: number
      groupKey: string
      isFirstInGroup: boolean
      isLastInGroup: boolean
    }
    const meta = new Map<string, RowMeta>()
    // หา anchor index ของแต่ละ group
    const groupAnchors = new Map<string, { anchorCode: string; anchorIndex: number }>()
    coActiveCodes.forEach((code, idx) => {
      const info = getAggInfoForCode(code)
      if (info && info.anchorCode === code) {
        groupAnchors.set(info.groupKey, { anchorCode: code, anchorIndex: idx })
      }
    })
    // หา first/last index ของแต่ละ group ใน coActiveCodes
    const groupRange = new Map<string, { first: number; last: number; size: number }>()
    coActiveCodes.forEach((code, idx) => {
      const info = getAggInfoForCode(code)
      if (!info) return
      const existing = groupRange.get(info.groupKey)
      if (!existing) groupRange.set(info.groupKey, { first: idx, last: idx, size: 1 })
      else { existing.last = idx; existing.size++ }
    })
    coActiveCodes.forEach((code, idx) => {
      const info = getAggInfoForCode(code)
      if (!info) {
        meta.set(code, {
          isInGroup: false, isAnchor: false, anchorCode: code, anchorIndex: idx,
          indexInList: idx, groupSize: 0, groupKey: '',
          isFirstInGroup: false, isLastInGroup: false,
        })
        return
      }
      const anchor = groupAnchors.get(info.groupKey)
      const range = groupRange.get(info.groupKey)
      meta.set(code, {
        isInGroup: true,
        isAnchor: info.anchorCode === code,
        anchorCode: info.anchorCode,
        anchorIndex: anchor?.anchorIndex ?? idx,
        indexInList: idx,
        groupSize: range?.size ?? info.groupSize,
        groupKey: info.groupKey,
        isFirstInGroup: range ? idx === range.first : false,
        isLastInGroup: range ? idx === range.last : false,
      })
    })
    return meta
  }, [coActiveCodes, getAggInfoForCode])

  const itemNameMap = useMemo(
    () => Object.fromEntries(linenCatalog.map(it => [it.code, it.name])),
    [linenCatalog],
  )

  /** 339 + 346: row classes สำหรับ visual brace — theme เดียวกับ LF Grid (post-345)
   *  - LF Grid pattern: ไม่มี bg tint + ไม่มี border-l
   *  - First in group: border-t slate-300 (1px)
   *  - Last in group: border-b slate-300 (1px)
   */
  const coRowClasses = (code: string, baseClasses = ''): string => {
    const m = coRowAggMeta.get(code)
    return cn(
      baseClasses || 'border-t border-slate-100',
      m?.isFirstInGroup && '!border-t !border-t-slate-300',
      m?.isLastInGroup && '!border-b !border-b-slate-300',
    )
  }

  /** 339 + 346 + 348 + 349: render label cell — uniform font ทุกแถว (no anchor emphasis, no pill)
   *  349.2: ลบ "📦 N" badge ออก
   *  349.1: font/style เดียวกันหมด (เหมือน H01 H02 ปกติ) — anchor/non-anchor distinguished
   *         จาก values + brace borders + cell arrows (349.1.1/2) แทน
   */
  const renderCoLabel = (code: string) => {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs text-slate-400">{code}</span>
        <span className="text-slate-700 truncate">{itemNameMap[code]}</span>
      </span>
    )
  }

  /** 349.1.1+349.1.2: arrow ↓/↑ ที่ first/last row ของ group ใน cells ที่ anchor มีค่า
   *  pattern เดียวกับ LF Grid — clean "ปีกกา" feeling โดยไม่มี border tricks
   *  return null = ไม่ใช่ first/last หรือ anchor ไม่มีค่า → cell แสดงค่าปกติ
   */
  const cellArrow = (code: string, anchorHasValue: boolean): '↓' | '↑' | null => {
    const m = coRowAggMeta.get(code)
    if (!m?.isInGroup || m.isAnchor) return null
    if (!anchorHasValue) return null
    if (m.isFirstInGroup) return '↓'
    if (m.isLastInGroup) return '↑'
    return null
  }

  /** 340.1: helper — code เป็น non-anchor ของ aggregate group ไหม
   *  หมายเหตุ: LF activity ของ non-anchor → aggregate ไปที่ anchor หมด
   *           non-anchor row "ของจริง" จึงมีแค่ per-size adjustment เท่านั้น
   */
  const isCoNonAnchorInGroup = (code: string): boolean => {
    const m = coRowAggMeta.get(code)
    return !!(m?.isInGroup && !m.isAnchor)
  }

  /** 340.1: compute daily diff สำหรับ non-anchor row — adjustment เท่านั้น (ไม่รวม LF)
   *  เหตุผล: LF row ของ non-anchor (col6 per-row) ไม่ใช่ค่า balanced ของ size นั้น
   *         เพราะ col2/col5 aggregate ไปที่ anchor → per-row diff = noise ไม่ใช่ ค้าง/คืน
   */
  const computeNonAnchorDailyAdj = useCallback((customerId: string, code: string, day: string): number => {
    let diff = 0
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customerId || a.date !== day || a.type !== 'adjust') continue
      if (!coShowAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        if (it.code === code) diff += it.delta || 0
      }
    }
    return diff
  }, [carryOverAdjustments, coShowAdjustments])

  /** 340.1: month sum สำหรับ non-anchor row (yearly view) — adjustment เท่านั้น */
  const computeNonAnchorMonthlyAdj = useCallback((customerId: string, code: string, month: string): number => {
    let sum = 0
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customerId || !a.date.startsWith(month) || a.type !== 'adjust') continue
      if (!coShowAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        if (it.code === code) sum += it.delta || 0
      }
    }
    return sum
  }, [carryOverAdjustments, coShowAdjustments])

  /** Compute per-day diff for one item code in current mode
   *  336: group-aware — ถ้า code = anchor ของ aggregate group → sum diff ทุก code ใน group
   *       (non-anchor codes ถูก filter ออกแล้วใน coActiveCodes)
   */
  const computeDailyDiff = (customerId: string, code: string, day: string, mode: CarryOverMode): number => {
    const aggInfo = getAggInfoForCode(code)
    const isAggAnchor = !!(aggInfo && aggInfo.anchorCode === code)
    // สร้าง set ของ codes ที่อยู่ใน group นี้ (สำหรับ match LF rows + adjustments)
    const groupCodes = isAggAnchor && aggInfo
      ? new Set(linenCatalog.filter(i => i.sizeGroup === aggInfo.groupKey).map(i => i.code))
      : null

    let diff = 0
    for (const f of linenForms) {
      if (f.customerId !== customerId || f.date !== day) continue
      // 265: trust LF บังคับ Mode 2
      const effectiveMode: CarryOverMode = f.workflowMode === 'trust_customer' ? 2 : mode
      for (const r of f.rows) {
        const matches = groupCodes ? groupCodes.has(r.code) : r.code === code
        if (!matches) continue
        switch (effectiveMode) {
          case 1: diff += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
          case 2: diff += (r.col6_factoryPackSend || 0) - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
          case 3: diff += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
          case 4: diff += r.col4_factoryApproved - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
        }
      }
    }
    // Add adjustments on this day (only adjust type, reset is handled by getCarryOver)
    for (const a of carryOverAdjustments) {
      if (a.isDeleted || a.customerId !== customerId || a.date !== day || a.type !== 'adjust') continue
      if (!coShowAdjustments && !a.showInCustomerReport) continue
      for (const it of a.items) {
        const matches = groupCodes ? groupCodes.has(it.code) : it.code === code
        if (matches) diff += it.delta || 0
      }
    }
    return diff
  }

  /** Generate days array between start and end (inclusive) */
  const coDaysInRange = useMemo(() => {
    if (coView !== 'monthly') return [] as string[]
    const days: string[] = []
    const start = new Date(coStartDate)
    const end = new Date(coEndDate)
    while (start <= end) {
      days.push(start.toISOString().slice(0, 10))
      start.setDate(start.getDate() + 1)
    }
    return days
  }, [coStartDate, coEndDate, coView])

  /** Generate months array (YYYY-MM) between start and end */
  const coMonthsInRange = useMemo(() => {
    if (coView !== 'yearly') return [] as string[]
    const months: string[] = []
    const start = new Date(coStartDate)
    const end = new Date(coEndDate)
    let y = start.getFullYear()
    let m = start.getMonth()
    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
      months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
      m++
      if (m > 11) { m = 0; y++ }
    }
    return months
  }, [coStartDate, coEndDate, coView])

  /** Carry-over balance "ยกมา" (before start date) for each item */
  const coBroughtForward = useMemo(() => {
    if (!selCustomerId) return {} as Record<string, number>
    if (coMode === 'compare') return {} as Record<string, number>
    return getCarryOver(selCustomerId, coStartDate, coMode, coShowAdjustments)
  }, [selCustomerId, coStartDate, coMode, getCarryOver, coShowAdjustments])

  /** Carry-over balance "สะสม" (after end date) — used for ยอดสุดท้าย */
  const coCarriedAfter = useMemo(() => {
    if (!selCustomerId) return {} as Record<string, number>
    if (coMode === 'compare') return {} as Record<string, number>
    return getCarryOver(selCustomerId, nextDay(coEndDate), coMode, coShowAdjustments)
  }, [selCustomerId, coEndDate, coMode, getCarryOver, coShowAdjustments])

  /** For "compare" mode: balance for all 4 modes at end of range */
  const coCompareValues = useMemo(() => {
    if (!selCustomerId || coMode !== 'compare') return null
    const end = nextDay(coEndDate)
    return {
      1: getCarryOver(selCustomerId, end, 1, coShowAdjustments),
      2: getCarryOver(selCustomerId, end, 2, coShowAdjustments),
      3: getCarryOver(selCustomerId, end, 3, coShowAdjustments),
      4: getCarryOver(selCustomerId, end, 4, coShowAdjustments),
    } as Record<CarryOverMode, Record<string, number>>
  }, [selCustomerId, coMode, coEndDate, getCarryOver, coShowAdjustments])

  // ============================================================
  // Aging Report (B1) — บิลค้างชำระ aging
  // ============================================================
  const agingReport = useMemo(() => {
    const today = todayISO()
    const todayMs = new Date(today).getTime()

    type Bucket = 'not_due' | '1_30' | '31_60' | '61_90' | '90_plus'
    const buckets: Record<Bucket, { label: string; color: string; bills: BillingStatement[]; total: number }> = {
      not_due: { label: 'ยังไม่ถึงกำหนด', color: 'text-slate-600', bills: [], total: 0 },
      '1_30':  { label: '1-30 วัน',     color: 'text-blue-600', bills: [], total: 0 },
      '31_60': { label: '31-60 วัน',    color: 'text-amber-600', bills: [], total: 0 },
      '61_90': { label: '61-90 วัน',    color: 'text-orange-600', bills: [], total: 0 },
      '90_plus': { label: 'มากกว่า 90 วัน', color: 'text-red-600', bills: [], total: 0 },
    }

    // Per-customer aging
    const custAging: Record<string, { name: string; not_due: number; '1_30': number; '31_60': number; '61_90': number; '90_plus': number; total: number }> = {}

    // Filter unpaid bills (status sent or overdue, not paid)
    const unpaidBills = billingStatements.filter(b => b.status !== 'paid' && b.status !== 'draft')

    for (const b of unpaidBills) {
      // Outstanding amount = netPayable - paidAmount (handle partial payments)
      const cust = getCustomer(b.customerId)
      const target = cust?.enableVat
        ? cust.enableWithholding ? b.netPayable : b.grandTotal
        : b.subtotal
      const outstanding = Math.max(0, target - (b.paidAmount || 0))
      if (outstanding === 0) continue

      const dueMs = new Date(b.dueDate).getTime()
      const daysPast = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24))

      let bucket: Bucket
      if (daysPast <= 0) bucket = 'not_due'
      else if (daysPast <= 30) bucket = '1_30'
      else if (daysPast <= 60) bucket = '31_60'
      else if (daysPast <= 90) bucket = '61_90'
      else bucket = '90_plus'

      buckets[bucket].bills.push(b)
      buckets[bucket].total += outstanding

      // Per-customer
      if (!custAging[b.customerId]) {
        custAging[b.customerId] = {
          name: cust?.shortName || cust?.name || '-',
          not_due: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0, total: 0,
        }
      }
      custAging[b.customerId][bucket] += outstanding
      custAging[b.customerId].total += outstanding
    }

    const grandTotal = Object.values(buckets).reduce((s, b) => s + b.total, 0)
    const overdueTotal = buckets['1_30'].total + buckets['31_60'].total + buckets['61_90'].total + buckets['90_plus'].total
    const customerList = Object.entries(custAging)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total)

    return { buckets, customerList, grandTotal, overdueTotal }
  }, [billingStatements, getCustomer])

  // ============================================================
  // Discrepancy Analytics (53.1) — ความแตกต่างการนับ
  // ============================================================

  /**
   * วิเคราะห์ "นับไม่ตรง" จาก LF ในเดือนที่เลือก:
   * - Type 1: col5 (โรงซักนับเข้า) ≠ col2+col3 (ลูกค้านับส่ง+เคลม)
   * - Type 2: col4 (ลูกค้านับกลับ) ≠ col6 (โรงซักแพคส่ง)
   */
  const discrepancyAnalytics = useMemo(() => {
    const monthForms = linenForms.filter(f => f.date.startsWith(selMonth))

    // Per-customer counts
    const custCount: Record<string, { name: string; type1: number; type2Pending: number; type2Resolved: number; total: number }> = {}
    // Per-item counts
    const itemCount: Record<string, { type1: number; type2Pending: number; type2Resolved: number; total: number }> = {}
    // Type 2 breakdown
    let type2Pending = 0
    let type2Resolved = 0
    const type2Customers: Record<string, number> = {}

    for (const f of monthForms) {
      const cust = getCustomer(f.customerId)
      if (!cust) continue
      if (!custCount[f.customerId]) {
        custCount[f.customerId] = { name: cust.shortName || cust.name, type1: 0, type2Pending: 0, type2Resolved: 0, total: 0 }
      }
      for (const r of f.rows) {
        const expected12 = r.col2_hotelCountIn + r.col3_hotelClaimCount
        const countIn = r.col5_factoryClaimApproved
        const packSend = r.col6_factoryPackSend || 0
        const countBack = r.col4_factoryApproved
        const isResolved = r.originalCol6 !== undefined && r.originalCol4 !== undefined

        // Type 1: col5 ≠ col2+col3
        if (countIn > 0 && countIn !== expected12) {
          custCount[f.customerId].type1++
          custCount[f.customerId].total++
          if (!itemCount[r.code]) itemCount[r.code] = { type1: 0, type2Pending: 0, type2Resolved: 0, total: 0 }
          itemCount[r.code].type1++
          itemCount[r.code].total++
        }
        // Type 2 Pending: col4 ≠ col6 (active discrepancy)
        if (countBack > 0 && packSend > 0 && countBack !== packSend) {
          custCount[f.customerId].type2Pending++
          custCount[f.customerId].total++
          if (!itemCount[r.code]) itemCount[r.code] = { type1: 0, type2Pending: 0, type2Resolved: 0, total: 0 }
          itemCount[r.code].type2Pending++
          itemCount[r.code].total++
          type2Pending++
          type2Customers[f.customerId] = (type2Customers[f.customerId] || 0) + 1
        }
        // Type 2 Resolved: row ที่เคยถูก sync แล้ว
        if (isResolved) {
          custCount[f.customerId].type2Resolved++
          custCount[f.customerId].total++
          if (!itemCount[r.code]) itemCount[r.code] = { type1: 0, type2Pending: 0, type2Resolved: 0, total: 0 }
          itemCount[r.code].type2Resolved++
          itemCount[r.code].total++
          type2Resolved++
          type2Customers[f.customerId] = (type2Customers[f.customerId] || 0) + 1
        }
      }
    }

    const topCustomers = Object.entries(custCount)
      .map(([id, data]) => ({ id, ...data }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    const topItems = Object.entries(itemCount)
      .map(([code, data]) => ({ code, name: itemNameMap[code] || code, ...data }))
      .filter(i => i.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    const topType2Customers = Object.entries(type2Customers)
      .map(([id, count]) => ({ id, name: getCustomer(id)?.shortName || getCustomer(id)?.name || id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return { topCustomers, topItems, type2Pending, type2Resolved, topType2Customers }
  }, [linenForms, selMonth, getCustomer, itemNameMap])

  /** Adjustment records for this customer in date range (for history display) */
  const coAdjustmentsInRange = useMemo(() => {
    if (!selCustomerId) return [] as CarryOverAdjustment[]
    return carryOverAdjustments
      .filter(a =>
        !a.isDeleted &&
        a.customerId === selCustomerId &&
        a.date >= coStartDate &&
        a.date <= coEndDate &&
        (coShowAdjustments || a.showInCustomerReport)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [carryOverAdjustments, selCustomerId, coStartDate, coEndDate, coShowAdjustments])

  if (!canViewReports(currentUser)) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Staff/Accountant/Admin เท่านั้น</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">รายงาน</h1>
        <p className="text-sm text-slate-500 mt-0.5">วิเคราะห์ข้อมูลและสรุปผล</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {(tab === 'monthly' || tab === 'delivery' || tab === 'stock' || tab === 'consolidation' || tab === 'revenue' || tab === 'carryover' || tab === 'discrepancy') && (
          <div className="flex items-center gap-2">
            <CustomerPicker value={selCustomerId} onChange={setSelCustomerId} allowAll />
            {selCustomerId && (
              <Link href={`/dashboard/customers/${selCustomerId}`}
                className="text-xs text-[#3DD8D8] hover:underline flex items-center gap-0.5 shrink-0">
                <ExternalLink className="w-3 h-3" />ดูรายละเอียด
              </Link>
            )}
          </div>
        )}
        <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
      </div>

      {/* Per-customer tab: select customer prompt */}
      {needsCustomer && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-700 font-medium">กรุณาเลือกลูกค้าจากเมนูด้านบน</p>
          <p className="text-sm text-amber-600 mt-1">รายงานนี้ต้องระบุลูกค้า</p>
        </div>
      )}

      {/* Monthly Summary Tab */}
      {tab === 'monthly' && selCustomer && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-800">
              สรุปรายเดือน — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
          </div>
          <MonthlySummaryGrid
            customer={selCustomer}
            month={selMonth}
            linenForms={linenForms}
            deliveryNotes={deliveryNotes}
            catalog={linenCatalog}
            priceMap={buildPriceMapFromQT(selCustomer.id, quotations)}
          />
        </div>
      )}

      {/* Revenue Tab */}
      {tab === 'revenue' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">
            รายได้{selCustomer ? ` — ${selCustomer.shortName || selCustomer.name}` : ''} ({selMonth})
          </h3>
          <div className="text-3xl font-bold text-[#1B3A5C] mb-4">
            {formatCurrency(revenueByCustomer.reduce((s, r) => s + r.amount, 0))}
          </div>
          <div className="space-y-2">
            {revenueByCustomer.map(r => (
              <div key={r.customer!.id} className="flex items-center justify-between py-2 border-b border-slate-100">
                <Link href={`/dashboard/customers/${r.customer!.id}`} className="text-sm text-slate-700 hover:text-[#1B3A5C] hover:underline">{r.customer!.shortName || r.customer!.name}</Link>
                <span className="text-sm font-medium text-slate-800">{formatCurrency(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Tab */}
      {tab === 'customer' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">ลูกค้า</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">ยอดวางบิล</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">จำนวนบิล</th>
              </tr>
            </thead>
            <tbody>
              {customers.filter(c => c.isActive).map(c => {
                const bills = billingStatements.filter(b => b.customerId === c.id)
                const total = bills.reduce((s, b) => s + b.subtotal, 0)
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B3A5C] hover:underline">{c.shortName || c.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(total)}</td>
                    <td className="px-4 py-3 text-center">{bills.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Item Tab */}
      {tab === 'item' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">รหัส</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">รายการ</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">จำนวน (ชิ้น)</th>
              </tr>
            </thead>
            <tbody>
              {itemUsage.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-slate-400">ไม่มีข้อมูล</td></tr>
              ) : itemUsage.map(item => (
                <tr key={item.code} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className="px-4 py-2 text-slate-700">{item.name}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatNumber(item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* P&L Tab */}
      {tab === 'pnl' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">กำไร-ขาดทุน — {selMonth}</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-200">
              <span className="text-slate-600">รายได้รวม</span>
              <span className="text-lg font-bold text-emerald-600">{formatCurrency(pnl.revenue)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-200">
              <span className="text-slate-600">ค่าใช้จ่ายรวม</span>
              <span className="text-lg font-bold text-red-600">{formatCurrency(pnl.totalExpense)}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-800 font-medium">กำไร (ขาดทุน)</span>
              <span className={cn('text-xl font-bold', pnl.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {formatCurrency(pnl.profit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 465.3 (D) — กำไรตามรอบ */}
      {tab === 'roundpnl' && <RoundPnLReport month={selMonth} />}

      {/* 465.3 (F) — ลูกค้าคุ้ม/ไม่คุ้ม */}
      {tab === 'custvalue' && <CustomerValueReport month={selMonth} />}

      {/* B1: Aging Report Tab */}
      {tab === 'aging' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {(Object.entries(agingReport.buckets) as [string, typeof agingReport.buckets[keyof typeof agingReport.buckets]][]).map(([key, b]) => (
              <div key={key} className={cn('bg-white rounded-xl border p-4',
                key === '90_plus' ? 'border-red-200' : key === '61_90' ? 'border-orange-200' : key === '31_60' ? 'border-amber-200' : key === '1_30' ? 'border-blue-200' : 'border-slate-200')}>
                <p className={cn('text-xs font-medium', b.color)}>{b.label}</p>
                <p className={cn('text-2xl font-bold mt-1', b.color)}>{formatCurrency(b.total)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{b.bills.length} บิล</p>
              </div>
            ))}
          </div>

          {/* Total summary */}
          <div className="bg-gradient-to-r from-[#1B3A5C] to-[#122740] rounded-xl p-4 text-white flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-300">รวมบิลค้างชำระทั้งหมด</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(agingReport.grandTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-300">เกินกำหนด</p>
              <p className="text-2xl font-bold text-red-300 mt-1">{formatCurrency(agingReport.overdueTotal)}</p>
            </div>
          </div>

          {/* Per-customer aging */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">รายลูกค้า ({agingReport.customerList.length})</h3>
            </div>
            {agingReport.customerList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">ไม่มีบิลค้างชำระ ✓</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600">ยังไม่ถึง</th>
                      <th className="text-right px-2 py-2 font-medium text-blue-700">1-30</th>
                      <th className="text-right px-2 py-2 font-medium text-amber-700">31-60</th>
                      <th className="text-right px-2 py-2 font-medium text-orange-700">61-90</th>
                      <th className="text-right px-2 py-2 font-medium text-red-700">90+</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-800">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingReport.customerList.map(c => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <Link href={`/dashboard/customers/${c.id}`} className="text-slate-700 hover:text-[#1B3A5C] hover:underline font-medium">
                            {c.name}
                          </Link>
                        </td>
                        <td className="text-right px-2 py-2 font-mono text-slate-500">{c.not_due > 0 ? formatCurrency(c.not_due) : '-'}</td>
                        <td className="text-right px-2 py-2 font-mono text-blue-600">{c['1_30'] > 0 ? formatCurrency(c['1_30']) : '-'}</td>
                        <td className="text-right px-2 py-2 font-mono text-amber-600">{c['31_60'] > 0 ? formatCurrency(c['31_60']) : '-'}</td>
                        <td className="text-right px-2 py-2 font-mono text-orange-600">{c['61_90'] > 0 ? formatCurrency(c['61_90']) : '-'}</td>
                        <td className="text-right px-2 py-2 font-mono text-red-600 font-semibold">{c['90_plus'] > 0 ? formatCurrency(c['90_plus']) : '-'}</td>
                        <td className="text-right px-3 py-2 font-mono font-bold text-slate-800">{formatCurrency(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Carry-over Tab */}
      {tab === 'carryover' && selCustomer && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* Mode selector */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-600">อ้างอิง:</span>
                <select value={coMode} onChange={e => setCoMode(e.target.value === 'compare' ? 'compare' : Number(e.target.value) as CarryOverMode)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
                  {([1, 2, 3, 4] as CarryOverMode[]).map(m => (
                    <option key={m} value={m}>เคส {m}: {CARRY_OVER_MODE_CONFIG[m].formula}</option>
                  ))}
                  <option value="compare">เปรียบเทียบทุกเคส (1-4)</option>
                </select>
              </div>

              {/* View toggle */}
              {coMode !== 'compare' && (
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5">
                  <button onClick={() => setCoView('monthly')}
                    className={cn('px-3 py-1 rounded transition-colors', coView === 'monthly' ? 'bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'text-slate-600')}>
                    รายเดือน (รายวัน)
                  </button>
                  <button onClick={() => setCoView('yearly')}
                    className={cn('px-3 py-1 rounded transition-colors', coView === 'yearly' ? 'bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'text-slate-600')}>
                    รายปี (รายเดือน)
                  </button>
                </div>
              )}

              {/* Date range */}
              <div className="flex items-center gap-2">
                <input type="date" value={coStartDate} onChange={e => setCoStartDate(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
                <span className="text-slate-400">ถึง</span>
                <input type="date" value={coEndDate} onChange={e => setCoEndDate(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
              </div>

              {/* Show adjustments toggle */}
              <button onClick={() => setCoShowAdjustments(v => !v)}
                className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors',
                  coShowAdjustments ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                {coShowAdjustments ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {coShowAdjustments ? 'แสดง' : 'ซ่อน'}รายการปรับยอด
              </button>

              {/* Spacer */}
              <div className="ml-auto flex items-center gap-2">
                {/* Print/Export button */}
                <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowCarryOverPrint(true) }}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1 font-medium">
                  <FileDown className="w-3.5 h-3.5" />พิมพ์/ส่งออกเอกสาร
                </button>

                {/* Adjust button */}
                <button onClick={() => { setCoEditingAdjustment(undefined); setCoAdjustModalOpen(true) }}
                  className="px-3 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] flex items-center gap-1 font-semibold">
                  <Plus className="w-3.5 h-3.5" />ปรับยอด
                </button>
              </div>
            </div>

            {coMode !== 'compare' && (
              <div className="text-[11px] text-slate-500">
                ({CARRY_OVER_MODE_CONFIG[coMode as CarryOverMode].description})
                {CARRY_OVER_MODE_CONFIG[coMode as CarryOverMode].hint && (
                  <span className="ml-2 italic text-slate-400">({CARRY_OVER_MODE_CONFIG[coMode as CarryOverMode].hint})</span>
                )}
              </div>
            )}

            {/* 296: Undo panel — ย้อนการกระทำ ปรับยอด/แก้ไข/ลบ ภายใน 7 วัน */}
            <UndoPanel filterTypes={['carry_over']} />
          </div>

          {/* 317: By-Group Summary — แสดงเฉพาะลูกค้าที่ opt-in size groups */}
          {coMode !== 'compare' && selCustomer && customerUsesAggregateGroups(selCustomer) && (() => {
            const grouped = groupCarryOver(coCarriedAfter, selCustomer, linenCatalog)
            if (grouped.groups.length === 0) return null
            return (
              <div className="bg-white rounded-xl border border-slate-300 p-4">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 text-sm">
                  📦 สรุปแบบรวมกลุ่ม (ที่สิ้น {formatDate(coEndDate)})
                  <span className="text-[10px] text-slate-500 font-normal">— สำหรับลูกค้าที่นับรวมไซส์ตอนรับเข้า</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped.groups.map(grp => (
                    <details key={grp.groupKey} className="rounded-lg border border-slate-200 bg-slate-50/40 overflow-hidden">
                      <summary className="cursor-pointer px-3 py-2 hover:bg-slate-100 transition-colors list-none flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-700 text-xs">{grp.groupKey}</span>
                          <span className="text-[10px] text-slate-500">{grp.items.length} ไซส์</span>
                        </span>
                        <span className={cn(
                          'font-bold text-sm',
                          grp.netCarry < 0 ? 'text-red-600' : 'text-emerald-600',
                        )}>
                          {grp.netCarry > 0 ? '+' : ''}{grp.netCarry}
                        </span>
                      </summary>
                      <div className="px-3 pb-2 pt-1 space-y-0.5 border-t border-slate-200 text-xs">
                        {grp.items.map(it => (
                          <div key={it.code} className="flex justify-between py-0.5">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <code className="font-mono text-slate-400">{it.code}</code>
                              <span className="truncate">{it.name}</span>
                            </span>
                            <span className={cn('font-medium', it.carry < 0 ? 'text-red-500' : 'text-emerald-600')}>
                              {it.carry > 0 ? '+' : ''}{it.carry}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  💡 ตัวเลขสะสม "ค้าง/คืน" จริงของแต่ละกลุ่ม = sum ของทุก code ใน group · ตรงกับ workflow รวมไซส์ตอนรับเข้า
                </p>
              </div>
            )
          })()}

          {/* Compare Mode — แสดง 4 เคสคู่กัน */}
          {coMode === 'compare' && coCompareValues && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600 border-r border-slate-200">รายการ</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-32">
                      เคส 1
                      <span className="block text-[10px] font-normal text-slate-500 leading-tight">{CARRY_OVER_MODE_CONFIG[1].label}</span>
                      <span className="block text-[10px] font-normal text-slate-400 italic leading-tight">({CARRY_OVER_MODE_CONFIG[1].description})</span>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-32">
                      เคส 2
                      <span className="block text-[10px] font-normal text-slate-500 leading-tight">{CARRY_OVER_MODE_CONFIG[2].label}</span>
                      <span className="block text-[10px] font-normal text-slate-400 italic leading-tight">({CARRY_OVER_MODE_CONFIG[2].description})</span>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-32">
                      เคส 3
                      <span className="block text-[10px] font-normal text-slate-500 leading-tight">{CARRY_OVER_MODE_CONFIG[3].label}</span>
                      <span className="block text-[10px] font-normal text-slate-400 italic leading-tight">({CARRY_OVER_MODE_CONFIG[3].description})</span>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-32">
                      เคส 4
                      <span className="block text-[10px] font-normal text-slate-500 leading-tight">{CARRY_OVER_MODE_CONFIG[4].label}</span>
                      <span className="block text-[10px] font-normal text-slate-400 italic leading-tight">({CARRY_OVER_MODE_CONFIG[4].description})</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coActiveCodes.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
                  ) : coActiveCodes.map(code => {
                    const v1 = coCompareValues[1][code] || 0
                    const v2 = coCompareValues[2][code] || 0
                    const v3 = coCompareValues[3][code] || 0
                    const v4 = coCompareValues[4][code] || 0
                    // 349: peek anchor values for first/last arrow
                    const m = coRowAggMeta.get(code)
                    const anchorVals = m?.isInGroup && !m.isAnchor && coCompareValues ? {
                      1: coCompareValues[1][m.anchorCode] || 0,
                      2: coCompareValues[2][m.anchorCode] || 0,
                      3: coCompareValues[3][m.anchorCode] || 0,
                      4: coCompareValues[4][m.anchorCode] || 0,
                    } : null
                    const cellCls = (v: number) => cn(
                      'text-right px-4 py-2 font-mono',
                      v < 0 ? 'text-red-600' : v > 0 ? 'text-emerald-600' : 'text-slate-300',
                    )
                    const fmt = (v: number) => v === 0 ? '·' : (v > 0 ? '+' : '') + v
                    // render: own value → arrow ↓/↑ ถ้า anchor มีค่า → '·'
                    const renderCell = (v: number, anchorV: number) => {
                      if (v !== 0) return fmt(v)
                      const arr = anchorVals ? cellArrow(code, anchorV !== 0) : null
                      return arr || '·'
                    }
                    return (
                      <tr key={code} className={coRowClasses(code)}>
                        <td className="px-4 py-2 border-r border-slate-100 max-w-[320px]">{renderCoLabel(code)}</td>
                        <td className={cellCls(v1)}>{renderCell(v1, anchorVals?.[1] || 0)}</td>
                        <td className={cellCls(v2)}>{renderCell(v2, anchorVals?.[2] || 0)}</td>
                        <td className={cellCls(v3)}>{renderCell(v3, anchorVals?.[3] || 0)}</td>
                        <td className={cellCls(v4)}>{renderCell(v4, anchorVals?.[4] || 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Monthly View (51.1) — รายการ=row, day=col · 349.3 compact widths */}
          {coMode !== 'compare' && coView === 'monthly' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="text-[11px] w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-slate-600 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[150px]">รายการ</th>
                    <th className="text-right px-1 py-1.5 font-medium text-slate-600 w-10">ยกมา</th>
                    {coDaysInRange.map(day => (
                      <th key={day} className="text-right px-0.5 py-1.5 font-medium text-slate-600 w-8">{parseInt(day.split('-')[2])}</th>
                    ))}
                    <th className="text-right px-1 py-1.5 font-medium text-slate-600 w-10 bg-slate-100">รวม</th>
                    <th className="text-right px-1 py-1.5 font-medium text-slate-600 w-10 bg-slate-100">สะสม</th>
                  </tr>
                </thead>
                <tbody>
                  {coActiveCodes.length === 0 ? (
                    <tr><td colSpan={coDaysInRange.length + 4} className="text-center py-8 text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
                  ) : coActiveCodes.map(code => {
                    const brought = coBroughtForward[code] || 0
                    const carried = coCarriedAfter[code] || 0
                    const monthTotal = carried - brought
                    const isNonAnchor = isCoNonAnchorInGroup(code)
                    const dailyFor = (day: string) => isNonAnchor
                      ? computeNonAnchorDailyAdj(selCustomerId, code, day)
                      : computeDailyDiff(selCustomerId, code, day, coMode as CarryOverMode)
                    // 349: peek anchor values for first/last arrow
                    const m = coRowAggMeta.get(code)
                    const ancBrought = m?.isInGroup && !m.isAnchor ? (coBroughtForward[m.anchorCode] || 0) : 0
                    const ancCarried = m?.isInGroup && !m.isAnchor ? (coCarriedAfter[m.anchorCode] || 0) : 0
                    const ancMonthTotal = ancCarried - ancBrought
                    const cellCls = (v: number, bgTotal = false) => cn(
                      'text-right px-0.5 py-1 font-mono',
                      bgTotal && 'bg-slate-50 px-1',
                      v < 0 ? 'text-red-600' : v > 0 ? 'text-emerald-600' : 'text-slate-300',
                    )
                    const fmt = (v: number) => v === 0 ? '·' : (v > 0 ? '+' : '') + v
                    const renderCell = (v: number, anchorV: number) => {
                      if (v !== 0) return fmt(v)
                      const arr = m?.isInGroup && !m.isAnchor ? cellArrow(code, anchorV !== 0) : null
                      return arr || '·'
                    }
                    return (
                      <tr key={code} className={coRowClasses(code)}>
                        <td className="px-2 py-1 sticky left-0 z-10 bg-white border-r border-slate-100">
                          {renderCoLabel(code)}
                        </td>
                        <td className={cellCls(brought)}>{renderCell(brought, ancBrought)}</td>
                        {coDaysInRange.map(day => {
                          const d = dailyFor(day)
                          const ancD = m?.isInGroup && !m.isAnchor
                            ? computeDailyDiff(selCustomerId, m.anchorCode, day, coMode as CarryOverMode)
                            : 0
                          return <td key={day} className={cellCls(d)}>{renderCell(d, ancD)}</td>
                        })}
                        <td className={cn(cellCls(monthTotal, true), monthTotal !== 0 && 'font-medium')}>{renderCell(monthTotal, ancMonthTotal)}</td>
                        <td className={cn(cellCls(carried, true), carried !== 0 && 'font-semibold')}>{renderCell(carried, ancCarried)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Yearly View (51.2) — รายการ=row, month=col · 349.3 compact widths */}
          {coMode !== 'compare' && coView === 'yearly' && (() => {
            // 349.1.1: helper — compute anchor's monthly sum (re-use logic ของ anchor inline)
            const computeAnchorMonthlySum = (anchorCode: string, month: string): number => {
              const aggInfo = getAggInfoForCode(anchorCode)
              if (!aggInfo) return 0
              const groupCodes = new Set(linenCatalog.filter(i => i.sizeGroup === aggInfo.groupKey).map(i => i.code))
              let sum = 0
              for (const f of linenForms) {
                if (f.customerId !== selCustomerId || !f.date.startsWith(month)) continue
                const m: CarryOverMode = f.workflowMode === 'trust_customer' ? 2 : (coMode as CarryOverMode)
                for (const r of f.rows) {
                  if (!groupCodes.has(r.code)) continue
                  switch (m) {
                    case 1: sum += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
                    case 2: sum += (r.col6_factoryPackSend || 0) - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
                    case 3: sum += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
                    case 4: sum += r.col4_factoryApproved - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
                  }
                }
              }
              for (const a of carryOverAdjustments) {
                if (a.isDeleted || a.customerId !== selCustomerId || !a.date.startsWith(month) || a.type !== 'adjust') continue
                if (!coShowAdjustments && !a.showInCustomerReport) continue
                for (const it of a.items) {
                  if (groupCodes.has(it.code)) sum += it.delta || 0
                }
              }
              return sum
            }
            return (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="text-[11px] w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-slate-600 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[150px]">รายการ</th>
                    <th className="text-right px-1 py-1.5 font-medium text-slate-600 w-12">ยกมา</th>
                    {coMonthsInRange.map(month => (
                      <th key={month} className="text-right px-1 py-1.5 font-medium text-slate-600 w-12">{month.slice(5)}/{month.slice(2, 4)}</th>
                    ))}
                    <th className="text-right px-1 py-1.5 font-medium text-slate-600 w-12 bg-slate-100">รวม</th>
                    <th className="text-right px-1 py-1.5 font-medium text-slate-600 w-12 bg-slate-100">สะสม</th>
                  </tr>
                </thead>
                <tbody>
                  {coActiveCodes.length === 0 ? (
                    <tr><td colSpan={coMonthsInRange.length + 4} className="text-center py-8 text-slate-400">ไม่มีรายการในช่วงเวลานี้</td></tr>
                  ) : coActiveCodes.map(code => {
                    const brought = coBroughtForward[code] || 0
                    const carried = coCarriedAfter[code] || 0
                    const yearTotal = carried - brought
                    const isNonAnchor = isCoNonAnchorInGroup(code)
                    // 349: peek anchor values for first/last arrow
                    const m = coRowAggMeta.get(code)
                    const ancBrought = m?.isInGroup && !m.isAnchor ? (coBroughtForward[m.anchorCode] || 0) : 0
                    const ancCarried = m?.isInGroup && !m.isAnchor ? (coCarriedAfter[m.anchorCode] || 0) : 0
                    const ancYearTotal = ancCarried - ancBrought
                    const cellCls = (v: number, bgTotal = false) => cn(
                      'text-right px-1 py-1 font-mono',
                      bgTotal && 'bg-slate-50',
                      v < 0 ? 'text-red-600' : v > 0 ? 'text-emerald-600' : 'text-slate-300',
                    )
                    const fmt = (v: number) => v === 0 ? '·' : (v > 0 ? '+' : '') + v
                    const renderCell = (v: number, anchorV: number) => {
                      if (v !== 0) return fmt(v)
                      const arr = m?.isInGroup && !m.isAnchor ? cellArrow(code, anchorV !== 0) : null
                      return arr || '·'
                    }
                    return (
                      <tr key={code} className={coRowClasses(code)}>
                        <td className="px-2 py-1 sticky left-0 z-10 bg-white border-r border-slate-100">
                          {renderCoLabel(code)}
                        </td>
                        <td className={cellCls(brought)}>{renderCell(brought, ancBrought)}</td>
                        {coMonthsInRange.map(month => {
                          let monthSum = 0
                          if (isNonAnchor) {
                            monthSum = computeNonAnchorMonthlyAdj(selCustomerId, code, month)
                          } else {
                            // anchor / ungrouped — inline calc
                            const aggInfo = getAggInfoForCode(code)
                            const isAggAnchor = !!(aggInfo && aggInfo.anchorCode === code)
                            const groupCodes = isAggAnchor && aggInfo
                              ? new Set(linenCatalog.filter(i => i.sizeGroup === aggInfo.groupKey).map(i => i.code))
                              : null
                            for (const f of linenForms) {
                              if (f.customerId !== selCustomerId || !f.date.startsWith(month)) continue
                              const mode: CarryOverMode = f.workflowMode === 'trust_customer' ? 2 : (coMode as CarryOverMode)
                              for (const r of f.rows) {
                                const matches = groupCodes ? groupCodes.has(r.code) : r.code === code
                                if (!matches) continue
                                switch (mode) {
                                  case 1: monthSum += (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved; break
                                  case 2: monthSum += (r.col6_factoryPackSend || 0) - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
                                  case 3: monthSum += r.col4_factoryApproved - r.col5_factoryClaimApproved; break
                                  case 4: monthSum += r.col4_factoryApproved - (r.col2_hotelCountIn + r.col3_hotelClaimCount); break
                                }
                              }
                            }
                            for (const a of carryOverAdjustments) {
                              if (a.isDeleted || a.customerId !== selCustomerId || !a.date.startsWith(month) || a.type !== 'adjust') continue
                              if (!coShowAdjustments && !a.showInCustomerReport) continue
                              for (const it of a.items) {
                                const matches = groupCodes ? groupCodes.has(it.code) : it.code === code
                                if (matches) monthSum += it.delta || 0
                              }
                            }
                          }
                          // 349: anchor's monthly value for arrow
                          const ancMonthSum = m?.isInGroup && !m.isAnchor
                            ? computeAnchorMonthlySum(m.anchorCode, month)
                            : 0
                          return <td key={month} className={cellCls(monthSum)}>{renderCell(monthSum, ancMonthSum)}</td>
                        })}
                        <td className={cn(cellCls(yearTotal, true), yearTotal !== 0 && 'font-medium')}>{renderCell(yearTotal, ancYearTotal)}</td>
                        <td className={cn(cellCls(carried, true), carried !== 0 && 'font-semibold')}>{renderCell(carried, ancCarried)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )
          })()}

          {/* Adjustments History */}
          {coShowAdjustments && coAdjustmentsInRange.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">รายการปรับยอดในช่วงเวลานี้ ({coAdjustmentsInRange.length})</h3>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">ประเภท</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">หมวด</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">เหตุผล</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600">แสดงลูกค้า</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {coAdjustmentsInRange.map(a => (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-600">{formatDate(a.date)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={cn('inline-block px-2 py-0.5 rounded font-medium',
                            a.type === 'reset' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                            {a.type === 'reset' ? 'Reset' : 'Adjust'}
                          </span>
                          {/* 340.3: badge สำหรับ adj ที่ใช้ auto-balance (redistribute pattern) */}
                          {a.autoBalancedAnchor && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title="ใช้ auto-balance — redistribute pattern (group sum คงที่)">
                              ⚖ balance
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.items.map(it => (
                            <span key={it.code} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                              {it.code}{a.type === 'adjust' && it.delta !== 0 ? ` ${it.delta > 0 ? '+' : ''}${it.delta}` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{CARRY_OVER_REASON_CONFIG[a.reasonCategory].icon} {CARRY_OVER_REASON_CONFIG[a.reasonCategory].label}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-xs truncate" title={a.reason}>{a.reason}</td>
                      <td className="px-3 py-2 text-center">
                        {a.showInCustomerReport ? <Eye className="w-3.5 h-3.5 inline text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 inline text-slate-300" />}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { setCoEditingAdjustment(a); setCoAdjustModalOpen(true) }}
                            className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-[#1B3A5C]" title="แก้ไข" aria-label="แก้ไขรายการปรับยอด">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => {
                            if (!confirm(`ลบรายการปรับยอดวันที่ ${formatDate(a.date)} ?`)) return
                            // 296: snapshot oldData ก่อน delete → push undo
                            const oldData = { ...a }
                            deleteCarryOverAdjustment(a.id)
                            pushUndoAction({
                              type: 'carry_over',
                              description: `ลบการปรับยอดวันที่ ${formatDate(a.date)} — ${selCustomer?.shortName || selCustomer?.name || ''}`,
                              changes: [{ table: 'carry_over_adjustments', id: a.id, op: 'delete', oldData }],
                            })
                          }}
                            className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-red-600" title="ลบ" aria-label="ลบรายการปรับยอด">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Discrepancy Analytics Tab (53.1) */}
      {tab === 'discrepancy' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">
              วิเคราะห์ความถี่ของการนับไม่ตรงในเดือน <strong>{selMonth}</strong> — แสดง 2 type:
            </p>
            <ul className="text-xs text-slate-500 mt-2 space-y-1 ml-4 list-disc">
              <li><strong>Type 1:</strong> โรงซักนับเข้า (col5) ≠ ลูกค้านับส่ง+เคลม (col2+col3) — ตรวจตอนรับผ้า</li>
              <li><strong>Type 2:</strong> ลูกค้านับกลับ (col4) ≠ โรงซักแพคส่ง (col6) — ตรวจตอนคืนผ้า</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Customers */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">Top 10 ลูกค้านับไม่ตรง</h3>
              </div>
              {discrepancyAnalytics.topCustomers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">ไม่พบความแตกต่างการนับ</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-8">#</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ลูกค้า</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600 w-14">T1</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600 w-14" title="Type 2 Pending — col4 ≠ col6 ที่ยังไม่ได้แก้">T2 รอ</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600 w-14" title="Type 2 Resolved — เคย sync col6+col4 แล้ว">T2 ✓</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-14">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discrepancyAnalytics.topCustomers.map((c, i) => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Link href={`/dashboard/customers/${c.id}`} className="text-slate-700 hover:text-[#1B3A5C] hover:underline">{c.name}</Link>
                        </td>
                        <td className="text-right px-2 py-2 font-mono text-amber-600">{c.type1}</td>
                        <td className="text-right px-2 py-2 font-mono text-orange-600">{c.type2Pending}</td>
                        <td className="text-right px-2 py-2 font-mono text-emerald-600">{c.type2Resolved}</td>
                        <td className="text-right px-3 py-2 font-mono font-semibold text-slate-800">{c.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top Items */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">Top 10 รายการผ้านับไม่ตรง</h3>
              </div>
              {discrepancyAnalytics.topItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">ไม่พบความแตกต่างการนับ</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-8">#</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600 w-14">T1</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600 w-14">T2 รอ</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600 w-14">T2 ✓</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-14">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discrepancyAnalytics.topItems.map((it, i) => (
                      <tr key={it.code} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-slate-400 mr-1">{it.code}</span>
                          <span className="text-slate-700">{it.name}</span>
                        </td>
                        <td className="text-right px-2 py-2 font-mono text-amber-600">{it.type1}</td>
                        <td className="text-right px-2 py-2 font-mono text-orange-600">{it.type2Pending}</td>
                        <td className="text-right px-2 py-2 font-mono text-emerald-600">{it.type2Resolved}</td>
                        <td className="text-right px-3 py-2 font-mono font-semibold text-slate-800">{it.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Type 2 Summary — split Pending vs Resolved (74) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">สรุป Type 2: ลูกค้านับกลับ ≠ โรงซักแพคส่ง</h3>
            <p className="text-xs text-slate-500 mb-3">
              <strong className="text-orange-600">Pending</strong> = ยังไม่ได้แก้ (col4 ≠ col6 active) | <strong className="text-emerald-600">Resolved</strong> = แก้แล้ว (เคย sync col6+col4)
            </p>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-2xl font-bold text-orange-600">{discrepancyAnalytics.type2Pending}</p>
                <p className="text-xs text-orange-700">🟠 Pending — ยังไม่ได้แก้</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-2xl font-bold text-emerald-600">{discrepancyAnalytics.type2Resolved}</p>
                <p className="text-xs text-emerald-700">✓ Resolved — sync แล้ว</p>
              </div>
            </div>
            {discrepancyAnalytics.topType2Customers.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">ลูกค้าที่นับไม่ตรงบ่อย:</p>
                <div className="flex flex-wrap gap-2">
                  {discrepancyAnalytics.topType2Customers.map(c => (
                    <Link key={c.id} href={`/dashboard/customers/${c.id}`}
                      className="text-xs bg-slate-50 text-slate-700 px-2 py-1 rounded hover:bg-slate-100 border border-slate-200">
                      {c.name} <span className="font-mono">({c.count})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly Delivery Report Tab */}
      {tab === 'delivery' && selCustomer && (
        <div className="no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">
              รายงานส่งสินค้า — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
            <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowDeliveryPrint(true) }}
              className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <MonthlyDeliveryReportPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
            />
          </div>
        </div>
      )}

      {/* Monthly Stock Report Tab */}
      {tab === 'stock' && selCustomer && (
        <div className="no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">
              สต็อกรายเดือน — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
            <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowStockPrint(true) }}
              className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <MonthlyStockReportPrint
              customer={selCustomer}
              month={selMonth}
              linenForms={linenForms}
              catalog={linenCatalog}
              company={companyInfo}
              getCarryOver={getCarryOver}
            />
          </div>
        </div>
      )}

      {/* Consolidation Tab (รวบเดือน) */}
      {tab === 'consolidation' && selCustomer && (
        <div className="no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">
              รวบเดือน — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
            <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowConsolidationPrint(true) }}
              className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <MonthlyConsolidationPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
              priceMap={buildPriceMapFromQT(selCustomer.id, quotations)}
            />
          </div>
        </div>
      )}

      {/* 217.1: Price Audit Tab — read-only monitoring */}
      {tab === 'priceaudit' && <PriceAudit />}
      {tab === 'sdaudit' && <SDAudit />}
      {tab === 'wbaudit' && <WBAudit />}
      {tab === 'driftaudit' && <CarryDriftAudit />}
      {tab === 'lfrowaudit' && <LFRowAudit />}
      {tab === 'closing' && <MonthlyClosingChecklist />}
      {tab === 'trustaudit' && <TrustModeAudit />}
      {tab === 'aggaudit' && <AggregateModeAudit />}
      {tab === 'anchoraudit' && <AggregateAnchorAudit />}
      {tab === 'scheduleaudit' && <ScheduleAudit />}

      {/* 220: Executive Dashboard — admin only */}
      {tab === 'executive' && <ExecutiveDashboard />}

      {/* Delivery Report Print Modal */}
      <Modal open={showDeliveryPrint} onClose={() => setShowDeliveryPrint(false)} title="พิมพ์รายงานส่งสินค้า" size="full" className="print-target">
        {selCustomer && (
          <div>
            {/* Dynamic @page override */}
            <style>{`@media print { @page { size: A4 ${printOrientation}; margin: ${printMargin === 'narrow' ? '5mm' : '10mm'}; } }`}</style>

            {/* Print options */}
            <div className="no-print flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">แนวกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintOrientation('portrait')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'portrait' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวตั้ง
                  </button>
                  <button onClick={() => setPrintOrientation('landscape')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'landscape' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวนอน
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ขอบกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintMargin('normal')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'normal' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    ปกติ (10mm)
                  </button>
                  <button onClick={() => setPrintMargin('narrow')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'narrow' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แคบ (5mm)
                  </button>
                </div>
              </div>
            </div>

            <MonthlyDeliveryReportPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-delivery-report" filename={`delivery-report-${selCustomer.shortName || selCustomer.name}-${selMonth}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>

      {/* Consolidation Print Modal */}
      <Modal open={showConsolidationPrint} onClose={() => setShowConsolidationPrint(false)} title="พิมพ์รวบเดือน" size="full" className="print-target">
        {selCustomer && (
          <div>
            <style>{`@media print { @page { size: A4 ${printOrientation}; margin: ${printMargin === 'narrow' ? '5mm' : '10mm'}; } }`}</style>

            <div className="no-print flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">แนวกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintOrientation('portrait')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'portrait' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวตั้ง
                  </button>
                  <button onClick={() => setPrintOrientation('landscape')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'landscape' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวนอน
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ขอบกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintMargin('normal')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'normal' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    ปกติ (10mm)
                  </button>
                  <button onClick={() => setPrintMargin('narrow')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'narrow' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แคบ (5mm)
                  </button>
                </div>
              </div>
            </div>

            <MonthlyConsolidationPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
              priceMap={buildPriceMapFromQT(selCustomer.id, quotations)}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-consolidation" filename={`รวบเดือน-${selCustomer.shortName || selCustomer.name}-${selMonth}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>

      {/* Stock Report Print Modal */}
      <Modal open={showStockPrint} onClose={() => setShowStockPrint(false)} title="พิมพ์สต็อกรายเดือน" size="full" className="print-target">
        {selCustomer && (
          <div>
            {/* Dynamic @page override */}
            <style>{`@media print { @page { size: A4 ${printOrientation}; margin: ${printMargin === 'narrow' ? '5mm' : '10mm'}; } }`}</style>

            {/* Print options */}
            <div className="no-print flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">แนวกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintOrientation('portrait')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'portrait' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวตั้ง
                  </button>
                  <button onClick={() => setPrintOrientation('landscape')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'landscape' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวนอน
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ขอบกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintMargin('normal')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'normal' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    ปกติ (10mm)
                  </button>
                  <button onClick={() => setPrintMargin('narrow')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'narrow' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แคบ (5mm)
                  </button>
                </div>
              </div>
            </div>

            <MonthlyStockReportPrint
              customer={selCustomer}
              month={selMonth}
              linenForms={linenForms}
              catalog={linenCatalog}
              company={companyInfo}
              getCarryOver={getCarryOver}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-stock-report" filename={`stock-report-${selCustomer.shortName || selCustomer.name}-${selMonth}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>

      {/* Carry-over Adjust Modal */}
      {selCustomer && (
        <CarryOverAdjustModal
          open={coAdjustModalOpen}
          onClose={() => { setCoAdjustModalOpen(false); setCoEditingAdjustment(undefined) }}
          customerId={selCustomer.id}
          customerName={selCustomer.shortName || selCustomer.name}
          editing={coEditingAdjustment}
        />
      )}

      {/* Carry-over Report Print Modal */}
      <Modal open={showCarryOverPrint} onClose={() => setShowCarryOverPrint(false)} title="พิมพ์รายงานผ้าค้าง/คืน" size="full" className="print-target">
        {selCustomer && (
          <div className={cn('print-content', `print-${printOrientation}`, `print-margin-${printMargin}`)}>
            <div className="flex justify-between items-center mb-4 no-print">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-600">รูปแบบกระดาษ:</span>
                <select value={printOrientation} onChange={e => setPrintOrientation(e.target.value as 'portrait' | 'landscape')}
                  className="px-2 py-1 border border-slate-200 rounded">
                  <option value="landscape">แนวนอน (Landscape)</option>
                  <option value="portrait">แนวตั้ง (Portrait)</option>
                </select>
                <select value={printMargin} onChange={e => setPrintMargin(e.target.value as 'normal' | 'narrow')}
                  className="px-2 py-1 border border-slate-200 rounded">
                  <option value="narrow">ขอบแคบ</option>
                  <option value="normal">ขอบปกติ</option>
                </select>
              </div>
            </div>
            <CarryOverReportPrint
              customer={selCustomer}
              company={companyInfo}
              catalog={linenCatalog}
              linenForms={linenForms}
              carryOverAdjustments={carryOverAdjustments}
              startDate={coStartDate}
              endDate={coEndDate}
              mode={coMode}
              view={coView}
              showAdjustments={coShowAdjustments}
              getCarryOver={getCarryOver}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-carryover-report" filename={`carryover-${selCustomer.shortName || selCustomer.name}-${coStartDate}-${coEndDate}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
