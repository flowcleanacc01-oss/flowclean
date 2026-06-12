'use client'

// 427 — ช่องกรอกพิกัด GPS: วางลิงก์ Google Maps / พิกัดดิบ → parse เป็น lat,lng อัตโนมัติ
//   ใช้ร่วม: form ลูกค้า (จุดส่งผ้า) + ตั้งค่าบริษัท (พิกัดโรงงาน)
import { useState } from 'react'
import { parseLatLng } from '@/lib/geo'
import { MapPin, X, ExternalLink } from 'lucide-react'

export default function GpsCoordInput({
  lat, lng, onChange, placeholder,
}: {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const [err, setErr] = useState(false)
  const hasCoord = !!(lat || lng)

  const apply = (v: string) => {
    setText(v)
    if (!v.trim()) { setErr(false); return }
    const p = parseLatLng(v)
    if (p) {
      onChange(p.lat, p.lng)
      setText('')
      setErr(false)
    } else {
      setErr(true)
    }
  }

  if (hasCoord) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-emerald-200 bg-emerald-50/50 rounded-lg text-sm">
        <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="font-mono text-xs text-slate-700 truncate">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
          className="text-[#1B3A5C] hover:text-[#3DD8D8] shrink-0" title="เปิดดูใน Google Maps">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button type="button" onClick={() => onChange(0, 0)} aria-label="ล้างพิกัด"
          className="ml-auto text-slate-300 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
      </div>
    )
  }

  return (
    <div>
      <input value={text} onChange={e => apply(e.target.value)}
        placeholder={placeholder || 'วางลิงก์ Google Maps หรือพิกัด เช่น 13.7563, 100.5018'}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
      {err && (
        <p className="text-[11px] text-amber-600 mt-1">
          อ่านพิกัดไม่ได้ — ลิงก์สั้น (maps.app.goo.gl) ให้เปิดในเบราว์เซอร์ก่อน แล้วคัดลอก URL เต็มจาก address bar มาวาง
        </p>
      )}
    </div>
  )
}
