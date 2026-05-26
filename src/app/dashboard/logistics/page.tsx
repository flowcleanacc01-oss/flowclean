'use client'

// P5.1 — ปฏิทินขนส่ง (Logistic Calendar, Weekly)
// แสดงคิวรับ-ส่งผ้ารายสัปดาห์ (ลูกค้า × 7 วัน) จาก schedule + overrides + SD จริง
// ลาก cell ข้ามวัน = เลื่อนคิว · คลิก = สร้าง/ดู SD

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import {
  buildLogisticsWeek, getWeekStart, addDays, parseLocalDate, isDraggableStatus,
  type LogisticsCell, type LogisticsRow,
} from '@/lib/logistics-week'
import { todayISO, genId, cn, formatExportFilename } from '@/lib/utils'
import { WEEKDAY_SHORT, SCHEDULE_TYPE_CONFIG, type DeliveryNote, type ScheduleOverride, type Customer } from '@/types'
import { canViewSD } from '@/lib/permissions'
import Modal from '@/components/Modal'
import RouteSheetPrint, { type RouteStop } from '@/components/RouteSheetPrint'
import ExportButtons from '@/components/ExportButtons'
import {
  ChevronLeft, ChevronRight, CalendarDays, Truck, Plus, AlertOctagon,
  AlertTriangle, CheckCircle2, ArrowRight, Ban, Info, ClipboardCheck, CornerUpRight, CornerDownRight,
  ChevronUp, ChevronDown, GripVertical, ListOrdered, X, CalendarX, Trash2,
} from 'lucide-react'

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function fmtShort(iso: string): string {
  const d = parseLocalDate(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}
function fmtFull(iso: string): string {
  const d = parseLocalDate(iso)
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${TH_MONTHS[d.getMonth()]}`
}
function cellStatusLabel(cell: LogisticsCell, today: string): string {
  if (cell.regularSDs.length) return cell.regularSDs.map(s => s.noteNumber).join(', ')
  if (cell.status === 'extra-only' || cell.status === 'override-extra') {
    return cell.extraSDs.length ? `รอบเสริม (${cell.extraSDs.map(s => s.noteNumber).join(', ')})` : 'รอบเสริม'
  }
  if (cell.status === 'missing') return cell.date <= today ? 'ขาด — รอสร้าง SD' : 'รอสร้าง SD'
  if (cell.status === 'off-schedule') return cell.extraSDs.length ? `นอกคิว (${cell.extraSDs.map(s => s.noteNumber).join(', ')})` : 'นอกคิว'
  return '-'
}

interface PendingReschedule {
  customerId: string
  customerName: string
  fromDate: string
  toDate: string
  regularSDs: DeliveryNote[]
  mode: 'move-sd' | 'move-expectation'
  fromBaseScheduled: boolean        // 371 — from เป็นวันคิวจริง (มีคิวให้ skip) ไหม
}

// 371 — undo: เก็บ inverse ของ reschedule ล่าสุด เพื่อ "เลิกทำ"
interface ReschedAction {
  label: string
  addedOverrideIds: string[]                                     // ที่เพิ่ง add → undo: delete
  deletedOverrides: ScheduleOverride[]                           // ที่เพิ่ง delete → undo: re-add
  movedSDs: { id: string; noteNumber: string; fromDate: string }[] // SD ที่ย้าย → undo: ย้ายกลับ
  customerRestore?: { id: string; prev: Partial<Customer> }      // 378 — undo: คืนค่า schedule fields
}

// 378 — ลบ chip → เลือก scope (เหมือน Google Calendar)
interface PendingDelete {
  customerId: string
  customerName: string
  date: string
  hasSD: boolean
}

export default function LogisticsPage() {
  const { currentUser, customers, deliveryNotes, scheduleOverrides, updateDeliveryNote, addScheduleOverride, deleteScheduleOverride, updateCustomer, routePlans, setRouteOrder, companyInfo } = useStore()
  const router = useRouter()

  const today = todayISO()
  const [anchor, setAnchor] = useState(() => getWeekStart(today))

  // drag state
  const dragSourceRef = useRef<{ customerId: string; date: string } | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [draggingRow, setDraggingRow] = useState<string | null>(null)

  // reschedule confirm
  const [pending, setPending] = useState<PendingReschedule | null>(null)
  const [reason, setReason] = useState('')
  const [lastAction, setLastAction] = useState<ReschedAction | null>(null)  // 371 — undo
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)  // 378

  const week = useMemo(
    () => buildLogisticsWeek(customers, deliveryNotes, scheduleOverrides, anchor, today),
    [customers, deliveryNotes, scheduleOverrides, anchor, today],
  )

  // day-detail (route ordering) state
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const listDragIdx = useRef<number | null>(null)
  const [listDragOver, setListDragOver] = useState<number | null>(null)

  // จุดวิ่งของวันที่เลือก — เรียงตาม routePlan (unordered ต่อท้ายตามชื่อ)
  const dayStops = useMemo(() => {
    if (!selectedDay) return []
    const plan = routePlans.find(p => p.date === selectedDay)
    const order = plan?.orderedCustomerIds || []
    const stops = week.rows
      .map(row => ({ row, cell: row.cells.find(c => c.date === selectedDay) }))
      .filter((x): x is { row: LogisticsRow; cell: LogisticsCell } =>
        !!x.cell && x.cell.status !== 'empty' && x.cell.status !== 'skipped')
    stops.sort((a, b) => {
      const ia = order.indexOf(a.row.customer.id)
      const ib = order.indexOf(b.row.customer.id)
      if (ia === -1 && ib === -1) {
        return (a.row.customer.shortName || a.row.customer.name).localeCompare(b.row.customer.shortName || b.row.customer.name, 'th')
      }
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    return stops
  }, [selectedDay, week, routePlans])

  if (!canViewSD(currentUser)) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800">
        คุณไม่มีสิทธิ์เข้าถึงหน้าปฏิทินขนส่ง
      </div>
    )
  }

  const isThisWeek = week.weekStart === getWeekStart(today)

  // ── drag handlers ──
  const onDragStart = (row: LogisticsRow, cell: LogisticsCell) => {
    dragSourceRef.current = { customerId: row.customer.id, date: cell.date }
    setDraggingRow(row.customer.id)
  }
  const onDragEnd = () => {
    dragSourceRef.current = null
    setDragOverKey(null)
    setDraggingRow(null)
  }
  const canDropOn = (row: LogisticsRow, cell: LogisticsCell): boolean => {
    const src = dragSourceRef.current
    return !!src && src.customerId === row.customer.id && src.date !== cell.date
  }
  const onDrop = (row: LogisticsRow, cell: LogisticsCell) => {
    const src = dragSourceRef.current
    if (!src || !canDropOn(row, cell)) { onDragEnd(); return }
    const srcCell = row.cells.find(c => c.date === src.date)
    onDragEnd()
    if (!srcCell) return
    const movingSD = srcCell.regularSDs.length > 0
    setPending({
      customerId: row.customer.id,
      customerName: row.customer.shortName || row.customer.name,
      fromDate: src.date,
      toDate: cell.date,
      regularSDs: srcCell.regularSDs,
      mode: movingSD ? 'move-sd' : 'move-expectation',
      fromBaseScheduled: srcCell.baseScheduled,
    })
    setReason(`เลื่อนคิว ${fmtShort(src.date)} → ${fmtShort(cell.date)}`)
  }

  const confirmReschedule = () => {
    if (!pending) return
    const cid = pending.customerId
    const linkId = genId()
    const addedOverrideIds: string[] = []
    const deletedOverrides: ScheduleOverride[] = []
    const movedSDs: { id: string; noteNumber: string; fromDate: string }[] = []

    // 371 — หักล้าง override ที่ขัดแย้ง ณ 2 ปลายทางก่อน (กัน duplicate ตอนเลื่อนย้อนกลับ)
    // ถ้าไม่ทำ: เลื่อน 18→19 (skip@18+add@19) แล้วเลื่อน 19→18 จะได้ add@18+skip@19 ทับซ้อน
    //           → ทั้ง 2 วันมี skip+add → audit ตีว่า expected ทั้งคู่ → โชว์คิวซ้ำ
    const toSkipOv = scheduleOverrides.find(o => o.customerId === cid && o.date === pending.toDate && o.type === 'reschedule_skip')
    const fromAddOv = scheduleOverrides.find(o => o.customerId === cid && o.date === pending.fromDate && o.type === 'reschedule_add')
    if (toSkipOv) { deleteScheduleOverride(toSkipOv.id); deletedOverrides.push(toSkipOv) }   // ปลายทางจะมีคิว → ลบ "เลื่อนออก" ที่ค้าง
    if (fromAddOv) { deleteScheduleOverride(fromAddOv.id); deletedOverrides.push(fromAddOv) } // ต้นทางจะเลื่อนออก → ลบ "เลื่อนเข้า" ที่ค้าง

    // ต้นทาง: mark "เลื่อนออก" — เฉพาะวันคิวจริง + ไม่ได้เพิ่งหักล้าง add (กันวันเดิมโชว์ "ขาด")
    if (!fromAddOv && pending.fromBaseScheduled) {
      const o = addScheduleOverride({ customerId: cid, date: pending.fromDate, type: 'reschedule_skip', reason, rescheduledLinkId: linkId })
      addedOverrideIds.push(o.id)
    }
    // ปลายทาง
    if (pending.mode === 'move-sd') {
      // มี SD จริง: ย้ายวันที่ SD ไปวันใหม่ (SD = หลักฐานว่าส่งวันใหม่)
      pending.regularSDs.forEach(sd => { updateDeliveryNote(sd.id, { date: pending.toDate }); movedSDs.push({ id: sd.id, noteNumber: sd.noteNumber, fromDate: pending.fromDate }) })
    } else if (!toSkipOv) {
      // ยังไม่มี SD + ปลายทางไม่ได้หักล้าง skip → ทำเครื่องหมาย "เลื่อนเข้า"
      const o = addScheduleOverride({ customerId: cid, date: pending.toDate, type: 'reschedule_add', reason, rescheduledLinkId: linkId })
      addedOverrideIds.push(o.id)
    }

    setLastAction({ label: `${pending.customerName}: ${fmtShort(pending.fromDate)} → ${fmtShort(pending.toDate)}`, addedOverrideIds, deletedOverrides, movedSDs })
    setPending(null)
  }

  // 371 — เลิกทำ action ล่าสุด (reverse ทุก operation)
  const undoReschedule = () => {
    if (!lastAction) return
    lastAction.addedOverrideIds.forEach(id => deleteScheduleOverride(id))
    lastAction.deletedOverrides.forEach(o => addScheduleOverride({ customerId: o.customerId, date: o.date, type: o.type, reason: o.reason, rescheduledLinkId: o.rescheduledLinkId }))
    lastAction.movedSDs.forEach(m => updateDeliveryNote(m.id, { date: m.fromDate }))
    if (lastAction.customerRestore) updateCustomer(lastAction.customerRestore.id, lastAction.customerRestore.prev)  // 378
    setLastAction(null)
  }

  // ── 378 — ลบ chip (เลือก scope เหมือน Google Calendar) ──
  const askDelete = (row: LogisticsRow, cell: LogisticsCell) => {
    setPendingDelete({
      customerId: row.customer.id,
      customerName: row.customer.shortName || row.customer.name,
      date: cell.date,
      hasSD: cell.regularSDs.length > 0,
    })
  }

  // เฉพาะกิจกรรมนี้ = skip override วันนั้น (371 cancel-opposite: ลบ add/extra ที่ค้างก่อน)
  const deleteThisOnly = () => {
    if (!pendingDelete) return
    const { customerId, date, customerName } = pendingDelete
    const oppOv = scheduleOverrides.find(o => o.customerId === customerId && o.date === date && (o.type === 'reschedule_add' || o.type === 'extra'))
    const deletedOverrides: ScheduleOverride[] = []
    if (oppOv) { deleteScheduleOverride(oppOv.id); deletedOverrides.push(oppOv) }
    const o = addScheduleOverride({ customerId, date, type: 'skip', reason: 'ลูกค้ายกเลิก/ข้ามคิววันนี้' })
    setLastAction({ label: `${customerName}: ข้ามคิว ${fmtShort(date)}`, addedOverrideIds: [o.id], deletedOverrides, movedSDs: [] })
    setPendingDelete(null)
  }

  // กิจกรรมนี้และที่ตามมาทั้งหมด = ตั้ง scheduleEndDate = วันก่อนหน้า chip นี้
  const deleteThisAndFollowing = () => {
    if (!pendingDelete) return
    const { customerId, date, customerName } = pendingDelete
    const cust = customers.find(c => c.id === customerId)
    const prev: Partial<Customer> = { scheduleEndDate: cust?.scheduleEndDate, scheduleEndCount: cust?.scheduleEndCount }
    const newEnd = addDays(date, -1)
    updateCustomer(customerId, { scheduleEndDate: newEnd, scheduleEndCount: undefined })
    setLastAction({ label: `${customerName}: สิ้นสุดคิวที่ ${fmtShort(newEnd)}`, addedOverrideIds: [], deletedOverrides: [], movedSDs: [], customerRestore: { id: customerId, prev } })
    setPendingDelete(null)
  }

  // ทั้งหมด = เปลี่ยนเป็น "ไม่ตั้งคิว" (เก็บ prev ไว้ undo)
  const deleteAllSchedule = () => {
    if (!pendingDelete) return
    const { customerId, customerName } = pendingDelete
    const cust = customers.find(c => c.id === customerId)
    const prev: Partial<Customer> = {
      scheduleType: cust?.scheduleType, scheduleDays: cust?.scheduleDays, scheduleStartDate: cust?.scheduleStartDate,
      scheduleEveryNDays: cust?.scheduleEveryNDays, scheduleBiweeklyAnchorWeek: cust?.scheduleBiweeklyAnchorWeek,
      scheduleEndDate: cust?.scheduleEndDate, scheduleEndCount: cust?.scheduleEndCount,
    }
    updateCustomer(customerId, {
      scheduleType: 'none', scheduleDays: [], scheduleStartDate: undefined,
      scheduleEveryNDays: undefined, scheduleBiweeklyAnchorWeek: undefined, scheduleEndDate: undefined, scheduleEndCount: undefined,
    })
    setLastAction({ label: `${customerName}: ลบตารางคิวทั้งหมด`, addedOverrideIds: [], deletedOverrides: [], movedSDs: [], customerRestore: { id: customerId, prev } })
    setPendingDelete(null)
  }

  // ── route reorder (day-detail) ──
  const moveStop = (idx: number, dir: -1 | 1) => {
    if (!selectedDay) return
    const j = idx + dir
    if (j < 0 || j >= dayStops.length) return
    const ids = dayStops.map(s => s.row.customer.id)
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]] // swap
    setRouteOrder(selectedDay, ids)
  }
  const reorderDrag = (from: number, to: number) => {
    if (!selectedDay || from === to) return
    const ids = dayStops.map(s => s.row.customer.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(from < to ? to - 1 : to, 0, moved) // insert-before target (adjust for removal)
    setRouteOrder(selectedDay, ids)
  }

  // ── cell click ──
  const goCreate = (customerId: string, date: string) =>
    router.push(`/dashboard/delivery?createFor=${customerId}&date=${date}`)
  const goDetail = (id: string) => router.push(`/dashboard/delivery?detail=${id}`)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A5C] flex items-center gap-2">
            <Truck className="w-6 h-6 text-[#3DD8D8]" />
            ปฏิทินขนส่ง
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            แผนรับ-ส่งผ้ารายสัปดาห์ — ลาก cell ข้ามวันเพื่อเลื่อนคิว · คลิกเพื่อสร้าง/ดูใบส่งของ
          </p>
        </div>
        <Link
          href="/dashboard/reports?tab=scheduleaudit"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-[#1B3A5C] border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ClipboardCheck className="w-4 h-4" />
          ตรวจสอบคิว (Audit)
        </Link>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(addDays(anchor, -7))}
            aria-label="สัปดาห์ก่อนหน้า"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-[#1B3A5C] min-w-[180px] text-center">
            {fmtShort(week.weekStart)} – {fmtShort(week.weekEnd)}
            <span className="text-slate-400 font-normal"> · {parseLocalDate(week.weekStart).getFullYear() + 543}</span>
          </div>
          <button
            type="button"
            onClick={() => setAnchor(addDays(anchor, 7))}
            aria-label="สัปดาห์ถัดไป"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {!isThisWeek && (
            <button
              type="button"
              onClick={() => setAnchor(getWeekStart(today))}
              className="px-3 py-2 text-sm text-[#1B3A5C] border border-[#3DD8D8] rounded-lg hover:bg-[#3DD8D8]/10 transition-colors font-medium"
            >
              สัปดาห์นี้
            </button>
          )}
        </div>

        {/* Summary chips */}
        <div className="flex items-center gap-2 text-xs">
          <SummaryChip icon={CheckCircle2} label="มี SD" value={week.totals.sdsCreated} cls="text-emerald-700 bg-emerald-50 border-emerald-200" />
          {week.totals.upcoming > 0 && (
            <SummaryChip icon={CalendarDays} label="รอสร้าง" value={week.totals.upcoming} cls="text-amber-700 bg-amber-50 border-amber-200" />
          )}
          {week.totals.missing > 0 && (
            <SummaryChip icon={AlertOctagon} label="ขาด" value={week.totals.missing} cls="text-red-700 bg-red-50 border-red-200" />
          )}
          {week.totals.extra > 0 && (
            <SummaryChip icon={Plus} label="เสริม" value={week.totals.extra} cls="text-blue-700 bg-blue-50 border-blue-200" />
          )}
        </div>
      </div>

      {/* Grid */}
      {week.rows.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <CalendarDays className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">ยังไม่มีลูกค้าที่ตั้งค่าตารางคิว</h3>
              <p className="text-sm text-amber-700 mb-3">
                ตั้งค่าตารางส่งผ้า (รายวัน/รายสัปดาห์) ในหน้าลูกค้าก่อน แล้วคิวจะแสดงในปฏิทินนี้
              </p>
              <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-sm text-amber-800 font-medium hover:underline">
                ไปหน้าลูกค้า <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-auto max-h-[calc(100vh-17rem)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-600 min-w-[160px]">
                  ลูกค้า
                </th>
                {week.days.map(d => (
                  <th
                    key={d.date}
                    className={cn(
                      'sticky top-0 z-20 border-b border-slate-200 px-1 py-1.5 text-center font-semibold min-w-[96px]',
                      d.isToday ? 'bg-[#3DD8D8]/15 text-[#1B3A5C]' : 'bg-slate-50 text-slate-600',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDay(d.date)}
                      title="จัดลำดับวิ่ง + พิมพ์ route sheet"
                      className="w-full rounded-md px-1 py-1 hover:bg-white/70 transition-colors group/day"
                    >
                      <div className="text-[13px]">{WEEKDAY_SHORT[d.dayOfWeek]}</div>
                      <div className={cn('text-[11px] font-normal', d.isToday ? 'text-[#1B3A5C]' : 'text-slate-400')}>{fmtShort(d.date)}</div>
                      <ListOrdered className="w-3 h-3 mx-auto mt-0.5 text-slate-300 group-hover/day:text-[#3DD8D8]" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.rows.map(row => (
                <tr key={row.customer.id} className="group">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-b border-r border-slate-100 px-3 py-2 align-top transition-colors">
                    <div className="font-medium text-[#1B3A5C] truncate max-w-[180px]" title={row.customer.name}>
                      {row.customer.shortName || row.customer.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400" title={SCHEDULE_TYPE_CONFIG[row.customer.scheduleType!]?.description}>
                        {SCHEDULE_TYPE_CONFIG[row.customer.scheduleType!]?.label}
                      </span>
                      {row.weekMissing > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                          ขาด {row.weekMissing}
                        </span>
                      )}
                    </div>
                  </td>
                  {row.cells.map(cell => {
                    const key = `${row.customer.id}|${cell.date}`
                    const isDropTarget = draggingRow === row.customer.id && dragOverKey === key
                    return (
                      <td
                        key={cell.date}
                        onDragOver={e => { if (canDropOn(row, cell)) { e.preventDefault(); setDragOverKey(key) } }}
                        onDragLeave={() => setDragOverKey(k => (k === key ? null : k))}
                        onDrop={() => onDrop(row, cell)}
                        className={cn(
                          'border-b border-slate-100 px-1.5 py-1.5 text-center align-middle h-14',
                          cell.isToday && 'bg-[#3DD8D8]/[0.06]',
                          isDropTarget && 'ring-2 ring-inset ring-[#3DD8D8] bg-[#3DD8D8]/10',
                        )}
                      >
                        <CellChip
                          cell={cell}
                          today={today}
                          draggable={isDraggableStatus(cell.status)}
                          onDragStart={() => onDragStart(row, cell)}
                          onDragEnd={onDragEnd}
                          onCreate={() => goCreate(row.customer.id, cell.date)}
                          onView={goDetail}
                          onDelete={cell.baseScheduled && cell.status !== 'skipped' ? () => askDelete(row, cell) : undefined}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-4 text-xs text-slate-500">
        <LegendDot cls="bg-emerald-500" label="มี SD แล้ว" />
        <LegendDot cls="bg-amber-400" label="ควรมี — รอสร้าง" />
        <LegendDot cls="bg-red-500" label="ขาด (เลยกำหนด)" />
        <LegendDot cls="bg-blue-500" label="รอบเสริม" />
        <LegendDot cls="bg-orange-500" label="หลายใบในวันเดียว" />
        <LegendDot cls="bg-purple-400" label="ข้าม / เลื่อน" />
        <span className="text-slate-400 inline-flex items-center gap-1"><Info className="w-3.5 h-3.5" />ลาก cell ที่มีคิว ไปวางวันอื่น = เลื่อนคิว</span>
      </div>

      {/* 371 — Undo banner (เลิกทำ reschedule ล่าสุด) */}
      {lastAction && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1B3A5C] text-white shadow-lg text-sm max-w-[92vw]">
          <CornerDownRight className="w-4 h-4 text-[#3DD8D8] flex-shrink-0" />
          <span className="truncate">เลื่อนคิวแล้ว · {lastAction.label}</span>
          <button type="button" onClick={undoReschedule} className="font-semibold text-[#3DD8D8] hover:underline flex-shrink-0">เลิกทำ</button>
          <button type="button" onClick={() => setLastAction(null)} className="text-white/50 hover:text-white flex-shrink-0" aria-label="ปิด">✕</button>
        </div>
      )}

      {/* 378 — ลบ/ยกเลิกคิว (เลือก scope เหมือน Google Calendar) */}
      <Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="ยกเลิก / ลบคิว" size="md" closeLabel="cancel">
        {pendingDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-[#1B3A5C]">{pendingDelete.customerName}</span>
              {' · คิววันที่ '}
              <span className="font-semibold text-[#1B3A5C]">{fmtFull(pendingDelete.date)}</span>
            </p>
            {pendingDelete.hasSD && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ วันนี้มีใบส่งของ (SD) อยู่แล้ว — &quot;ข้ามคิว&quot; เป็นการบันทึกเชิงข้อมูล ไม่ได้ลบ SD (ลบ SD ทำที่หน้าใบส่งของ)
              </div>
            )}
            <div className="space-y-2">
              <button type="button" onClick={deleteThisOnly}
                className="w-full text-left rounded-lg border border-slate-200 px-4 py-3 hover:border-[#3DD8D8] hover:bg-[#3DD8D8]/5 transition-colors">
                <div className="font-semibold text-sm text-[#1B3A5C] flex items-center gap-2"><Ban className="w-4 h-4 text-amber-500" />เฉพาะกิจกรรมนี้</div>
                <div className="text-xs text-slate-500 mt-0.5">ลูกค้ายกเลิก/ข้ามเฉพาะวันนี้ — คิววันอื่นเหมือนเดิม</div>
              </button>
              <button type="button" onClick={deleteThisAndFollowing}
                className="w-full text-left rounded-lg border border-slate-200 px-4 py-3 hover:border-[#3DD8D8] hover:bg-[#3DD8D8]/5 transition-colors">
                <div className="font-semibold text-sm text-[#1B3A5C] flex items-center gap-2"><CalendarX className="w-4 h-4 text-purple-500" />กิจกรรมนี้และที่ตามมาทั้งหมด</div>
                <div className="text-xs text-slate-500 mt-0.5">สิ้นสุดคิวตั้งแต่วันนี้เป็นต้นไป (= ตั้งวันสิ้นสุด {fmtShort(addDays(pendingDelete.date, -1))})</div>
              </button>
              <button type="button" onClick={() => { if (window.confirm('ลบตารางคิวทั้งหมดของลูกค้านี้? (เปลี่ยนเป็น "ไม่ตั้งคิว")')) deleteAllSchedule() }}
                className="w-full text-left rounded-lg border border-red-200 px-4 py-3 hover:border-red-400 hover:bg-red-50 transition-colors">
                <div className="font-semibold text-sm text-red-700 flex items-center gap-2"><Trash2 className="w-4 h-4" />กิจกรรมทั้งหมด</div>
                <div className="text-xs text-slate-500 mt-0.5">ลบตารางคิวทั้งหมดของลูกค้านี้ (เปลี่ยนเป็น &quot;ไม่ตั้งคิว&quot;)</div>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reschedule confirm modal */}
      <Modal open={!!pending} onClose={() => setPending(null)} title="ยืนยันการเลื่อนคิว" size="md" closeLabel="cancel">
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="text-center">
                <div className="text-[11px] text-slate-400">จาก</div>
                <div className="font-semibold text-[#1B3A5C]">{fmtFull(pending.fromDate)}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#3DD8D8]" />
              <div className="text-center">
                <div className="text-[11px] text-slate-400">ไป</div>
                <div className="font-semibold text-[#1B3A5C]">{fmtFull(pending.toDate)}</div>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
              <span className="font-medium text-[#1B3A5C]">{pending.customerName}</span>
              {pending.mode === 'move-sd' ? (
                <p className="mt-1 flex items-start gap-1.5">
                  <Truck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>
                    ย้ายวันที่ใบส่งของ {pending.regularSDs.length} ใบ
                    ({pending.regularSDs.map(s => s.noteNumber).join(', ')}) ไปวันใหม่
                    <span className="block text-xs text-slate-400 mt-0.5">วันเดิมจะถูกบันทึกเป็น “เลื่อนออก” (ไม่โชว์ว่าขาด)</span>
                  </span>
                </p>
              ) : (
                <p className="mt-1 flex items-start gap-1.5">
                  <CornerUpRight className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                  ยังไม่มีใบส่งของในวันนี้ — จะบันทึกเป็น <b>เลื่อนคิว</b> (ข้ามวันเดิม + เพิ่มวันใหม่) ไว้ในตาราง
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">หมายเหตุ</label>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
                placeholder="เหตุผลการเลื่อนคิว"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmReschedule}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors inline-flex items-center gap-1.5"
              >
                <CornerDownRight className="w-4 h-4" />
                ยืนยันเลื่อนคิว
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Day-detail: route ordering + print */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `แผนวิ่ง ${fmtFull(selectedDay)}` : 'แผนวิ่ง'}
        size="xl"
        className="print-target"
      >
        {selectedDay && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 no-print">
              <p className="text-sm text-slate-500">
                {dayStops.length} จุด — กดลูกศร หรือลากเพื่อจัดลำดับการวิ่ง
              </p>
              {dayStops.length > 0 && (
                <ExportButtons targetId="print-route-sheet" filename={formatExportFilename(`RouteSheet-${selectedDay}`)} orientation="landscape" />
              )}
            </div>

            {dayStops.length === 0 ? (
              <div className="no-print text-center py-10 text-slate-400 text-sm">
                ไม่มีจุดวิ่งในวันนี้ (ไม่มีลูกค้าที่ถึงคิวหรือมี SD)
              </div>
            ) : (
              <div className="space-y-1.5 mb-5 no-print">
                {dayStops.map((s, idx) => (
                  <div
                    key={s.row.customer.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); listDragIdx.current = idx }}
                    onDragOver={e => { e.preventDefault(); setListDragOver(idx) }}
                    onDragLeave={() => setListDragOver(o => (o === idx ? null : o))}
                    onDrop={() => { if (listDragIdx.current != null) reorderDrag(listDragIdx.current, idx); listDragIdx.current = null; setListDragOver(null) }}
                    onDragEnd={() => { listDragIdx.current = null; setListDragOver(null) }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border bg-white',
                      listDragOver === idx ? 'border-t-2 border-t-[#3DD8D8]' : 'border-slate-200',
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-slate-300 cursor-grab flex-shrink-0" />
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1B3A5C] text-white text-xs font-bold flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#1B3A5C] truncate">{s.row.customer.shortName || s.row.customer.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {cellStatusLabel(s.cell, today)}{s.row.customer.contactPhone ? ` · ${s.row.customer.contactPhone}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col flex-shrink-0">
                      <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0} aria-label="เลื่อนขึ้น" className="text-slate-400 hover:text-[#1B3A5C] disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === dayStops.length - 1} aria-label="เลื่อนลง" className="text-slate-400 hover:text-[#1B3A5C] disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-400 mb-2 no-print">ตัวอย่างใบพิมพ์ (Route Sheet)</p>
              <RouteSheetPrint
                dateLabel={`${fmtFull(selectedDay)} ${parseLocalDate(selectedDay).getFullYear() + 543}`}
                company={companyInfo}
                stops={dayStops.map(({ row, cell }): RouteStop => ({
                  customerName: row.customer.shortName || row.customer.name,
                  address: row.customer.address || '',
                  phone: row.customer.contactPhone || '',
                  statusLabel: cellStatusLabel(cell, today),
                }))}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Cell chip ──
function CellChip({
  cell, today, draggable, onDragStart, onDragEnd, onCreate, onView, onDelete,
}: {
  cell: LogisticsCell
  today: string
  draggable: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onCreate: () => void
  onView: (id: string) => void
  onDelete?: () => void          // 378 — ลบ/ยกเลิกคิว (เฉพาะวันคิวจริง)
}) {
  const hasRescheduleSkip = cell.overrides.some(o => o.type === 'reschedule_skip')
  const hasRescheduleAdd = cell.overrides.some(o => o.type === 'reschedule_add')

  // resolve visual
  let label = ''
  let cls = ''
  let Icon: typeof CheckCircle2 | null = null
  let onClick: (() => void) | undefined
  let title = cell.overrideReason

  switch (cell.status) {
    case 'empty':
      return <span className="text-slate-200 select-none">·</span>
    case 'ok':
      label = cell.regularSDs.length > 1 ? `${cell.regularSDs.length} ใบ` : 'SD'
      cls = 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
      Icon = CheckCircle2
      onClick = () => onView(cell.regularSDs[0].id)
      title = cell.regularSDs.map(s => s.noteNumber).join(', ')
      break
    case 'missing': {
      const overdue = cell.date <= today
      label = overdue ? 'ขาด' : 'รอสร้าง'
      cls = overdue
        ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
        : 'text-amber-700 bg-amber-50 border-amber-200 border-dashed hover:bg-amber-100'
      Icon = overdue ? AlertOctagon : Plus
      onClick = onCreate
      break
    }
    case 'extra-only':
      label = 'เสริม'
      cls = 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
      Icon = Plus
      onClick = () => onView(cell.extraSDs[0].id)
      title = cell.extraSDs.map(s => s.noteNumber).join(', ')
      break
    case 'override-extra': {
      const sd = cell.regularSDs[0] || cell.extraSDs[0]
      label = 'เสริม'
      cls = 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
      Icon = Plus
      onClick = sd ? () => onView(sd.id) : undefined
      break
    }
    case 'multiple-regular':
      label = `${cell.regularSDs.length} ใบ`
      cls = 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'
      Icon = AlertTriangle
      onClick = () => onView(cell.regularSDs[0].id)
      title = cell.regularSDs.map(s => s.noteNumber).join(', ')
      break
    case 'off-schedule': {
      const sd = cell.regularSDs[0] || cell.extraSDs[0]
      label = 'นอกคิว'
      cls = 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
      Icon = Truck
      onClick = sd ? () => onView(sd.id) : undefined
      break
    }
    case 'skipped':
      label = hasRescheduleSkip ? 'เลื่อนออก' : 'ข้าม'
      cls = 'text-purple-600 bg-purple-50 border-purple-200'
      Icon = Ban
      break
  }

  return (
    <span className="relative block w-full group/chip">
      <button
        type="button"
        draggable={draggable}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cell.date); onDragStart() }}
        onDragEnd={onDragEnd}
        onClick={onClick}
        disabled={!onClick && !draggable}
        title={title}
        className={cn(
          'relative w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[12px] font-medium transition-colors',
          cls,
          draggable && 'cursor-grab active:cursor-grabbing',
          !onClick && !draggable && 'cursor-default',
        )}
      >
        {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="truncate">{label}</span>
        {hasRescheduleAdd && cell.status !== 'skipped' && (
          <CornerDownRight className="w-3 h-3 text-indigo-500 absolute -top-1 -right-1" aria-label="เลื่อนเข้า" />
        )}
      </button>
      {/* 378 — ปุ่มลบ/ยกเลิกคิว (มุมซ้ายบน · subtle, เด่นตอน hover · แตะได้บน tablet) */}
      {onDelete && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="ยกเลิก / ลบคิว"
          aria-label="ยกเลิก / ลบคิว"
          className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-400 shadow-sm flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-red-50 hover:text-red-600 hover:border-red-300 group-hover/chip:opacity-100 transition-opacity z-10"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

function SummaryChip({ icon: Icon, label, value, cls }: { icon: typeof CheckCircle2; label: string; value: number; cls: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-medium', cls)}>
      <Icon className="w-3.5 h-3.5" />
      {value} {label}
    </span>
  )
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-2.5 h-2.5 rounded-full', cls)} />
      {label}
    </span>
  )
}
