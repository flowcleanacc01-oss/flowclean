'use client'

// GPS / ติดตามรถ — Feat 423 C (UI)
//   แท็บ "ตำแหน่งสด" (realtime จาก V2X) + "เที่ยววิ่ง" (trip history) · เชื่อมทะเบียนกับฟลีต
//   ดึงผ่าน /api/gps (server proxy) · ไม่ฝัง map (ใช้ลิงก์ Google Maps) เลี่ยง map API key

import { useState, useEffect, useMemo, useCallback } from 'react'
import { subDays, parseISO, format } from 'date-fns'
import { useStore } from '@/lib/store'
import { fetchGpsCars, fetchGpsRealtime, fetchGpsTrips } from '@/lib/gps-service'
import { normalizePlate, type GpsCar, type GpsPosition, type GpsTrip } from '@/lib/v2x-types'
import { buildRoundAudit, medianDailyKm, hhmmOf, type RoundAudit, type AuditFlag } from '@/lib/gps-audit'
import { buildTripStops } from '@/lib/dispatch'
import { todayISO, cn } from '@/lib/utils'
import { canViewFleet } from '@/lib/permissions'
import { dailyTripId, type Vehicle } from '@/types'
import {
  Satellite, MapPin, Navigation, RefreshCw, Radio, Gauge,
  ExternalLink, Route, TrendingUp, Fuel, AlertCircle, Loader2, Car, CircleDot, Clock,
  ClipboardCheck, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react'

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

export default function GpsPage() {
  const { currentUser, vehicles } = useStore()
  const [tab, setTab] = useState<'realtime' | 'trips' | 'audit'>('realtime')

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
        {([['realtime', 'ตำแหน่งสด', Radio], ['trips', 'เที่ยววิ่ง', Route], ['audit', 'เทียบแผน', ClipboardCheck]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5',
              tab === k ? 'border-[#3DD8D8] text-[#1B3A5C]' : 'border-transparent text-slate-400 hover:text-slate-600')}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'realtime' ? <RealtimeTab vehicleByPlate={vehicleByPlate} />
        : tab === 'trips' ? <TripsTab vehicleByPlate={vehicleByPlate} />
        : <AuditTab />}
    </div>
  )
}

// ───────────────────────── ตำแหน่งสด ─────────────────────────

