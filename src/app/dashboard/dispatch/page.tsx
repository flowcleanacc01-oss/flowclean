'use client'

// 423 Phase B2 — Dispatch Board (กระดานจ่ายงานรายวัน)
//   เลือกวัน → สร้างใบงานจาก membership+schedule → การ์ดต่อรอบ (รถ/คนขับ/เด็กรถ + จุดลูกค้า)
//   - override รถ/คน รายวัน (standby = backup pool) · เรียงลำดับจุด · bag count (load)
//   - เพิ่มจุด: ยืมรอบ (moved-in) / แทรก (inserted) · สถานะรอบ planned/running/done

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { canManageDispatch } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import { toLocalISO, parseLocalDate, addDays } from '@/lib/logistics-week'
import { buildTripStops, generateDailyTrips, tripLoad, resequence, type GenerateMode } from '@/lib/dispatch'
import {
  dailyTripId,
  TRIP_STATUS_CONFIG, TRIP_STOP_SOURCE_CONFIG, TRIP_STOP_STATUS_CONFIG,
} from '@/types'
import type { DailyTrip, TripStop, TripStatus, TripStopStatus, Round, Crew } from '@/types'
import Modal from '@/components/Modal'
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CalendarDays,
  ClipboardCheck, Truck, Clock, Plus, Trash2, X, RotateCcw, Package, Search,
} from 'lucide-react'

const selCls = 'px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#3DD8D8] bg-white'

const STATUS_NEXT: Record<TripStopStatus, TripStopStatus> = { pending: 'done', done: 'skipped', skipped: 'pending' }

function todayLocal(): string {
  return toLocalISO(new Date())
}

