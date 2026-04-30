'use client'

/**
 * 205 — Vocabulary Audit
 *
 * แดชบอร์ดดูความถี่ของการใช้ code ทุก source (Catalog / QT / LF / DN)
 * ใช้สำหรับ cleanup catalog: หา code ไม่เคยใช้ / ใช้น้อย / orphan
 */
import { useMemo, useState } from 'react'
import { useVocabUsage, VOCAB_STATUS_CONFIG, type VocabStatus, type VocabUsageRow } from '@/lib/use-vocab-usage'
import { exportCSV } from '@/lib/export'
import { formatDate, formatNumber, cn } from '@/lib/utils'
import {
  Search, ArrowUpDown, ChevronUp, ChevronDown, BookOpen,
  Activity, AlertTriangle, Package, TrendingUp, Filter, FileSpreadsheet,
} from 'lucide-react'

type SortCol = 'code' | 'name' | 'qtCount' | 'lfRows' | 'dnRows' | 'dnTotalQty' | 'lastUsed' | 'totalDocs'
type SortDir = 'asc' | 'desc'
type FilterKey = 'all' | VocabStatus

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'ทั้งหมด',
  orphan: 'Orphan',
  catalog_only: 'ไม่เคยใช้',
  unused: 'ไม่เคยใช้',
  rarely: 'ใช้น้อย',
  often: 'ใช้บ่อย',
}

export default function VocabularyAudit() {
  const { rows, totalCodes, orphanCount, catalogOnlyCount, rarelyCount, oftenCount } = useVocabUsage()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sortCol, setSortCol] = useState<SortCol>('totalDocs')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filtered = useMemo(() => {
    let list = rows
    if (filter !== 'all') {
      // catalog_only กับ unused merge เป็นกลุ่มเดียว
      if (filter === 'catalog_only' || filter === 'unused') {
        list = list.filter(r => r.status === 'catalog_only')
      } else {
        list = list.filter(r => r.status === filter)
      }
    }
    if (search.trim()) {
      const s = search.toLowerCase().trim()
      list = list.filter(r =>
        r.code.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s) ||
        r.allNames.some(n => n.toLowerCase().includes(s))
      )
    }
    // Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'code':       cmp = a.code.localeCompare(b.code); break
        case 'name':       cmp = a.name.localeCompare(b.name); break
        case 'qtCount':    cmp = a.qtCount - b.qtCount; break
        case 'lfRows':     cmp = a.lfRows - b.lfRows; break
        case 'dnRows':     cmp = a.dnRows - b.dnRows; break
        case 'dnTotalQty': cmp = a.dnTotalQty - b.dnTotalQty; break
        case 'lastUsed':   cmp = (a.lastUsed || '').localeCompare(b.lastUsed || ''); break
        case 'totalDocs':  cmp = a.totalDocs - b.totalDocs; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rows, filter, search, sortCol, sortDir])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'code' || col === 'name' || col === 'lastUsed' ? 'asc' : 'desc')
    }
  }

  const handleExportCSV = () => {
    const headers = ['รหัส', 'ชื่อรายการ', 'Catalog?', 'จำนวนชื่อ', 'QT (จำนวน)', 'LF (rows)', 'DN (rows)', 'ผลรวม Qty (DN)', 'ใช้ล่าสุด', 'รวม docs', 'สถานะ']
    const dataRows = filtered.map(r => [
      r.code,
      r.name,
      r.inCatalog ? 'ใช่' : 'ไม่',
      String(r.allNames.length),
      String(r.qtCount),
      String(r.lfRows),
      String(r.dnRows),
      String(r.dnTotalQty),
      r.lastUsed || '-',
      String(r.totalDocs),
      VOCAB_STATUS_CONFIG[r.status].label,
    ])
    exportCSV(headers, dataRows, 'Vocabulary_Audit')
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <BookOpen className="w-3.5 h-3.5" />
          Vocabulary Audit
        </div>
        <h2 className="text-xl font-bold">ความถี่การใช้รายการในระบบ</h2>
        <p className="text-sm opacity-90 mt-1">
          ดู code/ชื่อรายการที่ใช้ใน QT / LF / DN — หา candidate ลบออกจาก catalog
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="ทั้งหมด"
          value={totalCodes}
          color="slate"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          sub="codes ในระบบ"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Orphan"
          value={orphanCount}
          color="red"
          active={filter === 'orphan'}
          onClick={() => setFilter('orphan')}
          sub="ไม่อยู่ใน catalog"
        />
        <StatCard
          icon={<Package className="w-4 h-4" />}
          label="ไม่เคยใช้"
          value={catalogOnlyCount}
          color="slate"
          active={filter === 'catalog_only'}
          onClick={() => setFilter('catalog_only')}
          sub="catalog แต่ไม่มีใน QT/LF/DN"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="ใช้น้อย/บ่อย"
          value={rarelyCount + oftenCount}
          color="emerald"
          active={filter === 'rarely' || filter === 'often'}
          onClick={() => setFilter(filter === 'rarely' ? 'often' : 'rarely')}
          sub={`น้อย ${rarelyCount} · บ่อย ${oftenCount}`}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา code / ชื่อ"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-56"
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">Filter:</span>
            <span className="font-medium text-[#1B3A5C]">{FILTER_LABELS[filter]}</span>
            <span className="text-slate-400">({filtered.length})</span>
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          ส่งออก CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <Th col="code" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">รหัส</Th>
                <Th col="name" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">ชื่อรายการ</Th>
                <th className="px-2 py-2 text-center font-medium">Catalog</th>
                <Th col="qtCount" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">QT</Th>
                <Th col="lfRows" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">LF rows</Th>
                <Th col="dnRows" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">DN rows</Th>
                <Th col="dnTotalQty" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">Qty รวม</Th>
                <Th col="totalDocs" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="right">รวม docs</Th>
                <Th col="lastUsed" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} align="left">ใช้ล่าสุด</Th>
                <th className="px-3 py-2 text-left font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-slate-400 text-sm">
                    ไม่พบข้อมูลตาม filter ที่เลือก
                  </td>
                </tr>
              ) : filtered.map(row => <Row key={row.code} row={row} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
        <div className="font-medium text-slate-700 mb-1.5">📖 คำอธิบายสถานะ</div>
        <ul className="space-y-1 leading-relaxed">
          <li><span className="font-medium text-red-600">⚠️ Orphan</span> — code ใน QT/LF/DN ที่ไม่อยู่ใน catalog (ใช้ Hygiene Center → Sync Names → Promote/Reassign)</li>
          <li><span className="font-medium text-slate-600">📦 ไม่เคยใช้</span> — มีใน catalog แต่ไม่มีใครใช้ใน QT/LF/DN เลย (candidate ลบออก)</li>
          <li><span className="font-medium text-amber-600">🟡 ใช้น้อย</span> — รวม docs &lt; 10 (ทบทวนว่ายังจำเป็นไหม)</li>
          <li><span className="font-medium text-emerald-600">🟢 ใช้บ่อย</span> — รวม docs &ge; 10 (รายการหลัก)</li>
        </ul>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color, sub, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'slate' | 'red' | 'emerald' | 'amber'
  sub: string
  active: boolean
  onClick: () => void
}) {
  const colorMap: Record<string, string> = {
    slate:   'text-slate-600 bg-slate-50',
    red:     'text-red-600 bg-red-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber:   'text-amber-600 bg-amber-50',
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left bg-white border rounded-xl p-3 transition-all hover:shadow-sm',
        active ? 'border-[#3DD8D8] ring-2 ring-[#3DD8D8]/30' : 'border-slate-200'
      )}>
      <div className={cn('inline-flex items-center justify-center w-7 h-7 rounded-lg mb-1.5', colorMap[color])}>
        {icon}
      </div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums',
        color === 'slate' ? 'text-slate-700' :
        color === 'red'   ? 'text-red-700' :
        color === 'emerald' ? 'text-emerald-700' : 'text-amber-700'
      )}>{value}</p>
      <p className="text-[10px] text-slate-400 leading-tight">{sub}</p>
    </button>
  )
}

