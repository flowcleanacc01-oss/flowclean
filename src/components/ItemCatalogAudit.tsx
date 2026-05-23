'use client'

/**
 * A2 + A3 + B3 — Item Catalog Audit UI
 *
 * Multi-subtype audit ของ catalog หา cleanup candidates:
 * - item_unused_in_qt (A2): items ไม่มี QT ไหนใช้
 * - item_orphan_group (A3): singleton sizeGroup
 * - item_no_size_group (B3): category ควรมี group แต่ไม่ตั้ง
 * - item_no_facets (B3): ไม่มี facets
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useItemCatalogAudit, type AuditSubtype } from '@/lib/use-item-catalog-audit'
import { exportCSV } from '@/lib/export'
import { formatExportFilename, cn } from '@/lib/utils'
import {
  Search, AlertTriangle, FileSpreadsheet, ExternalLink, Package,
  Layers, Tags, Eye,
} from 'lucide-react'

const SUBTYPE_CONFIG: Record<AuditSubtype, { label: string; icon: React.ReactNode; color: string; sub: string }> = {
  item_unused_in_qt: {
    label: 'ไม่ใช้ใน QT',
    icon: <Eye className="w-4 h-4" />,
    color: 'amber',
    sub: 'ไม่มี QT ไหนใช้',
  },
  item_orphan_group: {
    label: 'Orphan group',
    icon: <Layers className="w-4 h-4" />,
    color: 'blue',
    sub: 'sizeGroup ตัวเดียว',
  },
  item_no_size_group: {
    label: 'ไม่มี sizeGroup',
    icon: <Package className="w-4 h-4" />,
    color: 'orange',
    sub: 'category ควรตั้ง group',
  },
  item_no_facets: {
    label: 'ไม่มี facets',
    icon: <Tags className="w-4 h-4" />,
    color: 'slate',
    sub: 'Wizard 2.0 ใช้',
  },
}

export default function ItemCatalogAudit() {
  const router = useRouter()
  const { findings, total, countBySubtype } = useItemCatalogAudit()

  const [subtype, setSubtype] = useState<'all' | AuditSubtype>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = findings
    if (subtype !== 'all') list = list.filter(f => f.subtype === subtype)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(f =>
        f.code.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        (f.sizeGroup || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [findings, subtype, search])

  const handleExportCSV = () => {
    if (filtered.length === 0) return
    const headers = ['Subtype', 'Severity', 'Code', 'Name', 'Category', 'Size Group', 'Detail']
    const data = filtered.map(f => [
      f.subtype, f.severity, f.code, f.name, f.category, f.sizeGroup || '', f.detail,
    ])
    exportCSV(headers, data, formatExportFilename('CatalogAudit', '', new Date().toISOString().slice(0, 10)))
  }

  const goToItem = (code: string) => {
    router.push(`/dashboard/items?tab=items&focusCode=${encodeURIComponent(code)}`)
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Item Catalog Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจปัญหาเชิงโครงสร้างของ catalog</h2>
        <p className="text-sm opacity-90 mt-1">
          4 subtype: unused ใน QT · singleton group · missing sizeGroup · missing facets
        </p>
      </div>

      {/* Subtype filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(SUBTYPE_CONFIG) as AuditSubtype[]).map(st => {
          const cfg = SUBTYPE_CONFIG[st]
          const count = countBySubtype[st]
          const active = subtype === st
          const colorMap: Record<string, string> = {
            amber: 'text-amber-600 bg-amber-50',
            blue: 'text-blue-600 bg-blue-50',
            orange: 'text-orange-600 bg-orange-50',
            slate: 'text-slate-500 bg-slate-50',
          }
          return (
            <button
              key={st}
              type="button"
              onClick={() => setSubtype(active ? 'all' : st)}
              className={cn(
                'p-3 rounded-xl border text-left transition-all',
                active ? 'border-[#1B3A5C] ring-2 ring-[#3DD8D8]/40 bg-white' : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <div className={cn('inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium', colorMap[cfg.color])}>
                {cfg.icon}{cfg.label}
              </div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{count.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-0.5">{cfg.sub}</div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา code / name / group"
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
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs w-32">Subtype</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">รายการ</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">รายละเอียด</th>
                <th className="text-center px-2 py-2.5 font-medium text-slate-600 text-xs w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400">
                    {total === 0 ? '✓ ไม่พบปัญหา — catalog แข็งแรง' : 'ไม่มีรายการที่ตรงเงื่อนไข'}
                  </td>
                </tr>
              ) : filtered.map((f, idx) => {
                const cfg = SUBTYPE_CONFIG[f.subtype]
                const colorMap: Record<string, string> = {
                  amber: 'bg-amber-50 text-amber-700 border-amber-200',
                  blue: 'bg-blue-50 text-blue-700 border-blue-200',
                  orange: 'bg-orange-50 text-orange-700 border-orange-200',
                  slate: 'bg-slate-50 text-slate-700 border-slate-200',
                }
                return (
                  <tr key={`${f.code}__${f.subtype}__${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border', colorMap[cfg.color])}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => goToItem(f.code)}
                        className="font-mono font-semibold text-[#1B3A5C] hover:underline inline-flex items-center gap-1"
                      >
                        {f.code}<ExternalLink className="w-3 h-3" />
                      </button>
                      <div className="text-xs text-slate-700">{f.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>cat: {f.category}</span>
                        {f.sizeGroup && <span className="font-mono">· group: {f.sizeGroup}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{f.detail}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => goToItem(f.code)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                      >
                        <ExternalLink className="w-3 h-3" />เปิด
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
