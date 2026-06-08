'use client'

// 423 Phase B1 — Rounds + Crew (รอบเดินรถ + คนขับ/เด็กติดรถ)
//   Tab "รอบ": จัดการรอบ + assign default รถ/คน + ผูกลูกค้าเข้ารอบ + จัดลำดับวิ่ง + หน้าต่างเวลา
//   Tab "คนขับ/เด็กรถ": roster + สถานะสำรอง

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { canManageRounds } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { Round, Crew, CrewRole, CrewStatus } from '@/types'
import { CREW_ROLE_LABELS, CREW_STATUS_CONFIG } from '@/types'
import Modal from '@/components/Modal'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, Clock, Truck,
  UserPlus, Search, Route as RouteIcon, Users, X,
} from 'lucide-react'

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]'
const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

export default function RoundsPage() {
  const { currentUser } = useStore()
  const [tab, setTab] = useState<'rounds' | 'crew'>('rounds')

  if (!canManageRounds(currentUser)) {
    return <div className="text-center py-20"><p className="text-slate-400">เฉพาะ Staff / บัญชี / Admin เท่านั้น</p></div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <RouteIcon className="w-6 h-6 text-[#1B3A5C]" /> รอบเดินรถ
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">จัดรอบ · ผูกลูกค้า + ลำดับวิ่ง · คนขับ/เด็กรถ</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([['rounds', 'รอบ'], ['crew', 'คนขับ/เด็กรถ']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === k ? 'border-[#3DD8D8] text-[#1B3A5C]' : 'border-transparent text-slate-400 hover:text-slate-600')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'rounds' ? <RoundsTab /> : <CrewTab />}
    </div>
  )
}

// ============================================================
// Tab: รอบ (accordion + ลูกค้าในรอบ)
// ============================================================
function RoundsTab() {
  const { rounds, customers, vehicles, crew, deleteRound, updateCustomer } = useStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Round | null>(null)
  const [assignRound, setAssignRound] = useState<Round | null>(null)

  const sortedRounds = useMemo(() => [...rounds].sort((a, b) => a.sortOrder - b.sortOrder), [rounds])

  const membersOf = (roundId: string) =>
    customers
      .filter(c => c.roundId === roundId && c.isActive)
      .sort((a, b) => (a.routeSequence || 0) - (b.routeSequence || 0) || a.shortName.localeCompare(b.shortName, 'th'))

  const vehicleLabel = (id: string) => {
    const v = vehicles.find(x => x.id === id)
    return v ? `คัน ${v.code}` : null
  }
  const crewLabel = (id: string) => crew.find(x => x.id === id)?.name || null

  // จัดลำดับ: reassign routeSequence = ตำแหน่งใหม่ (1-based) เฉพาะตัวที่เปลี่ยน
  const move = (roundId: string, idx: number, dir: -1 | 1) => {
    const list = [...membersOf(roundId)]
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    const tmp = list[idx]; list[idx] = list[j]; list[j] = tmp
    list.forEach((c, i) => {
      if ((c.routeSequence || 0) !== i + 1) updateCustomer(c.id, { routeSequence: i + 1 })
    })
  }

  const removeFromRound = (custId: string) => updateCustomer(custId, { roundId: '', routeSequence: 0 })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors">
          <Plus className="w-4 h-4" /> เพิ่มรอบ
        </button>
      </div>

      {sortedRounds.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <RouteIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ยังไม่มีรอบ — กด “เพิ่มรอบ”</p>
        </div>
      ) : sortedRounds.map(r => {
        const members = membersOf(r.id)
        const expanded = expandedId === r.id
        return (
          <div key={r.id} className={cn('bg-white rounded-xl border overflow-hidden', r.isActive ? 'border-slate-200' : 'border-slate-200 opacity-70')}>
            {/* header */}
            <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50/50" onClick={() => setExpandedId(expanded ? null : r.id)}>
              <span className="px-2.5 py-1 rounded-lg text-sm font-bold text-white shrink-0" style={{ backgroundColor: r.color }}>{r.code}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{r.name}{!r.isActive && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-normal">พัก</span>}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{r.startTime || '—'}–{r.endTime || '—'}</span>
                  {vehicleLabel(r.defaultVehicleId) && <span className="inline-flex items-center gap-1"><Truck className="w-3 h-3" />{vehicleLabel(r.defaultVehicleId)}</span>}
                  {crewLabel(r.defaultDriverId) && <span>👤 {crewLabel(r.defaultDriverId)}</span>}
                  <span className="text-slate-400">· {members.length} ลูกค้า</span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditing(r); setShowForm(true) }} aria-label="แก้ไข" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#1B3A5C]"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => { if (confirm(`ลบรอบ ${r.code}? ลูกค้าในรอบจะถูกปลดออกจากรอบ (ไม่ถูกลบ)`)) { members.forEach(m => removeFromRound(m.id)); deleteRound(r.id) } }} aria-label="ลบ" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                {expanded ? <ChevronUp className="w-5 h-5 text-slate-400 self-center" /> : <ChevronDown className="w-5 h-5 text-slate-400 self-center" />}
              </div>
            </div>

            {/* expanded: ลูกค้าในรอบ */}
            {expanded && (
              <div className="border-t border-slate-100 p-4 space-y-2">
                {members.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-3">ยังไม่มีลูกค้าในรอบนี้</p>
                ) : (
                  <ul className="space-y-1">
                    {members.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 text-sm">
                        <span className="w-6 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
                        <div className="flex flex-col">
                          <button onClick={() => move(r.id, i, -1)} disabled={i === 0} className="text-slate-300 hover:text-[#1B3A5C] disabled:opacity-30 leading-none"><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => move(r.id, i, 1)} disabled={i === members.length - 1} className="text-slate-300 hover:text-[#1B3A5C] disabled:opacity-30 leading-none"><ChevronDown className="w-3.5 h-3.5" /></button>
                        </div>
                        <span className="font-medium text-slate-700 w-28 truncate" title={c.name}>{c.shortName}</span>
                        <span className="flex-1 text-xs text-slate-400 truncate hidden sm:block">{c.name}</span>
                        {/* time window */}
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="w-3 h-3 text-slate-300" />
                          <input type="time" value={c.pickupWindowStart || ''} onChange={e => updateCustomer(c.id, { pickupWindowStart: e.target.value })} className="w-24 px-1.5 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                          <span className="text-slate-300">-</span>
                          <input type="time" value={c.pickupWindowEnd || ''} onChange={e => updateCustomer(c.id, { pickupWindowEnd: e.target.value })} className="w-24 px-1.5 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#3DD8D8]" />
                        </div>
                        <button onClick={() => removeFromRound(c.id)} aria-label="เอาออกจากรอบ" className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <button onClick={() => setAssignRound(r)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                  <UserPlus className="w-4 h-4" /> เพิ่มลูกค้าเข้ารอบ
                </button>
              </div>
            )}
          </div>
        )
      })}

      {showForm && <RoundFormModal round={editing} onClose={() => setShowForm(false)} />}
      {assignRound && <AssignCustomerModal round={assignRound} onClose={() => setAssignRound(null)} />}
    </div>
  )
}

