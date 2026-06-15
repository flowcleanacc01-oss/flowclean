'use client'
// 449 — Milk-Run Analytics · แท็บ "สถิติหน้างาน"
//   Phase 1: backfill (reconstruct GPS history → gps_visits/gps_legs) + สรุปข้อมูลที่เก็บ
//   Phase 2/3 (ต่อยอดในไฟล์นี้): สถิติเวลา/dwell/leg · anomaly · เทียบคนขับ · หา route
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { fetchGpsCars, fetchGpsTrips } from '@/lib/gps-service'
import { fetchGpsVisits, fetchGpsLegs, saveReconstructedDay } from '@/lib/supabase-service'
import { reconstructVisitsLegs, type RoundWindow } from '@/lib/visit-reconstruct'
import { normalizePlate } from '@/lib/v2x-types'
import type { LatLng } from '@/lib/geo'
import { cn, todayISO } from '@/lib/utils'
import type { GpsVisit, GpsLeg, Vehicle } from '@/types'
import { Database, Loader2, Play, X, RefreshCw, AlertTriangle, CheckCircle2, Truck, Clock, Route } from 'lucide-react'

/** ไล่วันแบบ TZ-safe (string math · Date.UTC) — from..to รวมปลาย */
function enumerateDays(from: string, to: string): string[] {
  const out: string[] = []
  if (!from || !to || from > to) return out
  const [y0, m0, d0] = from.split('-').map(Number)
  let t = Date.UTC(y0, m0 - 1, d0)
  const end = (() => { const [y, m, d] = to.split('-').map(Number); return Date.UTC(y, m - 1, d) })()
  while (t <= end) {
    const dt = new Date(t)
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`)
    t += 86400000
  }
  return out
}

interface BackfillProgress { done: number; total: number; visits: number; legs: number; errors: number; current: string }

export default function MilkRunTab() {
  const { customers, companyInfo, savedPlaces, rounds, dailyTrips, vehicles, crew } = useStore()

  const [visits, setVisits] = useState<GpsVisit[] | null>(null)
  const [legs, setLegs] = useState<GpsLeg[] | null>(null)
  const [loading, setLoading] = useState(true)

  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 13); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const [to, setTo] = useState(todayISO())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BackfillProgress | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const factory: LatLng | null = useMemo(
    () => (companyInfo.factoryLat || companyInfo.factoryLng) ? { lat: companyInfo.factoryLat, lng: companyInfo.factoryLng } : null,
    [companyInfo.factoryLat, companyInfo.factoryLng])

  const loadStored = useCallback(async () => {
    setLoading(true)
    try {
      const [v, l] = await Promise.all([fetchGpsVisits(), fetchGpsLegs()])
      setVisits(v); setLegs(l)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดข้อมูลสถิติไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStored() }, [loadStored])

  /** หน้าต่างเวลารอบของรถวันนั้น (จากกระดานจ่ายงานจริง → fallback รอบ default ของรถ) */
  const roundWindowsFor = useCallback((vehicleId: string, date: string): RoundWindow[] => {
    const roundById = new Map(rounds.map(r => [r.id, r]))
    const dts = dailyTrips.filter(t => t.date === date && t.vehicleId === vehicleId)
    if (dts.length > 0) {
      return dts.map(dt => {
        const r = roundById.get(dt.roundId)
        return { roundId: dt.roundId, driverId: dt.driverId || r?.defaultDriverId || '', start: r?.startTime || '', end: r?.endTime || '' }
      }).filter(w => w.start)
    }
    return rounds.filter(r => r.defaultVehicleId === vehicleId && r.isActive)
      .map(r => ({ roundId: r.id, driverId: r.defaultDriverId || '', start: r.startTime, end: r.endTime }))
  }, [rounds, dailyTrips])

  const runBackfill = async () => {
    setErr(null); setRunning(true); cancelRef.current = false
    try {
      const cars = await fetchGpsCars()
      const carByNorm = new Map(cars.map(c => [c.plateNorm, c.plate]))
      // รถในฟลีตที่จับคู่ V2X ได้
      const targets: { vehicle: Vehicle; plate: string }[] = vehicles
        .filter(v => v.isActive)
        .map(v => ({ vehicle: v, plate: carByNorm.get(normalizePlate(v.licensePlate)) || '' }))
        .filter(t => t.plate)
      const days = enumerateDays(from, to)
      const total = days.length * targets.length
      if (total === 0) { setErr('ไม่มีรถที่จับคู่ GPS ได้ หรือช่วงวันไม่ถูกต้อง'); setRunning(false); return }
      let done = 0, vTot = 0, lTot = 0, errs = 0
      for (const day of days) {
        for (const { vehicle, plate } of targets) {
          if (cancelRef.current) break
          setProgress({ done, total, visits: vTot, legs: lTot, errors: errs, current: `${day} · คัน ${vehicle.code}` })
          try {
            const trips = await fetchGpsTrips(plate, day)
            const ctx = { date: day, vehicleId: vehicle.id, roundWindows: roundWindowsFor(vehicle.id, day) }
            const { visits: vs, legs: ls } = reconstructVisitsLegs(trips, customers, factory, savedPlaces, ctx)
            await saveReconstructedDay(vehicle.id, day, vs, ls)
            vTot += vs.length; lTot += ls.length
          } catch { errs++ }
          done++
          setProgress({ done, total, visits: vTot, legs: lTot, errors: errs, current: `${day} · คัน ${vehicle.code}` })
        }
        if (cancelRef.current) break
      }
      await loadStored()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'backfill ไม่สำเร็จ')
    } finally { setRunning(false) }
  }

  // สรุปข้อมูลที่เก็บ
  const summary = useMemo(() => {
    if (!visits || !legs) return null
    const dates = new Set<string>(), custs = new Set<string>(), vehs = new Set<string>()
    for (const v of visits) { if (v.date) dates.add(v.date); if (v.customerId) custs.add(v.customerId); if (v.vehicleId) vehs.add(v.vehicleId) }
    for (const l of legs) if (l.date) dates.add(l.date)
    const ds = [...dates].sort()
    return { visits: visits.length, legs: legs.length, customers: custs.size, vehicles: vehs.size, minDate: ds[0] || '', maxDate: ds[ds.length - 1] || '' }
  }, [visits, legs])

  void crew // (Phase 3 — แสดงชื่อคนขับ)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-1.5"><Database className="w-5 h-5 text-[#3DD8D8]" /> สถิติหน้างานขนส่ง (Milk-Run)</h2>
        <p className="text-sm text-slate-500 mt-0.5">สังเคราะห์ GPS ย้อนหลังเป็นสถิติ เวลาถึง/เวลาที่ลูกค้า/เวลาเดินทาง — เลิกเดา ใช้ข้อมูลจริง</p>
      </div>

      {err && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {err}
        </div>
      )}

      {/* สรุปข้อมูลที่เก็บ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Clock} label="การจอดที่ลูกค้า (visit)" value={loading ? '—' : (summary?.visits ?? 0).toLocaleString()} />
        <SummaryCard icon={Route} label="ช่วงเดินทาง (leg)" value={loading ? '—' : (summary?.legs ?? 0).toLocaleString()} />
        <SummaryCard icon={Truck} label="ลูกค้าที่มีสถิติ" value={loading ? '—' : (summary?.customers ?? 0).toLocaleString()} />
        <SummaryCard icon={Database} label="ช่วงข้อมูล" value={loading ? '—' : (summary && summary.minDate ? `${summary.minDate.slice(5)} – ${summary.maxDate.slice(5)}` : 'ยังไม่มี')} />
      </div>

      {/* Backfill */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-700">สังเคราะห์ข้อมูลย้อนหลัง</h3>
          <button onClick={loadStored} disabled={loading || running}
            className="text-xs text-slate-500 hover:text-[#1B3A5C] inline-flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> รีเฟรช
          </button>
        </div>
        <p className="text-xs text-slate-400">
          ดึงเที่ยววิ่ง GPS ของทุกคันในช่วงที่เลือก แล้วแปลงเป็น visit/leg เก็บลงฐานข้อมูล (รันซ้ำได้ — เขียนทับวันเดิม)
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">ตั้งแต่</label>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} disabled={running}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">ถึง</label>
            <input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)} disabled={running}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          {!running ? (
            <button onClick={runBackfill}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#1B3A5C] text-white hover:bg-[#122740] transition-colors inline-flex items-center gap-1.5">
              <Play className="w-4 h-4" /> เริ่มสังเคราะห์
            </button>
          ) : (
            <button onClick={() => { cancelRef.current = true }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5">
              <X className="w-4 h-4" /> หยุด
            </button>
          )}
        </div>

        {progress && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {running ? `กำลังประมวลผล: ${progress.current}` : 'เสร็จสิ้น'}
              </span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#3DD8D8] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> visit {progress.visits.toLocaleString()} · leg {progress.legs.toLocaleString()}</span>
              {progress.errors > 0 && <span className="text-amber-600">ข้าม {progress.errors} (ดึงไม่ได้)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
    </div>
  )
}
