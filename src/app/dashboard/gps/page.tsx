'use client'

// GPS / ติดตามรถ — Feat 423 C (UI)
//   แท็บ "ตำแหน่งสด" (realtime จาก V2X) + "เที่ยววิ่ง" (trip history) · เชื่อมทะเบียนกับฟลีต
//   ดึงผ่าน /api/gps (server proxy) · ไม่ฝัง map (ใช้ลิงก์ Google Maps) เลี่ยง map API key

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { subDays, parseISO, format } from 'date-fns'
import { useStore } from '@/lib/store'
import { fetchGpsCars, fetchGpsRealtime, fetchGpsTrips, fetchGpsTrack } from '@/lib/gps-service'
import { normalizePlate, type GpsCar, type GpsPosition, type GpsTrip } from '@/lib/v2x-types'
import {
  buildRoundAudit, buildVehicleAudit, guessVehiclesForRound, medianDailyKm, hhmmOf,
  type RoundAudit, type VehicleAudit, type AuditFlag,
} from '@/lib/gps-audit'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, BarChart, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from 'recharts'
import { buildTripStops } from '@/lib/dispatch'
import { matchPlace, engineOffGaps, isShuffleTrip, passedPlaces, type LatLng, type PlaceMatch } from '@/lib/geo'
import { buildDashboardStats, type DashboardStats, type VehicleTrips } from '@/lib/gps-dashboard'
import { connStatus, CONN_LEVEL_ORDER, type ConnLevel } from '@/lib/gps-connection'
import type { RouteTrack } from '@/components/RouteMap'
import { isScheduledDay } from '@/lib/schedule-audit'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import { todayISO, cn } from '@/lib/utils'
import { canViewFleet } from '@/lib/permissions'
import {
  dailyTripId, SAVED_PLACE_CATEGORY_CONFIG,
  type Customer, type Round, type Vehicle, type SavedPlace, type SavedPlaceCategory,
} from '@/types'
import Modal from '@/components/Modal'
import GpsCoordInput from '@/components/GpsCoordInput'
import {
  Satellite, MapPin, Navigation, RefreshCw, Radio, Gauge,
  ExternalLink, Route, TrendingUp, Fuel, AlertCircle, Loader2, Car, CircleDot, Clock,
  ClipboardCheck, CheckCircle2, AlertTriangle, Info, Wand2,
  Factory, ParkingCircle, Building2, Award, Search, Plus, Pencil, Trash2, Coffee,
  BarChart3, Timer, Map as MapIcon, WifiOff,
} from 'lucide-react'

// 432.2.1 — แผนที่ Leaflet โหลดเฉพาะตอนเปิด (lazy · ssr:false เพราะ leaflet อ้าง window)
const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></div>,
})

// สีเส้นทางต่อเที่ยว (วน) — ต่างกันชัดเพื่อแยกเที่ยวบนแผนที่
const ROUTE_COLORS = ['#1B3A5C', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#ca8a04']

// 433 — UI ของสถานะการเชื่อมต่อ GPS (label/สี ต่อระดับ)
const CONN_CONFIG: Record<ConnLevel, { label: string; pill: string; card: string }> = {
  online:     { label: 'ออนไลน์',         pill: 'bg-emerald-100 text-emerald-700', card: 'border-slate-200' },
  recent:     { label: 'เพิ่งขาดสัญญาณ',   pill: 'bg-amber-100 text-amber-700',     card: 'border-amber-200' },
  suspicious: { label: 'ขาดสัญญาณ ⚠',     pill: 'bg-rose-100 text-rose-700',       card: 'border-rose-300 ring-1 ring-rose-200' },
  long:       { label: 'ออฟไลน์',          pill: 'bg-slate-100 text-slate-500',     card: 'border-slate-200' },
}

// ชื่อจุดจาก PlaceMatch → string (ลูกค้า/โรงงาน/จุดบันทึก) · fallback = address
function placeNameOf(m: PlaceMatch | null, fallback: string): string {
  if (m?.type === 'customer') return m.customer!.shortName || m.customer!.name
  if (m?.type === 'factory') return 'โรงงาน'
  if (m?.type === 'saved') return m.savedPlace!.name
  return fallback || '—'
}

// "2026-06-10 20:35:16" → "20:35"
function hhmm(s: string): string {
  const m = s.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : '—'
}

// relative ago จาก "yyyy-mm-dd HH:MM:SS" (local)
function ago(s: string): string {
  if (!s) return ''
  const t = new Date(s.replace(' ', 'T')).getTime()
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชม.ที่แล้ว`
  return `${Math.floor(hr / 24)} วันที่แล้ว`
}

// นาที → "X ชม. Y นาที"
function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`
}

// 432 — ระยะเวลาเที่ยว (เริ่ม→จบ) เป็นนาที · 0 = คำนวณไม่ได้
function tripDurationMin(startTime: string, endTime: string): number {
  const ms = new Date(endTime.replace(' ', 'T')).getTime() - new Date(startTime.replace(' ', 'T')).getTime()
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 0
}

// 432 — ระยะเวลาแบบกระชับสำหรับมอนิเตอร์: <60 นาที → "X นาที", ≥60 → "X.XX ชม."
function fmtDurationShort(min: number): string {
  if (min <= 0) return ''
  return min < 60 ? `${min} นาที` : `${(min / 60).toFixed(2)} ชม.`
}

export default function GpsPage() {
  const { currentUser, vehicles } = useStore()
  const [tab, setTab] = useState<'realtime' | 'trips' | 'dashboard' | 'audit' | 'places'>('realtime')

  // plateNorm → vehicle (แสดง code A/B/C ของฟลีต)
  const vehicleByPlate = useMemo(() => {
    const m = new Map<string, Vehicle>()
    vehicles.forEach(v => m.set(normalizePlate(v.licensePlate), v))
    return m
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
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Satellite className="w-6 h-6 text-[#1B3A5C]" /> GPS / ติดตามรถ
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">ตำแหน่งสด + ประวัติเที่ยววิ่ง จากระบบ V2X · เชื่อมทะเบียนกับฟลีต</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([['realtime', 'ตำแหน่งสด', Radio], ['trips', 'เที่ยววิ่ง', Route], ['dashboard', 'ภาพรวม', BarChart3], ['audit', 'เทียบแผน', ClipboardCheck], ['places', 'สถานที่', MapPin]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5',
              tab === k ? 'border-[#3DD8D8] text-[#1B3A5C]' : 'border-transparent text-slate-400 hover:text-slate-600')}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'realtime' ? <RealtimeTab vehicleByPlate={vehicleByPlate} />
        : tab === 'trips' ? <TripsTab vehicleByPlate={vehicleByPlate} />
        : tab === 'dashboard' ? <DashboardTab vehicleByPlate={vehicleByPlate} />
        : tab === 'audit' ? <AuditTab />
        : <PlacesTab />}
    </div>
  )
}

// ───────────────────────── ตำแหน่งสด ─────────────────────────

