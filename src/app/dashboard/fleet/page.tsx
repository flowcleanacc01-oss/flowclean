'use client'

// 423 Phase A — Fleet & Compliance (ฟลีตรถ)
//   การ์ดรถ 4 คัน + แถบเตือนต่ออายุ (ประกัน/พ.ร.บ./ภาษี/ตรวจสภาพ) + PM ตามระยะไมล์
//   + บันทึกเลขไมล์ (อัปโหลดรูปหน้าปัด) + ประวัติงานซ่อม (ผูก Expense)

import { useState, useEffect, useMemo } from 'react'
import { differenceInDays, parseISO, format } from 'date-fns'
import { useStore } from '@/lib/store'
import { canViewFleet } from '@/lib/permissions'
import { cn, formatDate, formatNumber, sanitizeNumber, todayISO } from '@/lib/utils'
import { blockNumberArrowKeys } from '@/lib/modal-nav'
import { fuelEfficiencyMap, isEfficiencyAbnormal, pendingReimbursements } from '@/lib/fuel'
import { deriveAnchor, estimateOdometer, anchorDayKmAfter, anchorAgeDays, ANCHOR_MAX_AGE_DAYS, type OdometerEstimate } from '@/lib/odometer'
import { fetchGpsDailyMileage, fetchGpsCars, fetchGpsTrips } from '@/lib/gps-service'
import { normalizePlate } from '@/lib/v2x-types'
import { COMPLIANCE_STATUS_CONFIG, MAINTENANCE_TYPES, FUEL_TYPES, FUEL_PAID_BY_CONFIG } from '@/types'
import type { Vehicle, ComplianceStatus, FuelPaidBy } from '@/types'
import Modal from '@/components/Modal'
import {
  Plus, Wrench, Gauge, ShieldCheck, Camera, Trash2, Pencil,
  AlertTriangle, Car, Fuel, Receipt, Banknote, Check, Satellite, Loader2,
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
  currentOdometer: 0, odometerAnchorDate: '', odometerAnchorTime: '', serviceIntervalKm: 8000, nextServiceOdometer: 0, isActive: true, note: '',
}

