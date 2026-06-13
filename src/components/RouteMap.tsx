'use client'

// 432.2.1 — แผนที่เส้นทางจริง (Leaflet + OpenStreetMap · ไม่ต้องใช้ API key)
//   โหลดผ่าน next/dynamic ssr:false → leaflet เข้า bundle เฉพาะตอนเปิดแผนที่ (ไม่หน่วงหน้าอื่น)
//   วาด polyline ต่อเที่ยว (สีต่างกัน) + หมุดเริ่ม/จบ + จุดขับขี่เสี่ยง · ใช้ circleMarker (vector) เลี่ยงปัญหา icon asset
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsTrackPoint, GpsDangerPoint } from '@/lib/v2x-types'

export interface RouteTrack {
  label: string       // "เที่ยว 1 · 08:00→09:00"
  color: string
  points: GpsTrackPoint[]
  dangers: GpsDangerPoint[]
  startName?: string
  endName?: string
  passed?: { type: string; name: string }[] // 435 — จุดที่รู้จักที่เส้นทางผ่าน (legend ใช้ · map ไม่ใช้)
}

export default function RouteMap({ tracks }: { tracks: RouteTrack[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const bounds: [number, number][] = []
    tracks.forEach((t, ti) => {
      const latlngs = t.points.map(p => [p.lat, p.lng] as [number, number])
      if (latlngs.length > 0) {
        L.polyline(latlngs, { color: t.color, weight: 4, opacity: 0.85 }).addTo(map)
        bounds.push(...latlngs)
        const start = latlngs[0]
        const end = latlngs[latlngs.length - 1]
        // หมุดเริ่ม (เขียว) — เฉพาะเที่ยวแรก เพื่อไม่รก
        if (ti === 0) {
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

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
    } else {
      map.setView([13.736, 100.56], 11) // กรุงเทพฯ เป็น default
    }

    // แผนที่เปิดใน modal → container เพิ่งมีขนาดจริง ต้อง invalidate กัน tile เพี้ยน
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => { clearTimeout(t); map.remove() }
  }, [tracks])

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: 320 }} />
}
