'use client'

// 432.2.1 — แผนที่เส้นทางจริง (Leaflet + OpenStreetMap · ไม่ต้องใช้ API key)
//   โหลดผ่าน next/dynamic ssr:false → leaflet เข้า bundle เฉพาะตอนเปิดแผนที่ (ไม่หน่วงหน้าอื่น)
//   วาด polyline ต่อเที่ยว (สีต่างกัน) + หมุดเริ่ม/จบ + จุดขับขี่เสี่ยง · ใช้ circleMarker (vector) เลี่ยงปัญหา icon asset
// 443  — selectedIndex: null = โชว์ทุกเที่ยว (ภาพรวม) · number = โชว์เฉพาะเที่ยวนั้น (อ่านง่าย)
// 443.1 — playback: เล่นย้อนเส้นทางของเที่ยวที่เลือก (มาร์กเกอร์วิ่งตามเส้น + แถบเวลา + ปุ่มเล่น/หยุด/ความเร็ว/เลื่อน)
//   ⚠️ V2X track/{id} คืน lat/lng ครบ แต่ travelTime/speed = null ทุกจุด → playback กระจายเวลาเฉลี่ยตามช่วงเที่ยว
//      (ถ้าวันใด track มี time จริง → ใช้ time จริงอัตโนมัติ = speed เป๊ะตาม V2X)
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Play, Pause, RotateCcw, Gauge } from 'lucide-react'
import type { GpsTrackPoint, GpsDangerPoint } from '@/lib/v2x-types'
import { buildFractions, posAt } from '@/lib/route-playback'

export interface RouteTrack {
  label: string       // "เที่ยว 1 · 08:00→09:00"
  color: string
  points: GpsTrackPoint[]
  dangers: GpsDangerPoint[]
  startName?: string
  endName?: string
  passed?: { type: string; name: string; customerId?: string }[] // 435/447 — จุดที่ผ่าน (+ customerId เช็คคิวงาน) · legend ใช้ · map ไม่ใช้
  startMs?: number    // 443.1 — เวลาเริ่มเที่ยว (epoch ms) สำหรับนาฬิกา playback
  endMs?: number      // 443.1 — เวลาจบเที่ยว
}

// 439 — ทิศทาง a→b เป็นองศา (0=เหนือ, ตามเข็ม) สำหรับหมุนลูกศร · planar approx พอสำหรับระยะสั้นในเมือง
function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLng = (b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2))
  const dLat = b[0] - a[0]
  return (Math.atan2(dLng, dLat) * 180) / Math.PI
}

const SPEEDS = [0.5, 1, 2, 4, 8]
const BASE_WATCH_MS = 24_000 // เล่นทั้งเที่ยวจบใน ~24 วิ ที่ 1× (ปรับด้วยตัวคูณความเร็ว)

