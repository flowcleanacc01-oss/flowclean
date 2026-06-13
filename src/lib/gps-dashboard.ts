// 432.2.2 — GPS Dashboard: สรุปภาพรวมเที่ยววิ่งหลายคัน/หลายวัน เพื่อ audit + ควบคุมประสิทธิภาพคนขับ
//   pure ทั้งไฟล์ (testable) · รับ trips ต่อคัน → aggregate เป็น KPI / รายคัน / รายวัน / จุดแวะ
import type { Customer, SavedPlace } from '@/types'
import type { GpsTrip } from './v2x-types'
import { matchPlace, engineOffGaps, isShuffleTrip, type LatLng } from './geo'

/** จุดแวะที่นับเป็น detour ต้องไม่เกินนี้ (กัน gap ข้ามวัน/จอดค้างคืน ปนเข้ามา) */
const MAX_DETOUR_GAP_MIN = 120

/** ประเภท SavedPlace ที่นับเป็น "แวะส่วนตัว" (sync กับ SAVED_PLACE_CATEGORY_CONFIG.detour) */
const SAVED_DETOUR_CATS = new Set<SavedPlace['category']>(['food', 'rest', 'personal'])

export interface VehicleAgg {
  carId: string
  plate: string
  vehicleCode: string | null
  trips: number       // เที่ยวจริง (ไม่นับขยับรถ)
  km: number
  fuel: number
  drivingMin: number
  idleMin: number
  scoreAvg: number    // เฉลี่ยเฉพาะเที่ยวที่มีคะแนน (>0)
  overSpeed: number
  harsh: number       // กระชาก = accel + decel
  kmPerLiter: number
  detourVisits: number
  detourMin: number
}

export interface DayAgg {
  day: string         // yyyy-mm-dd
  km: number
  trips: number
  fuel: number
}

export interface DetourAgg {
  name: string
  category: SavedPlace['category']
  visits: number
  totalMin: number
}

// 435 — สรุปต่อคนขับ (จับตา "ติดเครื่องนิ่ง" ต่อคน) · attribute ผ่าน driverResolver(carId, day)
export interface DriverAgg {
  driverId: string    // '' = ไม่ระบุคนขับ · 'multi' = วันนั้นรถมีหลายคนขับ (แยกไม่ได้)
  name: string
  trips: number
  km: number
  drivingMin: number
  idleMin: number
  overSpeed: number
  harsh: number
  detourVisits: number
  detourMin: number
}

/** map (carId, day) → คนขับ · คืน {id:'', name:'ไม่ระบุคนขับ'} ถ้าไม่มีใบงาน, {id:'multi',...} ถ้าหลายคน */
export type DriverResolver = (carId: string, day: string) => { id: string; name: string }

export interface DashboardTotals {
  trips: number
  km: number
  fuel: number
  drivingMin: number
  idleMin: number
  scoreAvg: number
  overSpeed: number
  harsh: number
  kmPerLiter: number
  detourVisits: number
  detourMin: number
}

export interface DashboardStats {
  totals: DashboardTotals
  byVehicle: VehicleAgg[]
  byDay: DayAgg[]
  detours: DetourAgg[]
  byDriver: DriverAgg[] // 435 — เรียง idle มาก→น้อย (ว่างถ้าไม่ส่ง driverResolver)
}

/** "2026-06-10 16:23:00" → "2026-06-10" */
function dayOf(time: string): string {
  return (time || '').slice(0, 10)
}

export interface VehicleTrips {
  carId: string
  plate: string
  vehicleCode: string | null
  trips: GpsTrip[]
}

/**
 * รวมสถิติ dashboard จากเที่ยววิ่งหลายคัน
 *   detour = ช่วงดับเครื่องจอด (engineOffGap) ที่จุดจอดตรงกับ SavedPlace ประเภท "แวะส่วนตัว" และ ≤ 120 นาที
 */
