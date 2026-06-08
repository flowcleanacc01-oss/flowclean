'use client'

// 423 Phase A — Fleet & Compliance (ฟลีตรถ)
//   การ์ดรถ 4 คัน + แถบเตือนต่ออายุ (ประกัน/พ.ร.บ./ภาษี/ตรวจสภาพ) + PM ตามระยะไมล์
//   + บันทึกเลขไมล์ (อัปโหลดรูปหน้าปัด) + ประวัติงานซ่อม (ผูก Expense)

import { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { useStore } from '@/lib/store'
import { canViewFleet } from '@/lib/permissions'
import { cn, formatDate, formatNumber, sanitizeNumber, todayISO } from '@/lib/utils'
import { blockNumberArrowKeys } from '@/lib/modal-nav'
import { COMPLIANCE_STATUS_CONFIG, MAINTENANCE_TYPES } from '@/types'
import type { Vehicle, ComplianceStatus } from '@/types'
import Modal from '@/components/Modal'
import {
  Plus, Wrench, Gauge, ShieldCheck, Camera, Trash2, Pencil,
  AlertTriangle, Car,
} from 'lucide-react'

const NEAR_DAYS = 7   // เตือนล่วงหน้า (วัน) ก่อนประกัน/พ.ร.บ./ภาษี/ตรวจสภาพหมด (ติ๊ดเลือก)
const NEAR_KM = 500   // เตือนล่วงหน้า (กม.) ก่อนถึงระยะเช็ค PM

const COMPLIANCE_FIELDS: { key: 'insuranceExpiry' | 'actExpiry' | 'taxExpiry' | 'inspectionExpiry'; label: string }[] = [
  { key: 'insuranceExpiry', label: 'ประกันชั้น 1' },
  { key: 'actExpiry', label: 'พ.ร.บ.' },
  { key: 'taxExpiry', label: 'ภาษีรถ' },
  { key: 'inspectionExpiry', label: 'ตรวจสภาพ' },
]

/** สถานะวันหมดอายุ — null = ไม่มีข้อมูล (ยังไม่กรอก) */
function complianceStatus(expiry: string): { status: ComplianceStatus; days: number } | null {
  if (!expiry) return null
  let d: number
  try { d = differenceInDays(parseISO(expiry), parseISO(todayISO())) } catch { return null }
  if (d < 0) return { status: 'overdue', days: d }
  if (d <= NEAR_DAYS) return { status: 'near', days: d }
  return { status: 'ok', days: d }
}

/** สถานะ PM ตามระยะไมล์ — null = ยังไม่ตั้งระยะถัดไป */
function pmStatus(v: Vehicle): { status: ComplianceStatus; remaining: number } | null {
  if (!v.nextServiceOdometer || v.nextServiceOdometer <= 0) return null
  const remaining = v.nextServiceOdometer - v.currentOdometer
  if (remaining <= 0) return { status: 'overdue', remaining }
  if (remaining <= NEAR_KM) return { status: 'near', remaining }
  return { status: 'ok', remaining }
}

const BLANK_VEHICLE: Omit<Vehicle, 'id' | 'createdAt'> = {
  code: '', licensePlate: '', brand: 'Toyota Hilux Revo Standard Cab + ตู้ทึบ', usageType: 'พาณิชย์',
  registeredDate: '', insuranceCompany: '', insuranceClass: 'ชั้น 1', insuranceExpiry: '',
  actExpiry: '', taxExpiry: '', inspectionExpiry: '',
  currentOdometer: 0, serviceIntervalKm: 8000, nextServiceOdometer: 0, isActive: true, note: '',
}

export default function FleetPage() {
  const { currentUser, vehicles, addVehicle, updateVehicle, deleteVehicle } = useStore()
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [odometerVehicle, setOdometerVehicle] = useState<Vehicle | null>(null)
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null)

  const sorted = useMemo(
    () => [...vehicles].sort((a, b) => a.code.localeCompare(b.code, 'th')),
    [vehicles],
  )

  // แถบเตือนรวม — overdue ก่อน, near ตามมา (เรียงด่วนสุด)
  const alerts = useMemo(() => {
    const out: { vehicleCode: string; label: string; status: ComplianceStatus; detail: string; sortKey: number }[] = []
    for (const v of vehicles) {
      if (!v.isActive) continue
      for (const f of COMPLIANCE_FIELDS) {
        const c = complianceStatus(v[f.key])
        if (c && c.status !== 'ok') {
          out.push({
            vehicleCode: v.code,
            label: f.label,
            status: c.status,
            detail: c.days < 0 ? `เกินกำหนด ${Math.abs(c.days)} วัน` : `อีก ${c.days} วัน`,
            sortKey: c.days,
          })
        }
      }
      const pm = pmStatus(v)
      if (pm && pm.status !== 'ok') {
        out.push({
          vehicleCode: v.code,
          label: 'ถึงระยะเช็ค (PM)',
          status: pm.status,
          detail: pm.remaining <= 0 ? `เลยมา ${formatNumber(Math.abs(pm.remaining))} กม.` : `อีก ${formatNumber(pm.remaining)} กม.`,
          sortKey: pm.remaining,
        })
      }
    }
    return out.sort((a, b) => a.sortKey - b.sortKey)
  }, [vehicles])

  if (!canViewFleet(currentUser)) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะผู้ดูแลระบบและบัญชีเท่านั้น</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-[#1B3A5C]" /> ฟลีตรถ
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">รถ {vehicles.length} คัน · ประกัน/พ.ร.บ./ภาษี/ตรวจสภาพ + บำรุงเชิงป้องกัน</p>
        </div>
        <button
          onClick={() => { setEditingVehicle(null); setShowForm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" /> เพิ่มรถ
        </button>
      </div>

      {/* Alert strip */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2.5 flex items-center gap-2 border-b border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">รายการที่ต้องดำเนินการ ({alerts.length})</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {alerts.map((a, i) => {
              const cfg = COMPLIANCE_STATUS_CONFIG[a.status]
              return (
                <li key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="font-bold text-[#1B3A5C] w-10 shrink-0">คัน {a.vehicleCode}</span>
                  <span className="text-slate-600 flex-1 min-w-0">{a.label}</span>
                  <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap', cfg.badge)}>
                    {cfg.dot} {a.detail}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Vehicle cards */}
      {vehicles.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ยังไม่มีรถในระบบ — กด “เพิ่มรถ” เพื่อเริ่ม</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map(v => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              onEdit={() => { setEditingVehicle(v); setShowForm(true) }}
              onDelete={() => {
                if (confirm(`ลบรถคัน ${v.code} (${v.licensePlate})?\nประวัติไมล์/ซ่อมของคันนี้จะถูกลบด้วย`)) deleteVehicle(v.id)
              }}
              onOdometer={() => setOdometerVehicle(v)}
              onMaintenance={() => setMaintenanceVehicle(v)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <VehicleFormModal
          vehicle={editingVehicle}
          onClose={() => setShowForm(false)}
          onSubmit={(data) => {
            if (editingVehicle) updateVehicle(editingVehicle.id, data)
            else addVehicle(data)
            setShowForm(false)
          }}
        />
      )}
      {odometerVehicle && (
        <OdometerModal vehicle={odometerVehicle} onClose={() => setOdometerVehicle(null)} />
      )}
      {maintenanceVehicle && (
        <MaintenanceModal vehicle={maintenanceVehicle} onClose={() => setMaintenanceVehicle(null)} />
      )}
    </div>
  )
}

// ============================================================
// Vehicle Card
// ============================================================
function VehicleCard({ vehicle, onEdit, onDelete, onOdometer, onMaintenance }: {
  vehicle: Vehicle
  onEdit: () => void
  onDelete: () => void
  onOdometer: () => void
  onMaintenance: () => void
}) {
  const v = vehicle
  const pm = pmStatus(v)
  return (
    <div className={cn('bg-white rounded-xl border p-4 space-y-3', v.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60')}>
      {/* head */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#1B3A5C] text-[#3DD8D8] flex items-center justify-center text-xl font-bold shrink-0">
          {v.code || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-lg leading-tight">{v.licensePlate || '(ไม่ระบุทะเบียน)'}</p>
          <p className="text-xs text-slate-500 truncate">{v.brand}{v.usageType ? ` · ${v.usageType}` : ''}</p>
          {!v.isActive && <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">ไม่ใช้งาน</span>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} aria-label="แก้ไข" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#1B3A5C] transition-colors">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} aria-label="ลบ" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* compliance grid */}
      <div className="grid grid-cols-2 gap-2">
        {COMPLIANCE_FIELDS.map(f => {
          const c = complianceStatus(v[f.key])
          const cfg = c ? COMPLIANCE_STATUS_CONFIG[c.status] : null
          return (
            <div key={f.key} className="rounded-lg border border-slate-100 bg-slate-50/50 px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <ShieldCheck className="w-3 h-3" /> {f.label}
              </div>
              {v[f.key] ? (
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="text-xs font-medium text-slate-700">{formatDate(v[f.key])}</span>
                  {cfg && <span title={cfg.label}>{cfg.dot}</span>}
                </div>
              ) : (
                <p className="text-xs text-slate-300 mt-0.5">—</p>
              )}
            </div>
          )
        })}
      </div>

      {/* PM */}
      <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0 text-xs">
          <span className="text-slate-500">ไมล์ปัจจุบัน </span>
          <span className="font-semibold text-slate-700">{formatNumber(v.currentOdometer)} กม.</span>
          {v.nextServiceOdometer > 0 && (
            <>
              <span className="text-slate-400"> · เช็คถัดไป </span>
              <span className="font-medium text-slate-600">{formatNumber(v.nextServiceOdometer)}</span>
            </>
          )}
        </div>
        {pm && (
          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap', COMPLIANCE_STATUS_CONFIG[pm.status].badge)}>
            {pm.remaining <= 0 ? `เลย ${formatNumber(Math.abs(pm.remaining))} กม.` : `อีก ${formatNumber(pm.remaining)} กม.`}
          </span>
        )}
      </div>

      {/* actions */}
      <div className="flex gap-2 pt-0.5">
        <button onClick={onOdometer} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
          <Gauge className="w-3.5 h-3.5" /> บันทึกไมล์
        </button>
        <button onClick={onMaintenance} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
          <Wrench className="w-3.5 h-3.5" /> ประวัติซ่อม
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Vehicle Form Modal (เพิ่ม/แก้)
// ============================================================
const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]'
const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

function VehicleFormModal({ vehicle, onClose, onSubmit }: {
  vehicle: Vehicle | null
  onClose: () => void
  onSubmit: (data: Omit<Vehicle, 'id' | 'createdAt'>) => void
}) {
  const [form, setForm] = useState<Omit<Vehicle, 'id' | 'createdAt'>>(() => {
    if (!vehicle) return { ...BLANK_VEHICLE }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, ...rest } = vehicle
    return rest
  })
  const set = <K extends keyof typeof form>(k: K, val: (typeof form)[K]) => setForm(prev => ({ ...prev, [k]: val }))

  const submit = () => {
    if (!form.code.trim() || !form.licensePlate.trim()) {
      alert('กรุณากรอกชื่อย่อ (A/B/C/D) และทะเบียนรถ')
      return
    }
    onSubmit(form)
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? `แก้ไขรถ — คัน ${vehicle.code}` : 'เพิ่มรถ'} size="lg" closeLabel="cancel">
      <div className="space-y-4">
        {/* ข้อมูลรถ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>ชื่อย่อ *</label>
            <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} placeholder="A" />
          </div>
          <div className="col-span-1 sm:col-span-3">
            <label className={labelCls}>ทะเบียน *</label>
            <input className={inputCls} value={form.licensePlate} onChange={e => set('licensePlate', e.target.value)} placeholder="3ฒพ-5682" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>ยี่ห้อ/รุ่น</label>
            <input className={inputCls} value={form.brand} onChange={e => set('brand', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>ประเภทการใช้</label>
            <input className={inputCls} value={form.usageType} onChange={e => set('usageType', e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>วันจดทะเบียน <span className="text-slate-400">(ไว้คำนวณอายุ 7 ปี → ต้องตรวจสภาพ)</span></label>
          <input type="date" className={inputCls} value={form.registeredDate} onChange={e => set('registeredDate', e.target.value)} />
        </div>

        {/* ประกัน + ราชการ */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 mb-2">📋 ประกันภัย + ปฏิบัติตามกฎหมาย</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>บริษัทประกัน</label>
              <input className={inputCls} value={form.insuranceCompany} onChange={e => set('insuranceCompany', e.target.value)} placeholder="ชับบ์ สามัคคี" />
            </div>
            <div>
              <label className={labelCls}>ชั้นประกัน</label>
              <input className={inputCls} value={form.insuranceClass} onChange={e => set('insuranceClass', e.target.value)} placeholder="ชั้น 1" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div>
              <label className={labelCls}>ประกันหมด</label>
              <input type="date" className={inputCls} value={form.insuranceExpiry} onChange={e => set('insuranceExpiry', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>พ.ร.บ. หมด</label>
              <input type="date" className={inputCls} value={form.actExpiry} onChange={e => set('actExpiry', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>ภาษีหมด</label>
              <input type="date" className={inputCls} value={form.taxExpiry} onChange={e => set('taxExpiry', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>ตรวจสภาพหมด</label>
              <input type="date" className={inputCls} value={form.inspectionExpiry} onChange={e => set('inspectionExpiry', e.target.value)} />
            </div>
          </div>
        </div>

        {/* PM */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 mb-2">🔧 บำรุงเชิงป้องกัน (ตามระยะไมล์)</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>ไมล์ปัจจุบัน (กม.)</label>
              <input type="number" className={inputCls} value={form.currentOdometer || ''} onChange={e => set('currentOdometer', sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
            </div>
            <div>
              <label className={labelCls}>ระยะเช็คทุก (กม.)</label>
              <input type="number" className={inputCls} value={form.serviceIntervalKm || ''} onChange={e => set('serviceIntervalKm', sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
            </div>
            <div>
              <label className={labelCls}>ครบกำหนดถัดไป (กม.)</label>
              <input type="number" className={inputCls} value={form.nextServiceOdometer || ''} onChange={e => set('nextServiceOdometer', sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>หมายเหตุ</label>
          <input className={inputCls} value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded accent-[#1B3A5C]" />
          ใช้งานอยู่
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
// Odometer Modal (บันทึกเลขไมล์ + รูปหน้าปัด)
// ============================================================
function OdometerModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { odometerLogs, addOdometerLog, deleteOdometerLog } = useStore()
  const [date, setDate] = useState(todayISO())
  const [odometer, setOdometer] = useState(0)
  const [fuelLevel, setFuelLevel] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const logs = useMemo(
    () => odometerLogs.filter(o => o.vehicleId === vehicle.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [odometerLogs, vehicle.id],
  )

  const save = async () => {
    if (odometer <= 0) { alert('กรุณากรอกเลขไมล์'); return }
    setSaving(true)
    let photoPath = ''
    if (file) {
      try { photoPath = await uploadFleetPhoto(file, vehicle.id) }
      catch { alert('อัปโหลดรูปไม่สำเร็จ — บันทึกข้อมูลไมล์ต่อไป (ไม่มีรูป)') }
    }
    addOdometerLog({ vehicleId: vehicle.id, date, odometer, fuelLevel, photoPath, note })
    setSaving(false)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`บันทึกเลขไมล์ — คัน ${vehicle.code}`} size="md" closeLabel="cancel">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>วันที่</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>เลขไมล์ (กม.) *</label>
            <input type="number" className={inputCls} value={odometer || ''} onChange={e => setOdometer(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} placeholder={formatNumber(vehicle.currentOdometer)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>น้ำมัน (จากหน้าปัด)</label>
            <input className={inputCls} value={fuelLevel} onChange={e => setFuelLevel(e.target.value)} placeholder="เต็มถัง / ครึ่งถัง" />
          </div>
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>รูปหน้าปัดเรือนไมล์ <span className="text-slate-400">(.jpg .png — ไม่บังคับ)</span></label>
          <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-[#3DD8D8]">
            <Camera className="w-4 h-4" />
            <span className="truncate">{file ? file.name : 'เลือกรูป...'}</span>
            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors disabled:opacity-60">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>

        {/* history */}
        {logs.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">ประวัติเลขไมล์</p>
            <ul className="divide-y divide-slate-100 max-h-52 overflow-auto">
              {logs.map(o => (
                <li key={o.id} className="py-2 flex items-center gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">{formatDate(o.date)}</span>
                  <span className="font-semibold text-slate-700">{formatNumber(o.odometer)} กม.</span>
                  {o.fuelLevel && <span className="text-xs text-slate-400">· {o.fuelLevel}</span>}
                  <span className="flex-1" />
                  {o.photoPath && (
                    <button onClick={() => viewFleetPhoto(o.photoPath)} className="text-xs text-[#1B3A5C] hover:underline inline-flex items-center gap-0.5">
                      <Camera className="w-3 h-3" /> ดูรูป
                    </button>
                  )}
                  <button onClick={() => deleteOdometerLog(o.id)} aria-label="ลบ" className="text-slate-300 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ============================================================
// Maintenance Modal (ประวัติซ่อม + เพิ่มงานซ่อม + ผูก Expense)
// ============================================================
function MaintenanceModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { maintenanceRecords, addMaintenanceRecord, deleteMaintenanceRecord, updateVehicle, addExpense } = useStore()
  const [date, setDate] = useState(todayISO())
  const [type, setType] = useState<string>(MAINTENANCE_TYPES[0])
  const [odometer, setOdometer] = useState(0)
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState(0)
  const [nextDue, setNextDue] = useState(0)
  const [asExpense, setAsExpense] = useState(true)

  const records = useMemo(
    () => maintenanceRecords.filter(m => m.vehicleId === vehicle.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [maintenanceRecords, vehicle.id],
  )

  const save = () => {
    if (!type.trim()) { alert('กรุณาเลือกประเภทงานซ่อม'); return }
    let expenseId = ''
    if (asExpense && cost > 0) {
      const exp = addExpense({
        date, category: 'maintenance', amount: cost,
        description: `${type} — คัน ${vehicle.code} (${vehicle.licensePlate})${description ? ` · ${description}` : ''}`,
        reference: '', vehicleId: vehicle.id,
      })
      expenseId = exp.id
    }
    addMaintenanceRecord({ vehicleId: vehicle.id, date, odometer, type, description, cost, expenseId, nextDueOdometer: nextDue })
    // sync เข้า vehicle: ไมล์ที่ทำ (ถ้า > ปัจจุบัน) + ระยะเช็คถัดไป (ถ้ากรอก)
    const patch: Partial<Vehicle> = {}
    if (odometer > vehicle.currentOdometer) patch.currentOdometer = odometer
    if (nextDue > 0) patch.nextServiceOdometer = nextDue
    if (Object.keys(patch).length > 0) updateVehicle(vehicle.id, patch)
    // reset form
    setType(MAINTENANCE_TYPES[0]); setOdometer(0); setDescription(''); setCost(0); setNextDue(0)
  }

  return (
    <Modal open onClose={onClose} title={`ประวัติซ่อม/บำรุง — คัน ${vehicle.code}`} size="lg" closeLabel="close">
      <div className="space-y-4">
        {/* add form */}
        <div className="rounded-xl border border-slate-200 p-3 space-y-3 bg-slate-50/40">
          <p className="text-xs font-semibold text-slate-500">เพิ่มงานซ่อม/บำรุง</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>วันที่</label>
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>ประเภท</label>
              <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
                {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>ที่ระยะ (กม.)</label>
              <input type="number" className={inputCls} value={odometer || ''} onChange={e => setOdometer(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
            </div>
            <div>
              <label className={labelCls}>ค่าใช้จ่าย (บาท)</label>
              <input type="number" className={inputCls} value={cost || ''} onChange={e => setCost(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>รายละเอียด</label>
              <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="เช่น เปลี่ยนผ้าเบรคหน้า + น้ำมันเครื่อง" />
            </div>
            <div>
              <label className={labelCls}>ครบกำหนดถัดไป (กม.) <span className="text-slate-400">(ไม่บังคับ)</span></label>
              <input type="number" className={inputCls} value={nextDue || ''} onChange={e => setNextDue(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} placeholder="เช่น น้ำมันเครื่อง → 185000" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={asExpense} onChange={e => setAsExpense(e.target.checked)} className="rounded accent-[#1B3A5C]" />
            บันทึกเป็นค่าใช้จ่ายด้วย (หมวดซ่อมบำรุง — ผูกกับรถคันนี้)
          </label>
          <div className="flex justify-end">
            <button onClick={save} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors">
              <Plus className="w-4 h-4" /> เพิ่ม
            </button>
          </div>
        </div>

        {/* history */}
        {records.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">ยังไม่มีประวัติงานซ่อม</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {records.map(m => (
              <li key={m.id} className="py-2.5 flex items-start gap-3 text-sm">
                <span className="text-slate-400 w-20 shrink-0">{formatDate(m.date)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-700">
                    {m.type}
                    {m.odometer > 0 && <span className="text-xs text-slate-400 font-normal"> @ {formatNumber(m.odometer)} กม.</span>}
                  </p>
                  {m.description && <p className="text-xs text-slate-500 truncate">{m.description}</p>}
                  {m.nextDueOdometer > 0 && <p className="text-[11px] text-amber-600">ครบกำหนดถัดไป {formatNumber(m.nextDueOdometer)} กม.</p>}
                </div>
                {m.cost > 0 && <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">฿{formatNumber(m.cost)}</span>}
                {m.expenseId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 self-center">บันทึกจ่ายแล้ว</span>}
                <button onClick={() => deleteMaintenanceRecord(m.id)} aria-label="ลบ" className="text-slate-300 hover:text-red-500 self-center">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// ============================================================
// Storage helpers — รูปหน้าปัด (Supabase Storage ผ่าน /api/fleet-photo)
// ============================================================
function sessionUserId(): string {
  try {
    const s = typeof window !== 'undefined' ? sessionStorage.getItem('flowclean_session') : null
    return s ? JSON.parse(s).userId || '' : ''
  } catch { return '' }
}

async function uploadFleetPhoto(file: File, vehicleId: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('vehicleId', vehicleId)
  const res = await fetch('/api/fleet-photo', { method: 'POST', headers: { 'x-fc-session': sessionUserId() }, body: fd })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'upload failed')
  return json.path as string
}

async function viewFleetPhoto(path: string): Promise<void> {
  try {
    const res = await fetch(`/api/fleet-photo?path=${encodeURIComponent(path)}`, { headers: { 'x-fc-session': sessionUserId() } })
    const json = await res.json()
    if (res.ok && json.url) window.open(json.url, '_blank', 'noopener')
    else alert('เปิดรูปไม่สำเร็จ')
  } catch { alert('เปิดรูปไม่สำเร็จ') }
}