function fmtClock(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function RouteMap({ tracks, selectedIndex = null }: { tracks: RouteTrack[]; selectedIndex?: number | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  // playback refs (จัดการ Leaflet layer แบบ imperative)
  const coveredRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const progressRef = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [progress, setProgress] = useState(0) // 0..1 (mirror ของ progressRef สำหรับ UI)

  // เที่ยวที่กำลังเล่น (เฉพาะตอนเลือกเที่ยวเดียว + มีจุดพอเล่น)
  const active = selectedIndex != null ? tracks[selectedIndex] : null
  const canPlay = !!active && active.points.length >= 2
  const fractions = useMemo(() => (canPlay ? buildFractions(active!.points) : []), [canPlay, active])

  // ── สร้าง/วาดแผนที่ใหม่เมื่อ tracks หรือ selectedIndex เปลี่ยน ──
  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    // เลือกเที่ยวที่จะวาด: ทั้งหมด (overview) หรือเฉพาะเที่ยวที่เลือก
    const drawIdx = selectedIndex != null && tracks[selectedIndex] ? [selectedIndex] : tracks.map((_, i) => i)
    const single = selectedIndex != null && tracks[selectedIndex]
    const bounds: [number, number][] = []

    drawIdx.forEach(ti => {
      const t = tracks[ti]
      const latlngs = t.points.map(p => [p.lat, p.lng] as [number, number])
      if (latlngs.length > 0) {
        // โหมดเล่นย้อน: เส้นเต็มจาง + เส้น "วิ่งผ่านแล้ว" ทึบโตขึ้น · โหมดภาพรวม: เส้นทึบปกติ
        L.polyline(latlngs, { color: t.color, weight: 4, opacity: single ? 0.3 : 0.85 }).addTo(map)
        bounds.push(...latlngs)
        if (!single) {
          // 439 — ลูกศรทิศทางเป็นระยะ (เฉพาะภาพรวม — โหมดเล่นย้อนใช้มาร์กเกอร์วิ่งบอกทิศแทน)
          const step = Math.min(40, Math.max(5, Math.round(latlngs.length / 10)))
          for (let k = step; k < latlngs.length; k += step) {
            L.marker(latlngs[k], {
              interactive: false, keyboard: false,
              icon: L.divIcon({
                className: '',
                html: `<div style="color:${t.color};transform:rotate(${bearingDeg(latlngs[k - 1], latlngs[k])}deg);font-size:15px;line-height:1;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 2px #fff">▲</div>`,
                iconSize: [16, 16], iconAnchor: [8, 8],
              }),
            }).addTo(map)
          }
        }
        const start = latlngs[0]
        const end = latlngs[latlngs.length - 1]
        // หมุดเริ่ม (เขียว) — เที่ยวแรกของภาพรวม หรือเที่ยวที่เลือก
        if (ti === drawIdx[0]) {
          L.circleMarker(start, { radius: 6, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1, weight: 2 })
            .addTo(map).bindPopup(`เริ่ม: ${t.startName || t.label}`)
        }
        // หมุดจบ (วงสีเที่ยว) — = จุดจอด/ส่งผ้า
        L.circleMarker(end, { radius: 7, color: t.color, fillColor: '#ffffff', fillOpacity: 1, weight: 3 })
          .addTo(map).bindPopup(`${t.label}<br>จบ: ${t.endName || '—'}`)
      }
      // จุดขับขี่เสี่ยง (แดง)
      t.dangers.forEach(d => {
        L.circleMarker([d.lat, d.lng], { radius: 4, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9, weight: 1 })
          .addTo(map).bindPopup(`จุดขับขี่เสี่ยง · ${d.time}`)
        bounds.push([d.lat, d.lng])
      })
    })

    // โหมดเล่นย้อน: เตรียมเส้น "วิ่งผ่านแล้ว" + มาร์กเกอร์รถ
    coveredRef.current = null
    markerRef.current = null
    if (single && tracks[selectedIndex!].points.length >= 2) {
      const t = tracks[selectedIndex!]
      coveredRef.current = L.polyline([[t.points[0].lat, t.points[0].lng]], { color: t.color, weight: 6, opacity: 0.95 }).addTo(map)
      markerRef.current = L.marker([t.points[0].lat, t.points[0].lng], {
        interactive: false, keyboard: false, zIndexOffset: 1000,
        icon: L.divIcon({
          className: '',
          html: `<div style="width:18px;height:18px;border-radius:50%;background:${t.color};border:3px solid #fff;box-shadow:0 0 0 2px ${t.color},0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        }),
      }).addTo(map)
    }

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
    else map.setView([13.736, 100.56], 11)

    const inv = setTimeout(() => map.invalidateSize(), 120)
    return () => { clearTimeout(inv); map.remove(); mapRef.current = null }
  }, [tracks, selectedIndex])

  // รีเซ็ต playback เมื่อเปลี่ยนเที่ยว
  useEffect(() => {
    setPlaying(false); setProgress(0); progressRef.current = 0; lastTsRef.current = null
  }, [selectedIndex])

  // วาดมาร์กเกอร์/เส้นผ่านแล้ว ณ สัดส่วน f
  const renderAt = (f: number) => {
    if (!active || !markerRef.current || !coveredRef.current) return
    const { pos, idx } = posAt(active.points, fractions, f)
    markerRef.current.setLatLng(pos)
    const covered = active.points.slice(0, idx + 1).map(p => [p.lat, p.lng] as [number, number])
    covered.push(pos)
    coveredRef.current.setLatLngs(covered)
  }

  // ── animation loop ──
  useEffect(() => {
    if (!playing || !canPlay) return
    const stepMs = BASE_WATCH_MS / speed
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      let f = progressRef.current + dt / stepMs
      if (f >= 1) { f = 1 }
      progressRef.current = f
      setProgress(f)
      renderAt(f)
      if (f >= 1) { setPlaying(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastTsRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, canPlay, selectedIndex])

  const onPlayPause = () => {
    if (!canPlay) return
    if (progressRef.current >= 1) { progressRef.current = 0; setProgress(0); renderAt(0) } // เล่นใหม่จากต้น
    lastTsRef.current = null
    setPlaying(p => !p)
  }
  const onReset = () => {
    setPlaying(false); progressRef.current = 0; setProgress(0); lastTsRef.current = null; renderAt(0)
  }
  const onScrub = (v: number) => {
    setPlaying(false); progressRef.current = v; setProgress(v); lastTsRef.current = null; renderAt(v)
  }

  // นาฬิกาเวลาจริง ณ สัดส่วนปัจจุบัน (ถ้ารู้ start/end ms)
  const clock = active && active.startMs && active.endMs
    ? fmtClock(active.startMs + (active.endMs - active.startMs) * progress)
    : null

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: 320 }} />
      {/* 443.1 — แถบควบคุมเล่นย้อน (เฉพาะตอนเลือกเที่ยวเดียว) */}
      {canPlay && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-[1000] w-[min(94%,560px)] bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onPlayPause}
              className="w-9 h-9 shrink-0 rounded-full bg-[#1B3A5C] text-white flex items-center justify-center hover:bg-[#122740] transition-colors"
              aria-label={playing ? 'หยุด' : 'เล่น'}>
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button type="button" onClick={onReset} aria-label="เริ่มใหม่"
              className="w-8 h-8 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#1B3A5C] flex items-center justify-center transition-colors">
              <RotateCcw className="w-4 h-4" />
            </button>
            <input type="range" min={0} max={1} step={0.001} value={progress}
              onChange={e => onScrub(Number(e.target.value))}
              className="flex-1 h-1.5 accent-[#3DD8D8] cursor-pointer" aria-label="เลื่อนตำแหน่ง" />
            <span className="shrink-0 tabular-nums text-xs font-semibold text-slate-600 w-[58px] text-right">
              {clock || `${Math.round(progress * 100)}%`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <Gauge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {SPEEDS.map(s => (
              <button key={s} type="button" onClick={() => setSpeed(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${speed === s ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'text-slate-500 hover:bg-slate-100'}`}>
                {s}×
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-400 truncate">{active?.label}</span>
          </div>
        </div>
      )}
    </div>
  )
}
