'use client'

/**
 * 311 P2.4 — Schedule Override List + Add/Edit/Delete UI
 *
 * แสดงใน customer detail page (ใต้ schedule setup card)
 * - List overrides ทั้งหมดของลูกค้านี้
 * - Add override modal (skip/extra/reschedule)
 * - Edit/Delete (reschedule pair → ลบทั้งคู่)
 */
import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatDate, cn, todayISO } from '@/lib/utils'
import { genId } from '@/lib/utils'
import Modal from '@/components/Modal'
import {
  SCHEDULE_OVERRIDE_TYPE_CONFIG,
  type ScheduleOverride, type ScheduleOverrideType,
} from '@/types'
import { Plus, CalendarOff, CalendarPlus, ArrowRightLeft, Trash2, Pencil } from 'lucide-react'

interface Props {
  customerId: string
}

const TYPE_ICONS: Record<ScheduleOverrideType, React.ReactNode> = {
  skip: <CalendarOff className="w-3.5 h-3.5" />,
  extra: <CalendarPlus className="w-3.5 h-3.5" />,
  reschedule_skip: <ArrowRightLeft className="w-3.5 h-3.5" />,
  reschedule_add: <ArrowRightLeft className="w-3.5 h-3.5" />,
}

const TYPE_COLOR_CLS: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}