// ============================================================
// Round form modal
// ============================================================
const BLANK_ROUND: Omit<Round, 'id' | 'createdAt'> = {
  code: '', name: '', startTime: '', endTime: '',
  defaultVehicleId: '', defaultDriverId: '', defaultHelperId: '',
  color: '#0ea5e9', sortOrder: 0, isActive: true, note: '',
}

function RoundFormModal({ round, onClose }: { round: Round | null; onClose: () => void }) {
  const { rounds, vehicles, crew, addRound, updateRound } = useStore()
  const [form, setForm] = useState<Omit<Round, 'id' | 'createdAt'>>(() => {
    if (!round) return { ...BLANK_ROUND, sortOrder: rounds.length + 1 }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, ...rest } = round
    return rest
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const drivers = crew.filter(c => c.role === 'driver')
  const helpers = crew.filter(c => c.role === 'helper')
  const activeVehicles = [...vehicles].filter(v => v.isActive).sort((a, b) => a.code.localeCompare(b.code, 'th'))

  const submit = () => {
    if (!form.code.trim() || !form.name.trim()) { alert('กรุณากรอกชื่อย่อรอบ + ชื่อรอบ'); return }
    if (round) updateRound(round.id, form)
    else addRound(form)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={round ? `แก้ไขรอบ ${round.code}` : 'เพิ่มรอบ'} size="lg" closeLabel="cancel">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>ชื่อย่อ *</label>
            <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} placeholder="V" />
          </div>
          <div className="col-span-1 sm:col-span-3">
            <label className={labelCls}>ชื่อรอบ *</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="รอบ V" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>เวลาออก</label>
            <input type="time" className={inputCls} value={form.startTime} onChange={e => set('startTime', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>เวลาจบ</label>
            <input type="time" className={inputCls} value={form.endTime} onChange={e => set('endTime', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>สี</label>
            <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="w-full h-[38px] border border-slate-200 rounded-lg cursor-pointer" />
          </div>
          <div>
            <label className={labelCls}>ลำดับแสดง</label>
            <input type="number" className={inputCls} value={form.sortOrder || ''} onChange={e => set('sortOrder', Number(e.target.value) || 0)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>รถประจำรอบ</label>
            <select className={inputCls} value={form.defaultVehicleId} onChange={e => set('defaultVehicleId', e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {activeVehicles.map(v => <option key={v.id} value={v.id}>คัน {v.code} · {v.licensePlate}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>คนขับประจำ</label>
            <select className={inputCls} value={form.defaultDriverId} onChange={e => set('defaultDriverId', e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {drivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>เด็กรถประจำ</label>
            <select className={inputCls} value={form.defaultHelperId} onChange={e => set('defaultHelperId', e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {helpers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>หมายเหตุ</label>
          <input className={inputCls} value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded accent-[#1B3A5C]" />
          เปิดใช้รอบนี้ (ปิด = พักชั่วคราว เช่น SZH)
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={submit} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors">บันทึก</button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================
// Assign customer to round
// ============================================================
function AssignCustomerModal({ round, onClose }: { round: Round; onClose: () => void }) {
  const { customers, rounds, updateCustomer } = useStore()
  const [search, setSearch] = useState('')

  const roundName = (id: string) => rounds.find(r => r.id === id)?.code

  const candidates = useMemo(() => {
    return customers
      .filter(c => c.isActive && c.roundId !== round.id)
      .filter(c => !search || matchesThaiQueryAnyField([c.shortName, c.name, c.customerCode], search))
      .sort((a, b) => a.shortName.localeCompare(b.shortName, 'th'))
  }, [customers, round.id, search])

  const add = (custId: string) => {
    const inRound = customers.filter(c => c.roundId === round.id)
    const maxSeq = inRound.reduce((m, c) => Math.max(m, c.routeSequence || 0), 0)
    updateCustomer(custId, { roundId: round.id, routeSequence: maxSeq + 1 })
  }

  return (
    <Modal open onClose={onClose} title={`เพิ่มลูกค้าเข้ารอบ ${round.code}`} size="md" closeLabel="close">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <ul className="divide-y divide-slate-100 max-h-80 overflow-auto">
          {candidates.length === 0 ? (
            <li className="text-center text-sm text-slate-400 py-6">ไม่พบลูกค้า</li>
          ) : candidates.map(c => (
            <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="font-medium text-slate-700 w-28 truncate">{c.shortName}</span>
              <span className="flex-1 text-xs text-slate-400 truncate">{c.name}</span>
              {c.roundId && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">อยู่รอบ {roundName(c.roundId) || '?'}</span>}
              <button onClick={() => add(c.id)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors">
                {c.roundId ? 'ย้ายมา' : 'เพิ่ม'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

// ============================================================
// Tab: คนขับ/เด็กรถ
// ============================================================
function CrewTab() {
  const { crew, vehicles, deleteCrew } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Crew | null>(null)

  const sorted = useMemo(() => [...crew].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'th')), [crew])
  const vehicleLabel = (id: string) => { const v = vehicles.find(x => x.id === id); return v ? `คัน ${v.code}` : null }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors">
          <Plus className="w-4 h-4" /> เพิ่มคน
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ยังไม่มีคนขับ/เด็กรถ</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(c => {
            const st = CREW_STATUS_CONFIG[c.status]
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                  {c.role === 'driver' ? <Truck className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">{CREW_ROLE_LABELS[c.role]}{c.phone ? ` · ${c.phone}` : ''}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', st.badge)}>{st.label}</span>
                    {vehicleLabel(c.defaultVehicleId) && <span className="text-[10px] text-slate-400">{vehicleLabel(c.defaultVehicleId)}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditing(c); setShowForm(true) }} aria-label="แก้ไข" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#1B3A5C]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm(`ลบ ${c.name}?`)) deleteCrew(c.id) }} aria-label="ลบ" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && <CrewFormModal crewMember={editing} onClose={() => setShowForm(false)} />}
    </div>
  )
}

const BLANK_CREW: Omit<Crew, 'id' | 'createdAt'> = {
  name: '', role: 'driver', phone: '', status: 'active', defaultVehicleId: '', note: '',
}

function CrewFormModal({ crewMember, onClose }: { crewMember: Crew | null; onClose: () => void }) {
  const { vehicles, addCrew, updateCrew } = useStore()
  const [form, setForm] = useState<Omit<Crew, 'id' | 'createdAt'>>(() => {
    if (!crewMember) return { ...BLANK_CREW }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, ...rest } = crewMember
    return rest
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: v }))
  const activeVehicles = [...vehicles].filter(v => v.isActive).sort((a, b) => a.code.localeCompare(b.code, 'th'))

  const submit = () => {
    if (!form.name.trim()) { alert('กรุณากรอกชื่อ'); return }
    if (crewMember) updateCrew(crewMember.id, form)
    else addCrew(form)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={crewMember ? 'แก้ไขคนขับ/เด็กรถ' : 'เพิ่มคนขับ/เด็กรถ'} size="md" closeLabel="cancel">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>ชื่อ *</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>เบอร์โทร</label>
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>หน้าที่</label>
            <select className={inputCls} value={form.role} onChange={e => set('role', e.target.value as CrewRole)}>
              <option value="driver">{CREW_ROLE_LABELS.driver}</option>
              <option value="helper">{CREW_ROLE_LABELS.helper}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>สถานะ</label>
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value as CrewStatus)}>
              {(Object.keys(CREW_STATUS_CONFIG) as CrewStatus[]).map(s => <option key={s} value={s}>{CREW_STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>รถที่ขับประจำ</label>
          <select className={inputCls} value={form.defaultVehicleId} onChange={e => set('defaultVehicleId', e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {activeVehicles.map(v => <option key={v.id} value={v.id}>คัน {v.code} · {v.licensePlate}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>หมายเหตุ</label>
          <input className={inputCls} value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={submit} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors">บันทึก</button>
        </div>
      </div>
    </Modal>
  )
}
