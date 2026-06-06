'use client'

/**
 * 413 — LF Row Duplicate Audit UI
 * ตรวจ "row code ซ้ำใน LF" → สาเหตุ SD.qty ไม่ตรง LF (SD รวม col6 ข้าม row ซ้ำ)
 * Mount: /dashboard/reports?tab=lfrowaudit
 */
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  ShieldAlert, AlertOctagon, AlertTriangle, CircleDashed, Eye,
  Search, ExternalLink, FileText, Receipt, Eraser, Loader2, FileSpreadsheet,
} from 'lucide-react'
import {
  useLFRowAudit,
  type LFRowDupSeverity, type LFRowAuditFilters,
} from '@/lib/use-lf-row-audit'
import { useStore } from '@/lib/store'
import { cn, formatDate } from '@/lib/utils'
import { exportCSV } from '@/lib/export'
import CustomerPicker from '@/components/CustomerPicker'
import FloatingTotalBar from '@/components/FloatingTotalBar'

const SEVERITY_CFG: Record<LFRowDupSeverity, { label: string; badge: string; icon: string; desc: string }> = {
  doubled: { label: 'Doubled', badge: 'bg-red-100 text-red-700', icon: '🔴', desc: 'มี row ไม่ว่าง ≥ 2 — เสี่ยง over-bill (ต้องตรวจเอง)' },
  ghost: { label: 'Ghost', badge: 'bg-orange-100 text-orange-700', icon: '🟠', desc: 'row จริง 1 + row ว่าง — SD = ค่าจริง (ล้าง row ว่างได้)' },
  latent: { label: 'Latent', badge: 'bg-slate-100 text-slate-600', icon: '⚪', desc: 'row ว่างทั้งหมด — ยังไม่กระทบ แต่ระเบิดได้ถ้าลงยอด' },
}