export function buildDashboardStats(
  vehicles: VehicleTrips[],
  customers: Customer[],
  factory: LatLng | null,
  savedPlaces: SavedPlace[],
  driverResolver?: DriverResolver, // 435 — ถ้าส่ง = สร้าง byDriver
): DashboardStats {
  const detourPlaces = savedPlaces.filter(p => SAVED_DETOUR_CATS.has(p.category))
  const byDayMap = new Map<string, DayAgg>()
  const detourMap = new Map<string, DetourAgg>()
  const driverMap = new Map<string, DriverAgg>()
  const byVehicle: VehicleAgg[] = []

  // 435 — accumulate metric ของวันหนึ่งให้คนขับ (สร้าง agg ถ้ายังไม่มี)
  const addToDriver = (drv: { id: string; name: string }, patch: Partial<DriverAgg>) => {
    const a = driverMap.get(drv.id) || {
      driverId: drv.id, name: drv.name, trips: 0, km: 0, drivingMin: 0, idleMin: 0,
      overSpeed: 0, harsh: 0, detourVisits: 0, detourMin: 0,
    }
    a.trips += patch.trips || 0; a.km += patch.km || 0
    a.drivingMin += patch.drivingMin || 0; a.idleMin += patch.idleMin || 0
    a.overSpeed += patch.overSpeed || 0; a.harsh += patch.harsh || 0
    a.detourVisits += patch.detourVisits || 0; a.detourMin += patch.detourMin || 0
    driverMap.set(drv.id, a)
  }

  for (const v of vehicles) {
    const sorted = [...v.trips].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const real = sorted.filter(t => !isShuffleTrip(t))
    const scored = sorted.filter(t => t.score > 0)
    const km = sorted.reduce((s, t) => s + t.distanceKm, 0)
    const fuel = sorted.reduce((s, t) => s + t.fuelLiters, 0)
    const gaps = engineOffGaps(sorted)

    // รายวัน (รวมทุกคัน) + 435: attribute ต่อคนขับต่อวัน
    const dayTripsMap = new Map<string, GpsTrip[]>()
    for (const t of sorted) {
      const d = dayOf(t.startTime)
      if (!d) continue
      const cur = byDayMap.get(d) || { day: d, km: 0, trips: 0, fuel: 0 }
      cur.km += t.distanceKm
      cur.fuel += t.fuelLiters
      if (!isShuffleTrip(t)) cur.trips += 1
      byDayMap.set(d, cur)
      if (!dayTripsMap.has(d)) dayTripsMap.set(d, [])
      dayTripsMap.get(d)!.push(t)
    }
    if (driverResolver) {
      for (const [day, dts] of dayTripsMap) {
        addToDriver(driverResolver(v.carId, day), {
          trips: dts.filter(t => !isShuffleTrip(t)).length,
          km: dts.reduce((s, t) => s + t.distanceKm, 0),
          drivingMin: dts.reduce((s, t) => s + t.drivingMin, 0),
          idleMin: dts.reduce((s, t) => s + t.idleMin, 0),
          overSpeed: dts.reduce((s, t) => s + t.overSpeedCount, 0),
          harsh: dts.reduce((s, t) => s + t.rapidAccelCount + t.rapidDecelCount, 0),
        })
      }
    }

    // จุดแวะ (detour) — จาก engine-off gap ที่ตรง SavedPlace แวะส่วนตัว
    let vDetourVisits = 0, vDetourMin = 0
    for (const gap of gaps) {
      if (gap.minutes > MAX_DETOUR_GAP_MIN) continue
      // เฉพาะจุดที่ไม่ใช่ลูกค้า/โรงงาน — match กับ detourPlaces เท่านั้น
      const m = matchPlace(gap.lat, gap.lng, customers, factory, detourPlaces)
      if (m?.type !== 'saved' || !m.savedPlace) continue
      vDetourVisits += 1
      vDetourMin += gap.minutes
      const key = m.savedPlace.id
      const da = detourMap.get(key) || { name: m.savedPlace.name, category: m.savedPlace.category, visits: 0, totalMin: 0 }
      da.visits += 1
      da.totalMin += gap.minutes
      detourMap.set(key, da)
      if (driverResolver) addToDriver(driverResolver(v.carId, dayOf(gap.fromTime)), { detourVisits: 1, detourMin: gap.minutes })
    }

    byVehicle.push({
      carId: v.carId,
      plate: v.plate,
      vehicleCode: v.vehicleCode,
      trips: real.length,
      km,
      fuel,
      drivingMin: sorted.reduce((s, t) => s + t.drivingMin, 0),
      idleMin: sorted.reduce((s, t) => s + t.idleMin, 0),
      scoreAvg: scored.length ? scored.reduce((s, t) => s + t.score, 0) / scored.length : 0,
      overSpeed: sorted.reduce((s, t) => s + t.overSpeedCount, 0),
      harsh: sorted.reduce((s, t) => s + t.rapidAccelCount + t.rapidDecelCount, 0),
      kmPerLiter: fuel > 0 ? km / fuel : 0,
      detourVisits: vDetourVisits,
      detourMin: vDetourMin,
    })
  }

  // totals
  const sum = (sel: (a: VehicleAgg) => number) => byVehicle.reduce((s, a) => s + sel(a), 0)
  const totKm = sum(a => a.km), totFuel = sum(a => a.fuel)
  // คะแนนเฉลี่ยถ่วงน้ำหนักด้วยจำนวนเที่ยวที่มีคะแนน
  let scoreWeightSum = 0, scoreWeight = 0
  for (const v of vehicles) {
    for (const t of v.trips) if (t.score > 0) { scoreWeightSum += t.score; scoreWeight += 1 }
  }

  const totals: DashboardTotals = {
    trips: sum(a => a.trips),
    km: totKm,
    fuel: totFuel,
    drivingMin: sum(a => a.drivingMin),
    idleMin: sum(a => a.idleMin),
    scoreAvg: scoreWeight ? scoreWeightSum / scoreWeight : 0,
    overSpeed: sum(a => a.overSpeed),
    harsh: sum(a => a.harsh),
    kmPerLiter: totFuel > 0 ? totKm / totFuel : 0,
    detourVisits: sum(a => a.detourVisits),
    detourMin: sum(a => a.detourMin),
  }

  return {
    totals,
    byVehicle: byVehicle.sort((a, b) => b.km - a.km),
    byDay: [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    detours: [...detourMap.values()].sort((a, b) => b.visits - a.visits),
    byDriver: [...driverMap.values()].sort((a, b) => b.idleMin - a.idleMin), // 435 — idle มาก→น้อย
  }
}