export default function DispatchPage() {
  const { currentUser, rounds, customers, vehicles, crew, dailyTrips, scheduleOverrides, addDailyTrips, updateDailyTrip, deleteDailyTrip } = useStore()
  const [date, setDate] = useState<string>(todayLocal())
  const [mode, setMode] = useState<GenerateMode>('schedule')
  const [showGenerate, setShowGenerate] = useState(false)
  const [addStopTrip, setAddStopTrip] = useState<DailyTrip | null>(null)

  const activeRounds = useMemo(() => [...rounds].filter(r => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [rounds])
  const tripsForDate = useMemo(() => dailyTrips.filter(t => t.date === date), [dailyTrips, date])
  const tripByRound = useMemo(() => {
    const m = new Map<string, DailyTrip>()
    for (const t of tripsForDate) m.set(t.roundId, t)
    return m
  }, [tripsForDate])

  const roundsWithoutTrip = activeRounds.filter(r => !tripByRound.has(r.id))
  const totalLoad = tripsForDate.reduce((s, t) => s + tripLoad(t), 0)
  const totalStops = tripsForDate.reduce((s, t) => s + t.stops.length, 0)

  // generate ทุกรอบที่ยังไม่มีใบงานวันนี้
  const runGenerate = () => {
    const existing = new Set(dailyTrips.filter(t => t.date === date).map(t => t.id))
    const { created } = generateDailyTrips(rounds, customers, date, scheduleOverrides, existing, mode, currentUser?.id || 'unknown')
    if (created.length > 0) addDailyTrips(created.map(c => c.trip))
    setShowGenerate(false)
  }

  // สร้างใบงานรอบเดียว (ghost card)
  const generateOne = (round: Round) => {
    const id = dailyTripId(date, round.id)
    if (dailyTrips.some(t => t.id === id)) return
    const stops = buildTripStops(round, customers, date, scheduleOverrides, mode)
    addDailyTrips([{
      id, date, roundId: round.id,
      vehicleId: round.defaultVehicleId || '', driverId: round.defaultDriverId || '', helperId: round.defaultHelperId || '',
      status: 'planned', note: '', stops, createdBy: currentUser?.id || 'unknown', createdAt: new Date().toISOString(),
    }])
  }

  // preview สำหรับ generate modal
  const generatePreview = useMemo(() => {
    const existing = new Set(dailyTrips.filter(t => t.date === date).map(t => t.id))
    let willCreate = 0, willSkip = 0
    for (const r of activeRounds) {
      if (existing.has(dailyTripId(date, r.id))) willSkip++
      else willCreate++
    }
    return { willCreate, willSkip }
  }, [activeRounds, dailyTrips, date])

  if (!canManageDispatch(currentUser)) {
    return <div className="text-center py-20"><p className="text-slate-400">เฉพาะ Staff / บัญชี / Admin เท่านั้น</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-[#1B3A5C]" /> จ่ายงานรายวัน
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">กระดานจ่ายงาน — รอบ × รถ × คนขับ + จุดลูกค้าในแต่ละวัน</p>
        </div>
        <button onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors">
          <Plus className="w-4 h-4" /> สร้างใบงาน
        </button>
      </div>

      {/* date nav */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-200 p-3">
        <button onClick={() => setDate(addDays(date, -1))} aria-label="วันก่อนหน้า" className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronLeft className="w-5 h-5" /></button>
        <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
          <CalendarDays className="w-4 h-4 text-[#1B3A5C]" />
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none" />
        </div>
        <button onClick={() => setDate(addDays(date, 1))} aria-label="วันถัดไป" className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronRight className="w-5 h-5" /></button>
        <button onClick={() => setDate(todayLocal())} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">วันนี้</button>
        <span className="text-sm text-slate-500 ml-1">{formatDate(date)} · {parseLocalDate(date).toLocaleDateString('th-TH', { weekday: 'long' })}</span>
        {tripsForDate.length > 0 && (
          <span className="ml-auto text-xs text-slate-500 inline-flex items-center gap-3">
            <span>{tripsForDate.length} รอบ</span>
            <span>{totalStops} จุด</span>
            <span className="inline-flex items-center gap-1 font-semibold text-[#1B3A5C]"><Package className="w-3.5 h-3.5" />{totalLoad} ถุง</span>
          </span>
        )}
      </div>

      {activeRounds.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ยังไม่มีรอบเดินรถที่เปิดใช้งาน — ไปตั้งค่าที่หน้า “รอบเดินรถ” ก่อน</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {activeRounds.map(round => {
            const trip = tripByRound.get(round.id)
            if (trip) {
              return <DispatchCard key={round.id} round={round} trip={trip}
                vehicles={vehicles} crew={crew} customers={customers}
                onUpdate={updateDailyTrip} onDelete={deleteDailyTrip} onRegenerate={generateOne}
                onAddStop={() => setAddStopTrip(trip)} mode={mode} />
            }
            return (
              <div key={round.id} className="bg-white rounded-xl border border-dashed border-slate-300 p-5 flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg text-sm font-bold text-white shrink-0" style={{ backgroundColor: round.color }}>{round.code}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-700 truncate">{round.name}</p>
                  <p className="text-xs text-slate-400">ยังไม่สร้างใบงานวันนี้</p>
                </div>
                <button onClick={() => generateOne(round)} className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors inline-flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> สร้างใบงาน
                </button>
              </div>
            )
          })}
        </div>
      )}

      {roundsWithoutTrip.length > 0 && tripsForDate.length > 0 && (
        <p className="text-xs text-slate-400 text-center">มี {roundsWithoutTrip.length} รอบที่ยังไม่ได้สร้างใบงานวันนี้</p>
      )}

      {showGenerate && (
        <Modal open onClose={() => setShowGenerate(false)} title={`สร้างใบงาน · ${formatDate(date)}`} size="md" closeLabel="cancel">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">เลือกลูกค้าที่จะใส่ในใบงาน</p>
              <div className="space-y-2">
                <label className={cn('flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer', mode === 'schedule' ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-slate-200')}>
                  <input type="radio" name="genmode" checked={mode === 'schedule'} onChange={() => setMode('schedule')} className="mt-0.5 accent-[#1B3A5C]" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">เฉพาะลูกค้าที่ถึงคิววันนั้น <span className="text-xs font-normal text-slate-400">(แนะนำ)</span></p>
                    <p className="text-xs text-slate-500">ตามตารางคิวลูกค้า (เหมือนปฏิทินขนส่ง) — ไม่ใส่ลูกค้าที่ไม่ถึงรอบ</p>
                  </div>
                </label>
                <label className={cn('flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer', mode === 'all' ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-slate-200')}>
                  <input type="radio" name="genmode" checked={mode === 'all'} onChange={() => setMode('all')} className="mt-0.5 accent-[#1B3A5C]" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">ทุกลูกค้าในรอบ</p>
                    <p className="text-xs text-slate-500">ใส่สมาชิกรอบทั้งหมด — เผื่อรอบที่ยังไม่ได้ตั้งคิว (ตัดจุดที่ไม่ต้องออกได้ภายหลัง)</p>
                  </div>
                </label>
              </div>
            </div>
            <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              จะสร้างใบงาน <b className="text-[#1B3A5C]">{generatePreview.willCreate}</b> รอบ
              {generatePreview.willSkip > 0 && <span className="text-slate-400"> · ข้าม {generatePreview.willSkip} รอบ (มีใบงานแล้ว — ไม่ทับ)</span>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowGenerate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={runGenerate} disabled={generatePreview.willCreate === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] disabled:opacity-40 transition-colors">สร้าง</button>
            </div>
          </div>
        </Modal>
      )}

      {addStopTrip && (
        <AddStopModal trip={addStopTrip} round={activeRounds.find(r => r.id === addStopTrip.roundId)}
          customers={customers} rounds={rounds} onClose={() => setAddStopTrip(null)} onUpdate={updateDailyTrip} />
      )}
    </div>
  )
}

// ============================================================
// Dispatch card (1 รอบ)
// ============================================================
function DispatchCard({
  round, trip, vehicles, crew, customers, onUpdate, onDelete, onRegenerate, onAddStop, mode,
}: {
  round: Round
  trip: DailyTrip
  vehicles: ReturnType<typeof useStore>['vehicles']
  crew: Crew[]
  customers: ReturnType<typeof useStore>['customers']
  onUpdate: (id: string, updates: Partial<DailyTrip>) => void
  onDelete: (id: string) => void
  onRegenerate: (round: Round) => void
  onAddStop: () => void
  mode: GenerateMode
}) {
  const activeVehicles = useMemo(() => [...vehicles].filter(v => v.isActive).sort((a, b) => a.code.localeCompare(b.code, 'th')), [vehicles])
  const drivers = useMemo(() => crew.filter(c => c.role === 'driver'), [crew])
  const helpers = useMemo(() => crew.filter(c => c.role === 'helper'), [crew])
  const custById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers])

  const setStops = (next: TripStop[]) => onUpdate(trip.id, { stops: resequence(next) })

  const moveStop = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= trip.stops.length) return
    const next = [...trip.stops]
    const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp
    setStops(next)
  }
  const removeStop = (idx: number) => setStops(trip.stops.filter((_, i) => i !== idx))
  const editStop = (idx: number, patch: Partial<TripStop>) =>
    onUpdate(trip.id, { stops: trip.stops.map((s, i) => i === idx ? { ...s, ...patch } : s) })

  const load = tripLoad(trip)
  const st = TRIP_STATUS_CONFIG[trip.status]

  // crew option label + standby/leave marker (backup pool)
  const crewOpt = (c: Crew) => `${c.name}${c.status === 'standby' ? ' ⚠️สำรอง' : c.status === 'leave' ? ' (ลา)' : ''}`
  const driverObj = drivers.find(c => c.id === trip.driverId)
  const driverOnLeave = driverObj?.status === 'leave'

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-100" style={{ borderLeft: `4px solid ${round.color}` }}>
        <span className="px-2.5 py-1 rounded-lg text-sm font-bold text-white shrink-0" style={{ backgroundColor: round.color }}>{round.code}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{round.name}</p>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock className="w-3 h-3" />{round.startTime || '—'}–{round.endTime || '—'}</span>
        </div>
        <select value={trip.status} onChange={e => onUpdate(trip.id, { status: e.target.value as TripStatus })}
          className={cn('text-xs font-medium px-2 py-1 rounded-full border focus:outline-none cursor-pointer', st.badge)}>
          {(Object.keys(TRIP_STATUS_CONFIG) as TripStatus[]).map(s => <option key={s} value={s}>{TRIP_STATUS_CONFIG[s].label}</option>)}
        </select>
        <button onClick={() => { if (confirm(`โหลดจุดใหม่จากคิวรอบ ${round.code}? จะแทนรายการจุดปัจจุบัน (ยอดถุง/สถานะที่กรอกไว้จะหาย)`)) { onDelete(trip.id); onRegenerate(round) } }}
          aria-label="โหลดจุดใหม่" title="โหลดจุดใหม่จากคิว" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#1B3A5C]"><RotateCcw className="w-4 h-4" /></button>
        <button onClick={() => { if (confirm(`ลบใบงานรอบ ${round.code} ของวันนี้?`)) onDelete(trip.id) }}
          aria-label="ลบใบงาน" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
      </div>

      {/* crew assignment */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/60 border-b border-slate-100">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-500 inline-flex items-center gap-1"><Truck className="w-3 h-3" />รถ</span>
          <select value={trip.vehicleId} onChange={e => onUpdate(trip.id, { vehicleId: e.target.value })} className={selCls}>
            <option value="">— ไม่ระบุ —</option>
            {activeVehicles.map(v => <option key={v.id} value={v.id}>คัน {v.code}{v.id === round.defaultVehicleId ? ' (ประจำ)' : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-500">คนขับ</span>
          <select value={trip.driverId} onChange={e => onUpdate(trip.id, { driverId: e.target.value })}
            className={cn(selCls, driverOnLeave && 'ring-2 ring-rose-300')}>
            <option value="">— ไม่ระบุ —</option>
            {drivers.map(c => <option key={c.id} value={c.id}>{crewOpt(c)}{c.id === round.defaultDriverId ? ' ·ประจำ' : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-500">เด็กรถ</span>
          <select value={trip.helperId} onChange={e => onUpdate(trip.id, { helperId: e.target.value })} className={selCls}>
            <option value="">— ไม่ระบุ —</option>
            {helpers.map(c => <option key={c.id} value={c.id}>{crewOpt(c)}{c.id === round.defaultHelperId ? ' ·ประจำ' : ''}</option>)}
          </select>
        </label>
      </div>
      {driverOnLeave && <p className="px-3 py-1.5 text-xs text-rose-600 bg-rose-50">⚠️ คนขับที่เลือกลา/หยุด — เลือกคนสำรองแทน</p>}

      {/* stops */}
      <div className="p-3">
        {trip.stops.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">ไม่มีจุดในรอบนี้{mode === 'schedule' ? ' (ไม่มีลูกค้าถึงคิววันนี้)' : ''} — กด “เพิ่มจุด”</p>
        ) : (
          <ul className="space-y-0.5">
            {trip.stops.map((s, i) => {
              const c = custById.get(s.customerId)
              const srcCfg = TRIP_STOP_SOURCE_CONFIG[s.source]
              const stCfg = TRIP_STOP_STATUS_CONFIG[s.status]
              return (
                <li key={s.customerId + i} className={cn('flex items-center gap-2 py-1.5 px-1.5 rounded-lg hover:bg-slate-50 text-sm', s.status === 'skipped' && 'opacity-50')}>
                  <span className="w-5 text-center text-xs font-semibold text-slate-400">{s.sequence}</span>
                  <div className="flex flex-col -my-0.5">
                    <button onClick={() => moveStop(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-[#1B3A5C] disabled:opacity-30 leading-none"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveStop(i, 1)} disabled={i === trip.stops.length - 1} className="text-slate-300 hover:text-[#1B3A5C] disabled:opacity-30 leading-none"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="font-medium text-slate-700 w-24 truncate" title={c?.name}>{c?.shortName || c?.name || '(ลบแล้ว)'}</span>
                  {s.source !== 'regular' && <span className={cn('text-[9px] px-1 py-0.5 rounded border shrink-0', srcCfg.badge)}>{srcCfg.label}</span>}
                  {(s.timeWindowStart || s.timeWindowEnd) && (
                    <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5 shrink-0"><Clock className="w-2.5 h-2.5" />{s.timeWindowStart || '—'}-{s.timeWindowEnd || '—'}</span>
                  )}
                  <div className="flex-1" />
                  <div className="inline-flex items-center gap-1">
                    <input type="number" inputMode="numeric" min={0} value={s.bagCount || ''} placeholder="0"
                      onChange={e => editStop(i, { bagCount: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-14 px-1.5 py-1 border border-slate-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                    <span className="text-[10px] text-slate-400">ถุง</span>
                  </div>
                  <button onClick={() => editStop(i, { status: STATUS_NEXT[s.status] })} title={`สถานะ: ${stCfg.label} (กดเพื่อเปลี่ยน)`}
                    className={cn('w-6 h-6 flex items-center justify-center rounded-full border text-xs font-bold shrink-0', stCfg.badge)}>{stCfg.dot}</button>
                  <button onClick={() => removeStop(i)} aria-label="เอาจุดออก" className="text-slate-300 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
          <button onClick={onAddStop} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            <Plus className="w-4 h-4" /> เพิ่มจุด
          </button>
          <span className="text-xs text-slate-500 inline-flex items-center gap-3">
            <span>{trip.stops.length} จุด</span>
            <span className="inline-flex items-center gap-1 font-semibold text-[#1B3A5C]"><Package className="w-3.5 h-3.5" />{load} ถุง</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Add stop modal (ยืมรอบ / แทรกจุด)
// ============================================================
function AddStopModal({
  trip, round, customers, rounds, onClose, onUpdate,
}: {
  trip: DailyTrip
  round?: Round
  customers: ReturnType<typeof useStore>['customers']
  rounds: Round[]
  onClose: () => void
  onUpdate: (id: string, updates: Partial<DailyTrip>) => void
}) {
  const [search, setSearch] = useState('')
  const inTrip = useMemo(() => new Set(trip.stops.map(s => s.customerId)), [trip.stops])
  const roundCode = (id: string) => rounds.find(r => r.id === id)?.code

  const candidates = useMemo(() => {
    return customers
      .filter(c => c.isActive && !inTrip.has(c.id))
      .filter(c => !search || matchesThaiQueryAnyField([c.shortName, c.name, c.customerCode], search))
      .sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name, 'th'))
      .slice(0, 60)
  }, [customers, inTrip, search])

  const add = (custId: string) => {
    const c = customers.find(x => x.id === custId)
    if (!c) return
    // ลูกค้ามีรอบอื่น = ยืมรอบ (moved-in) · ไม่มีรอบ/รอบนี้เอง = แทรก (inserted)
    const source: TripStop['source'] = (c.roundId && c.roundId !== trip.roundId) ? 'moved-in' : 'inserted'
    const newStop: TripStop = {
      customerId: custId, sequence: trip.stops.length + 1, source,
      bagCount: 0, status: 'pending', note: '',
      timeWindowStart: c.pickupWindowStart || '', timeWindowEnd: c.pickupWindowEnd || '',
    }
    onUpdate(trip.id, { stops: resequence([...trip.stops, newStop]) })
  }

  return (
    <Modal open onClose={onClose} title={`เพิ่มจุดเข้ารอบ ${round?.code || ''}`} size="md" closeLabel="close">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า..." autoFocus
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <ul className="divide-y divide-slate-100 max-h-80 overflow-auto">
          {candidates.length === 0 ? (
            <li className="text-center text-sm text-slate-400 py-6">ไม่พบลูกค้า</li>
          ) : candidates.map(c => {
            const otherRound = c.roundId && c.roundId !== trip.roundId
            return (
              <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="font-medium text-slate-700 w-24 truncate">{c.shortName || c.name}</span>
                <span className="flex-1 text-xs text-slate-400 truncate">{c.name}</span>
                {otherRound && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">รอบ {roundCode(c.roundId!) || '?'}</span>}
                <button onClick={() => add(c.id)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors">
                  {otherRound ? 'ยืมมา' : 'เพิ่ม'}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-slate-400">ลูกค้าที่อยู่รอบอื่น = “ยืมรอบ” เฉพาะวันนี้ (ไม่กระทบรอบประจำ)</p>
      </div>
    </Modal>
  )
}