function RealtimeTab({ vehicleByPlate }: { vehicleByPlate: Map<string, Vehicle> }) {
  const [positions, setPositions] = useState<GpsPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [updatedLabel, setUpdatedLabel] = useState('')

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {positions.map(p => {
          const v = vehicleByPlate.get(p.plateNorm)
          return (
            <div key={p.carId} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {v && <span className="text-xs font-bold bg-[#1B3A5C] text-white px-1.5 py-0.5 rounded shrink-0">คัน {v.code}</span>}
                    <span className="font-semibold text-slate-800 truncate">{p.plate}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">พิกัด {ago(p.gpsTime)}</p>
                </div>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0',
                  p.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  <CircleDot className="w-3 h-3" />{p.online ? 'ออนไลน์' : 'ออฟไลน์'}
                </span>
              </div>

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
                <MapPin className="w-4 h-4" /> เปิดแผนที่ <ExternalLink className="w-3 h-3" />
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
  const [cars, setCars] = useState<GpsCar[]>([])
  const [carId, setCarId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [trips, setTrips] = useState<GpsTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // โหลดรายชื่อรถครั้งแรก
  useEffect(() => {
    fetchGpsCars()
      .then(cs => { setCars(cs); if (cs[0]) setCarId(cs[0].carId) })
      .catch(e => setErr(e instanceof Error ? e.message : 'โหลดรายชื่อรถไม่สำเร็จ'))
  }, [])

  const load = useCallback(async () => {
    if (!carId) return
    setLoading(true); setErr(null)
    try {
      setTrips(await fetchGpsTrips(carId, date))
      setLoaded(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ดึงเที่ยววิ่งไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [carId, date])

  const summary = useMemo(() => ({
    count: trips.length,
    km: trips.reduce((s, t) => s + t.distanceKm, 0),
    fuel: trips.reduce((s, t) => s + t.fuelLiters, 0),
    drive: trips.reduce((s, t) => s + t.drivingMin, 0),
  }), [trips])

  const selectedCar = cars.find(c => c.carId === carId)
  const selectedVehicle = selectedCar ? vehicleByPlate.get(selectedCar.plateNorm) : undefined

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
        <button onClick={load} disabled={!carId || loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} ดึงข้อมูล
        </button>
      </div>

      {err && <ErrorBlock msg={err} onRetry={load} />}

      {loaded && !err && (
        <>
          {/* สรุปยอด */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Route} label="จำนวนเที่ยว" value={`${summary.count} เที่ยว`} />
            <StatCard icon={TrendingUp} label="ระยะทางรวม" value={`${summary.km.toFixed(1)} กม.`} />
            <StatCard icon={Fuel} label="น้ำมันรวม" value={`${summary.fuel.toFixed(2)} ลิตร`} />
            <StatCard icon={Clock} label="เวลาขับรวม" value={fmtMin(summary.drive)} />
          </div>

          {/* ตารางเที่ยว */}
          {trips.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">ไม่มีเที่ยววิ่งในวันนี้{selectedVehicle ? ` (คัน ${selectedVehicle.code})` : ''}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="px-3 py-2.5 text-left font-medium">เวลา</th>
                      <th className="px-3 py-2.5 text-right font-medium">ระยะทาง</th>
                      <th className="px-3 py-2.5 text-left font-medium">ปลายทาง</th>
                      <th className="px-3 py-2.5 text-right font-medium">น้ำมัน</th>
                      <th className="px-3 py-2.5 text-right font-medium">จอด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trips.map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 font-medium">
                          {hhmm(t.startTime)} → {hhmm(t.endTime)}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-700">{t.distanceKm.toFixed(2)} กม.</td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[260px] truncate" title={t.endAddress}>{t.endAddress || '—'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-500">{t.fuelLiters.toFixed(2)} ล.</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-400">{t.idleMin > 0 ? fmtMin(t.idleMin) : '—'}</td>
                      </tr>
                    ))}
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
    </div>
  )
}

// ───────────────────────── เทียบแผน (audit) ─────────────────────────

function AuditTab() {
  const { rounds, customers, vehicles, dailyTrips, scheduleOverrides } = useStore()
  const [date, setDate] = useState(todayISO())
  const [cars, setCars] = useState<GpsCar[]>([])
  const [audits, setAudits] = useState<RoundAudit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { fetchGpsCars().then(setCars).catch(() => {}) }, [])

  const run = useCallback(async () => {
    setLoading(true); setErr(null); setAudits(null)
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

      const carIds = [...new Set(plan.map(p => p.car?.carId).filter((x): x is string => !!x))]
      // historical 3 วันก่อน (V2X /report/trip/list ช้ากับช่วงยาว — 7 วัน = timeout 504)
      const histFrom = format(subDays(parseISO(date), 3), 'yyyy-MM-dd')
      const yesterday = format(subDays(parseISO(date), 1), 'yyyy-MM-dd')
      const dayTrips = new Map<string, GpsTrip[]>()
      const histMedian = new Map<string, number | null>()
      for (const carId of carIds) {
        dayTrips.set(carId, await fetchGpsTrips(carId, date))
        // historical = best-effort: ถ้า V2X timeout/error → median null (มิติอื่นยังทำงาน)
        try {
          const hist = await fetchGpsTrips(carId, histFrom, yesterday)
          histMedian.set(carId, medianDailyKm(hist, date))
        } catch {
          histMedian.set(carId, null)
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'วิเคราะห์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [rounds, customers, vehicles, dailyTrips, scheduleOverrides, cars, date])

  const warnCount = useMemo(
    () => audits?.reduce((s, a) => s + a.flags.filter(f => f.level === 'warn').length, 0) ?? 0,
    [audits],
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">วันที่ตรวจ</label>
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>
        <button onClick={run} disabled={loading || cars.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#2bb8b8] transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} เทียบแผน vs จริง
        </button>
        <p className="text-xs text-slate-400 sm:ml-auto sm:self-center">เทียบจุดในรอบ · เวลาออก/เลิก · ระยะทาง/น้ำมัน</p>
      </div>

      {err && <ErrorBlock msg={err} onRetry={run} />}
      {loading && <LoadingBlock />}

      {audits && !loading && (
        <>
          <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-2 text-sm font-medium',
            warnCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>
            {warnCount > 0
              ? <><AlertTriangle className="w-4 h-4" /> พบ {warnCount} ข้อควรตรวจสอบ จาก {audits.length} รอบ</>
              : <><CheckCircle2 className="w-4 h-4" /> ทุกรอบวิ่งตามแผน ({audits.length} รอบ)</>}
          </div>

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
              </div>
            ))}
          </div>
        </>
      )}

      {!audits && !loading && !err && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">เลือกวัน แล้วกด เทียบแผน vs จริง</p>
        </div>
      )}
    </div>
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
