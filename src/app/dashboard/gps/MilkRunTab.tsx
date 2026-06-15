'use client'
// 449 — Milk-Run Analytics · แท็บ "สถิติหน้างาน"
//   Phase 1: backfill (reconstruct GPS history → gps_visits/gps_legs) + สรุปข้อมูลที่เก็บ
//   Phase 2/3 (ต่อยอดในไฟล์นี้): สถิติเวลา/dwell/leg · anomaly · เทียบคนขับ · หา route
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { fetchGpsCars, fetchGpsTrips } from '@/lib/gps-service'
import { fetchGpsVisits, fetchGpsLegs, saveReconstructedDay } from '@/lib/supabase-service'
import { reconstructVisitsLegs, type RoundWindow } from '@/lib/visit-reconstruct'
import { customerStats, legStats, arrivalVsWindow, minToHHMM, type Dist } from '@/lib/visit-stats'
import { detectAnomalies, driverScores, routeOpportunities } from '@/lib/visit-anomaly'
import { normalizePlate } from '@/lib/v2x-types'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { LatLng } from '@/lib/geo'
import { cn, todayISO } from '@/lib/utils'
import type { GpsVisit, GpsLeg, Vehicle } from '@/types'
import { Database, Loader2, Play, X, RefreshCw, AlertTriangle, CheckCircle2, Truck, Clock, Route, Search } from 'lucide-react'

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

  // ── Phase 2/3: สถิติ baseline + วิเคราะห์ ──
  const [statView, setStatView] = useState<'customer' | 'leg' | 'driver' | 'insight'>('customer')
  const [statSearch, setStatSearch] = useState('')
  const custById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers])
  const custStats = useMemo(() => (visits ? customerStats(visits) : []), [visits])
  const lgStats = useMemo(() => (legs ? legStats(legs) : []), [legs])

  const custName = useCallback((id: string) => {
    const c = custById.get(id)
    return c ? (c.shortName || c.name) : id
  }, [custById])

  const filteredCustStats = useMemo(() => {
    if (!statSearch.trim()) return custStats
    return custStats.filter(s => {
      const c = custById.get(s.customerId)
      return matchesThaiQueryAnyField([c?.shortName, c?.name, c?.customerCode, s.customerId], statSearch)
    })
  }, [custStats, statSearch, custById])

  const filteredLegStats = useMemo(() => {
    if (!statSearch.trim()) return lgStats
    return lgStats.filter(s => matchesThaiQueryAnyField([custName(s.fromCustomerId), custName(s.toCustomerId), s.fromName, s.toName], statSearch))
  }, [lgStats, statSearch, custName])

  // ── Phase 3: anomaly + เทียบคนขับ + หา route ──
  const drvScores = useMemo(() => (visits && legs ? driverScores(visits, legs) : []), [visits, legs])
  const anomalies = useMemo(() => (visits && legs ? detectAnomalies(visits, legs) : []), [visits, legs])
  const routeOpps = useMemo(() => (legs ? routeOpportunities(legs) : []), [legs])
  const drvName = useCallback((id: string) => crew.find(c => c.id === id)?.name || (id ? `คนขับ ${id.slice(0, 4)}` : 'ไม่ระบุ'), [crew])

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

      {/* ── Phase 2: สถิติ baseline ── */}
      {!loading && (custStats.length > 0 || lgStats.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1 flex-wrap">
              {([['customer', 'ตามลูกค้า'], ['leg', 'ช่วงเดินทาง A→B'], ['driver', 'เทียบคนขับ'], ['insight', 'ข้อค้นพบ']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setStatView(k)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1',
                    statView === k ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                  {label}
                  {k === 'insight' && anomalies.length > 0 && <span className={cn('px-1 rounded-full text-[10px]', statView === k ? 'bg-white/25' : 'bg-rose-100 text-rose-700')}>{anomalies.length}</span>}
                </button>
              ))}
            </div>
            {(statView === 'customer' || statView === 'leg') && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input value={statSearch} onChange={e => setStatSearch(e.target.value)} placeholder="ค้นหาลูกค้า"
                  className="border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-sm w-44" />
              </div>
            )}
          </div>

          {statView === 'customer' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
                    <th className="px-3 py-2 text-right font-medium">ครั้ง</th>
                    <th className="px-3 py-2 text-right font-medium">เวลาถึง (ปกติ)</th>
                    <th className="px-3 py-2 text-right font-medium">ใช้เวลา (dwell)</th>
                    <th className="px-3 py-2 text-right font-medium">เวลาออก</th>
                    <th className="px-3 py-2 text-center font-medium">เทียบแผน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustStats.map(s => {
                    const c = custById.get(s.customerId)
                    const cmp = c ? arrivalVsWindow(s.arrive.median, s.arrive.n, c.pickupWindowStart || '', c.pickupWindowEnd || '') : null
                    return (
                      <tr key={s.customerId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-700">{custName(s.customerId)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{s.visits}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap"><TimeDist d={s.arrive} kind="time" /></td>
                        <td className="px-3 py-2 text-right whitespace-nowrap"><TimeDist d={s.dwell} kind="dur" /></td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">{s.depart.n > 0 ? minToHHMM(s.depart.median) : '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {cmp === 'in' && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">ตรงเวลา</span>}
                          {cmp === 'after' && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700">สายกว่ากำหนด</span>}
                          {cmp === 'before' && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700">ถึงก่อนกำหนด</span>}
                          {cmp === null && <span className="text-slate-300 text-[11px]">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredCustStats.length === 0 && <p className="text-center text-slate-400 text-sm py-6">ไม่พบลูกค้าที่ค้นหา</p>}
            </div>
          ) : statView === 'leg' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <th className="px-3 py-2 text-left font-medium">ช่วงเดินทาง</th>
                    <th className="px-3 py-2 text-right font-medium">ครั้ง</th>
                    <th className="px-3 py-2 text-right font-medium">เวลาเดินทาง (ปกติ)</th>
                    <th className="px-3 py-2 text-right font-medium">ระยะ (กม.)</th>
                    <th className="px-3 py-2 text-right font-medium">น้ำมัน (ล.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLegStats.map(s => (
                    <tr key={`${s.fromCustomerId}>${s.toCustomerId}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{custName(s.fromCustomerId)} <span className="text-slate-300">→</span> {custName(s.toCustomerId)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{s.trips}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap"><TimeDist d={s.travel} kind="dur" /></td>
                      <td className="px-3 py-2 text-right text-slate-600">{s.km.median.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{s.fuel.median > 0 ? s.fuel.median.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredLegStats.length === 0 && <p className="text-center text-slate-400 text-sm py-6">ไม่พบช่วงเดินทางที่ค้นหา</p>}
            </div>
          ) : statView === 'driver' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <th className="px-3 py-2 text-left font-medium">คนขับ</th>
                    <th className="px-3 py-2 text-right font-medium" title="คะแนนขับขี่จาก V2X (median)">คะแนนขับขี่</th>
                    <th className="px-3 py-2 text-right font-medium">เที่ยว</th>
                    <th className="px-3 py-2 text-right font-medium" title="เวลาเดินทางต่อ leg (median)">เวลาเดินทาง</th>
                    <th className="px-3 py-2 text-right font-medium" title="เวลาที่ลูกค้า (median)">dwell</th>
                    <th className="px-3 py-2 text-right font-medium">กม./ล.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drvScores.map((s, i) => (
                    <tr key={s.driverId} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                        {i === 0 && drvScores.length > 1 && <span className="mr-1" title="คะแนนขับขี่สูงสุด">🏆</span>}{drvName(s.driverId)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold', s.drivingScore >= 90 ? 'text-emerald-600' : s.drivingScore >= 70 ? 'text-amber-600' : s.drivingScore > 0 ? 'text-rose-600' : 'text-slate-300')}>
                        {s.drivingScore > 0 ? s.drivingScore.toFixed(0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">{s.legs}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{s.travelMedian > 0 ? `${Math.round(s.travelMedian)} น.` : '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{s.dwellMedian > 0 ? `${Math.round(s.dwellMedian)} น.` : '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{s.kmPerL > 0 ? s.kmPerL.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {drvScores.length === 0 && <p className="text-center text-slate-400 text-sm py-6">ยังไม่มีข้อมูลคนขับ — ใบงาน (กระดานจ่ายงาน) ช่วยระบุคนขับให้แต่ละเที่ยว</p>}
            </div>
          ) : (
            // insight: ข้อค้นพบ (anomaly + โอกาสประหยัดเวลา)
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> ผิดปกติ — นาน/ช้ากว่าปกติ ({anomalies.length})</h4>
                {anomalies.length === 0 ? (
                  <p className="text-xs text-slate-400">ไม่พบความผิดปกติ — ทุกอย่างอยู่ในช่วงปกติ 👍</p>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg max-h-72 overflow-auto">
                    {anomalies.slice(0, 50).map((a, i) => (
                      <li key={i} className="px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
                        <span className="text-slate-400 w-16 shrink-0 text-xs">{a.date.slice(5)}</span>
                        <span className="font-medium text-slate-700">
                          {a.kind === 'dwell' ? `จอดที่ ${custName(a.customerId)}` : `${custName(a.fromCustomerId)} → ${custName(a.toCustomerId)}`}
                        </span>
                        <span className="text-rose-600 font-semibold">{Math.round(a.value)} น.</span>
                        <span className="text-slate-400 text-xs">(ปกติ ~{Math.round(a.median)} น.)</span>
                        {a.driverId && <span className="text-slate-400 text-xs ml-auto">{drvName(a.driverId)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5"><Route className="w-3.5 h-3.5 text-[#3DD8D8]" /> โอกาสประหยัดเวลา — เคยทำได้เร็วกว่า ({routeOpps.length})</h4>
                {routeOpps.length === 0 ? (
                  <p className="text-xs text-slate-400">ยังไม่พบช่วงที่แปรปรวนชัดเจน (ต้องมีข้อมูลพอ)</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs">
                          <th className="px-3 py-2 text-left font-medium">ช่วงเดินทาง</th>
                          <th className="px-3 py-2 text-right font-medium">เที่ยว</th>
                          <th className="px-3 py-2 text-right font-medium">ปกติ</th>
                          <th className="px-3 py-2 text-right font-medium">เคยทำได้</th>
                          <th className="px-3 py-2 text-right font-medium" title="ประหยัดได้ต่อเที่ยว × จำนวนเที่ยว">ประหยัดได้</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {routeOpps.slice(0, 30).map(s => (
                          <tr key={`${s.fromCustomerId}>${s.toCustomerId}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{custName(s.fromCustomerId)} <span className="text-slate-300">→</span> {custName(s.toCustomerId)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{s.trips}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{Math.round(s.median)} น.</td>
                            <td className="px-3 py-2 text-right text-emerald-600 font-medium">{Math.round(s.fast)} น.</td>
                            <td className="px-3 py-2 text-right text-[#1B3A5C] font-semibold">~{Math.round(s.savingTotal)} น.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          {(statView === 'customer' || statView === 'leg') && (
            <p className="text-[11px] text-slate-400">
              ค่ากลาง (median) = เวลาส่วนมาก · วงเล็บ = ช่วงปกติ (25–75%) · ตัดค่าผิดปกติออกแล้ว
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** แสดงการกระจาย: median เด่น + ช่วง p25–p75 ในวงเล็บ · kind=time (HH:MM) | dur (นาที) */
function TimeDist({ d, kind }: { d: Dist; kind: 'time' | 'dur' }) {
  if (d.n === 0) return <span className="text-slate-300">—</span>
  const fmt = (m: number) => (kind === 'time' ? minToHHMM(m) : `${Math.round(m)}`)
  return (
    <span>
      <span className="font-semibold text-slate-700">{fmt(d.median)}{kind === 'dur' && ' น.'}</span>
      {(d.p25 !== d.p75) && <span className="text-[11px] text-slate-400"> ({fmt(d.p25)}–{fmt(d.p75)})</span>}
    </span>
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