function Th({
  col, sortCol, sortDir, onClick, align, children,
}: {
  col: SortCol
  sortCol: SortCol
  sortDir: SortDir
  onClick: (c: SortCol) => void
  align: 'left' | 'right' | 'center'
  children: React.ReactNode
}) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        'px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 select-none',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      )}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active
          ? (sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-[#1B3A5C]" />
            : <ChevronDown className="w-3 h-3 text-[#1B3A5C]" />)
          : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
      </span>
    </th>
  )
}

function Row({ row }: { row: VocabUsageRow }) {
  const cfg = VOCAB_STATUS_CONFIG[row.status]
  const isLowUse = row.status === 'orphan' || row.status === 'catalog_only' || row.status === 'rarely'
  return (
    <tr className={cn(
      'border-t border-slate-100 hover:bg-slate-50/50',
      isLowUse && 'bg-slate-50/30'
    )}>
      <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">{row.code}</td>
      <td className="px-3 py-2 text-slate-700">
        {row.name}
        {row.allNames.length > 1 && (
          <span className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
            +{row.allNames.length - 1} ชื่อ
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-center">
        {row.inCatalog
          ? <span className="text-emerald-600 text-xs">✓</span>
          : <span className="text-red-500 text-xs">✗</span>}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', row.qtCount === 0 ? 'text-slate-300' : 'text-slate-700')}>
        {formatNumber(row.qtCount)}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', row.lfRows === 0 ? 'text-slate-300' : 'text-slate-700')}>
        {formatNumber(row.lfRows)}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', row.dnRows === 0 ? 'text-slate-300' : 'text-slate-700')}>
        {formatNumber(row.dnRows)}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', row.dnTotalQty === 0 ? 'text-slate-300' : 'text-slate-700')}>
        {formatNumber(row.dnTotalQty)}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums font-medium',
        row.totalDocs === 0 ? 'text-slate-300' : 'text-[#1B3A5C]')}>
        {formatNumber(row.totalDocs)}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
        {row.lastUsed ? formatDate(row.lastUsed) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
          cfg.color, cfg.bgColor)}>
          <span>{cfg.icon}</span>
          {cfg.label}
        </span>
      </td>
    </tr>
  )
}