export default function LFRowAudit() {
  const { mergeDuplicateRowsBatch } = useStore()
  const [severity, setSeverity] = useState<'all' | LFRowDupSeverity>('all')
  const [customerId, setCustomerId] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [showQtDup, setShowQtDup] = useState(false)

  const INITIAL_VISIBLE = 200
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  useEffect(() => { setVisibleCount(INITIAL_VISIBLE) }, [severity, customerId, search])

  const filters: LFRowAuditFilters = useMemo(() => ({ severity, customerId, search }), [severity, customerId, search])
  const { rows, qtDupRows, stats } = useLFRowAudit(filters)

  // LF ที่ล้างได้ (ghost/latent + มี row ว่างลบได้) จาก list ที่กรองอยู่
  const cleanableIds = useMemo(
    () => rows.filter(r => r.severity !== 'doubled' && r.removableEmptyRows > 0).map(r => r.id),
    [rows],
  )

  const handleCleanAll = async () => {
    if (cleanableIds.length === 0 || busy) return
    if (!confirm(
      `ล้าง row ซ้ำที่ "ว่าง" ของ ${cleanableIds.length} LF (ตามที่กรองอยู่)?\n\n` +
      `• ลบเฉพาะ row ว่าง (ทุก col = 0) ที่ซ้ำ code — ไม่แตะค่าตัวเลขใดๆ\n` +
      `• 🔴 Doubled (มี row ไม่ว่าง ≥ 2) จะถูกข้าม — ต้องตรวจเอง\n\nดำเนินการต่อ?`,
    )) return
    setBusy(true)
    try {
      const res = await mergeDuplicateRowsBatch(cleanableIds)
      alert(`✅ ล้างเสร็จ — แก้ ${res.fixed} LF, ลบ row ว่างซ้ำ ${res.removed} แถว`)
    } finally {
      setBusy(false)
    }
  }

  const handleCleanOne = async (lfId: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await mergeDuplicateRowsBatch([lfId])
      if (res.fixed === 0) alert('ไม่มี row ว่างซ้ำให้ลบ (อาจเป็น Doubled — ต้องตรวจเอง)')
    } finally {
      setBusy(false)
    }
  }

  const handleExport = () => {
    if (rows.length === 0) return
    const headers = ['Severity', 'ลูกค้า', 'LF', 'วันที่', 'Code ซ้ำ (col6)', 'SD ผูก', 'ลบ row ว่างได้']
    const data = rows.map(r => [
      SEVERITY_CFG[r.severity].label, r.customerShortName, r.formNumber, r.date,
      r.dups.map(d => `${d.code}×${d.count}[${d.col6Values.join('+')}]`).join(' · '),
      r.linkedSds.map(s => s.noteNumber).join(' '),
      String(r.removableEmptyRows),
    ])
    exportCSV(headers, data, `LFRowDup_${new Date().toISOString().slice(0, 10)}`)
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <ShieldAlert className="w-3.5 h-3.5" />
          LF ↔ SD Row Duplicate Audit
        </div>
        <h2 className="text-xl font-bold">ตรวจ row code ซ้ำใน LF — ต้นเหตุ SD จำนวนไม่ตรง LF</h2>
        <p className="text-sm opacity-90 mt-1">
          SD รวม col6 ข้าม row ซ้ำ (เด้งเป็น 2 เท่า) แต่ LF แสดง row เดียว → จำนวนไม่ตรง.
          ปุ่ม <span className="font-semibold">ล้าง row ว่าง</span> ลบเฉพาะแถวว่างซ้ำ — ไม่แตะค่าตัวเลข
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={<AlertOctagon className="w-4 h-4" />} label="🔴 Doubled" value={stats.doubled} color="red"
          active={severity === 'doubled'} onClick={() => setSeverity(severity === 'doubled' ? 'all' : 'doubled')}
          sub={stats.affectedSds > 0 ? `กระทบ ${stats.affectedSds} SD` : 'เด้ง 2 เท่า'} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="🟠 Ghost" value={stats.ghost} color="orange"
          active={severity === 'ghost'} onClick={() => setSeverity(severity === 'ghost' ? 'all' : 'ghost')}
          sub="row จริง 1 + ว่าง" />
        <StatCard icon={<CircleDashed className="w-4 h-4" />} label="⚪ Latent" value={stats.latent} color="slate"
          active={severity === 'latent'} onClick={() => setSeverity(severity === 'latent' ? 'all' : 'latent')}
          sub="ว่างทั้งหมด (time-bomb)" />
        <StatCard icon={<Eye className="w-4 h-4" />} label="ตรวจแล้ว" value={stats.total} color="emerald"
          active={severity === 'all'} onClick={() => setSeverity('all')}
          sub={`ลบ row ว่างได้ ${stats.removableTotal}`} />
        <StatCard icon={<Receipt className="w-4 h-4" />} label="QT code ซ้ำ" value={stats.qtDupCount} color="amber"
          active={showQtDup} onClick={() => setShowQtDup(v => !v)}
          sub="ต้นเหตุ upstream" />
      </div>

      {/* QT dup section (ต้นเหตุ) */}
      {showQtDup && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
            <Receipt className="w-4 h-4" /> QT ที่มี item code ซ้ำ ({qtDupRows.length}) — ต้นเหตุที่ buildRows เคยสร้าง row ซ้ำ
          </div>
          <p className="text-xs text-amber-700 mb-3">
            แก้ที่ต้นทางแล้ว (buildRows dedupe) — LF ใหม่จะไม่ซ้ำ. ควรลบ code ซ้ำใน QT เหล่านี้ด้วย (หน้าใบเสนอราคา)
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {qtDupRows.length === 0 ? (
              <div className="text-xs text-slate-400 py-2">— ไม่มี QT code ซ้ำ —</div>
            ) : qtDupRows.map(q => (
              <div key={q.id} className="flex items-center justify-between bg-white rounded-lg border border-amber-100 px-3 py-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                    q.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {q.status === 'accepted' ? 'ตกลง' : q.status}
                  </span>
                  <span className="font-medium text-slate-700 truncate">{q.customerShortName}</span>
                  <span className="text-xs text-slate-400">{q.quotationNumber}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex flex-wrap gap-1 justify-end">
                    {q.dupCodes.map(d => (
                      <code key={d.code} className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-mono font-bold">
                        {d.code}×{d.count}
                      </code>
                    ))}
                  </span>
                  <Link href={`/dashboard/billing?tab=quotation&qtcustomer=${q.customerId}`}
                    className="text-[#1B3A5C] hover:text-[#3DD8D8]" title="เปิด QT ลูกค้านี้">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + bulk action */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาลูกค้า / LF / code"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none w-56" />
          </div>
          <div className="min-w-[180px]">
            <CustomerPicker value={customerId === 'all' ? '' : customerId}
              onChange={(id) => setCustomerId(id || 'all')} allowAll />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50">
            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={handleCleanAll} disabled={cleanableIds.length === 0 || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B3A5C] text-white rounded-lg text-sm hover:bg-[#122740] disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
            ล้าง row ว่าง ({cleanableIds.length})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">ระดับ</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">ลูกค้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">LF / วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Code ซ้ำ (col6 per row)</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">SD ผูก</th>
                <th className="text-center px-3 py-2.5 font-medium text-slate-600 text-xs">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                  🎉 ไม่พบ row code ซ้ำ
                </td></tr>
              ) : rows.slice(0, visibleCount).map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold', SEVERITY_CFG[r.severity].badge)}>
                      {SEVERITY_CFG[r.severity].icon} {SEVERITY_CFG[r.severity].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.customerShortName}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{r.customerName}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/linen-forms?detail=${r.id}`}
                      className="inline-flex items-center gap-1 text-[#1B3A5C] hover:text-[#3DD8D8] font-medium text-xs">
                      <FileText className="w-3 h-3" />{r.formNumber}
                    </Link>
                    <div className="text-[10px] text-slate-400">{formatDate(r.date)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.dups.map(d => (
                        <span key={d.code}
                          title={`${d.name} — ${d.count} แถว, col6 = ${d.col6Values.join(' + ')} = ${d.col6Sum}`}
                          className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border',
                            d.severity === 'doubled' ? 'bg-red-50 text-red-700 border-red-200'
                              : d.severity === 'ghost' ? 'bg-orange-50 text-orange-700 border-orange-200'
                                : 'bg-slate-50 text-slate-500 border-slate-200')}>
                          <strong>{d.code}</strong>×{d.count}
                          <span className="opacity-70">[{d.col6Values.join('+')}]</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.linkedSds.length === 0 ? (
                      <span className="text-[10px] text-slate-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.linkedSds.map(s => (
                          <Link key={s.id} href={`/dashboard/delivery?detail=${s.id}`}
                            title={s.isBilled ? 'วางบิลแล้ว' : ''}
                            className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border hover:bg-slate-100',
                              s.isBilled ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200')}>
                            <Receipt className="w-2.5 h-2.5" />{s.noteNumber}{s.isBilled ? ' 🔒' : ''}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.severity === 'doubled' ? (
                      <span className="text-[10px] text-red-500" title="row ไม่ว่าง ≥ 2 — ระบบไม่รู้ค่าไหนถูก ต้องตรวจ/แก้ใน LF เอง">
                        ตรวจเอง
                      </span>
                    ) : (
                      <button onClick={() => handleCleanOne(r.id)} disabled={busy}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-slate-100 text-slate-700 hover:bg-[#1B3A5C] hover:text-white disabled:opacity-50">
                        <Eraser className="w-3 h-3" /> ล้าง {r.removableEmptyRows}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > visibleCount && (
          <button onClick={() => setVisibleCount(c => c + 200)}
            className="w-full px-3 py-2.5 text-xs text-[#1B3A5C] bg-slate-50 hover:bg-slate-100 border-t border-slate-200 font-medium">
            ↓ แสดงเพิ่ม (เหลือ {rows.length - visibleCount})
          </button>
        )}
      </div>

      <div className="text-xs text-slate-400 italic px-2 space-y-1">
        <div><strong className="text-red-500">🔴 Doubled</strong> = มี row "ไม่ว่าง" ≥ 2 code เดียวกัน → SD รวมเด้ง 2 เท่า (เคส TSR 17→34). ระบบไม่ auto-fix — เปิด LF ตรวจว่าค่าไหนถูก แล้วลบแถวเกิน/แก้</div>
        <div><strong className="text-orange-500">🟠 Ghost</strong> = row จริง 1 + row ว่างซ้ำ → SD ได้ค่าจริงอยู่แล้ว · กด "ล้าง" ลบแถวว่างทิ้งได้ปลอดภัย</div>
        <div><strong>⚪ Latent</strong> = row ว่างทั้งหมด → ยังไม่กระทบ แต่ถ้าลงยอดผ่านใบเช็คผ้า/AI จะกลายเป็น Doubled ทันที — ควรล้างกันไว้</div>
      </div>

      <FloatingTotalBar show={rows.length > 0}>
        <span>
          พบ <strong className="text-[#1B3A5C]">{rows.length.toLocaleString()}</strong> LF
          {(severity !== 'all' || customerId !== 'all' || search) && (
            <span className="text-slate-400 ml-2">(จากทั้งหมด {stats.total.toLocaleString()})</span>
          )}
          {cleanableIds.length > 0 && <span className="text-slate-500 ml-2">· ล้าง row ว่างได้ {cleanableIds.length} LF</span>}
        </span>
      </FloatingTotalBar>
    </div>
  )
}

function StatCard({ icon, label, value, color, sub, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string
  sub: string; active: boolean; onClick: () => void
}) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-50', red: 'text-red-600 bg-red-50',
    orange: 'text-orange-600 bg-orange-50', amber: 'text-amber-600 bg-amber-50',
    emerald: 'text-emerald-600 bg-emerald-50',
  }
  return (
    <button type="button" onClick={onClick}
      className={cn('p-3 rounded-xl border text-left transition-all',
        active ? 'border-[#1B3A5C] ring-2 ring-[#3DD8D8]/40 bg-white' : 'border-slate-200 bg-white hover:border-slate-300')}>
      <div className={cn('inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium', colorMap[color])}>
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </button>
  )
}