export default function FleetPage() {
  const { currentUser, vehicles, addVehicle, updateVehicle, deleteVehicle } = useStore()
  const [tab, setTab] = useState<'fleet' | 'fuel'>('fleet')
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [odometerVehicle, setOdometerVehicle] = useState<Vehicle | null>(null)
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null)
  const [showGpsOdometer, setShowGpsOdometer] = useState(false) // 428

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
          <p className="text-slate-500 text-sm mt-0.5">รถ {vehicles.length} คัน · ประกัน/พ.ร.บ./ภาษี/ตรวจสภาพ + บำรุง + เติมน้ำมัน</p>
        </div>
        {tab === 'fleet' && (
          <div className="flex flex-wrap gap-2 self-start">
            <button
              onClick={() => setShowGpsOdometer(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8]/15 text-[#1B3A5C] border border-[#3DD8D8] rounded-lg text-sm font-medium hover:bg-[#3DD8D8]/25 transition-colors"
              title="คำนวณไมล์ประมาณ = ไมล์จริงล่าสุดที่กรอก + ระยะวิ่งสะสมจาก GPS (V2X)"
            >
              <Satellite className="w-4 h-4" /> อัปเดตไมล์จาก GPS
            </button>
            <button
              onClick={() => { setEditingVehicle(null); setShowForm(true) }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> เพิ่มรถ
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([['fleet', 'รถ & บำรุง'], ['fuel', 'เติมน้ำมัน']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5',
              tab === k ? 'border-[#3DD8D8] text-[#1B3A5C]' : 'border-transparent text-slate-400 hover:text-slate-600')}>
            {k === 'fleet' ? <Car className="w-4 h-4" /> : <Fuel className="w-4 h-4" />}{label}
          </button>
        ))}
      </div>

      {tab === 'fuel' ? <FuelTab /> : <>

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
      </>}

      {showForm && (
        <VehicleFormModal
          vehicle={editingVehicle}
          onClose={() => setShowForm(false)}
          onSubmit={(data) => {
            // 428 — กรอกไมล์ใหม่ในฟอร์ม = ตั้งฐานวันคำนวณ GPS ใหม่ (anchor = วันนี้)
            // 446 — ตั้งเวลา anchor = ตอนนี้ (กรอกเดี๋ยวนี้ → วันนี้นับเฉพาะระยะหลังจากนี้)
            if (data.currentOdometer !== (editingVehicle?.currentOdometer ?? 0)) {
              data.odometerAnchorDate = todayISO()
              data.odometerAnchorTime = format(new Date(), 'HH:mm')
            }
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
      {showGpsOdometer && (
        <GpsOdometerModal onClose={() => setShowGpsOdometer(false)} />
      )}
    </div>
  )
}

// ============================================================
// 428 — อัปเดตไมล์จาก GPS
//   ไมล์ประมาณ = ไมล์จริงล่าสุดที่กรอก (ฐาน ณ วัน anchor) + Σ ระยะวิ่ง V2X หลังวันนั้น
//   เปิด modal → ดึงระยะรายวันทุกคันรอบเดียว → เสนอค่าต่อคัน → ติ๊กเลือก → บันทึก
// ============================================================
interface GpsOdoRow {
  v: Vehicle
  anchorDate: string // '' = ไม่รู้วันฐาน
  anchorTime: string // 446 — เวลาที่กรอกไมล์ ('' = ไม่รู้ → ข้ามวัน anchor ทั้งวัน)
  age: number // วันตั้งแต่ anchor (Infinity ถ้าไม่รู้)
  matched: boolean // ทะเบียนเจอใน GPS ไหม
  est: OdometerEstimate
}

function GpsOdometerModal({ onClose }: { onClose: () => void }) {
  const { vehicles, odometerLogs, fuelLogs, maintenanceRecords, updateVehicle } = useStore()
  const [rows, setRows] = useState<GpsOdoRow[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const today = todayISO()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const prep = [...vehicles].filter(v => v.isActive)
          .sort((a, b) => a.code.localeCompare(b.code, 'th'))
          .map(v => {
            const anchor = deriveAnchor(v, odometerLogs, fuelLogs, maintenanceRecords)
            return { v, anchorDate: anchor.date, anchorTime: anchor.time, age: anchorAgeDays(anchor.date, today) }
          })
        const eligible = prep.filter(p => p.anchorDate && p.age >= 0 && p.age <= ANCHOR_MAX_AGE_DAYS)
        // ดึงรอบเดียวครอบทุกคัน: from = anchor เก่าสุดในกลุ่มที่คำนวณได้ (ไม่มีใครคำนวณได้ → ไม่ต้องยิง)
        const from = eligible.map(p => p.anchorDate).sort()[0]
        const daily = from ? await fetchGpsDailyMileage(from, today) : []
        if (cancelled) return
        // 446 — วัน anchor ที่ "รู้เวลา": ดึงเที่ยวของวันนั้นมาบวกระยะ "หลังเวลาที่กรอกไมล์" (ไม่ข้ามข้อมูลวันเดียวกัน)
        const anchorDayKm = new Map<string, number>() // vehicleId → กม. วัน anchor หลังเวลา
        const timed = eligible.filter(p => p.anchorTime)
        if (timed.length > 0) {
          const cars = await fetchGpsCars().catch(() => [])
          if (cancelled) return
          const plateToV2x = new Map(cars.map(c => [c.plateNorm, c.plate]))
          await Promise.all(timed.map(async p => {
            const v2xPlate = plateToV2x.get(normalizePlate(p.v.licensePlate))
            if (!v2xPlate) return
            try {
              const trips = await fetchGpsTrips(v2xPlate, p.anchorDate)
              anchorDayKm.set(p.v.id, anchorDayKmAfter(trips, p.anchorDate, p.anchorTime))
            } catch { /* ดึงเที่ยววัน anchor ไม่ได้ → ข้ามวัน anchor แบบเดิม (ไม่ล้มทั้งก้อน) */ }
          }))
          if (cancelled) return
        }
        const gpsPlates = new Set(daily.map(d => d.plateNorm))
        const result: GpsOdoRow[] = prep.map(p => ({
          ...p,
          matched: gpsPlates.has(normalizePlate(p.v.licensePlate)) || (anchorDayKm.get(p.v.id) || 0) > 0,
          est: estimateOdometer(p.v, p.anchorDate, daily, today, anchorDayKm.get(p.v.id) || 0),
        }))
        setRows(result)
        // default ติ๊กเฉพาะคันที่คำนวณได้ + GPS มีระยะวิ่งจริง
        setChecked(new Set(result
          .filter(r => r.anchorDate && r.age <= ANCHOR_MAX_AGE_DAYS && r.matched && r.est.gpsKm > 0)
          .map(r => r.v.id)))
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'ดึงข้อมูล GPS ไม่สำเร็จ')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = () => {
    if (!rows) return
    // 446 — ค่าประมาณคิดถึง "ตอนนี้" แล้ว → ตั้ง anchor = วันนี้ เวลาตอนนี้ (กันนับระยะวันนี้ซ้ำรอบถัดไป)
    const now = format(new Date(), 'HH:mm')
    for (const r of rows) {
      if (!checked.has(r.v.id)) continue
      updateVehicle(r.v.id, { currentOdometer: r.est.estimate, odometerAnchorDate: today, odometerAnchorTime: now })
    }
    onClose()
  }

  /** เหตุผลที่คำนวณไม่ได้ (null = คำนวณได้) */
  const blockReason = (r: GpsOdoRow): string | null => {
    if (!r.matched) return 'ทะเบียนไม่ตรงกับรถใน GPS — เช็คทะเบียนในฟอร์มรถ'
    if (!r.anchorDate) return 'ยังไม่รู้ว่าไมล์ล่าสุดกรอกวันไหน — กด "บันทึกไมล์" จากหน้าปัดจริง 1 ครั้งก่อน'
    if (r.age > ANCHOR_MAX_AGE_DAYS) return `ไมล์ล่าสุดกรอกไว้นานเกิน ${ANCHOR_MAX_AGE_DAYS} วัน — กรอกไมล์จริงตั้งต้นใหม่ก่อน`
    return null
  }

  /** คำนวณได้แต่ระยะ = 0 → อธิบายว่าทำไม (กันเข้าใจผิดว่าระบบพัง) · null = มีระยะแล้ว */
  const zeroHint = (r: GpsOdoRow): string | null => {
    if (blockReason(r) || r.est.gpsKm > 0) return null
    if (r.anchorDate === today) {
      return r.anchorTime
        ? `กรอกไมล์วันนี้ ${r.anchorTime} น. — ยังไม่มีระยะวิ่งใหม่หลังเวลานี้`
        : 'กรอกไมล์วันนี้ — ระบบนับเฉพาะระยะ "หลังวันที่กรอก" จะเริ่มเห็นพรุ่งนี้'
    }
    return `ยังไม่มีระยะวิ่งใหม่จาก GPS หลังที่กรอก (${formatDate(r.anchorDate)}${r.anchorTime ? ` ${r.anchorTime} น.` : ''})`
  }

  return (
    <Modal open onClose={onClose} title="อัปเดตไมล์จาก GPS" size="lg" closeLabel="cancel">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          ไมล์ประมาณ = <b>ไมล์จริงล่าสุดที่กรอก</b> + <b>ระยะวิ่งสะสมจาก GPS</b> หลังวันนั้นถึงวันนี้
          — ทุกครั้งที่กรอกไมล์จริง (บันทึกไมล์/เติมน้ำมัน) ระบบจะตั้งฐานใหม่ให้ค่าแม่นตลอด
        </p>

        {err && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {err}
          </div>
        )}

        {!rows && !err && (
          <div className="text-center py-10">
            <Loader2 className="w-7 h-7 text-slate-300 mx-auto animate-spin mb-2" />
            <p className="text-sm text-slate-400">กำลังดึงระยะวิ่งจาก GPS…</p>
          </div>
        )}

        {rows && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left font-medium">รถ</th>
                  <th className="px-3 py-2 text-right font-medium">ไมล์ที่บันทึก</th>
                  <th className="px-3 py-2 text-right font-medium">+ GPS</th>
                  <th className="px-3 py-2 text-right font-medium">ไมล์ใหม่ (≈)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => {
                  const blocked = blockReason(r)
                  return (
                    <tr key={r.v.id} className={cn(blocked && 'opacity-70')}>
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={checked.has(r.v.id)} disabled={!!blocked}
                          onChange={() => toggle(r.v.id)} className="accent-[#1B3A5C]" />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-bold bg-[#1B3A5C] text-white px-1.5 py-0.5 rounded">คัน {r.v.code}</span>
                        <span className="ml-1.5 text-slate-700">{r.v.licensePlate}</span>
                        {blocked && <p className="text-[11px] text-amber-600 mt-0.5">{blocked}</p>}
                        {!blocked && zeroHint(r) && <p className="text-[11px] text-slate-400 mt-0.5">{zeroHint(r)}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-600">
                        {formatNumber(r.v.currentOdometer)}
                        {r.anchorDate && <span className="block text-[10px] text-slate-400">ณ {formatDate(r.anchorDate)}{r.anchorTime ? ` ${r.anchorTime} น.` : ''}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-600">
                        {blocked ? '—' : <>
                          +{formatNumber(Math.round(r.est.gpsKm))}
                          <span className="block text-[10px] text-slate-400">{r.est.days} วันที่วิ่ง</span>
                        </>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold text-[#1B3A5C]">
                        {blocked ? '—' : `≈ ${formatNumber(r.est.estimate)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400">
          ค่าจาก GPS เป็นค่าประมาณ (ไม่นับวันที่กรอกไมล์เอง) — กรอกไมล์จริงจากหน้าปัดเป็นระยะเพื่อ
          ตั้งฐานใหม่ให้ตรงเป๊ะ · กรอก manual ได้เหมือนเดิมทุกช่องทาง
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={!rows || checked.size === 0}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] disabled:opacity-40 transition-colors">
            บันทึก {checked.size > 0 ? `(${checked.size} คัน)` : ''}
          </button>
        </div>
      </div>
    </Modal>
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
          {v.odometerAnchorDate && <span className="text-[10px] text-slate-400"> · ณ {formatDate(v.odometerAnchorDate)}</span>}
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
  const [recordedTime, setRecordedTime] = useState(() => format(new Date(), 'HH:mm')) // 446 — เวลาที่ถ่าย/อ่านไมล์
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
    addOdometerLog({ vehicleId: vehicle.id, date, recordedTime, odometer, fuelLevel, photoPath, note })
    setSaving(false)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`บันทึกเลขไมล์ — คัน ${vehicle.code}`} size="md" closeLabel="cancel">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>วันที่</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>เวลาที่อ่าน</label>
            <input type="time" className={inputCls} value={recordedTime} onChange={e => setRecordedTime(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>เลขไมล์ (กม.) *</label>
            <input type="number" className={inputCls} value={odometer || ''} onChange={e => setOdometer(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} placeholder={formatNumber(vehicle.currentOdometer)} />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 -mt-2">
          ⏱️ เวลาที่อ่านไมล์สำคัญ — ถ้าถ่ายตอนเช้าก่อนออกรถ ระบบจะนับระยะที่วิ่ง “หลังเวลานี้” ของวันเดียวกันให้ครบ ไม่ข้ามทั้งวัน
        </p>
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
                  <span className="text-slate-400 w-24 shrink-0">{formatDate(o.date)}{o.recordedTime ? ` ${o.recordedTime}` : ''}</span>
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
    // 446 — งานซ่อมไม่ระบุเวลาอ่านไมล์ → anchorTime='' (ข้ามวันที่ทำแบบ conservative · ไม่ทิ้งเวลาเก่าที่ผิด)
    if (odometer > vehicle.currentOdometer) { patch.currentOdometer = odometer; patch.odometerAnchorDate = date; patch.odometerAnchorTime = '' }
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
// 423 งานติ๊ด — Tab เติมน้ำมัน (Fuel Log)
// ============================================================
function FuelTab() {
  const { fuelLogs, vehicles, crew, updateFuelLog, deleteFuelLog } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [filterVehicle, setFilterVehicle] = useState('')

  const vehById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])
  const crewById = useMemo(() => new Map(crew.map(c => [c.id, c])), [crew])
  const effMap = useMemo(() => fuelEfficiencyMap(fuelLogs), [fuelLogs])
  const pending = useMemo(() => pendingReimbursements(fuelLogs), [fuelLogs])

  const rows = useMemo(
    () => [...fuelLogs]
      .filter(f => !filterVehicle || f.vehicleId === filterVehicle)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [fuelLogs, filterVehicle],
  )

  const driverName = (id: string) => crewById.get(id)?.name || '—'

  return (
    <div className="space-y-4">
      {/* ค้างเบิกคืนคนขับ */}
      {pending.total > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2.5 flex items-center gap-2 border-b border-amber-100">
            <Banknote className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">ค้างเบิกคืนคนขับ</span>
            <span className="ml-auto text-base font-bold text-amber-700">฿{formatNumber(pending.total)}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {pending.byDriver.map(p => (
              <li key={p.driverId} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="font-medium text-slate-700 flex-1">{driverName(p.driverId)}</span>
                <span className="text-xs text-slate-400">{p.count} รายการ</span>
                <span className="font-semibold text-slate-700 w-24 text-right">฿{formatNumber(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8] bg-white">
          <option value="">ทุกคัน</option>
          {[...vehicles].sort((a, b) => a.code.localeCompare(b.code, 'th')).map(v => <option key={v.id} value={v.id}>คัน {v.code}</option>)}
        </select>
        <span className="text-xs text-slate-400">{rows.length} รายการ</span>
        <button onClick={() => setShowForm(true)}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors">
          <Plus className="w-4 h-4" /> บันทึกการเติม
        </button>
      </div>

      {/* list */}
      {rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Fuel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ยังไม่มีบันทึกการเติมน้ำมัน — กด “บันทึกการเติม”</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(f => {
            const v = vehById.get(f.vehicleId)
            const eff = effMap.get(f.id)
            const abnormal = eff != null && isEfficiencyAbnormal(eff)
            const photos: [string, string][] = [
              [f.receiptPhotoPath, 'ใบกำกับ'], [f.slipPhotoPath, 'สลิป'], [f.gaugePhotoPath, 'หน้าปัด'],
            ]
            return (
              <div key={f.id} className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 w-20 shrink-0">{formatDate(f.date)}</span>
                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-[#1B3A5C] text-white shrink-0">{v?.code || '?'}</span>
                  <span className="font-semibold text-slate-700">฿{formatNumber(f.amount)}</span>
                  <span className="text-xs text-slate-400">· {f.liters} ล. (฿{f.pricePerLiter.toFixed(2)}/ล.)</span>
                  {eff != null && (
                    <span className={cn('text-xs px-1.5 py-0.5 rounded border', abnormal ? 'bg-amber-50 text-amber-700 border-amber-200' : 'text-slate-400 border-slate-200')}
                      title={abnormal ? 'อัตราสิ้นเปลืองผิดปกติ — น่าตรวจสอบ' : undefined}>
                      {eff.toFixed(1)} กม./ล.{abnormal ? ' ⚠️' : ''}
                    </span>
                  )}
                  <span className="flex-1" />
                  {f.paidBy === 'driver' && (
                    f.isReimbursed
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">เบิกแล้ว</span>
                      : <button onClick={() => updateFuelLog(f.id, { isReimbursed: true, reimbursedDate: todayISO() })}
                          className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> ค้างเบิก — กดเมื่อจ่ายคืน
                        </button>
                  )}
                  <button onClick={() => { if (confirm('ลบรายการเติมน้ำมันนี้?')) deleteFuelLog(f.id) }} aria-label="ลบ" className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                  {f.driverId && <span>👤 {driverName(f.driverId)}</span>}
                  {f.station && <span>⛽ {f.station}</span>}
                  {f.odometer > 0 && <span>{formatNumber(f.odometer)} กม.</span>}
                  {f.taxInvoiceNumber && <span className="inline-flex items-center gap-0.5"><Receipt className="w-3 h-3" />{f.taxInvoiceNumber}</span>}
                  {f.expenseId && <span className="text-emerald-600">บันทึกรายจ่ายแล้ว</span>}
                  <span className="flex-1" />
                  {photos.filter(([p]) => p).map(([p, label]) => (
                    <button key={label} onClick={() => viewFleetPhoto(p)} className="text-[#1B3A5C] hover:underline inline-flex items-center gap-0.5">
                      <Camera className="w-3 h-3" />{label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && <FuelFormModal onClose={() => setShowForm(false)} />}
    </div>
  )
}

function FuelFormModal({ onClose }: { onClose: () => void }) {
  const { vehicles, crew, addFuelLog, addExpense } = useStore()
  const activeVehicles = useMemo(() => [...vehicles].filter(v => v.isActive).sort((a, b) => a.code.localeCompare(b.code, 'th')), [vehicles])
  const drivers = useMemo(() => [...crew].sort((a, b) => a.name.localeCompare(b.name, 'th')), [crew])

  const [vehicleId, setVehicleId] = useState(activeVehicles[0]?.id || '')
  const [date, setDate] = useState(todayISO())
  const [liters, setLiters] = useState(0)
  const [amount, setAmount] = useState(0)
  const [odometer, setOdometer] = useState(0)
  const [driverId, setDriverId] = useState('')
  const [station, setStation] = useState('')
  const [fuelType, setFuelType] = useState<string>(FUEL_TYPES[0])
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('')
  const [paidBy, setPaidBy] = useState<FuelPaidBy>('driver')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [gaugeFile, setGaugeFile] = useState<File | null>(null)
  const [asExpense, setAsExpense] = useState(true)
  const [saving, setSaving] = useState(false)

  const pricePerLiter = liters > 0 ? amount / liters : 0

  const save = async () => {
    if (!vehicleId) { alert('กรุณาเลือกคันรถ'); return }
    if (amount <= 0) { alert('กรุณากรอกยอดเงิน'); return }
    setSaving(true)
    const up = async (file: File | null, cat: string): Promise<string> => {
      if (!file) return ''
      try { return await uploadFleetPhoto(file, vehicleId, cat) }
      catch { return '' } // อัปไม่ได้ = บันทึกข้อมูลต่อ (ไม่มีรูป)
    }
    const [receiptPhotoPath, slipPhotoPath, gaugePhotoPath] = await Promise.all([
      up(receiptFile, 'fuel-receipt'), up(slipFile, 'fuel-slip'), up(gaugeFile, 'fuel-gauge'),
    ])
    let expenseId = ''
    if (asExpense && amount > 0) {
      const veh = vehicles.find(v => v.id === vehicleId)
      const exp = addExpense({
        date, category: 'fuel', amount,
        description: `น้ำมัน ${fuelType}${liters > 0 ? ` ${liters} ล.` : ''} คัน ${veh?.code || ''}${station ? ` @${station}` : ''}`,
        reference: taxInvoiceNumber, vehicleId,
      })
      expenseId = exp.id
    }
    addFuelLog({
      vehicleId, date, liters, pricePerLiter, amount, odometer, driverId, station, fuelType,
      taxInvoiceNumber, paidBy, isReimbursed: false, reimbursedDate: '', expenseId,
      receiptPhotoPath, slipPhotoPath, gaugePhotoPath, note: '',
    })
    setSaving(false)
    onClose()
  }

  const fileRow = (label: string, hint: string, file: File | null, setter: (f: File | null) => void) => (
    <div>
      <label className={labelCls}>{label} <span className="text-slate-400">{hint}</span></label>
      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-[#3DD8D8]">
        <Camera className="w-4 h-4 shrink-0" />
        <span className="truncate">{file ? file.name : 'เลือกรูป...'}</span>
        <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => setter(e.target.files?.[0] || null)} />
      </label>
    </div>
  )

  return (
    <Modal open onClose={onClose} title="บันทึกการเติมน้ำมัน" size="lg" closeLabel="cancel">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>คันรถ *</label>
            <select className={inputCls} value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
              {activeVehicles.length === 0 && <option value="">— ไม่มีรถ —</option>}
              {activeVehicles.map(v => <option key={v.id} value={v.id}>คัน {v.code}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>วันที่</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>ยอดเงิน (บาท) *</label>
            <input type="number" className={inputCls} value={amount || ''} onChange={e => setAmount(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
          </div>
          <div>
            <label className={labelCls}>ลิตร</label>
            <input type="number" className={inputCls} value={liters || ''} onChange={e => setLiters(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
          </div>
        </div>
        {pricePerLiter > 0 && <p className="text-xs text-slate-500 -mt-1">≈ ฿{pricePerLiter.toFixed(2)} / ลิตร</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>เลขไมล์ตอนเติม</label>
            <input type="number" className={inputCls} value={odometer || ''} onChange={e => setOdometer(sanitizeNumber(e.target.value))} onKeyDown={blockNumberArrowKeys} onFocus={e => e.currentTarget.select()} />
          </div>
          <div>
            <label className={labelCls}>ประเภทน้ำมัน</label>
            <select className={inputCls} value={fuelType} onChange={e => setFuelType(e.target.value)}>
              {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ปั๊ม</label>
            <input className={inputCls} value={station} onChange={e => setStation(e.target.value)} placeholder="ปตท. ยานนาวา" />
          </div>
          <div>
            <label className={labelCls}>เลขใบกำกับภาษี</label>
            <input className={inputCls} value={taxInvoiceNumber} onChange={e => setTaxInvoiceNumber(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>คนขับ/คนจ่าย</label>
            <select className={inputCls} value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {drivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>จ่ายโดย</label>
            <select className={inputCls} value={paidBy} onChange={e => setPaidBy(e.target.value as FuelPaidBy)}>
              {(Object.keys(FUEL_PAID_BY_CONFIG) as FuelPaidBy[]).map(k => <option key={k} value={k}>{FUEL_PAID_BY_CONFIG[k].label}</option>)}
            </select>
          </div>
        </div>

        {/* หลักฐาน 3 รูป */}
        <div className="rounded-xl border border-slate-200 p-3 space-y-3 bg-slate-50/40">
          <p className="text-xs font-semibold text-slate-500">หลักฐาน (ไม่บังคับ — กันทุจริต)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {fileRow('ใบกำกับภาษี', '', receiptFile, setReceiptFile)}
            {fileRow('สลิปโอนเงิน', '', slipFile, setSlipFile)}
            {fileRow('หน้าปัดเข็มน้ำมัน', '(หลังเติม)', gaugeFile, setGaugeFile)}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={asExpense} onChange={e => setAsExpense(e.target.checked)} className="rounded accent-[#1B3A5C]" />
          บันทึกเป็นรายจ่าย (หมวดค่าน้ำมันรถ) อัตโนมัติ
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors disabled:opacity-60">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
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

async function uploadFleetPhoto(file: File, vehicleId: string, category?: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('vehicleId', vehicleId)
  if (category) fd.append('category', category)
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
