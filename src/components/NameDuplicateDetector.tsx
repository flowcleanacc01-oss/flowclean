'use client'

/**
 * 348 — Name Duplicate Detector UI (Trap reducer #1)
 *
 * Hygiene Center tab — scan catalog หา pairs ที่ name คล้ายกันมาก
 * (similarity ≥ 80%) แต่ code ต่างกัน → proactive trap reducer
 *
 * เคสจริง: R-code (รามบุตรี) กับ main code มี name เดียวกัน → aggregate พลาด
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNameDuplicates, type NameDuplicatePair } from '@/lib/use-name-duplicates'
import { exportCSV } from '@/lib/export'
import { formatExportFilename, cn } from '@/lib/utils'
import {
  Search, AlertTriangle, FileSpreadsheet, Shuffle, Lock, ExternalLink, Package,
} from 'lucide-react'

type Severity = 'all' | 'high' | 'medium'

export default function NameDuplicateDetector() {
  const router = useRouter()
  const { pairs, total, high, aggregateRisk } = useNameDuplicates()

  const [severity, setSeverity] = useState<Severity>('all')
  const [search, setSearch] = useState('')
  const [onlyGroupMismatch, setOnlyGroupMismatch] = useState(false)

  const filtered = useMemo<NameDuplicatePair[]>(() => {
    let list = pairs
    if (severity !== 'all') list = list.filter(p => p.severity === severity)
    if (onlyGroupMismatch) {
      list = list.filter(p => (p.groupA || p.groupB) && p.groupA !== p.groupB)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p =>
        p.codeA.toLowerCase().includes(q) ||
        p.codeB.toLowerCase().includes(q) ||
        p.nameA.toLowerCase().includes(q) ||
        p.nameB.toLowerCase().includes(q),
      )
    }
    return list
  }, [pairs, severity, onlyGroupMismatch, search])

  const handleExportCSV = () => {
    if (filtered.length === 0) return
    const headers = ['Severity', 'Similarity', 'Code A', 'Name A', 'Group A', 'Protected A', 'Code B', 'Name B', 'Group B', 'Protected B']
    const data = filtered.map(p => [
      p.severity, String(p.similarity), p.codeA, p.nameA, p.groupA || '', p.protectedA ? 'YES' : '',
      p.codeB, p.nameB, p.groupB || '', p.protectedB ? 'YES' : '',
    ])
    exportCSV(headers, data, formatExportFilename('NameDuplicates', '', new Date().toISOString().slice(0, 10)))
  }

  const goToItem = (code: string) => {
    router.push(`/dashboard/items?tab=items&focusCode=${encodeURIComponent(code)}`)
  }

  const goToMerge = (src: string, tgt: string) => {
    router.push(`/dashboard/items?tab=merge&mergeSource=${encodeURIComponent(src)}&mergeTarget=${encodeURIComponent(tgt)}`)
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Name Duplicate Detector
        </div>
        <h2 className="text-xl font-bold">ตรวจรายการที่มีชื่อซ้ำ/คล้าย แต่รหัสต่างกัน</h2>
        <p className="text-sm opacity-90 mt-1">
          Proactive trap reducer — เคสจริง: <strong>R-code กับ main code ชื่อเหมือนกัน</strong> ทำให้ aggregate group matching พลาด
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Package className="w-4 h-4" />}
          label="Total pairs"
          value={total}
          color="slate"
          active={severity === 'all' && !onlyGroupMismatch}
          onClick={() => { setSeverity('all'); setOnlyGroupMismatch(false) }}
          sub="คู่ name ใกล้เคียง"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="High (≥95)"
          value={high}
          color="red"
          active={severity === 'high'}
          onClick={() => setSeverity(severity === 'high' ? 'all' : 'high')}
          sub="เกือบเหมือนเด๊ะ"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Medium (80-94)"
          value={total - high}
          color="amber"
          active={severity === 'medium'}
          onClick={() => setSeverity(severity === 'medium' ? 'all' : 'medium')}
          sub="คล้ายกันมาก"
        />
        <StatCard
          icon={<Package className="w-4 h-4" />}
          label="Aggregate risk"
          value={aggregateRisk}
          color="orange"
          active={onlyGroupMismatch}
          onClick={() => setOnlyGroupMismatch(!onlyGroupMismatch)}
          sub="sizeGroup ต่างกัน → aggregate พลาดได้"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา code / name"
            className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-64"
          />
        </div>
        <button
          onClick={handleExportCSV} disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />Export CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs w-20">Severity</th>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs w-16">Similar</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">รายการ A</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">รายการ B</th>
                <th className="text-center px-3 py-2.5 font-medium text-slate-600 text-xs w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    {total === 0 ? '✓ ไม่พบ name ซ้ำ/คล้าย — catalog สะอาดดี' : 'ไม่มีคู่ที่ตรงเงื่อนไข'}
                  </td>
                </tr>
              ) : filtered.map((p, idx) => {
                const groupMismatch = (p.groupA || p.groupB) && p.groupA !== p.groupB
                return (
                  <tr key={`${p.codeA}__${p.codeB}__${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-2 text-center">
                      <SeverityBadge severity={p.severity} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="text-xs font-mono font-semibold text-slate-700">{p.similarity}</span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => goToItem(p.codeA)}
                        className="font-mono font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1"
                      >
                        {p.codeA}<ExternalLink className="w-3 h-3" />
                      </button>
                      <div className="text-xs text-slate-700">{p.nameA}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>cat: {p.catA}</span>
                        {p.groupA && <span className="font-mono">· group: {p.groupA}</span>}
                        {p.protectedA && <span className="text-purple-600 font-medium">· 🔒 locked</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => goToItem(p.codeB)}
                        className="font-mono font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1"
                      >
                        {p.codeB}<ExternalLink className="w-3 h-3" />
                      </button>
                      <div className="text-xs text-slate-700">{p.nameB}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>cat: {p.catB}</span>
                        {p.groupB && <span className="font-mono">· group: {p.groupB}</span>}
                        {p.protectedB && <span className="text-purple-600 font-medium">· 🔒 locked</span>}
                      </div>
                      {groupMismatch && (
                        <div className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800 border border-orange-200">
                          ⚠ sizeGroup ต่างกัน — aggregate risk
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => goToMerge(p.codeB, p.codeA)}
                          disabled={p.protectedA || p.protectedB}
                          title={
                            p.protectedA || p.protectedB
                              ? '🔒 รายการถูกล็อค — ปลดล็อคก่อน merge'
                              : `Merge ${p.codeB} → ${p.codeA}`
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[#1B3A5C] text-white rounded hover:bg-[#122740] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Shuffle className="w-3 h-3" />Merge
                        </button>
                        <button
                          onClick={() => goToItem(p.codeA)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-purple-700 bg-purple-50 rounded hover:bg-purple-100 border border-purple-200"
                          title="ไปยังรายการ A เพื่อล็อค (กัน admin คนอื่นแก้/merge)"
                        >
                          <Lock className="w-3 h-3" />Lock A
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-400 italic">
        💡 <strong>Aggregate risk</strong>: คู่ที่ sizeGroup ต่างกัน (หรือมีอันเดียวมี group) — aggregate
        matching พลาดได้เมื่อ user เผลอกรอก code ที่ผิด group ใน LF/QT
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color, sub, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string
  sub: string; active: boolean; onClick: () => void
}) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-50',
    red: 'text-red-600 bg-red-50',
    amber: 'text-amber-600 bg-amber-50',
    orange: 'text-orange-600 bg-orange-50',
  }
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        'p-3 rounded-xl border text-left transition-all',
        active ? 'border-[#1B3A5C] ring-2 ring-[#3DD8D8]/40 bg-white' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className={cn('inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium', colorMap[color])}>
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </button>
  )
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' }) {
  const cfg: Record<'high' | 'medium', { label: string; cls: string }> = {
    high: { label: 'High', cls: 'bg-red-100 text-red-700 border-red-200' },
    medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  }
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border', cfg[severity].cls)}>
      {cfg[severity].label}
    </span>
  )
}
