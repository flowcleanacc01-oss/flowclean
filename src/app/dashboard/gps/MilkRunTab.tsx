'use client'
// 449 — Milk-Run Analytics · แท็บ "สถิติหน้างาน"
//   Phase 1: backfill (reconstruct GPS history → gps_visits/gps_legs) + สรุปข้อมูลที่เก็บ
//   Phase 2/3 (ต่อยอดในไฟล์นี้): สถิติเวลา/dwell/leg · anomaly · เทียบคนขับ · หา route
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { fetchGpsCars, fetchGpsTrips } from '@/lib/gps-service'
import { fetchGpsVisits, fetchGpsLegs, saveReconstructedDay } from '@/lib/supabase-service'
import { reconstructVisitsLegs, type RoundWindow } from '@/lib/visit-reconstruct'
import { customerStats, legStats, arrivalVsWindow, minToHHMM, type Dist, type CustomerStat, type LegStat } from '@/lib/visit-stats'
import { detectAnomalies, driverScores, routeOpportunities, detectRevisits, revisitsByCustomer, type Anomaly, type DriverScore, type RouteOpportunity, type RevisitIncident, type RevisitCustomerSummary } from '@/lib/visit-anomaly'
import { normalizePlate } from '@/lib/v2x-types'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import { exportCSV } from '@/lib/export'
import type { LatLng } from '@/lib/geo'
import { cn, todayISO } from '@/lib/utils'
import type { GpsVisit, GpsLeg, Vehicle } from '@/types'
import { Database, Loader2, Play, X, RefreshCw, AlertTriangle, CheckCircle2, Truck, Clock, Route, Search, FileSpreadsheet, Repeat } from 'lucide-react'

// 451 — เรียงทุกคอลัมน์ + export CSV (theme เดียวกับรายงานอื่น: SortHeader ลูกศร ↑↓ สี accent + exportCSV BOM)
type SortDir = 'asc' | 'desc'

/** เรียง rows ตาม getter · ค่าว่าง (NaN/'') จมท้ายเสมอไม่ว่า asc/desc · string เทียบแบบไทย */
function sortRows<T>(rows: T[], get: (x: T) => number | string, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b)
    const ea = va === '' || (typeof va === 'number' && Number.isNaN(va))
    const eb = vb === '' || (typeof vb === 'number' && Number.isNaN(vb))
    if (ea && eb) return 0
    if (ea) return 1
    if (eb) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'th')
    return dir === 'asc' ? cmp : -cmp
  })
}

/** state เรียงคอลัมน์ — กดคอลัมน์เดิม=สลับทิศ · คอลัมน์ใหม่=เริ่ม desc */
function useSort<C extends string>(initialCol: C, initialDir: SortDir = 'desc') {
  const [col, setCol] = useState<C>(initialCol)
  const [dir, setDir] = useState<SortDir>(initialDir)
  const onSort = useCallback((c: C) => {
    if (c === col) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setCol(c); setDir('desc') }
  }, [col])
  return { col, dir, onSort }
}