function RealtimeTab({ vehicleByPlate }: { vehicleByPlate: Map<string, Vehicle> }) {
  const { customers, companyInfo, savedPlaces } = useStore()
  const [positions, setPositions] = useState<GpsPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [updatedLabel, setUpdatedLabel] = useState('')

  // 433.1 — โรงงาน (จุดจอดประจำ) สำหรับจับคู่จุดที่ขาดสัญญาณ
  const factory: LatLng | null = useMemo(
    () => (companyInfo.factoryLat || companyInfo.factoryLng)
      ? { lat: companyInfo.factoryLat, lng: companyInfo.factoryLng } : null,
    [companyInfo.factoryLat, companyInfo.factoryLng])

  const load = useCallback(async () => {
    setErr(null)
    try {
      const data = await fetchGpsRealtime()
      setPositions(data)
      setUpdatedLabel(hhmm(new Date().toTimeString()))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000) // auto-refresh 30 วินาที
    return () => clearInterval(id)
  }, [load])

  if (loading && positions.length === 0) return <LoadingBlock />
  if (err && positions.length === 0) return <ErrorBlock msg={err} onRetry={load} />

  // 433 — ประเมินสถานะเชื่อมต่อ + จับคู่จุดที่ขาดสัญญาณกับสถานที่ที่รู้จัก + เรียงน่าสงสัยขึ้นก่อน
  const now = Date.now()
  const enriched = positions
    .map(p => {
      const conn = connStatus(p, now)
      // จุดที่ขาด = ตำแหน่งสุดท้ายก่อนเงียบ → จับคู่ลูกค้า/จุดบันทึก/โรงงาน (433.1)
      const place = conn.online ? null : matchPlace(p.lat, p.lng, customers, factory, savedPlaces)
      return { p, conn, v: vehicleByPlate.get(p.plateNorm), place }
    })
    .sort((a, b) => CONN_LEVEL_ORDER[a.conn.level] - CONN_LEVEL_ORDER[b.conn.level])
  const suspicious = enriched.filter(e => e.conn.level === 'suspicious')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{updatedLabel && `อัปเดตล่าสุด ${updatedLabel} · รีเฟรชอัตโนมัติทุก 30 วินาที`}</p>
        <button onClick={load}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B3A5C] transition-colors">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> รีเฟรช
        </button>
      </div>

      {err && <p className="text-xs text-amber-600">⚠ {err}</p>}

      {/* 433 — แจ้งเตือน GPS ขาดการเชื่อมต่อระหว่างวัน (อาจถูกถอด/ปิดอุปกรณ์) */}
      {suspicious.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2.5">
          <WifiOff className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-rose-800">
              {suspicious.length} คัน ขาดการเชื่อมต่อ GPS ระหว่างวัน — ควรตรวจสอบ (อาจถูกถอด/ปิดอุปกรณ์)
            </p>
            <p className="text-rose-700 mt-0.5">
              {suspicious.map(e =>
                `${e.v ? `คัน ${e.v.code}` : e.p.plate} — ขาดที่ ${e.place ? placeNameOf(e.place, '') : 'นอกจุดที่รู้จัก'} (${ago(e.conn.lastSeen)})`
              ).join(' · ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {enriched.map(({ p, conn, v, place }) => {
          const cfg = CONN_CONFIG[conn.level]
          const knownPlace = !!place // ขาดที่จุดที่รู้จัก (โรงงาน/ลูกค้า/จุดบันทึก) = มักจอดปกติ
          return (
            <div key={p.carId} className={cn('bg-white rounded-xl border p-4', cfg.card)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {v && <span className="text-xs font-bold bg-[#1B3A5C] text-white px-1.5 py-0.5 rounded shrink-0">คัน {v.code}</span>}
                    <span className="font-semibold text-slate-800 truncate">{p.plate}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">พิกัด {ago(p.gpsTime)}</p>
                </div>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0', cfg.pill)}>
                  {conn.online ? <CircleDot className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{cfg.label}
                </span>
              </div>

              {/* 433/433.1 — รายละเอียดการขาดสัญญาณ + จุดที่ขาด (วิเคราะห์ อับสัญญาณ vs ถูกถอด) */}
              {!conn.online && (
                <div className="mt-2 space-y-1">
                  <p className={cn('text-xs', conn.level === 'suspicious' ? 'text-rose-600 font-medium' : 'text-slate-400')}>
                    ขาดการเชื่อมต่อ {conn.offlineMin > 0 ? fmtMin(conn.offlineMin) : '—'} · เห็นล่าสุด {ago(conn.lastSeen)}
                  </p>
                  <p className="text-xs flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                    <span>
                      <span className="text-slate-500">จุดที่ขาด: </span>
                      {knownPlace
                        ? <span className="text-slate-600 font-medium">{placeNameOf(place, '')} <span className="font-normal text-slate-400">· จุดจอดที่รู้จัก (มักจอดปกติ)</span></span>
                        : <span className="text-amber-700 font-medium">นอกจุดที่รู้จัก — ควรตรวจสอบ</span>}
                    </span>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Gauge className="w-4 h-4 text-slate-400 shrink-0" />{p.speed} กม./ชม.
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Navigation className="w-4 h-4 text-slate-400 shrink-0" />{p.driving ? 'กำลังวิ่ง' : 'จอด'}
                </div>
              </div>

              <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#1B3A5C] hover:text-[#3DD8D8] font-medium transition-colors">
                <MapPin className="w-4 h-4" /> {conn.online ? 'เปิดแผนที่' : 'ดูจุดที่ขาดสัญญาณ'} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────── เที่ยววิ่ง ─────────────────────────

function TripsTab({ vehicleByPlate }: { vehicleByPlate: Map<string, Vehicle> }) {
  const { customers, companyInfo, savedPlaces } = useStore()
  const [cars, setCars] = useState<GpsCar[]>([])
  const [carId, setCarId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [trips, setTrips] = useState<GpsTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // 427 — ตั้งพิกัดลูกค้าจากจุดจอดจริง (เสนอจุด → ติ๊ดยืนยันชื่อ)
  const [coordTarget, setCoordTarget] = useState<{ lat: number; lng: number; address: string } | null>(null)
  const [showMap, setShowMap] = useState(false) // 432.2.1 — แผนที่เส้นทางทั้งวัน

  // โหลดรายชื่อรถครั้งแรก
  useEffect(() => {
    fetchGpsCars()
      .then(cs => { setCars(cs); if (cs[0]) setCarId(cs[0].carId) })
      .catch(e => setErr(e instanceof Error ? e.message : 'โหลดรายชื่อรถไม่สำเร็จ'))
  }, [])

  const selectedCar = cars.find(c => c.carId === carId)
  const selectedVehicle = selectedCar ? vehicleByPlate.get(selectedCar.plateNorm) : undefined
  const selectedPlate = selectedCar?.plate || ''

  const load = useCallback(async () => {
    if (!selectedPlate) return
    setLoading(true); setErr(null)
    try {
      setTrips(await fetchGpsTrips(selectedPlate, date))
      setLoaded(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ดึงเที่ยววิ่งไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [selectedPlate, date])

  // 427 — timeline เก่า→ใหม่ + ช่วงดับเครื่องจอดระหว่างเที่ยว + จับคู่สถานที่
  const factory: LatLng | null = useMemo(
    () => (companyInfo.factoryLat || companyInfo.factoryLng)
      ? { lat: companyInfo.factoryLat, lng: companyInfo.factoryLng } : null,
    [companyInfo.factoryLat, companyInfo.factoryLng])
  const sorted = useMemo(() => [...trips].sort((a, b) => a.startTime.localeCompare(b.startTime)), [trips])
  const gapAfter = useMemo(() => new Map(engineOffGaps(sorted).map(g => [g.afterIndex, g])), [sorted])
  const placeOf = useCallback(
    (lat: number, lng: number) => matchPlace(lat, lng, customers, factory, savedPlaces),
    [customers, factory, savedPlaces])

  const summary = useMemo(() => {
    const real = sorted.filter(t => !isShuffleTrip(t))
    const scored = sorted.filter(t => t.score > 0)
    return {
      count: real.length,
      shuffle: sorted.length - real.length,
      km: sorted.reduce((s, t) => s + t.distanceKm, 0),
      fuel: sorted.reduce((s, t) => s + t.fuelLiters, 0),
      drive: sorted.reduce((s, t) => s + t.drivingMin, 0),
      score: scored.length ? scored.reduce((s, t) => s + t.score, 0) / scored.length : 0,
      overSpeed: sorted.reduce((s, t) => s + t.overSpeedCount, 0),
      harsh: sorted.reduce((s, t) => s + t.rapidAccelCount + t.rapidDecelCount, 0),
      idle: sorted.reduce((s, t) => s + t.idleMin, 0),
    }
  }, [sorted])

  return (
    <div className="space-y-4">
      {/* ตัวเลือก */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">รถ</label>
          <select value={carId} onChange={e => setCarId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
            {cars.length === 0 && <option value="">— กำลังโหลด —</option>}
            {cars.map(c => {
              const v = vehicleByPlate.get(c.plateNorm)
              return <option key={c.carId} value={c.carId}>{v ? `คัน ${v.code} · ` : ''}{c.plate}</option>
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">วันที่</label>
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <button onClick={load} disabled={!selectedPlate || loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} ดึงข้อมูล
        </button>
      </div>

      {err && <ErrorBlock msg={err} onRetry={load} />}

      {loaded && !err && (
        <>
          {/* สรุปยอด — 427: เพิ่มคะแนนขับขี่ + พฤติกรรม */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Route} label="เที่ยววิ่ง" value={`${summary.count}${summary.shuffle > 0 ? ` (+${summary.shuffle} ขยับรถ)` : ''}`} />
            <StatCard icon={TrendingUp} label="ระยะทางรวม" value={`${summary.km.toFixed(1)} กม.`} />
            <StatCard icon={Fuel} label="น้ำมันรวม" value={`${summary.fuel.toFixed(2)} ลิตร`} />
            <StatCard icon={Clock} label="ขับ / ติดเครื่องนิ่ง" value={`${fmtMin(summary.drive)} / ${fmtMin(summary.idle)}`} />
            <StatCard icon={Award} label="คะแนนขับขี่เฉลี่ย" value={summary.score > 0 ? summary.score.toFixed(0) : '—'} />
            <StatCard icon={Gauge} label="เร็วเกิน / กระชาก" value={`${summary.overSpeed} / ${summary.harsh}`} />
          </div>

          {/* timeline เที่ยว + จุดจอดดับเครื่อง */}
          {sorted.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">ไม่มีเที่ยววิ่งในวันนี้{selectedVehicle ? ` (คัน ${selectedVehicle.code})` : ''}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
                <span className="text-xs text-slate-500">ไทม์ไลน์เที่ยววิ่ง — เรียงเวลาเก่า→ใหม่</span>
                <button onClick={() => setShowMap(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1B3A5C] text-white hover:bg-[#122740] transition-colors shrink-0"
                  title="ดูเส้นทางจริงทั้งวันบนแผนที่ — เห็นว่าออกนอกเส้นทาง/วนซ้ำไหม">
                  <MapIcon className="w-3.5 h-3.5" /> ดูเส้นทางบนแผนที่
                </button>
              </div>
              <div className="overflow-x-auto">
                {/* 438 — table-fixed + colgroup: คอลัมน์ถือความกว้างคงที่ · ปลายทางยาว truncate (เลิกล้นทับระยะทาง) */}
                <table className="w-full text-sm table-fixed min-w-[720px]">
                  <colgroup>
                    <col className="w-[176px]" />{/* เวลา */}
                    <col />{/* ปลายทาง — ที่เหลือ */}
                    <col className="w-[92px]" />{/* ระยะทาง */}
                    <col className="w-[80px]" />{/* น้ำมัน */}
                    <col className="w-[124px]" />{/* นิ่ง */}
                    <col className="w-[120px]" />{/* พฤติกรรม */}
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="px-3 py-2.5 text-left font-medium">เวลา</th>
                      <th className="px-3 py-2.5 text-left font-medium">ปลายทาง</th>
                      <th className="px-3 py-2.5 text-right font-medium">ระยะทาง</th>
                      <th className="px-3 py-2.5 text-right font-medium">น้ำมัน</th>
                      <th className="px-3 py-2.5 text-right font-medium" title="ติดเครื่องแต่ล้อไม่หมุน (จอดไม่ดับเครื่อง)">นิ่ง</th>
                      <th className="px-3 py-2.5 text-left font-medium">พฤติกรรม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sorted.map((t, i) => {
                      const dest = placeOf(t.endLat, t.endLng)
                      const shuffle = isShuffleTrip(t)
                      const gap = gapAfter.get(i)
                      const gapPlace = gap ? placeOf(gap.lat, gap.lng) : null
                      const durMin = tripDurationMin(t.startTime, t.endTime) // 432 — ระยะเวลาเที่ยว
                      return (
                        <Fragment key={t.tripId || i}>
                          <tr className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 font-medium">
                              {hhmm(t.startTime)} → {hhmm(t.endTime)}
                              {durMin > 0 && (
                                <span className="ml-1.5 text-xs font-normal text-slate-400" title="ระยะเวลาเที่ยวนี้ (เริ่ม→จบ)">
                                  ({fmtDurationShort(durMin)})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {shuffle ? (
                                <span className="flex items-center gap-1 text-slate-500 min-w-0">
                                  <ParkingCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">ขยับรถ{dest?.type === 'factory' ? 'ที่โรงงาน' : ''}</span>
                                </span>
                              ) : dest?.type === 'customer' ? (
                                <span className="flex items-center gap-1.5 font-medium text-[#1B3A5C] min-w-0">
                                  <Building2 className="w-3.5 h-3.5 text-[#3DD8D8] shrink-0" />
                                  <span className="truncate" title={dest.customer!.name}>{dest.customer!.shortName || dest.customer!.name}</span>
                                </span>
                              ) : dest?.type === 'factory' ? (
                                <span className="flex items-center gap-1.5 text-slate-600 min-w-0">
                                  <Factory className="w-3.5 h-3.5 text-slate-400 shrink-0" /> <span className="truncate">กลับโรงงาน</span>
                                </span>
                              ) : dest?.type === 'saved' ? (
                                <SavedPlaceTag place={dest.savedPlace!} />
                              ) : (
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-slate-600 truncate" title={t.endAddress}>{t.endAddress || '—'}</span>
                                  {(t.endLat !== 0 || t.endLng !== 0) && (
                                    <button onClick={() => setCoordTarget({ lat: t.endLat, lng: t.endLng, address: t.endAddress })}
                                      title="จุดนี้คืออะไร? — บันทึกเป็นพิกัดลูกค้า หรือสถานที่อื่น (ครั้งต่อไปขึ้นชื่อเอง)"
                                      className="shrink-0 text-slate-300 hover:text-[#1B3A5C]">
                                      <MapPin className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-700">{t.distanceKm.toFixed(2)} กม.</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-500">{t.fuelLiters.toFixed(2)} ล.</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              {t.idleMin >= 15 ? (
                                <span className="text-amber-600 font-medium" title={dest?.type === 'customer' ? 'จอดที่ลูกค้าแต่ไม่ดับเครื่อง (เปลืองน้ำมัน)' : 'ติดเครื่องนิ่งนาน'}>
                                  ⚠ {fmtMin(t.idleMin)}
                                </span>
                              ) : t.idleMin > 0 ? (
                                <span className="text-slate-400">{fmtMin(t.idleMin)}</span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                              <span className="inline-flex items-center gap-2">
                                {t.score > 0 && (
                                  <span className={cn('font-semibold',
                                    t.score >= 90 ? 'text-emerald-600' : t.score >= 70 ? 'text-amber-600' : 'text-rose-600')}>
                                    {t.score.toFixed(0)}
                                  </span>
                                )}
                                {t.overSpeedCount > 0 && <span className="text-rose-600" title="เร็วเกินกำหนด (ครั้ง)">⚡{t.overSpeedCount}</span>}
                                {t.rapidAccelCount > 0 && <span className="text-amber-600" title="ออกตัวกระชาก (ครั้ง)">↗{t.rapidAccelCount}</span>}
                                {t.rapidDecelCount > 0 && <span className="text-amber-600" title="เบรกกระชาก (ครั้ง)">↘{t.rapidDecelCount}</span>}
                                {t.score === 0 && t.overSpeedCount === 0 && t.rapidAccelCount === 0 && t.rapidDecelCount === 0 && <span className="text-slate-300">—</span>}
                              </span>
                            </td>
                          </tr>
                          {gap && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={6} className="px-3 py-1.5 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1.5 flex-wrap">
                                  <ParkingCircle className="w-3.5 h-3.5 text-slate-400" />
                                  ดับเครื่องจอด <b className="text-slate-600">{fmtMin(gap.minutes)}</b>
                                  <span className="text-slate-400">({hhmm(gap.fromTime)}–{hhmm(gap.toTime)})</span>
                                  {gapPlace?.type === 'customer' ? (
                                    <span className="inline-flex items-center gap-1 text-[#1B3A5C] font-medium">
                                      <Building2 className="w-3 h-3 text-[#3DD8D8]" />{gapPlace.customer!.shortName || gapPlace.customer!.name}
                                    </span>
                                  ) : gapPlace?.type === 'factory' ? (
                                    <span className="inline-flex items-center gap-1"><Factory className="w-3 h-3" />ที่โรงงาน</span>
                                  ) : gapPlace?.type === 'saved' ? (
                                    <SavedPlaceTag place={gapPlace.savedPlace!} />
                                  ) : (
                                    <>
                                      <span className="truncate max-w-[300px]" title={gap.address}>{gap.address || '—'}</span>
                                      {(gap.lat !== 0 || gap.lng !== 0) && (
                                        <button onClick={() => setCoordTarget({ lat: gap.lat, lng: gap.lng, address: gap.address })}
                                          title="จุดนี้คืออะไร? — บันทึกเป็นพิกัดลูกค้า หรือสถานที่อื่น"
                                          className="shrink-0 text-slate-300 hover:text-[#1B3A5C]">
                                          <MapPin className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </span>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loaded && !err && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Route className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">เลือกรถ + วันที่ แล้วกด “ดึงข้อมูล”</p>
        </div>
      )}

      {coordTarget && (
        <SetPlaceModal point={coordTarget} date={date} onClose={() => setCoordTarget(null)} />
      )}

      {showMap && (
        <RouteMapModal trips={sorted} placeOf={placeOf}
          title={`เส้นทาง ${selectedVehicle ? `คัน ${selectedVehicle.code} · ` : ''}${date}`}
          onClose={() => setShowMap(false)} />
      )}
    </div>
  )
}

// 432.2.1 — แผนที่เส้นทางทั้งวัน: ดึง track ต่อเที่ยว (best-effort) → วาดทุกเที่ยวซ้อนกัน
//   เห็นภาพว่าคนขับออกนอกเส้นทาง / วนซ้ำ / แวะนอกแผน ไหม
function RouteMapModal({
  trips, placeOf, title, onClose,
}: {
  trips: GpsTrip[]
  placeOf: (lat: number, lng: number) => PlaceMatch | null
  title: string
  onClose: () => void
}) {
  const { customers, companyInfo, savedPlaces } = useStore()
  const [tracks, setTracks] = useState<RouteTrack[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const factory: LatLng | null = useMemo(
    () => (companyInfo.factoryLat || companyInfo.factoryLng)
      ? { lat: companyInfo.factoryLat, lng: companyInfo.factoryLng } : null,
    [companyInfo.factoryLat, companyInfo.factoryLng])
  const realTrips = useMemo(() => trips.filter(t => t.tripId && !isShuffleTrip(t)), [trips])

  useEffect(() => {
    let cancelled = false
    if (realTrips.length === 0) { setTracks([]); setLoading(false); return }
    setLoading(true); setErr(null)
    Promise.allSettled(realTrips.map(t => fetchGpsTrack(t.tripId)))
      .then(results => {
        if (cancelled) return
        const out: RouteTrack[] = []
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled' || r.value.points.length === 0) return
          const t = realTrips[i]
          out.push({
            label: `เที่ยว ${i + 1} · ${hhmm(t.startTime)}→${hhmm(t.endTime)}`,
            color: ROUTE_COLORS[i % ROUTE_COLORS.length],
            points: r.value.points,
            dangers: r.value.dangers,
            startName: placeNameOf(placeOf(t.startLat, t.startLng), t.startAddress),
            endName: placeNameOf(placeOf(t.endLat, t.endLng), t.endAddress),
            // 435 — จุดที่รู้จักที่เส้นทางผ่าน (break down เที่ยวยาวที่ไม่ดับเครื่อง)
            passed: passedPlaces(r.value.points, customers, factory, savedPlaces),
          })
        })
        setTracks(out)
        if (out.length === 0) setErr('ระบบ GPS ไม่มีข้อมูลเส้นทางของเที่ยวเหล่านี้')
        setLoading(false)
      })
      .catch(e => { if (!cancelled) { setErr(e instanceof Error ? e.message : 'ดึงเส้นทางไม่สำเร็จ'); setLoading(false) } })
    return () => { cancelled = true }
  }, [realTrips, placeOf, customers, factory, savedPlaces])

  return (
    <Modal open onClose={onClose} title={title} size="wide" closeLabel="close">
      <div className="space-y-3">
        <div className="h-[68vh] rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin mb-2" /><p className="text-sm">กำลังดึงเส้นทางจาก GPS…</p>
            </div>
          ) : err ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <MapIcon className="w-10 h-10 mb-2 text-slate-300" /><p className="text-sm">{err}</p>
            </div>
          ) : (
            <RouteMap tracks={tracks || []} />
          )}
        </div>
        {/* legend + 435 break down จุดที่ผ่าน (เห็นว่าเที่ยวยาวที่ไม่ดับเครื่อง เข้าจุดไหนบ้าง) */}
        {tracks && tracks.length > 0 && (
          <div className="space-y-1.5 text-xs">
            {tracks.map((t, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="w-4 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: t.color }} />
                <div className="min-w-0">
                  <span className="text-slate-600 font-medium">{t.label}</span>
                  {t.passed && t.passed.length > 1 ? (
                    <span className="text-slate-500"> · ผ่าน {t.passed.length} จุด: {t.passed.map(p => p.name).join(' → ')}</span>
                  ) : (
                    <span className="text-slate-400"> → จบ: {t.endName}</span>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1 text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" /> จุดขับขี่เสี่ยง</span>
              <span>· “ผ่าน” = เส้นทางเข้าใกล้จุดที่บันทึกพิกัดไว้ (บอกลำดับ ไม่บอกเวลาจอด)</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// 432.1 — ป้ายจุดที่บันทึก (ร้านอาหาร/ปั๊ม ฯลฯ) · detour = ไฮไลต์เตือน "แวะ"
function SavedPlaceTag({ place }: { place: SavedPlace }) {
  const cfg = SAVED_PLACE_CATEGORY_CONFIG[place.category] || SAVED_PLACE_CATEGORY_CONFIG.other
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', cfg.detour ? 'text-amber-700' : 'text-slate-600')}
      title={cfg.detour ? `${cfg.label} — จุดแวะนอกแผน${place.note ? ` · ${place.note}` : ''}` : cfg.label}>
      <span aria-hidden>{cfg.emoji}</span>
      <span className="truncate max-w-[200px]">{place.name}</span>
      {cfg.detour && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">แวะ</span>}
    </span>
  )
}

// 427/432.1 — จุดจอดนี้คืออะไร? 2 โหมด:
//   • ลูกค้า   — บันทึกเป็นพิกัดลูกค้า (เที่ยวที่จบใกล้จุดนี้ขึ้นชื่อลูกค้าอัตโนมัติ — รัศมี 150ม.)
//   • สถานที่อื่น — บันทึกเป็นจุด POI (ร้านอาหาร/ปั๊ม/จุดแวะ) → จับคู่จุดจอดอัตโนมัติ + เห็นพฤติกรรมแวะ
function SetPlaceModal({
  point, date, onClose,
}: {
  point: { lat: number; lng: number; address: string }
  date: string
  onClose: () => void
}) {
  const { customers, updateCustomer, addSavedPlace } = useStore()
  const [mode, setMode] = useState<'customer' | 'saved'>('customer')
  const [search, setSearch] = useState('')
  // โหมดสถานที่อื่น
  const [placeName, setPlaceName] = useState('')
  const [placeCat, setPlaceCat] = useState<SavedPlaceCategory>('food')

  const candidates = useMemo(() => {
    const due = (c: Customer) => isScheduledDay(date, c)
    return customers
      .filter(c => c.isActive)
      .filter(c => !search || matchesThaiQueryAnyField([c.shortName, c.name, c.customerCode], search))
      .sort((a, b) => Number(due(b)) - Number(due(a)) ||
        (a.shortName || a.name).localeCompare(b.shortName || b.name, 'th'))
      .slice(0, 60)
  }, [customers, search, date])

  const saveCustomer = (c: Customer) => {
    if ((c.gpsLat || c.gpsLng) && !confirm(`${c.shortName || c.name} มีพิกัดอยู่แล้ว — แทนที่ด้วยจุดนี้?`)) return
    updateCustomer(c.id, { gpsLat: point.lat, gpsLng: point.lng })
    onClose()
  }

  const savePlace = () => {
    const name = placeName.trim()
    if (!name) return
    addSavedPlace({ name, category: placeCat, lat: point.lat, lng: point.lng, note: point.address || '' })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="จุดจอดนี้คืออะไร?" size="md" closeLabel="cancel">
      <div className="space-y-3">
        <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
          <p className="truncate" title={point.address}>📍 {point.address || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</p>
          <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#1B3A5C] hover:text-[#3DD8D8] mt-1">
            <ExternalLink className="w-3 h-3" /> เปิดดูใน Google Maps
          </a>
        </div>

        {/* เลือกโหมด */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden w-full">
          {([['customer', 'ลูกค้า'], ['saved', 'สถานที่อื่น (ร้านอาหาร/ปั๊ม)']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)}
              className={cn('flex-1 px-3 py-2 text-sm font-medium transition-colors',
                mode === k ? 'bg-[#1B3A5C] text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'customer' ? (
          <>
            <p className="text-xs text-slate-400">เลือกลูกค้าเพื่อบันทึกจุดนี้เป็นพิกัดประจำ — เที่ยวต่อๆ ไปที่จบใกล้จุดนี้จะขึ้นชื่อลูกค้าอัตโนมัติ (ลูกค้าที่ถึงคิววันนี้อยู่บนสุด)</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า..." autoFocus
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
            </div>
            <ul className="divide-y divide-slate-100 max-h-72 overflow-auto">
              {candidates.length === 0 ? (
                <li className="text-center text-sm text-slate-400 py-6">ไม่พบลูกค้า</li>
              ) : candidates.map(c => (
                <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-700 w-28 truncate">{c.shortName || c.name}</span>
                  <span className="flex-1 text-xs text-slate-400 truncate">{c.name}</span>
                  {isScheduledDay(date, c) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#3DD8D8]/15 text-[#1B3A5C] shrink-0">ถึงคิววันนี้</span>}
                  {(c.gpsLat || c.gpsLng) ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">มีพิกัดแล้ว</span> : null}
                  <button onClick={() => saveCustomer(c)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors shrink-0">
                    ใช้จุดนี้
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">บันทึกจุดนี้เป็นสถานที่ (ไม่ใช่ลูกค้า) — เที่ยว/จุดจอดต่อๆ ไปที่ใกล้จุดนี้จะขึ้นชื่อนี้อัตโนมัติ จุดแวะส่วนตัวจะถูกไฮไลต์เตือน</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">ชื่อสถานที่</label>
              <input value={placeName} onChange={e => setPlaceName(e.target.value)} placeholder="เช่น ร้านก๋วยเตี๋ยวไก่" autoFocus
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">ประเภท</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SAVED_PLACE_CATEGORY_CONFIG) as SavedPlaceCategory[]).map(k => {
                  const cfg = SAVED_PLACE_CATEGORY_CONFIG[k]
                  return (
                    <button key={k} onClick={() => setPlaceCat(k)}
                      className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1',
                        placeCat === k ? 'border-[#3DD8D8] bg-[#3DD8D8]/10 text-[#1B3A5C]' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                      <span aria-hidden>{cfg.emoji}</span>{cfg.label}
                    </button>
                  )
                })}
              </div>
              {SAVED_PLACE_CATEGORY_CONFIG[placeCat].detour && (
                <p className="text-[11px] text-amber-600 mt-1.5">⚠ ประเภทนี้นับเป็น “แวะส่วนตัว” — จะถูกไฮไลต์เตือนในเที่ยววิ่ง</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={savePlace} disabled={!placeName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] disabled:opacity-40 transition-colors">
                บันทึกสถานที่
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ───────────────────────── ภาพรวม (dashboard 432.2.2) ─────────────────────────
//   สรุปเที่ยววิ่งหลายคัน/หลายวัน → KPI + แนวโน้มรายวัน + เทียบรายคัน + จุดแวะส่วนตัว
//   ดึง trip ต่อคันแบบ best-effort (V2X ช้ากับช่วงยาว → ต่อคัน try/catch, คันที่ fail ไม่ล้มทั้งหมด)

function DashboardTab({ vehicleByPlate }: { vehicleByPlate: Map<string, Vehicle> }) {
  const { customers, companyInfo, savedPlaces, dailyTrips, crew } = useStore()
  const [cars, setCars] = useState<GpsCar[]>([])
  const [from, setFrom] = useState(() => format(subDays(parseISO(todayISO()), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(todayISO())
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [failedCars, setFailedCars] = useState<string[]>([])

  useEffect(() => { fetchGpsCars().then(setCars).catch(() => {}) }, [])

  const factory: LatLng | null = useMemo(
    () => (companyInfo.factoryLat || companyInfo.factoryLng)
      ? { lat: companyInfo.factoryLat, lng: companyInfo.factoryLng } : null,
    [companyInfo.factoryLat, companyInfo.factoryLng])

  const setPreset = (days: number) => {
    setFrom(format(subDays(parseISO(todayISO()), days - 1), 'yyyy-MM-dd'))
    setTo(todayISO())
  }

  const run = useCallback(async () => {
    if (cars.length === 0) return
    setLoading(true); setErr(null)
    try {
      const vts: VehicleTrips[] = []
      const failed: string[] = []
      for (const car of cars) {
        try {
          const trips = await fetchGpsTrips(car.plate, from, to)
          vts.push({ carId: car.carId, plate: car.plate, vehicleCode: vehicleByPlate.get(car.plateNorm)?.code ?? null, trips })
        } catch {
          failed.push(car.plate) // คันนี้ดึงไม่ได้ (timeout) — คันอื่นยังทำงาน
        }
      }
      // 435 — resolver (carId, day) → คนขับ ผ่าน dailyTrips (กระดานจ่ายงาน) · รถ→vehicleId→driverId→ชื่อ crew
      const crewName = new Map(crew.map(c => [c.id, c.name]))
      const carToVehicleId = new Map<string, string>()
      for (const car of cars) { const veh = vehicleByPlate.get(car.plateNorm); if (veh) carToVehicleId.set(car.carId, veh.id) }
      const driverResolver = (carId: string, day: string) => {
        const vid = carToVehicleId.get(carId)
        if (!vid) return { id: '', name: 'ไม่ระบุคนขับ' }
        const drivers = [...new Set(dailyTrips.filter(t => t.vehicleId === vid && t.date === day && t.driverId).map(t => t.driverId))]
        if (drivers.length === 0) return { id: '', name: 'ไม่ระบุคนขับ' }
        if (drivers.length > 1) return { id: 'multi', name: 'หลายคน (แยกไม่ได้)' }
        return { id: drivers[0], name: crewName.get(drivers[0]) || 'คนขับ' }
      }
      setStats(buildDashboardStats(vts, customers, factory, savedPlaces, driverResolver))
      setFailedCars(failed)
      setLoaded(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'วิเคราะห์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [cars, from, to, customers, factory, savedPlaces, vehicleByPlate, dailyTrips, crew])

  const rangeDays = useMemo(() => {
    const d = Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86400000) + 1
    return Number.isFinite(d) ? d : 0
  }, [from, to])

  return (
    <div className="space-y-4">
      {/* ตัวเลือกช่วงวันที่ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">ตั้งแต่</label>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">ถึง</label>
          <input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <div className="flex gap-1">
          {([['7 วัน', 7], ['14 วัน', 14], ['30 วัน', 30]] as const).map(([label, d]) => (
            <button key={d} onClick={() => setPreset(d)}
              className="px-2.5 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
              {label}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={loading || cars.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} วิเคราะห์ภาพรวม
        </button>
        <p className="text-xs text-slate-400 sm:ml-auto sm:self-center">
          {rangeDays > 0 && `${rangeDays} วัน`}{rangeDays > 14 ? ' · ช่วงยาวอาจดึงช้า' : ''}
        </p>
      </div>

      {err && <ErrorBlock msg={err} onRetry={run} />}
      {loading && <LoadingBlock />}

      {stats && !loading && (
        <>
          {failedCars.length > 0 && (
            <p className="text-xs text-amber-600">⚠ ดึงข้อมูลบางคันไม่สำเร็จ (อาจ timeout): {failedCars.join(', ')} — ลองลดช่วงวันที่</p>
          )}

          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Route} label="เที่ยววิ่งรวม" value={`${stats.totals.trips}`} />
            <StatCard icon={TrendingUp} label="ระยะทางรวม" value={`${stats.totals.km.toFixed(0)} กม.`} />
            <StatCard icon={Fuel} label="น้ำมันรวม" value={`${stats.totals.fuel.toFixed(1)} ล.`} />
            <StatCard icon={Gauge} label="อัตราสิ้นเปลือง" value={stats.totals.kmPerLiter > 0 ? `${stats.totals.kmPerLiter.toFixed(1)} กม./ล.` : '—'} />
            <StatCard icon={Award} label="คะแนนขับขี่เฉลี่ย" value={stats.totals.scoreAvg > 0 ? stats.totals.scoreAvg.toFixed(0) : '—'} />
            <StatCard icon={Clock} label="ติดเครื่องนิ่งรวม" value={fmtMin(stats.totals.idleMin)} />
          </div>

          {/* แวะส่วนตัว — ไฮไลต์ */}
          <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-2 text-sm font-medium',
            stats.totals.detourVisits > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>
            {stats.totals.detourVisits > 0
              ? <><Coffee className="w-4 h-4" /> แวะนอกแผน {stats.totals.detourVisits} ครั้ง · รวม {fmtMin(stats.totals.detourMin)} · เร็วเกิน {stats.totals.overSpeed} ครั้ง · กระชาก {stats.totals.harsh} ครั้ง</>
              : <><CheckCircle2 className="w-4 h-4" /> ไม่พบการแวะนอกแผน (จุดที่บันทึก) · เร็วเกิน {stats.totals.overSpeed} ครั้ง · กระชาก {stats.totals.harsh} ครั้ง</>}
          </div>

          {/* แนวโน้มรายวัน */}
          {stats.byDay.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-[#3DD8D8]" /> ระยะทาง + เที่ยววิ่ง รายวัน</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.byDay} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tickFormatter={d => d.slice(5)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis yAxisId="km" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis yAxisId="trips" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => n === 'กม.' ? [`${Number(v).toFixed(1)} กม.`, 'ระยะทาง'] : [`${v} เที่ยว`, 'เที่ยววิ่ง']}
                      labelFormatter={d => `วันที่ ${d}`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar yAxisId="km" dataKey="km" name="กม." fill="#3DD8D8" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="trips" type="monotone" dataKey="trips" name="เที่ยว" stroke="#1B3A5C" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* เทียบรายคัน — bar + ตาราง */}
          {stats.byVehicle.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Car className="w-4 h-4 text-[#3DD8D8]" /> เทียบรายคัน</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byVehicle} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey={(v: { vehicleCode: string | null; plate: string }) => v.vehicleCode ? `คัน ${v.vehicleCode}` : v.plate}
                      tick={{ fontSize: 11, fill: '#475569' }} width={64} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} กม.`, 'ระยะทาง']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="km" radius={[0, 4, 4, 0]}>
                      {stats.byVehicle.map((v, i) => <Cell key={i} fill={i === 0 ? '#1B3A5C' : '#3DD8D8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="px-3 py-2 text-left font-medium">คัน</th>
                      <th className="px-3 py-2 text-right font-medium">เที่ยว</th>
                      <th className="px-3 py-2 text-right font-medium">ระยะทาง</th>
                      <th className="px-3 py-2 text-right font-medium">กม./ล.</th>
                      <th className="px-3 py-2 text-right font-medium">คะแนน</th>
                      <th className="px-3 py-2 text-right font-medium" title="เร็วเกิน / กระชาก">เร็วเกิน/กระชาก</th>
                      <th className="px-3 py-2 text-right font-medium">นิ่ง</th>
                      <th className="px-3 py-2 text-right font-medium">แวะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.byVehicle.map(v => (
                      <tr key={v.carId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">
                          {v.vehicleCode ? <span className="text-xs font-bold bg-[#1B3A5C] text-white px-1.5 py-0.5 rounded mr-1.5">คัน {v.vehicleCode}</span> : null}
                          <span className="text-xs text-slate-400">{v.plate}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">{v.trips}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{v.km.toFixed(0)} กม.</td>
                        <td className="px-3 py-2 text-right text-slate-500">{v.kmPerLiter > 0 ? v.kmPerLiter.toFixed(1) : '—'}</td>
                        <td className={cn('px-3 py-2 text-right font-semibold',
                          v.scoreAvg === 0 ? 'text-slate-300' : v.scoreAvg >= 90 ? 'text-emerald-600' : v.scoreAvg >= 70 ? 'text-amber-600' : 'text-rose-600')}>
                          {v.scoreAvg > 0 ? v.scoreAvg.toFixed(0) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{v.overSpeed}/{v.harsh}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{v.idleMin > 0 ? fmtMin(v.idleMin) : '—'}</td>
                        <td className={cn('px-3 py-2 text-right font-medium', v.detourVisits > 0 ? 'text-amber-700' : 'text-slate-300')}>
                          {v.detourVisits > 0 ? `${v.detourVisits} (${fmtMin(v.detourMin)})` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* จุดแวะส่วนตัว */}
          {stats.detours.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Timer className="w-4 h-4 text-amber-500" /> จุดแวะนอกแผนที่เจอบ่อย</h3>
              <div className="divide-y divide-slate-100">
                {stats.detours.map((d, i) => {
                  const cfg = SAVED_PLACE_CATEGORY_CONFIG[d.category] || SAVED_PLACE_CATEGORY_CONFIG.other
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 text-sm">
                      <span className="text-lg shrink-0" aria-hidden>{cfg.emoji}</span>
                      <span className="font-medium text-slate-700 flex-1 truncate">{d.name}</span>
                      <span className="text-xs text-slate-400">{cfg.label}</span>
                      <span className="text-xs font-medium text-amber-700 shrink-0">{d.visits} ครั้ง · {fmtMin(d.totalMin)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 435 — อันดับคนขับ: ติดเครื่องนิ่ง (idle) เรียงมาก→น้อย */}
          {stats.byDriver.length > 0 && (() => {
            const hasNamed = stats.byDriver.some(d => d.driverId && d.driverId !== 'multi')
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-rose-500" /> อันดับคนขับ — ติดเครื่องนิ่ง (idle)
                </h3>
                {!hasNamed ? (
                  <p className="text-xs text-amber-600">⚠ ยังผูกคนขับกับรถไม่ได้ — สร้างใบงานในกระดานจ่ายงาน (ระบุคนขับต่อรอบ) ก่อน แล้ว idle จะแยกรายคนได้</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-xs">
                            <th className="px-3 py-2 text-left font-medium">คนขับ</th>
                            <th className="px-3 py-2 text-right font-medium">เที่ยว</th>
                            <th className="px-3 py-2 text-right font-medium">ระยะทาง</th>
                            <th className="px-3 py-2 text-right font-medium" title="เวลาขับ (ล้อหมุน) / ติดเครื่องนิ่ง (ล้อไม่หมุน)">ขับ / นิ่ง</th>
                            <th className="px-3 py-2 text-right font-medium">เร็วเกิน/กระชาก</th>
                            <th className="px-3 py-2 text-right font-medium">แวะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.byDriver.map((d, i) => {
                            const unknown = !d.driverId || d.driverId === 'multi'
                            return (
                              <tr key={d.driverId || `u${i}`} className="hover:bg-slate-50">
                                <td className={cn('px-3 py-2 whitespace-nowrap font-medium', unknown ? 'text-slate-400' : 'text-slate-700')}>
                                  {i === 0 && !unknown && d.idleMin > 0 && <span className="text-rose-500 mr-1" title="ติดเครื่องนิ่งมากสุด">🔴</span>}{d.name}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-600">{d.trips}</td>
                                <td className="px-3 py-2 text-right text-slate-700">{d.km.toFixed(0)} กม.</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <span className="text-slate-500">{fmtMin(d.drivingMin)}</span>
                                  <span className="text-slate-300"> / </span>
                                  <span className={cn(d.idleMin >= 60 ? 'text-rose-600 font-semibold' : d.idleMin > 0 ? 'text-amber-600' : 'text-slate-400')}>{d.idleMin > 0 ? fmtMin(d.idleMin) : '—'}</span>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-500">{d.overSpeed}/{d.harsh}</td>
                                <td className={cn('px-3 py-2 text-right font-medium', d.detourVisits > 0 ? 'text-amber-700' : 'text-slate-300')}>
                                  {d.detourVisits > 0 ? `${d.detourVisits} (${fmtMin(d.detourMin)})` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">นิ่ง = ติดเครื่องแต่ล้อไม่หมุน · ผูกคนขับจากใบงานกระดานจ่ายงาน (วัน+รถ → คนขับ) · “หลายคน/ไม่ระบุ” = ใบงานไม่ครบวันนั้น</p>
                  </>
                )}
              </div>
            )
          })()}
        </>
      )}

      {!loaded && !loading && !err && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">เลือกช่วงวันที่ แล้วกด “วิเคราะห์ภาพรวม”</p>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── เทียบแผน (audit) ─────────────────────────

function AuditTab() {
  const { rounds, customers, vehicles, dailyTrips, scheduleOverrides } = useStore()
  const [date, setDate] = useState(todayISO())
  const [view, setView] = useState<'round' | 'fleet'>('round') // 426 — รายรอบ / รายคัน/ฟลีต
  const [cars, setCars] = useState<GpsCar[]>([])
  const [audits, setAudits] = useState<RoundAudit[] | null>(null)
  const [vehicleAudits, setVehicleAudits] = useState<VehicleAudit[] | null>(null)
  const [tripsByCar, setTripsByCar] = useState<Map<string, GpsTrip[]> | null>(null) // 426 — ใช้เดารถ
  const [plannedTotal, setPlannedTotal] = useState({ stops: 0, bags: 0 })
  const [guessRoundId, setGuessRoundId] = useState<string | null>(null)
  const [pendingRerun, setPendingRerun] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { fetchGpsCars().then(setCars).catch(() => {}) }, [])

  const vehicleByPlate = useMemo(() => {
    const m = new Map<string, Vehicle>()
    vehicles.forEach(v => m.set(normalizePlate(v.licensePlate), v))
    return m
  }, [vehicles])

  const run = useCallback(async () => {
    setLoading(true); setErr(null); setAudits(null); setVehicleAudits(null)
    try {
      const activeRounds = [...rounds].filter(r => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
      const carByPlate = new Map(cars.map(c => [c.plateNorm, c]))

      const plan = activeRounds.map(round => {
        const dt = dailyTrips.find(t => t.id === dailyTripId(date, round.id))
        const vehicleId = dt?.vehicleId || round.defaultVehicleId
        const vehicle = vehicleId ? vehicles.find(v => v.id === vehicleId) : undefined
        const car = vehicle ? carByPlate.get(normalizePlate(vehicle.licensePlate)) : undefined
        const stops = dt?.stops ?? buildTripStops(round, customers, date, scheduleOverrides, 'schedule')
        return { round, vehicle, car, stops }
      })

      // 426 — ดึงเที่ยวของทุกคัน (ใช้ทั้งรายรอบ + รายคัน + เดารถ) · V2X มี ~3 คัน
      // historical 3 วันก่อน (V2X /report/trip/list ช้ากับช่วงยาว — 7 วัน = timeout 504)
      const histFrom = format(subDays(parseISO(date), 3), 'yyyy-MM-dd')
      const yesterday = format(subDays(parseISO(date), 1), 'yyyy-MM-dd')
      const dayTrips = new Map<string, GpsTrip[]>()
      const histMedian = new Map<string, number | null>()
      for (const car of cars) {
        dayTrips.set(car.carId, await fetchGpsTrips(car.plate, date))
        // historical = best-effort: ถ้า V2X timeout/error → median null (มิติอื่นยังทำงาน)
        try {
          const hist = await fetchGpsTrips(car.plate, histFrom, yesterday)
          histMedian.set(car.carId, medianDailyKm(hist, date))
        } catch {
          histMedian.set(car.carId, null)
        }
      }

      setAudits(plan.map(p => buildRoundAudit(
        p.round,
        p.vehicle?.code ?? null,
        p.car?.plate ?? null,
        !!p.car,
        p.stops,
        p.car ? (dayTrips.get(p.car.carId) || []) : [],
        p.car ? (histMedian.get(p.car.carId) ?? null) : null,
      )))
      setVehicleAudits(cars.map(car => buildVehicleAudit(
        car,
        vehicleByPlate.get(car.plateNorm)?.code ?? null,
        dayTrips.get(car.carId) || [],
        histMedian.get(car.carId) ?? null,
      )))
      setTripsByCar(dayTrips)
      setPlannedTotal({
        stops: plan.reduce((s, p) => s + p.stops.length, 0),
        bags: plan.reduce((s, p) => s + p.stops.reduce((x, st) => x + (st.bagCount || 0), 0), 0),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'วิเคราะห์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [rounds, customers, vehicles, dailyTrips, scheduleOverrides, cars, date, vehicleByPlate])

  // 426 — รัน audit ซ้ำหลังบันทึกรถจากการเดา (effect รอ store flush ก่อน → run closure เห็นข้อมูลใหม่)
  useEffect(() => {
    if (pendingRerun) { setPendingRerun(false); run() }
  }, [pendingRerun, run])

  const warnCount = useMemo(() => {
    const src = view === 'fleet' ? vehicleAudits : audits
    return src?.reduce((s, a) => s + a.flags.filter(f => f.level === 'warn').length, 0) ?? 0
  }, [audits, vehicleAudits, view])

  const fleetTotal = useMemo(() => ({
    count: vehicleAudits?.reduce((s, a) => s + a.actual.count, 0) ?? 0,
    km: vehicleAudits?.reduce((s, a) => s + a.actual.km, 0) ?? 0,
    fuel: vehicleAudits?.reduce((s, a) => s + a.actual.fuel, 0) ?? 0,
  }), [vehicleAudits])

  const guessRound = guessRoundId ? rounds.find(r => r.id === guessRoundId) : undefined

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">วันที่ตรวจ</label>
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">มุมมอง</label>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {([['round', 'รายรอบ'], ['fleet', 'รายคัน/ฟลีต']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className={cn('px-3 py-2 text-sm font-medium transition-colors',
                  view === k ? 'bg-[#1B3A5C] text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={run} disabled={loading || cars.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} เทียบแผน vs จริง
        </button>
        <p className="text-xs text-slate-400 sm:ml-auto sm:self-center">
          {view === 'fleet' ? 'ภาพรวมการวิ่งทุกคัน — ไม่ต้องผูกรถกับรอบ' : 'เทียบจุดในรอบ · เวลาออก/เลิก · ระยะทาง/น้ำมัน'}
        </p>
      </div>

      {err && <ErrorBlock msg={err} onRetry={run} />}
      {loading && <LoadingBlock />}

      {audits && !loading && (
        <>
          <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-2 text-sm font-medium',
            warnCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>
            {warnCount > 0
              ? <><AlertTriangle className="w-4 h-4" /> พบ {warnCount} ข้อควรตรวจสอบ จาก {view === 'fleet' ? `${vehicleAudits?.length ?? 0} คัน` : `${audits.length} รอบ`}</>
              : <><CheckCircle2 className="w-4 h-4" /> {view === 'fleet' ? `ทุกคันวิ่งปกติ (${vehicleAudits?.length ?? 0} คัน)` : `ทุกรอบวิ่งตามแผน (${audits.length} รอบ)`}</>}
          </div>

          {view === 'fleet' && vehicleAudits ? (
            <>
              {/* 426 — มุมมองรายคัน/ฟลีต: แผนรวมทุกรอบ vs วิ่งจริงทุกคัน (ไม่ต้องผูกรถกับรอบ) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={ClipboardCheck} label="แผนรวมทุกรอบ" value={`${plannedTotal.stops} จุด${plannedTotal.bags > 0 ? ` · ${plannedTotal.bags} ถุง` : ''}`} />
                <StatCard icon={Route} label="เที่ยวรวม (GPS)" value={`${fleetTotal.count} เที่ยว`} />
                <StatCard icon={TrendingUp} label="ระยะทางรวม" value={`${fleetTotal.km.toFixed(0)} กม.`} />
                <StatCard icon={Fuel} label="น้ำมันรวม" value={`${fleetTotal.fuel.toFixed(1)} ลิตร`} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicleAudits.map(va => (
                  <div key={va.carId} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {va.vehicleCode && <span className="text-xs font-bold bg-[#1B3A5C] text-white px-1.5 py-0.5 rounded shrink-0">คัน {va.vehicleCode}</span>}
                        <span className="font-semibold text-slate-800 truncate">{va.plate}</span>
                      </div>
                      {va.actual.count > 0 && (
                        <span className="text-xs text-slate-400 shrink-0 inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />{hhmmOf(va.actual.firstTime)}-{hhmmOf(va.actual.lastTime)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-xs text-slate-400 mb-0.5">เที่ยว</p>
                        <p className="text-slate-700 font-medium">{va.actual.count}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-xs text-slate-400 mb-0.5">ระยะทาง</p>
                        <p className="text-slate-700 font-medium">{va.actual.km.toFixed(0)} กม.</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-xs text-slate-400 mb-0.5">น้ำมัน</p>
                        <p className="text-slate-700 font-medium">{va.actual.fuel.toFixed(1)} ล.</p>
                      </div>
                    </div>

                    {(va.actual.kmPerLiter > 0 || va.medianKm != null) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                        {va.actual.kmPerLiter > 0 && <span className="inline-flex items-center gap-1"><Fuel className="w-3.5 h-3.5" />{va.actual.kmPerLiter.toFixed(1)} กม./ล.</span>}
                        {va.medianKm != null && <span className="text-slate-400">ปกติ ~{va.medianKm.toFixed(0)} กม./วัน</span>}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {va.flags.map((f, i) => <FlagRow key={i} flag={f} />)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {audits.map(a => (
                <div key={a.roundId} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: a.roundColor }}>{a.roundCode}</span>
                      <span className="text-xs text-slate-400">{a.roundStart}-{a.roundEnd}</span>
                    </div>
                    {a.vehicleCode
                      ? <span className="text-xs font-semibold text-slate-600">คัน {a.vehicleCode}{a.plate ? ` · ${a.plate}` : ''}</span>
                      : <span className="text-xs text-slate-400">ไม่มีรถผูกรอบ</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-xs text-slate-400 mb-0.5">แผน</p>
                      <p className="text-slate-700 font-medium">{a.plannedStops} จุด{a.plannedBags > 0 ? ` · ${a.plannedBags} ถุง` : ''}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-xs text-slate-400 mb-0.5">จริง (GPS)</p>
                      {a.matched
                        ? <p className="text-slate-700 font-medium">{a.actual.count} เที่ยว · {a.actual.km.toFixed(0)} กม.</p>
                        : <p className="text-slate-400">—</p>}
                    </div>
                  </div>

                  {a.matched && a.actual.count > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{hhmmOf(a.actual.firstTime)}-{hhmmOf(a.actual.lastTime)}</span>
                      <span className="inline-flex items-center gap-1"><Fuel className="w-3.5 h-3.5" />{a.actual.fuel.toFixed(1)} ล. ({a.actual.kmPerLiter.toFixed(1)} กม./ล.)</span>
                      {a.medianKm != null && <span className="text-slate-400">ปกติ ~{a.medianKm.toFixed(0)} กม./วัน</span>}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {a.flags.map((f, i) => <FlagRow key={i} flag={f} />)}
                  </div>

                  {/* 426 — รอบไม่มีรถ: ทางแก้ 2 ปุ่ม (กระดานจ่ายงาน / เดารถจาก GPS) */}
                  {!a.vehicleCode && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/dashboard/dispatch?date=${date}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                        <ClipboardCheck className="w-3.5 h-3.5" /> เปิดกระดานจ่ายงาน
                      </Link>
                      <button onClick={() => setGuessRoundId(a.roundId)} disabled={!tripsByCar}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3DD8D8]/15 text-[#1B3A5C] hover:bg-[#3DD8D8]/30 transition-colors disabled:opacity-50">
                        <Wand2 className="w-3.5 h-3.5" /> เดารถจาก GPS
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!audits && !loading && !err && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">เลือกวัน แล้วกด เทียบแผน vs จริง</p>
        </div>
      )}

      {guessRound && tripsByCar && (
        <GuessVehicleModal round={guessRound} cars={cars} tripsByCar={tripsByCar}
          vehicleByPlate={vehicleByPlate} date={date}
          onClose={() => setGuessRoundId(null)}
          onSaved={() => { setGuessRoundId(null); setPendingRerun(true) }} />
      )}
    </div>
  )
}

// 426 — เดารถจาก GPS: เทียบเวลาวิ่งจริงกับหน้าต่างเวลารอบ → เสนอ → ติ๊ดยืนยัน → บันทึก
function GuessVehicleModal({
  round, cars, tripsByCar, vehicleByPlate, date, onClose, onSaved,
}: {
  round: Round
  cars: GpsCar[]
  tripsByCar: Map<string, GpsTrip[]>
  vehicleByPlate: Map<string, Vehicle>
  date: string
  onClose: () => void
  onSaved: () => void
}) {
  const { customers, dailyTrips, scheduleOverrides, currentUser, addDailyTrips, updateDailyTrip, updateRound } = useStore()
  const guesses = useMemo(() => guessVehiclesForRound(round, cars, tripsByCar), [round, cars, tripsByCar])
  const [selected, setSelected] = useState<string>(guesses[0]?.carId || '')
  const [setAsDefault, setSetAsDefault] = useState(false)

  const selectedGuess = guesses.find(g => g.carId === selected)
  const selectedVehicle = selectedGuess ? vehicleByPlate.get(selectedGuess.plateNorm) : undefined

  const save = () => {
    if (!selectedVehicle) return
    const id = dailyTripId(date, round.id)
    const existing = dailyTrips.find(t => t.id === id)
    if (existing) {
      updateDailyTrip(id, { vehicleId: selectedVehicle.id })
    } else {
      // ยังไม่มีใบงานวันนั้น → สร้างให้เลย (โครงเดียวกับ generateOne ในกระดานจ่ายงาน)
      addDailyTrips([{
        id, date, roundId: round.id,
        vehicleId: selectedVehicle.id, driverId: round.defaultDriverId || '', helperId: round.defaultHelperId || '',
        status: 'planned', note: '', stops: buildTripStops(round, customers, date, scheduleOverrides, 'schedule'),
        createdBy: currentUser?.id || 'unknown', createdAt: new Date().toISOString(),
      }])
    }
    if (setAsDefault) updateRound(round.id, { defaultVehicleId: selectedVehicle.id })
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`เดารถจาก GPS · รอบ ${round.code}`} size="md" closeLabel="cancel">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          ดูจากเวลาวิ่งจริง (GPS) ที่ทับช่วงเวลารอบ <b>{round.startTime}–{round.endTime}</b> ของวันที่ {date}
          {' '}— รถ 1 คันอาจวิ่งหลายรอบ ตรวจตัวเลขก่อนยืนยัน
        </p>

        {guesses.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg">
            <Car className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">GPS ไม่พบรถคันไหนวิ่งในช่วงเวลารอบนี้</p>
          </div>
        ) : (
          <div className="space-y-2">
            {guesses.map((g, i) => {
              const v = vehicleByPlate.get(g.plateNorm)
              return (
                <label key={g.carId}
                  className={cn('flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selected === g.carId ? 'border-[#3DD8D8] bg-[#3DD8D8]/5' : 'border-slate-200 hover:bg-slate-50')}>
                  <input type="radio" name="guess-vehicle" checked={selected === g.carId}
                    onChange={() => setSelected(g.carId)} className="accent-[#1B3A5C]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {v && <span className="text-xs font-bold bg-[#1B3A5C] text-white px-1.5 py-0.5 rounded shrink-0">คัน {v.code}</span>}
                      <span className="text-sm font-semibold text-slate-800 truncate">{g.plate}</span>
                      {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">แนะนำ</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      วิ่งทับช่วงรอบ {fmtMin(g.overlapMin)} · ทั้งวัน {g.tripCount} เที่ยว · {g.km.toFixed(0)} กม.
                    </p>
                    {!v && <p className="text-xs text-amber-600 mt-0.5">⚠ ทะเบียนนี้ไม่ตรงกับรถในฟลีต — เพิ่ม/แก้ทะเบียนในหน้าฟลีตรถก่อน</p>}
                  </div>
                </label>
              )
            })}

            <label className="flex items-center gap-2 text-sm text-slate-600 pt-1 cursor-pointer">
              <input type="checkbox" checked={setAsDefault} onChange={e => setSetAsDefault(e.target.checked)} className="accent-[#1B3A5C]" />
              ตั้งเป็น “รถประจำรอบ {round.code}” ด้วย (ใช้กับทุกวัน ไม่ใช่แค่วันนี้)
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          {guesses.length > 0 && (
            <button onClick={save} disabled={!selectedVehicle}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] disabled:opacity-40 transition-colors">
              บันทึกลงใบงานวันนี้
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function FlagRow({ flag }: { flag: AuditFlag }) {
  const cfg = {
    warn: { Icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    info: { Icon: Info, cls: 'text-slate-600 bg-slate-50 border-slate-200' },
    ok: { Icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  }[flag.level]
  const Icon = cfg.Icon
  return (
    <div className={cn('flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg border', cfg.cls)}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{flag.message}</span>
    </div>
  )
}

// ───────────────────────── สถานที่บันทึก (432.1) ─────────────────────────
//   จัดการจุดที่ไม่ใช่ลูกค้า (ร้านอาหาร/ปั๊ม/จุดพัก/ธุระส่วนตัว) — เพิ่ม/แก้/ลบ
//   จุดเหล่านี้ใช้จับคู่จุดจอด GPS ในแท็บ "เที่ยววิ่ง" อัตโนมัติ
function PlacesTab() {
  const { savedPlaces, deleteSavedPlace } = useStore()
  const [editing, setEditing] = useState<SavedPlace | null>(null)
  const [adding, setAdding] = useState(false)

  const sorted = useMemo(
    () => [...savedPlaces].sort((a, b) => a.name.localeCompare(b.name, 'th')),
    [savedPlaces])

  const remove = (p: SavedPlace) => {
    if (confirm(`ลบสถานที่ “${p.name}”?\n(เที่ยววิ่งจะไม่ขึ้นชื่อนี้อีก)`)) deleteSavedPlace(p.id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          จุดที่บันทึกไว้ (ไม่ใช่ลูกค้า) — ใช้จับคู่จุดจอดในเที่ยววิ่งให้อ่านง่ายขึ้น · ประเภท
          <span className="text-amber-700 font-medium"> ร้านอาหาร/จุดพัก/ธุระส่วนตัว</span> = ไฮไลต์ว่าแวะนอกแผน
        </p>
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors shrink-0">
          <Plus className="w-4 h-4" /> เพิ่มสถานที่
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Coffee className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">ยังไม่มีสถานที่ที่บันทึก</p>
          <p className="text-xs text-slate-400 mt-1">กด “เพิ่มสถานที่” หรือกดหมุด 📍 ที่จุดจอดในแท็บเที่ยววิ่ง แล้วเลือก “สถานที่อื่น”</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {sorted.map(p => {
            const cfg = SAVED_PLACE_CATEGORY_CONFIG[p.category] || SAVED_PLACE_CATEGORY_CONFIG.other
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl shrink-0" aria-hidden>{cfg.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
                      cfg.detour ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>{cfg.label}</span>
                  </div>
                  {p.note && <p className="text-xs text-slate-400 truncate mt-0.5">{p.note}</p>}
                </div>
                <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                  className="text-slate-400 hover:text-[#1B3A5C] shrink-0" title={`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} — เปิด Google Maps`}>
                  <MapPin className="w-4 h-4" />
                </a>
                <button onClick={() => setEditing(p)} className="text-slate-400 hover:text-[#1B3A5C] shrink-0" title="แก้ไข">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => remove(p)} className="text-slate-400 hover:text-rose-500 shrink-0" title="ลบ">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {(adding || editing) && (
        <PlaceFormModal place={editing} onClose={() => { setAdding(false); setEditing(null) }} />
      )}
    </div>
  )
}

// 432.1 — ฟอร์มเพิ่ม/แก้สถานที่ (กรอกพิกัดเอง: วางลิงก์ Google Maps หรือพิกัดดิบ)
function PlaceFormModal({ place, onClose }: { place: SavedPlace | null; onClose: () => void }) {
  const { addSavedPlace, updateSavedPlace } = useStore()
  const [name, setName] = useState(place?.name || '')
  const [category, setCategory] = useState<SavedPlaceCategory>(place?.category || 'food')
  const [lat, setLat] = useState(place?.lat || 0)
  const [lng, setLng] = useState(place?.lng || 0)
  const [note, setNote] = useState(place?.note || '')

  const canSave = !!name.trim() && (lat !== 0 || lng !== 0)

  const save = () => {
    if (!canSave) return
    if (place) {
      updateSavedPlace(place.id, { name: name.trim(), category, lat, lng, note: note.trim() })
    } else {
      addSavedPlace({ name: name.trim(), category, lat, lng, note: note.trim() })
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={place ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่'} size="md" closeLabel="cancel">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">ชื่อสถานที่</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ร้านก๋วยเตี๋ยวไก่" autoFocus
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">ประเภท</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAVED_PLACE_CATEGORY_CONFIG) as SavedPlaceCategory[]).map(k => {
              const cfg = SAVED_PLACE_CATEGORY_CONFIG[k]
              return (
                <button key={k} onClick={() => setCategory(k)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1',
                    category === k ? 'border-[#3DD8D8] bg-[#3DD8D8]/10 text-[#1B3A5C]' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                  <span aria-hidden>{cfg.emoji}</span>{cfg.label}
                </button>
              )
            })}
          </div>
          {SAVED_PLACE_CATEGORY_CONFIG[category].detour && (
            <p className="text-[11px] text-amber-600 mt-1.5">⚠ ประเภทนี้นับเป็น “แวะส่วนตัว” — จะถูกไฮไลต์เตือนในเที่ยววิ่ง</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">พิกัด</label>
          <GpsCoordInput lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น คนขับชอบแวะตอนเช้า"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={!canSave}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] disabled:opacity-40 transition-colors">
            {place ? 'บันทึก' : 'เพิ่มสถานที่'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────── shared ─────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><Icon className="w-4 h-4 text-slate-400" />{label}</div>
      <p className="text-lg font-bold text-[#1B3A5C]">{value}</p>
    </div>
  )
}

function LoadingBlock() {
  return (
    <div className="text-center py-20">
      <Loader2 className="w-8 h-8 text-slate-300 mx-auto animate-spin mb-3" />
      <p className="text-slate-400 text-sm">กำลังเชื่อมต่อระบบ GPS…</p>
    </div>
  )
}

function ErrorBlock({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-amber-800 font-medium">เชื่อมต่อระบบ GPS ไม่สำเร็จ</p>
        <p className="text-xs text-amber-600 mt-0.5">{msg}</p>
      </div>
      <button onClick={onRetry} className="text-sm text-amber-700 hover:text-amber-900 font-medium shrink-0">ลองใหม่</button>
    </div>
  )
}