export default function ScheduleOverrideList({ customerId }: Props) {
  const { scheduleOverrides, addScheduleOverride, updateScheduleOverride, deleteScheduleOverride } = useStore()

  const overrides = useMemo(
    () => scheduleOverrides
      .filter(o => o.customerId === customerId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [scheduleOverrides, customerId],
  )

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="rounded-xl border bg-white border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-slate-800">
          <ArrowRightLeft className="w-4 h-4" />
          Override (skip / extra / reschedule)
        </h3>
        <button
          type="button"
          onClick={() => { setEditingId(null); setShowAddModal(true) }}
          className="inline-flex items-center gap-1 text-xs text-[#1B3A5C] hover:underline font-medium"
        >
          <Plus className="w-3 h-3" /> เพิ่ม override
        </button>
      </div>

      {overrides.length === 0 ? (
        <p className="text-sm text-slate-500">
          ยังไม่มี override — ใช้เมื่อ ลูกค้าขอข้ามคิว / เพิ่มรอบเสริม / เลื่อนคิว
        </p>
      ) : (
        <div className="space-y-1.5">
          {overrides.map(o => {
            const cfg = SCHEDULE_OVERRIDE_TYPE_CONFIG[o.type]
            // Find pair (สำหรับ reschedule)
            const pair = o.rescheduledLinkId
              ? scheduleOverrides.find(p => p.rescheduledLinkId === o.rescheduledLinkId && p.id !== o.id)
              : null
            return (
              <div key={o.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/30 hover:bg-slate-50">
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border', TYPE_COLOR_CLS[cfg.color])}>
                  {TYPE_ICONS[o.type]} {cfg.short}
                </span>
                <span className="font-mono text-xs text-slate-700">{formatDate(o.date)}</span>
                <span className="text-xs text-slate-600 flex-1 truncate" title={o.reason}>{o.reason}</span>
                {pair && (
                  <span className="text-[10px] text-slate-400 italic">↔ {formatDate(pair.date)}</span>
                )}
                <button
                  type="button"
                  onClick={() => { setEditingId(o.id); setShowAddModal(true) }}
                  className="p-1 text-slate-400 hover:text-blue-600"
                  title="แก้ไข"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`ลบ override วันที่ ${formatDate(o.date)}?\n${o.reason}\n${pair ? '⚠ จะลบทั้งคู่ (reschedule pair)' : ''}`)) return
                    deleteScheduleOverride(o.id)
                    if (pair) deleteScheduleOverride(pair.id)
                  }}
                  className="p-1 text-slate-400 hover:text-red-600"
                  title="ลบ"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <OverrideFormModal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingId(null) }}
        customerId={customerId}
        editingOverride={editingId ? overrides.find(o => o.id === editingId) ?? null : null}
        onAdd={addScheduleOverride}
        onUpdate={updateScheduleOverride}
      />
    </div>
  )
}

interface FormProps {
  open: boolean
  onClose: () => void
  customerId: string
  editingOverride: ScheduleOverride | null
  onAdd: ReturnType<typeof useStore>['addScheduleOverride']
  onUpdate: ReturnType<typeof useStore>['updateScheduleOverride']
}

function OverrideFormModal({ open, onClose, customerId, editingOverride, onAdd, onUpdate }: FormProps) {
  const [type, setType] = useState<ScheduleOverrideType>(editingOverride?.type || 'skip')
  const [date, setDate] = useState<string>(editingOverride?.date || todayISO())
  const [reason, setReason] = useState<string>(editingOverride?.reason || '')
  // Reschedule: paired date (skip from → add to)
  const [pairedDate, setPairedDate] = useState<string>('')

  // reset when modal opens
  useMemo(() => {
    if (open) {
      setType(editingOverride?.type || 'skip')
      setDate(editingOverride?.date || todayISO())
      setReason(editingOverride?.reason || '')
      setPairedDate('')
    }
  }, [open, editingOverride])

  const isReschedule = type === 'reschedule_skip' || type === 'reschedule_add'
  const isEdit = !!editingOverride

  const canSave = !!date && !!reason.trim() && (!isReschedule || isEdit || !!pairedDate)

  const handleSave = () => {
    if (!canSave) return
    if (isEdit && editingOverride) {
      // Edit only single record (ไม่แก้ pair)
      onUpdate(editingOverride.id, { type, date, reason })
    } else if (isReschedule) {
      // Create pair: skip on `date` + add on `pairedDate` linked
      const linkId = genId()
      onAdd({
        customerId, date, type: 'reschedule_skip', reason, rescheduledLinkId: linkId,
      })
      onAdd({
        customerId, date: pairedDate, type: 'reschedule_add', reason, rescheduledLinkId: linkId,
      })
    } else {
      onAdd({ customerId, date, type, reason })
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'แก้ไข Override' : 'เพิ่ม Schedule Override'} size="md">
      <div className="space-y-4">
        {/* Type picker */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">ประเภท</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'skip', label: '🚫 Skip', desc: 'ลูกค้าขอข้าม' },
              { value: 'extra', label: '➕ Extra', desc: 'เพิ่มรอบเสริม' },
              { value: 'reschedule_skip', label: '↔ Reschedule', desc: 'เลื่อนคิว (skip + add)' },
            ] as Array<{ value: ScheduleOverrideType; label: string; desc: string }>).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                disabled={isEdit && opt.value === 'reschedule_skip'}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  type === opt.value || (opt.value === 'reschedule_skip' && type === 'reschedule_add')
                    ? 'border-[#3DD8D8] bg-[#3DD8D8]/10 text-[#1B3A5C]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                  isEdit && opt.value === 'reschedule_skip' && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            {isReschedule ? 'วันที่ skip (เลื่อนออก)' : 'วันที่'}
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30"
          />
        </div>

        {/* Paired date (reschedule only) */}
        {isReschedule && !isEdit && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ใหม่ (เลื่อนไป)</label>
            <input
              type="date"
              value={pairedDate}
              onChange={e => setPairedDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30"
            />
            <p className="text-xs text-slate-500 mt-1">
              สร้าง 2 records ผูกกัน — แสดงใน audit เป็นคู่
            </p>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            เหตุผล <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="เช่น ผ้าน้อยไม่ถึง min/trip, ลูกค้าขอเลื่อนเป็นพรุ่งนี้"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-2 focus:ring-[#3DD8D8]/30 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-lg',
              canSave
                ? 'bg-[#1B3A5C] text-white hover:bg-[#122740]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed',
            )}
          >
            {isEdit ? 'บันทึก' : 'เพิ่ม'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