const PLAN_LABEL = { after: 'สายกว่ากำหนด', before: 'ถึงก่อนกำหนด', in: 'ตรงเวลา' } as const
const PLAN_RANK = { after: 3, before: 2, in: 1 } as const

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
  const [statView, setStatView] = useState<'customer' | 'leg' | 'driver' | 'insight' | 'revisit'>('customer')
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

  // ── 469: งานซ้ำซ้อน — วนกลับเข้าลูกค้ารายเดิมในเที่ยวเดียว ──
  const revisits = useMemo(() => (visits && legs ? detectRevisits(visits, legs) : []), [visits, legs])
  const revisitCust = useMemo(() => revisitsByCustomer(revisits), [revisits])

  // ── 451: เรียงทุกคอลัมน์ + export CSV ──
  const planOf = useCallback((s: CustomerStat) => {
    const c = custById.get(s.customerId)
    return c ? arrivalVsWindow(s.arrive.median, s.arrive.n, c.pickupWindowStart || '', c.pickupWindowEnd || '') : null
  }, [custById])
  const maxDrivingScore = useMemo(() => drvScores.reduce((m, s) => Math.max(m, s.drivingScore), 0), [drvScores])
  const anomalyPlace = useCallback((a: Anomaly) => a.kind === 'dwell'
    ? custName(a.customerId)
    : `${custName(a.fromCustomerId)} → ${custName(a.toCustomerId)}`, [custName])
  const anomalyKind = (a: Anomaly) => (a.kind === 'dwell' ? 'จอดที่ลูกค้า' : 'เดินทาง')

  type CustCol = 'name' | 'visits' | 'arrive' | 'dwell' | 'depart' | 'plan'
  type LegCol = 'pair' | 'trips' | 'travel' | 'km' | 'fuel'
  type DrvCol = 'name' | 'score' | 'legs' | 'travel' | 'dwell' | 'kmL'
  type AnoCol = 'date' | 'kind' | 'place' | 'value' | 'median' | 'diff' | 'driver'
  type OppCol = 'pair' | 'trips' | 'median' | 'fast' | 'saving'
  type RevCol = 'date' | 'cust' | 'driver' | 'first' | 'revisit' | 'stops' | 'km' | 'min'
  type RevCustCol = 'name' | 'incidents' | 'km' | 'min' | 'date'
  const custSort = useSort<CustCol>('visits')
  const legSort = useSort<LegCol>('trips')
  const drvSort = useSort<DrvCol>('score')
  const anoSort = useSort<AnoCol>('value')
  const oppSort = useSort<OppCol>('saving')
  const revSort = useSort<RevCol>('date')
  const revCustSort = useSort<RevCustCol>('incidents')

  const sortedCustStats = useMemo(() => sortRows(filteredCustStats, (s: CustomerStat) => {
    switch (custSort.col) {
      case 'name': return custName(s.customerId)
      case 'visits': return s.visits
      case 'arrive': return s.arrive.n > 0 ? s.arrive.median : NaN
      case 'dwell': return s.dwell.n > 0 ? s.dwell.median : NaN
      case 'depart': return s.depart.n > 0 ? s.depart.median : NaN
      case 'plan': { const p = planOf(s); return p ? PLAN_RANK[p] : NaN }
      default: return ''
    }
  }, custSort.dir), [filteredCustStats, custSort.col, custSort.dir, custName, planOf])

  const sortedLegStats = useMemo(() => sortRows(filteredLegStats, (s: LegStat) => {
    switch (legSort.col) {
      case 'pair': return `${custName(s.fromCustomerId)} → ${custName(s.toCustomerId)}`
      case 'trips': return s.trips
      case 'travel': return s.travel.n > 0 ? s.travel.median : NaN
      case 'km': return s.km.n > 0 ? s.km.median : NaN
      case 'fuel': return s.fuel.median > 0 ? s.fuel.median : NaN
      default: return ''
    }
  }, legSort.dir), [filteredLegStats, legSort.col, legSort.dir, custName])

  const sortedDrvScores = useMemo(() => sortRows(drvScores, (s: DriverScore) => {
    switch (drvSort.col) {
      case 'name': return drvName(s.driverId)
      case 'score': return s.drivingScore > 0 ? s.drivingScore : NaN
      case 'legs': return s.legs
      case 'travel': return s.travelMedian > 0 ? s.travelMedian : NaN
      case 'dwell': return s.dwellMedian > 0 ? s.dwellMedian : NaN
      case 'kmL': return s.kmPerL > 0 ? s.kmPerL : NaN
      default: return ''
    }
  }, drvSort.dir), [drvScores, drvSort.col, drvSort.dir, drvName])

  const sortedAnomalies = useMemo(() => sortRows(anomalies, (a: Anomaly) => {
    switch (anoSort.col) {
      case 'date': return a.date
      case 'kind': return anomalyKind(a)
      case 'place': return anomalyPlace(a)
      case 'value': return a.value
      case 'median': return a.median
      case 'diff': return a.value - a.median
      case 'driver': return drvName(a.driverId)
      default: return ''
    }
  }, anoSort.dir), [anomalies, anoSort.col, anoSort.dir, anomalyPlace, drvName])

  const sortedOpps = useMemo(() => sortRows(routeOpps, (s: RouteOpportunity) => {
    switch (oppSort.col) {
      case 'pair': return `${custName(s.fromCustomerId)} → ${custName(s.toCustomerId)}`
      case 'trips': return s.trips
      case 'median': return s.median
      case 'fast': return s.fast
      case 'saving': return s.savingTotal
      default: return ''
    }
  }, oppSort.dir), [routeOpps, oppSort.col, oppSort.dir, custName])

  const hhmm = (dt: string) => dt.slice(11, 16)   // "yyyy-mm-dd HH:MM:SS" → "HH:MM"
  const sortedRevisits = useMemo(() => sortRows(revisits, (r: RevisitIncident) => {
    switch (revSort.col) {
      case 'date': return r.date
      case 'cust': return custName(r.customerId)
      case 'driver': return drvName(r.driverId)
      case 'first': return r.firstArrive
      case 'revisit': return r.revisitArrive
      case 'stops': return r.otherStops
      case 'km': return r.loopKm
      case 'min': return r.loopMin
      default: return ''
    }
  }, revSort.dir), [revisits, revSort.col, revSort.dir, custName, drvName])

  const sortedRevisitCust = useMemo(() => sortRows(revisitCust, (s: RevisitCustomerSummary) => {
    switch (revCustSort.col) {
      case 'name': return custName(s.customerId)
      case 'incidents': return s.incidents
      case 'km': return s.loopKmTotal
      case 'min': return s.loopMinTotal
      case 'date': return s.lastDate
      default: return ''
    }
  }, revCustSort.dir), [revisitCust, revCustSort.col, revCustSort.dir, custName])

  const revisitKmTotal = useMemo(() => revisits.reduce((s, r) => s + r.loopKm, 0), [revisits])

  const exportRange = `${from}_${to}`
  const exportCust = () => {
    if (sortedCustStats.length === 0) return
    const headers = ['ลูกค้า', 'ครั้ง', 'เวลาถึง (ปกติ)', 'ใช้เวลา dwell (น.)', 'เวลาออก', 'เทียบแผน']
    exportCSV(headers, sortedCustStats.map(s => {
      const p = planOf(s)
      return [custName(s.customerId), String(s.visits),
        s.arrive.n > 0 ? minToHHMM(s.arrive.median) : '',
        s.dwell.n > 0 ? String(Math.round(s.dwell.median)) : '',
        s.depart.n > 0 ? minToHHMM(s.depart.median) : '',
        p ? PLAN_LABEL[p] : '']
    }), `สถิติหน้างาน_ตามลูกค้า_${exportRange}`)
  }
  const exportLeg = () => {
    if (sortedLegStats.length === 0) return
    const headers = ['ช่วงเดินทาง', 'ครั้ง', 'เวลาเดินทาง (น.)', 'ระยะ (กม.)', 'น้ำมัน (ล.)']
    exportCSV(headers, sortedLegStats.map(s => [
      `${custName(s.fromCustomerId)} → ${custName(s.toCustomerId)}`, String(s.trips),
      s.travel.n > 0 ? String(Math.round(s.travel.median)) : '',
      s.km.n > 0 ? s.km.median.toFixed(1) : '',
      s.fuel.median > 0 ? s.fuel.median.toFixed(2) : '']),
      `สถิติหน้างาน_ช่วงเดินทาง_${exportRange}`)
  }
  const exportDriver = () => {
    if (sortedDrvScores.length === 0) return
    const headers = ['คนขับ', 'คะแนนขับขี่', 'เที่ยว', 'เวลาเดินทาง (น.)', 'dwell (น.)', 'กม./ล.']
    exportCSV(headers, sortedDrvScores.map(s => [
      drvName(s.driverId),
      s.drivingScore > 0 ? s.drivingScore.toFixed(0) : '',
      String(s.legs),
      s.travelMedian > 0 ? String(Math.round(s.travelMedian)) : '',
      s.dwellMedian > 0 ? String(Math.round(s.dwellMedian)) : '',
      s.kmPerL > 0 ? s.kmPerL.toFixed(1) : '']),
      `สถิติหน้างาน_เทียบคนขับ_${exportRange}`)
  }
  const exportAnomalies = () => {
    if (sortedAnomalies.length === 0) return
    const headers = ['วันที่', 'ประเภท', 'จุด/ช่วง', 'จริง (น.)', 'ปกติ (น.)', 'ส่วนต่าง (น.)', 'คนขับ']
    exportCSV(headers, sortedAnomalies.map(a => [
      a.date, anomalyKind(a), anomalyPlace(a),
      String(Math.round(a.value)), String(Math.round(a.median)),
      String(Math.round(a.value - a.median)), a.driverId ? drvName(a.driverId) : '']),
      `สถิติหน้างาน_ผิดปกติ_${exportRange}`)
  }
  const exportOpps = () => {
    if (sortedOpps.length === 0) return
    const headers = ['ช่วงเดินทาง', 'เที่ยว', 'ปกติ (น.)', 'เคยทำได้ (น.)', 'ประหยัดได้ (น.)']
    exportCSV(headers, sortedOpps.map(s => [
      `${custName(s.fromCustomerId)} → ${custName(s.toCustomerId)}`, String(s.trips),
      String(Math.round(s.median)), String(Math.round(s.fast)), String(Math.round(s.savingTotal))]),
      `สถิติหน้างาน_โอกาสประหยัด_${exportRange}`)
  }
  const exportRevisitCust = () => {
    if (sortedRevisitCust.length === 0) return
    const headers = ['ลูกค้า', 'ครั้งที่วนกลับ', 'รวมระยะวน (กม.)', 'รวมเวลาวน (น.)', 'จุดแวะคั่นรวม', 'ครั้งล่าสุด']
    exportCSV(headers, sortedRevisitCust.map(s => [
      custName(s.customerId), String(s.incidents),
      s.loopKmTotal.toFixed(1), String(Math.round(s.loopMinTotal)),
      String(s.otherStopsTotal), s.lastDate]),
      `สถิติหน้างาน_งานซ้ำซ้อน_ตามลูกค้า_${exportRange}`)
  }
  const exportRevisits = () => {
    if (sortedRevisits.length === 0) return
    const headers = ['วันที่', 'ลูกค้า', 'คนขับ', 'เข้าครั้งแรก', 'วนกลับ', 'แวะคั่น (จุด)', 'ระยะวน (กม.)', 'เวลาวน (น.)']
    exportCSV(headers, sortedRevisits.map(r => [
      r.date, custName(r.customerId), r.driverId ? drvName(r.driverId) : '',
      hhmm(r.firstArrive), hhmm(r.revisitArrive), String(r.otherStops),
      r.loopKm.toFixed(1), String(Math.round(r.loopMin))]),
      `สถิติหน้างาน_งานซ้ำซ้อน_${exportRange}`)
  }

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
              {([['customer', 'ตามลูกค้า'], ['leg', 'ช่วงเดินทาง A→B'], ['driver', 'เทียบคนขับ'], ['insight', 'ข้อค้นพบ'], ['revisit', 'งานซ้ำซ้อน']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setStatView(k)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1',
                    statView === k ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                  {label}
                  {k === 'insight' && anomalies.length > 0 && <span className={cn('px-1 rounded-full text-[10px]', statView === k ? 'bg-white/25' : 'bg-rose-100 text-rose-700')}>{anomalies.length}</span>}
                  {k === 'revisit' && revisits.length > 0 && <span className={cn('px-1 rounded-full text-[10px]', statView === k ? 'bg-white/25' : 'bg-amber-100 text-amber-700')}>{revisits.length}</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {(statView === 'customer' || statView === 'leg') && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={statSearch} onChange={e => setStatSearch(e.target.value)} placeholder="ค้นหาลูกค้า"
                    className="border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-sm w-44" />
                </div>
              )}
              {/* 451 — Export CSV (insight/revisit มี 2 ชุดข้อมูล → ปุ่มแยกในแต่ละส่วน) */}
              {statView !== 'insight' && statView !== 'revisit' && (
                <button onClick={statView === 'customer' ? exportCust : statView === 'leg' ? exportLeg : exportDriver}
                  disabled={(statView === 'customer' ? sortedCustStats : statView === 'leg' ? sortedLegStats : sortedDrvScores).length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                </button>
              )}
            </div>
          </div>

          {statView === 'customer' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <SortHeader col="name" label="ลูกค้า" active={custSort.col === 'name'} dir={custSort.dir} onSort={custSort.onSort} className="text-left" />
                    <SortHeader col="visits" label="ครั้ง" active={custSort.col === 'visits'} dir={custSort.dir} onSort={custSort.onSort} />
                    <SortHeader col="arrive" label="เวลาถึง (ปกติ)" active={custSort.col === 'arrive'} dir={custSort.dir} onSort={custSort.onSort} />
                    <SortHeader col="dwell" label="ใช้เวลา (dwell)" active={custSort.col === 'dwell'} dir={custSort.dir} onSort={custSort.onSort} />
                    <SortHeader col="depart" label="เวลาออก" active={custSort.col === 'depart'} dir={custSort.dir} onSort={custSort.onSort} />
                    <SortHeader col="plan" label="เทียบแผน" active={custSort.col === 'plan'} dir={custSort.dir} onSort={custSort.onSort} className="text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedCustStats.map(s => {
                    const cmp = planOf(s)
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
              {sortedCustStats.length === 0 && <p className="text-center text-slate-400 text-sm py-6">ไม่พบลูกค้าที่ค้นหา</p>}
            </div>
          ) : statView === 'leg' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <SortHeader col="pair" label="ช่วงเดินทาง" active={legSort.col === 'pair'} dir={legSort.dir} onSort={legSort.onSort} className="text-left" />
                    <SortHeader col="trips" label="ครั้ง" active={legSort.col === 'trips'} dir={legSort.dir} onSort={legSort.onSort} />
                    <SortHeader col="travel" label="เวลาเดินทาง (ปกติ)" active={legSort.col === 'travel'} dir={legSort.dir} onSort={legSort.onSort} />
                    <SortHeader col="km" label="ระยะ (กม.)" active={legSort.col === 'km'} dir={legSort.dir} onSort={legSort.onSort} />
                    <SortHeader col="fuel" label="น้ำมัน (ล.)" active={legSort.col === 'fuel'} dir={legSort.dir} onSort={legSort.onSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedLegStats.map(s => (
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
              {sortedLegStats.length === 0 && <p className="text-center text-slate-400 text-sm py-6">ไม่พบช่วงเดินทางที่ค้นหา</p>}
            </div>
          ) : statView === 'driver' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs">
                    <SortHeader col="name" label="คนขับ" active={drvSort.col === 'name'} dir={drvSort.dir} onSort={drvSort.onSort} className="text-left" />
                    <SortHeader col="score" label="คะแนนขับขี่" active={drvSort.col === 'score'} dir={drvSort.dir} onSort={drvSort.onSort} title="คะแนนขับขี่จาก V2X (median)" />
                    <SortHeader col="legs" label="เที่ยว" active={drvSort.col === 'legs'} dir={drvSort.dir} onSort={drvSort.onSort} />
                    <SortHeader col="travel" label="เวลาเดินทาง" active={drvSort.col === 'travel'} dir={drvSort.dir} onSort={drvSort.onSort} title="เวลาเดินทางต่อ leg (median)" />
                    <SortHeader col="dwell" label="dwell" active={drvSort.col === 'dwell'} dir={drvSort.dir} onSort={drvSort.onSort} title="เวลาที่ลูกค้า (median)" />
                    <SortHeader col="kmL" label="กม./ล." active={drvSort.col === 'kmL'} dir={drvSort.dir} onSort={drvSort.onSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedDrvScores.map(s => (
                    <tr key={s.driverId} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                        {s.drivingScore === maxDrivingScore && maxDrivingScore > 0 && drvScores.length > 1 && <span className="mr-1" title="คะแนนขับขี่สูงสุด">🏆</span>}{drvName(s.driverId)}
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
          ) : statView === 'insight' ? (
            // insight: ข้อค้นพบ (anomaly + โอกาสประหยัดเวลา) — 451: ตารางเรียงได้ + export ทั้ง 2 ชุด
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> ผิดปกติ — นาน/ช้ากว่าปกติ ({anomalies.length})</h4>
                  {sortedAnomalies.length > 0 && (
                    <button onClick={exportAnomalies}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200 whitespace-nowrap">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                    </button>
                  )}
                </div>
                {anomalies.length === 0 ? (
                  <p className="text-xs text-slate-400">ไม่พบความผิดปกติ — ทุกอย่างอยู่ในช่วงปกติ 👍</p>
                ) : (
                  <div className="border border-slate-100 rounded-lg max-h-72 overflow-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50 text-slate-500 text-xs">
                          <SortHeader col="date" label="วันที่" active={anoSort.col === 'date'} dir={anoSort.dir} onSort={anoSort.onSort} className="text-left" />
                          <SortHeader col="kind" label="ประเภท" active={anoSort.col === 'kind'} dir={anoSort.dir} onSort={anoSort.onSort} className="text-left" />
                          <SortHeader col="place" label="จุด/ช่วง" active={anoSort.col === 'place'} dir={anoSort.dir} onSort={anoSort.onSort} className="text-left" />
                          <SortHeader col="value" label="จริง" active={anoSort.col === 'value'} dir={anoSort.dir} onSort={anoSort.onSort} />
                          <SortHeader col="median" label="ปกติ" active={anoSort.col === 'median'} dir={anoSort.dir} onSort={anoSort.onSort} />
                          <SortHeader col="diff" label="ส่วนต่าง" active={anoSort.col === 'diff'} dir={anoSort.dir} onSort={anoSort.onSort} title="ช้ากว่าปกติเท่าไร" />
                          <SortHeader col="driver" label="คนขับ" active={anoSort.col === 'driver'} dir={anoSort.dir} onSort={anoSort.onSort} className="text-left" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedAnomalies.map((a, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{a.date.slice(5)}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{anomalyKind(a)}</td>
                            <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{anomalyPlace(a)}</td>
                            <td className="px-3 py-2 text-right text-rose-600 font-semibold whitespace-nowrap">{Math.round(a.value)} น.</td>
                            <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{Math.round(a.median)} น.</td>
                            <td className="px-3 py-2 text-right text-rose-500 font-medium whitespace-nowrap">+{Math.round(a.value - a.median)} น.</td>
                            <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{a.driverId ? drvName(a.driverId) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Route className="w-3.5 h-3.5 text-[#3DD8D8]" /> โอกาสประหยัดเวลา — เคยทำได้เร็วกว่า ({routeOpps.length})</h4>
                  {sortedOpps.length > 0 && (
                    <button onClick={exportOpps}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200 whitespace-nowrap">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                    </button>
                  )}
                </div>
                {routeOpps.length === 0 ? (
                  <p className="text-xs text-slate-400">ยังไม่พบช่วงที่แปรปรวนชัดเจน (ต้องมีข้อมูลพอ)</p>
                ) : (
                  <div className="border border-slate-100 rounded-lg max-h-72 overflow-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50 text-slate-500 text-xs">
                          <SortHeader col="pair" label="ช่วงเดินทาง" active={oppSort.col === 'pair'} dir={oppSort.dir} onSort={oppSort.onSort} className="text-left" />
                          <SortHeader col="trips" label="เที่ยว" active={oppSort.col === 'trips'} dir={oppSort.dir} onSort={oppSort.onSort} />
                          <SortHeader col="median" label="ปกติ" active={oppSort.col === 'median'} dir={oppSort.dir} onSort={oppSort.onSort} />
                          <SortHeader col="fast" label="เคยทำได้" active={oppSort.col === 'fast'} dir={oppSort.dir} onSort={oppSort.onSort} />
                          <SortHeader col="saving" label="ประหยัดได้" active={oppSort.col === 'saving'} dir={oppSort.dir} onSort={oppSort.onSort} title="ประหยัดได้ต่อเที่ยว × จำนวนเที่ยว" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedOpps.map(s => (
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
          ) : (
            // 469: งานซ้ำซ้อน — วนกลับเข้าลูกค้ารายเดิมในเที่ยวเดียว (ยังไม่กลับโรงงาน)
            <div className="space-y-4">
              <p className="text-xs text-slate-500 -mt-1">
                ลูกค้าที่คนขับต้อง<span className="font-semibold text-amber-700">วนกลับเข้าซ้ำในเที่ยวเดียว</span> (ยังไม่กลับโรงงาน) — มักเกิดจากเข้าครั้งแรกแล้วงานไม่เสร็จ = เสียเที่ยวเปล่า
              </p>
              {!factory && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> ยังไม่ได้ตั้งพิกัดโรงงาน (ตั้งค่า → ข้อมูลบริษัท) — แยก “เที่ยว” ไม่ได้ จึงวิเคราะห์งานซ้ำซ้อนไม่ได้
                </div>
              )}
              {revisits.length === 0 ? (
                factory ? <p className="text-xs text-slate-400">ไม่พบการวนกลับเข้าซ้ำในเที่ยวเดียว 👍</p> : null
              ) : (
                <>
                  {/* สรุปต่อลูกค้า — ลูกค้าปัญหาเรื้อรัง (action view) */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Repeat className="w-3.5 h-3.5 text-amber-500" /> ลูกค้าที่ต้องวนกลับบ่อย ({revisitCust.length}) · รวม {revisits.length} ครั้ง · ~{revisitKmTotal.toFixed(0)} กม.
                      </h4>
                      <button onClick={exportRevisitCust}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200 whitespace-nowrap">
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                      </button>
                    </div>
                    <div className="border border-slate-100 rounded-lg max-h-72 overflow-auto">
                      <table className="w-full text-sm min-w-[480px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50 text-slate-500 text-xs">
                            <SortHeader col="name" label="ลูกค้า" active={revCustSort.col === 'name'} dir={revCustSort.dir} onSort={revCustSort.onSort} className="text-left" />
                            <SortHeader col="incidents" label="ครั้ง" active={revCustSort.col === 'incidents'} dir={revCustSort.dir} onSort={revCustSort.onSort} title="จำนวนครั้งที่ต้องวนกลับ" />
                            <SortHeader col="km" label="รวมระยะวน" active={revCustSort.col === 'km'} dir={revCustSort.dir} onSort={revCustSort.onSort} />
                            <SortHeader col="min" label="รวมเวลาวน" active={revCustSort.col === 'min'} dir={revCustSort.dir} onSort={revCustSort.onSort} />
                            <SortHeader col="date" label="ครั้งล่าสุด" active={revCustSort.col === 'date'} dir={revCustSort.dir} onSort={revCustSort.onSort} className="text-left" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedRevisitCust.map(s => (
                            <tr key={s.customerId} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{custName(s.customerId)}</td>
                              <td className="px-3 py-2 text-right text-amber-700 font-semibold">{s.incidents}</td>
                              <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{s.loopKmTotal.toFixed(1)} กม.</td>
                              <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{Math.round(s.loopMinTotal)} น.</td>
                              <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{s.lastDate.slice(5)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* รายการรายครั้ง — รายละเอียดแต่ละเหตุการณ์ */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Route className="w-3.5 h-3.5 text-[#3DD8D8]" /> รายการวนกลับ (รายครั้ง)</h4>
                      <button onClick={exportRevisits}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200 whitespace-nowrap">
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                      </button>
                    </div>
                    <div className="border border-slate-100 rounded-lg max-h-72 overflow-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50 text-slate-500 text-xs">
                            <SortHeader col="date" label="วันที่" active={revSort.col === 'date'} dir={revSort.dir} onSort={revSort.onSort} className="text-left" />
                            <SortHeader col="cust" label="ลูกค้า" active={revSort.col === 'cust'} dir={revSort.dir} onSort={revSort.onSort} className="text-left" />
                            <SortHeader col="driver" label="คนขับ" active={revSort.col === 'driver'} dir={revSort.dir} onSort={revSort.onSort} className="text-left" />
                            <SortHeader col="first" label="เข้าครั้งแรก" active={revSort.col === 'first'} dir={revSort.dir} onSort={revSort.onSort} />
                            <SortHeader col="revisit" label="วนกลับ" active={revSort.col === 'revisit'} dir={revSort.dir} onSort={revSort.onSort} />
                            <SortHeader col="stops" label="แวะคั่น" active={revSort.col === 'stops'} dir={revSort.dir} onSort={revSort.onSort} title="แวะลูกค้าเจ้าอื่นกี่จุดก่อนวนกลับ" />
                            <SortHeader col="km" label="ระยะวน" active={revSort.col === 'km'} dir={revSort.dir} onSort={revSort.onSort} title="ระยะช่วงออกจากลูกค้าจนวนกลับมาถึง" />
                            <SortHeader col="min" label="เวลาวน" active={revSort.col === 'min'} dir={revSort.dir} onSort={revSort.onSort} title="เวลาช่วงออกจากลูกค้าจนวนกลับมาถึง" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedRevisits.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{r.date.slice(5)}</td>
                              <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{custName(r.customerId)}</td>
                              <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{r.driverId ? drvName(r.driverId) : '—'}</td>
                              <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{hhmm(r.firstArrive)}</td>
                              <td className="px-3 py-2 text-right text-amber-700 font-medium whitespace-nowrap">{hhmm(r.revisitArrive)}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{r.otherStops}</td>
                              <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{r.loopKm.toFixed(1)} กม.</td>
                              <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{Math.round(r.loopMin)} น.</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
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

/** 451 — หัวคอลัมน์เรียงได้ (theme เดียวกับ AggregateModeAudit ฯลฯ) · alignment มาจาก className */
function SortHeader<C extends string>({ col, label, active, dir, onSort, className, title }: {
  col: C; label: string; active: boolean; dir: SortDir; onSort: (c: C) => void; className?: string; title?: string
}) {
  return (
    <th title={title}
      className={cn('px-3 py-2 font-medium cursor-pointer select-none hover:bg-slate-100 whitespace-nowrap', className || 'text-right')}
      onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-[#3DD8D8]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
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
