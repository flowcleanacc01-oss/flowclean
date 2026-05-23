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
import { todayISO, genId, cn } from '@/lib/utils'
import { WEEKDAY_SHORT, SCHEDULE_TYPE_CONFIG, type DeliveryNote } from '@/types'
import { canViewSD } from '@/lib/permissions'
import Modal from '@/components/Modal'
import {
  ChevronLeft, ChevronRight, CalendarDays, Truck, Plus, AlertOctagon,
  AlertTriangle, CheckCircle2, ArrowRight, Ban, Info, ClipboardCheck, CornerUpRight, CornerDownRight,
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

interface PendingReschedule {
  customerId: string
  customerName: string
  fromDate: string
  toDate: string
  regularSDs: DeliveryNote[]
  mode: 'move-sd' | 'move-expectation'
}

export default function LogisticsPage() {
  const { currentUser, customers, deliveryNotes, scheduleOverrides, updateDeliveryNote, addScheduleOverride } = useStore()
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

  const week = useMemo(
    () => buildLogisticsWeek(customers, deliveryNotes, scheduleOverrides, anchor, today),
    [customers, deliveryNotes, scheduleOverrides, anchor, today],
  )

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
    })
    setReason(`เลื่อนคิว ${fmtShort(src.date)} → ${fmtShort(cell.date)}`)
  }

  const confirmReschedule = () => {
    if (!pending) return
    if (pending.mode === 'move-sd') {
      // ย้ายวันที่ SD จริง — SD เป็น record ของรอบนั้น
      pending.regularSDs.forEach(sd => updateDeliveryNote(sd.id, { date: pending.toDate }))
    } else {
      // ย้าย "คิวที่คาดไว้" — สร้าง override คู่ skip(จากวัน) + add(ไปวัน)
      const linkId = genId()
      addScheduleOverride({ customerId: pending.customerId, date: pending.fromDate, type: 'reschedule_skip', reason, rescheduledLinkId: linkId })
      addScheduleOverride({ customerId: pending.customerId, date: pending.toDate, type: 'reschedule_add', reason, rescheduledLinkId: linkId })
    }
    setPending(null)
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
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-600 min-w-[160px]">
                  ลูกค้า
                </th>
                {week.days.map(d => (
                  <th
                    key={d.date}
                    className={cn(
                      'border-b border-slate-200 px-2 py-2.5 text-center font-semibold min-w-[96px]',
                      d.isToday ? 'bg-[#3DD8D8]/15 text-[#1B3A5C]' : 'bg-slate-50 text-slate-600',
                    )}
                  >
                    <div className="text-[13px]">{WEEKDAY_SHORT[d.dayOfWeek]}</div>
                    <div className={cn('text-[11px] font-normal', d.isToday ? 'text-[#1B3A5C]' : 'text-slate-400')}>{fmtShort(d.date)}</div>
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
                          row={row}
                          today={today}
                          draggable={isDraggableStatus(cell.status)}
                          onDragStart={() => onDragStart(row, cell)}
                          onDragEnd={onDragEnd}
                          onCreate={() => goCreate(row.customer.id, cell.date)}
                          onView={goDetail}
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
                  ย้ายวันที่ของใบส่งของ {pending.regularSDs.length} ใบ
                  ({pending.regularSDs.map(s => s.noteNumber).join(', ')})
                  ไปเป็นวันใหม่
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
    </div>
  )
}

// ── Cell chip ──
function CellChip({
  cell, row, today, draggable, onDragStart, onDragEnd, onCreate, onView,
}: {
  cell: LogisticsCell
  row: LogisticsRow
  today: string
  draggable: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onCreate: () => void
  onView: (id: string) => void
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
