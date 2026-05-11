'use client'

/**
 * 240.3 — Code Reuse Detector UI
 *
 * แสดง code ที่ name ใน QT เก่า ≠ name ใน catalog ปัจจุบัน + similarity ต่ำ (< 60)
 * = code ที่อาจถูก reuse (ใช้ซ้ำกับคนละ item)
 *
 * Action: เปิด Sync Names focus ที่ code นั้น → ใช้ Promote flow ที่มีอยู่แล้ว
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCodeReuse } from '@/lib/use-code-reuse'
import { AlertTriangle, ChevronDown, ChevronUp, Search, Sparkles, ExternalLink, Shuffle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { matchesThaiQuery, matchesThaiQueryAnyField } from '@/lib/thai-search'

export default function CodeReuseDetector() {
  const router = useRouter()
  const { entries, highSeverity, totalQtsAffected } = useCodeReuse()
  const [search, setSearch] = useState('')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return entries
    // 245: Thai-aware tolerant
    return entries.filter(e =>
      matchesThaiQueryAnyField([e.code, e.catalogName], search) ||
      e.reuseNames.some(r => matchesThaiQuery(r.driftName, search))
    )
  }, [entries, search])

  const goSyncFocus = (code: string) => {
    router.push(`/dashboard/items?tab=sync&focus=${encodeURIComponent(code)}`)
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Sparkles className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
        <div className="text-sm">ไม่มี code reuse suspect ในระบบ</div>
        <div className="text-xs mt-1">name ใน QT ทุกใบ similar กับ catalog name (similarity ≥ 60)</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shuffle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-purple-800">Code Reuse Detector</div>
            <div className="text-xs text-purple-700 mt-1">
              พบ <strong>{entries.length}</strong> code ที่ name ใน QT เก่า ≠ catalog ปัจจุบัน + similarity ต่ำ (&lt; 60%)
              {highSeverity > 0 && (
                <> · <span className="font-bold text-red-700">{highSeverity}</span> high suspect (similarity &lt; 30%)</>
              )}
              <> · กระทบ <strong>{totalQtsAffected}</strong> QT</>
            </div>
            <div className="text-[11px] text-purple-600 mt-1.5">
              ⚠ Reuse = code เดียวกัน เปลี่ยนเป็นคนละ item · ราคา/category อาจไม่ตรง · QT/บิลเก่าควรตรวจสอบ
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
          placeholder="ค้นหา code / ชื่อ catalog / ชื่อเก่า..."
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-400 focus:outline-none"
        />
      </div>

      {/* Reuse list */}
      <div className="space-y-2">
        {filtered.map(entry => {
          const isExpanded = expandedCode === entry.code
          return (
            <div key={entry.code} className={cn(
              'border rounded-lg overflow-hidden',
              entry.worstSeverity === 'high' ? 'border-red-300' : 'border-amber-300'
            )}>
              {/* Row header */}
              <div className="flex items-center gap-3 p-3 bg-white hover:bg-slate-50 cursor-pointer"
                onClick={() => setExpandedCode(isExpanded ? null : entry.code)}
              >
                {/* Code + catalog name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-800">{entry.code}</span>
                    <span className="text-sm text-slate-700">{entry.catalogName}</span>
                    <span className="text-[10px] text-slate-400">(catalog ปัจจุบัน)</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {entry.reuseNames.length} ชื่อเก่า · {entry.totalQts} QT กระทบ
                  </div>
                </div>

                {/* Severity tag */}
                <div className={cn(
                  'text-[11px] font-semibold px-2 py-1 rounded-md border',
                  entry.worstSeverity === 'high'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                )}>
                  {entry.worstSeverity === 'high' ? '🔴 High suspect' : '🟡 Medium'}
                  <span className="ml-1 opacity-70">{entry.minSimilarity}%</span>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goSyncFocus(entry.code) }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1B3A5C] text-white text-[11px] font-medium hover:bg-[#122740] transition-colors"
                  title="เปิด Sync Names → Promote name ใหม่ + แยก code"
                >
                  <ExternalLink className="w-3 h-3" />
                  จัดการ
                </button>

                {/* Expand toggle */}
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                  <div className="text-xs">
                    <div className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      ชื่อเก่าที่พบใน QT (similarity ต่ำ = ไม่ใช่ typo):
                    </div>
                    <div className="space-y-1.5">
                      {entry.reuseNames.map((rn, i) => (
                        <div key={i} className={cn(
                          'flex items-center gap-3 p-2 rounded-md border',
                          rn.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                        )}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-800 truncate">{rn.driftName}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {rn.qtCount} QT ใช้ชื่อนี้ · vs catalog &quot;{entry.catalogName}&quot;
                            </div>
                          </div>
                          <div className="text-[11px] font-mono text-slate-600">
                            similarity {rn.similarity}%
                          </div>
                          <div className={cn(
                            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                            rn.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                          )}>
                            {rn.severity === 'high' ? 'high' : 'medium'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* QT references (top 10) */}
                  {entry.driftEntry.qts.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-700 mb-1">QT references ({entry.driftEntry.qts.length}):</div>
                      <div className="space-y-0.5 max-h-32 overflow-auto pr-2">
                        {entry.driftEntry.qts.slice(0, 10).map((q, i) => (
                          <div key={`${q.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                            <span className="font-mono">{q.number}</span>
                            <span className="flex-1 truncate">{q.nameInQT}</span>
                            <span className="text-[10px] text-slate-400">{q.status}</span>
                          </div>
                        ))}
                        {entry.driftEntry.qts.length > 10 && (
                          <div className="text-[10px] text-slate-400 italic">+{entry.driftEntry.qts.length - 10} QT อื่น</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
                  <div className="bg-white border border-slate-200 rounded-md p-3 text-[11px] text-slate-600">
                    <div className="font-semibold text-slate-700 mb-1.5">ตัวเลือกแก้ไข:</div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px]">
                      <li><strong>Promote ชื่อเก่า → code ใหม่</strong> — สร้าง catalog item ใหม่สำหรับชื่อเก่า + ย้าย QT references → คงราคา/ประวัติเดิมไว้ (Recommended)</li>
                      <li><strong>Sync ชื่อเก่า → ชื่อ catalog</strong> — overwrite name ใน QT เก่า ให้ตรงกับ catalog (ใช้เมื่อแน่ใจว่าไม่ใช่ reuse จริง)</li>
                      <li><strong>ปล่อยไว้</strong> — ถ้าไม่กระทบ business (QT cancelled / archived เก่ามาก)</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && search && (
        <div className="text-center py-8 text-sm text-slate-400">
          ไม่พบ reuse suspect ที่ตรงกับ &quot;{search}&quot;
        </div>
      )}
    </div>
  )
}
