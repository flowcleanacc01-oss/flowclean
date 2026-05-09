'use client'

/**
 * 240 — Orphan Code Inspector
 *
 * แสดง orphan codes ทั้งหมด (code ที่อยู่ใน QT/LF/DN/Customer แต่ลบจาก catalog แล้ว)
 * พร้อม:
 *   - Name candidates ที่เคยถูกใส่ใน QT/DN
 *   - Avg price (เทียบ catalog item ปัจจุบัน → suggest target)
 *   - รายชื่อลูกค้าที่ใช้ + นับ refs (LF/QT/SD)
 *   - 1-click action: Reassign / เพิ่มกลับ catalog / ลบทิ้ง
 *
 * ทุก action delegate ไป MergeCodesTool ผ่าน URL params (?mergeSource= &mergeTarget= &deleteAfter=)
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useOrphanCodes, type OrphanEntry } from '@/lib/use-orphan-codes'
import { AlertTriangle, ArrowRight, Plus, Trash2, Search, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SuggestedTarget {
  code: string
  name: string
  defaultPrice: number
  scoreReason: string  // "ราคาตรง", "ราคา ±10%", "prefix ตรง", etc.
  confidence: 'high' | 'medium' | 'low'
}

export default function OrphanCodeInspector() {
  const router = useRouter()
  const { linenCatalog } = useStore()
  const { orphans } = useOrphanCodes()
  const [search, setSearch] = useState('')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)

  // Auto-suggest target จาก price + prefix matching
  const suggestTarget = (entry: OrphanEntry): SuggestedTarget | null => {
    if (entry.avgPrice <= 0) return null
    const prefix = entry.code.slice(0, 1) // "A19" → "A", "H22" → "H"

    const candidates = linenCatalog.map(item => {
      const priceDiff = Math.abs(item.defaultPrice - entry.avgPrice)
      const pricePct = item.defaultPrice > 0 ? priceDiff / item.defaultPrice : 1
      const samePrefix = item.code.startsWith(prefix)
      // Confidence scoring: ราคาตรง > ราคา ±10% > prefix match
      let score = 0
      let reason = ''
      let confidence: SuggestedTarget['confidence'] = 'low'
      if (priceDiff < 0.01) {
        score = 100
        reason = 'ราคาตรงเป๊ะ'
        confidence = 'high'
      } else if (pricePct <= 0.1) {
        score = 70
        reason = `ราคา ±${Math.round(pricePct * 100)}%`
        confidence = 'high'
      } else if (pricePct <= 0.25) {
        score = 40
        reason = `ราคา ±${Math.round(pricePct * 100)}%`
        confidence = 'medium'
      } else if (pricePct <= 0.5) {
        score = 15
        reason = `ราคา ±${Math.round(pricePct * 100)}%`
        confidence = 'low'
      }
      if (samePrefix && score > 0) score += 10
      return { item, score, reason, confidence }
    })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)

    const top = candidates[0]
    if (!top) return null
    return {
      code: top.item.code,
      name: top.item.name,
      defaultPrice: top.item.defaultPrice,
      scoreReason: top.reason,
      confidence: top.confidence,
    }
  }

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orphans
    return orphans.filter(e =>
      e.code.toLowerCase().includes(q) ||
      e.names.some(n => n.toLowerCase().includes(q)) ||
      e.customers.some(c => c.shortName.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    )
  }, [orphans, search])

  // Action: 1-click reassign — push URL ไป MergeCodesTool prefilled
  const goReassign = (source: string, target?: string) => {
    const sp = new URLSearchParams({ tab: 'merge', mergeSource: source })
    if (target) sp.set('mergeTarget', target)
    router.push(`/dashboard/items?${sp.toString()}`)
  }
  const goReadd = (code: string) => {
    router.push(`/dashboard/items?addCode=${encodeURIComponent(code)}`)
  }
  const goDelete = (source: string, target?: string) => {
    const sp = new URLSearchParams({ tab: 'merge', mergeSource: source, deleteAfter: '1' })
    if (target) sp.set('mergeTarget', target)
    router.push(`/dashboard/items?${sp.toString()}`)
  }

  if (orphans.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Sparkles className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
        <div className="text-sm">ไม่มี orphan codes ในระบบ</div>
        <div className="text-xs mt-1">code ทุกตัวใน QT/LF/DN/Customer มี catalog matching ครบ</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-orange-800">Orphan Code Inspector</div>
            <div className="text-xs text-orange-700 mt-1">
              พบ <strong>{orphans.length}</strong> code ที่อยู่ใน QT/LF/DN/Customer แต่ถูกลบจาก catalog แล้ว
              · แต่ละ code แสดง name candidate (จาก QT) + suggested target (เทียบราคา) + customer ที่กระทบ
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา code / ชื่อ / ลูกค้า..."
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none"
        />
      </div>

      {/* Orphan list */}
      <div className="space-y-2">
        {filtered.map(entry => {
          const suggested = suggestTarget(entry)
          const isExpanded = expandedCode === entry.code
          const customerNames = entry.customers.slice(0, 3).map(c => c.shortName).join(', ')
          const moreCust = entry.customers.length > 3 ? ` +${entry.customers.length - 3}` : ''

          return (
            <div key={entry.code} className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Row header — always visible */}
              <div className="flex items-center gap-3 p-3 bg-white hover:bg-slate-50 cursor-pointer"
                onClick={() => setExpandedCode(isExpanded ? null : entry.code)}
              >
                {/* Code + name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-orange-700">{entry.code}</span>
                    {entry.names.length > 0 ? (
                      <span className="text-sm text-slate-700">{entry.names[0]}</span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">(ไม่พบชื่อใน QT/DN)</span>
                    )}
                    {entry.names.length > 1 && (
                      <span className="text-[10px] text-slate-400">+{entry.names.length - 1} ชื่อ</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {entry.lfs.length} LF · {entry.qts.length} QT · {entry.dns.length} SD · {entry.customers.length} ลูกค้า
                    {entry.coas.length > 0 && (
                      <span className="ml-1 text-orange-600 font-medium">· {entry.coas.length} ปรับผ้าค้าง</span>
                    )}
                    {customerNames && <span className="ml-1.5 text-slate-400">({customerNames}{moreCust})</span>}
                  </div>
                </div>

                {/* Avg price */}
                <div className="text-right text-xs text-slate-500">
                  {entry.avgPrice > 0 ? (
                    <>
                      <div className="font-mono">฿{entry.avgPrice}</div>
                      <div className="text-[10px]">avg/ชิ้น</div>
                    </>
                  ) : (
                    <span className="text-[10px] italic">ไม่มี ราคา</span>
                  )}
                </div>

                {/* Suggested target */}
                <div className="min-w-[140px]">
                  {suggested ? (
                    <div className={cn(
                      "text-[11px] rounded-md px-2 py-1.5 border",
                      suggested.confidence === 'high' && "bg-emerald-50 border-emerald-200 text-emerald-800",
                      suggested.confidence === 'medium' && "bg-amber-50 border-amber-200 text-amber-800",
                      suggested.confidence === 'low' && "bg-slate-50 border-slate-200 text-slate-600",
                    )}>
                      <div className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 flex-shrink-0" />
                        <span className="font-mono font-semibold">{suggested.code}</span>
                        <span className="truncate">{suggested.name}</span>
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">{suggested.scoreReason}</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 italic text-center">ไม่มี suggested</div>
                  )}
                </div>

                {/* Expand toggle */}
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>

              {/* Expanded body — actions + details */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {suggested && suggested.confidence !== 'low' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); goReassign(entry.code, suggested.code) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
                        title={`Reassign ${entry.code} → ${suggested.code} (preselect target)`}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Reassign → {suggested.code} (1-click)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); goReassign(entry.code) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-700 hover:bg-slate-100 hover:border-slate-400 transition-colors"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Map → เลือก target อื่น
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); goReadd(entry.code) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-700 hover:bg-emerald-50 hover:border-emerald-400 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่มกลับ catalog
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); goDelete(entry.code, suggested?.code) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-700 hover:bg-red-50 hover:border-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      ลบทิ้ง (ผ่าน merge)
                    </button>
                  </div>

                  {/* Names found */}
                  {entry.names.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700 mb-1">ชื่อที่พบใน QT/DN:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.names.map(n => (
                          <span key={n} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px]">{n}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* QT references with names + prices */}
                  {entry.qts.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700 mb-1">QT references ({entry.qts.length}):</div>
                      <div className="space-y-0.5 max-h-32 overflow-auto pr-2">
                        {entry.qts.slice(0, 10).map((q, i) => (
                          <div key={`${q.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                            <span className="font-mono">{q.number}</span>
                            <span className="flex-1 truncate">{q.nameInQT || '(ไม่มีชื่อ)'}</span>
                            <span className="font-mono text-slate-500">฿{q.pricePerUnit}</span>
                            <span className="text-[10px] text-slate-400">{q.status}</span>
                          </div>
                        ))}
                        {entry.qts.length > 10 && (
                          <div className="text-[10px] text-slate-400 italic">+{entry.qts.length - 10} QT อื่น</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Customers list */}
                  {entry.customers.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700 mb-1">ลูกค้าที่ใช้ ({entry.customers.length}):</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.customers.map(c => (
                          <span key={c.id} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                            {c.shortName}
                            {c.priceListPrice != null && <span className="ml-1 text-slate-400">฿{c.priceListPrice}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LF references */}
                  {entry.lfs.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700 mb-1">LF references ({entry.lfs.length}):</div>
                      <div className="space-y-0.5 max-h-32 overflow-auto pr-2">
                        {entry.lfs.slice(0, 10).map((lf, i) => (
                          <div key={`${lf.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                            <span className="font-mono">{lf.formNumber}</span>
                            <span className="flex-1 truncate">{lf.customerShortName}</span>
                            <span className="text-slate-500">{lf.date}</span>
                            <span className="text-[10px] text-slate-400">{lf.rowsCount} rows</span>
                          </div>
                        ))}
                        {entry.lfs.length > 10 && (
                          <div className="text-[10px] text-slate-400 italic">+{entry.lfs.length - 10} LF อื่น</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 240.2: Carry-Over Adjustments references */}
                  {entry.coas.length > 0 && (
                    <div className="text-xs bg-orange-50 border border-orange-200 rounded p-2">
                      <div className="font-semibold text-orange-800 mb-1">
                        ปรับผ้าค้าง (CO Adjustments) ({entry.coas.length}):
                      </div>
                      <div className="text-[10px] text-orange-700 mb-1.5">
                        ⚠ orphan ที่ค้างเฉพาะที่นี่ — เกิดจาก merge เก่าก่อน Feature 240 (ไม่ rewrite ตารางนี้)
                      </div>
                      <div className="space-y-0.5 max-h-32 overflow-auto pr-2">
                        {entry.coas.slice(0, 10).map((co, i) => (
                          <div key={`${co.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                            <span className="text-slate-500">{co.date}</span>
                            <span className="px-1.5 py-0.5 rounded bg-white text-[10px]">{co.type}</span>
                            <span className="flex-1 truncate">{co.customerShortName}</span>
                            <span className={cn('font-mono font-semibold', co.delta < 0 ? 'text-red-600' : 'text-emerald-600')}>
                              {co.delta > 0 ? '+' : ''}{co.delta}
                            </span>
                          </div>
                        ))}
                        {entry.coas.length > 10 && (
                          <div className="text-[10px] text-orange-600 italic">+{entry.coas.length - 10} adjustment อื่น</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && search && (
        <div className="text-center py-8 text-sm text-slate-400">
          ไม่พบ orphan ที่ตรงกับ &quot;{search}&quot;
        </div>
      )}
    </div>
  )
}
