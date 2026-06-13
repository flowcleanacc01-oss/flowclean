'use client'

// 437 — กรอก LF แบบแท็บเล็ต (ปุ่ม −/+ ใหญ่ · ไม่ต่อ API · ทางเลือกแทน AI scan สำหรับนับหน้างาน)
//   touch-first: เลือกคอลัมน์ที่กรอก → ไล่รายการผ้า กด −/+ หรือแตะพิมพ์ตัวเลข · ค้นหา + ยอดรวมสด
//   ⚠️ item resolution = mirror ของ LinenFormGrid baseItems (qtItems→ชื่อ/ลำดับ, else catalog∩itemCodes)
//      + orphan rows + excludedCodes — keep in sync ถ้าแก้ฝั่ง grid · ไม่รองรับกลุ่มรวมไซส์ (caller gate ออก)
//   draft แก้ใน local state → commit (onChange) ตอนปิด · กัน write-spam จากการกด −/+ ทีละ 1

import { useEffect, useMemo, useState } from 'react'
import { matchesThaiQuery } from '@/lib/thai-search'
import { resolveDisplayName } from '@/lib/facet-generators'
import { cn } from '@/lib/utils'
import Modal from '@/components/Modal'
import { Search, Minus, Plus } from 'lucide-react'
import type { Customer, LinenFormRow, LinenItemDef, QuotationItem } from '@/types'

type CountCol = 'col2' | 'col3' | 'col4' | 'col5' | 'col6'

const COL_INFO: Record<CountCol, { field: keyof LinenFormRow; label: string }> = {
  col2: { field: 'col2_hotelCountIn', label: 'ลูกค้านับส่งซัก' },
  col3: { field: 'col3_hotelClaimCount', label: 'ลูกค้านับส่งเคลม' },
  col4: { field: 'col4_factoryApproved', label: 'ลูกค้านับกลับ' },
  col5: { field: 'col5_factoryClaimApproved', label: 'โรงซักนับเข้า' },
  col6: { field: 'col6_factoryPackSend', label: 'โรงซักแพคส่ง' },
}

function blankRow(code: string): LinenFormRow {
  return {
    code, col1_carryOver: 0, col2_hotelCountIn: 0, col3_hotelClaimCount: 0,
    col4_factoryApproved: 0, col5_factoryClaimApproved: 0, col6_factoryPackSend: 0, note: '',
  }
}

export default function LFTabletEntry({
  open, onClose, customer, rows, onChange, catalog, qtItems, itemCodes, excludedCodes, columns, headerLabel,
}: {
  open: boolean
  onClose: () => void
  customer: Customer
  rows: LinenFormRow[]
  onChange: (rows: LinenFormRow[]) => void
  catalog: LinenItemDef[]
  qtItems?: QuotationItem[]
  itemCodes?: string[]
  excludedCodes?: string[]
  columns: CountCol[]   // count columns ที่กรอกได้ (จาก status) — ตัวแรก = default
  headerLabel?: string
}) {
  const [draft, setDraft] = useState<LinenFormRow[]>(rows)
  const [col, setCol] = useState<CountCol>(columns[0] || 'col2')
  const [search, setSearch] = useState('')

  // เปิดใหม่ → sync draft จาก rows ปัจจุบัน + reset คอลัมน์/ค้นหา
  useEffect(() => {
    if (open) { setDraft(rows); setCol(columns[0] || 'col2'); setSearch('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const items = useMemo<{ code: string; name: string }[]>(() => {
    const excluded = new Set(excludedCodes ?? [])
    const base = qtItems
      ? qtItems.map(qi => ({ code: qi.code, name: resolveDisplayName(qi.code, qi.name, customer.itemNicknames) }))
      : catalog.filter(i => itemCodes ? itemCodes.includes(i.code) : false)
          .map(i => ({ code: i.code, name: resolveDisplayName(i.code, i.name, customer.itemNicknames) }))
    const baseCodes = new Set(base.map(i => i.code))
    const orphans = rows
      .filter(r => !baseCodes.has(r.code))
      .filter(r => r.col2_hotelCountIn || r.col3_hotelClaimCount || r.col4_factoryApproved
        || r.col5_factoryClaimApproved || r.col6_factoryPackSend || r.note)
      .map(r => ({ code: r.code, name: resolveDisplayName(r.code, catalog.find(c => c.code === r.code)?.name || r.code, customer.itemNicknames) }))
    return [...base, ...orphans].filter(i => !excluded.has(i.code))
  }, [qtItems, catalog, itemCodes, rows, excludedCodes, customer.itemNicknames])

  const field = COL_INFO[col].field
  const valueOf = (code: string): number => {
    const r = draft.find(x => x.code === code)
    return r ? (r[field] as number) || 0 : 0
  }
  const setValue = (code: string, v: number) => {
    const val = Math.max(0, Math.round(Number.isFinite(v) ? v : 0))
    setDraft(prev => prev.some(r => r.code === code)
      ? prev.map(r => r.code === code ? { ...r, [field]: val } : r)
      : [...prev, { ...blankRow(code), [field]: val }])
  }

  const filtered = useMemo(
    () => items.filter(i => !search || matchesThaiQuery(i.code, search) || matchesThaiQuery(i.name, search)),
    [items, search])
  const total = useMemo(() => items.reduce((s, i) => s + valueOf(i.code), 0), [items, draft, field]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitClose = () => { onChange(draft); onClose() }

  return (
    <Modal open={open} onClose={commitClose} title="กรอกแบบแท็บเล็ต" size="lg" closeLabel="close">
      <div className="space-y-3">
        {headerLabel && <p className="text-xs text-slate-500">{headerLabel}</p>}

        {/* เลือกคอลัมน์ที่กรอก */}
        {columns.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {columns.map(c => (
              <button key={c} type="button" onClick={() => setCol(c)}
                className={cn('px-3 py-2 rounded-lg text-sm font-semibold border transition-colors',
                  col === c ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                {COL_INFO[c].label}
              </button>
            ))}
          </div>
        )}

        {/* ค้นหา + ยอดรวม */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาผ้า..."
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-slate-400 leading-none">รวม {COL_INFO[col].label}</p>
            <p className="text-lg font-bold text-[#1B3A5C] leading-tight">{total.toLocaleString()}</p>
          </div>
        </div>

        {/* รายการผ้า — ปุ่ม −/+ ใหญ่ + แตะพิมพ์ได้ */}
        <div className="divide-y divide-slate-100 max-h-[60vh] overflow-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-10">{items.length === 0 ? 'ลูกค้านี้ยังไม่มีรายการผ้า (ตั้งใน QT ก่อน)' : 'ไม่พบรายการ'}</p>
          ) : filtered.map(item => {
            const v = valueOf(item.code)
            return (
              <div key={item.code} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0 text-[15px] text-slate-700 truncate" title={item.name}>{item.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => setValue(item.code, v - 1)} disabled={v <= 0}
                    aria-label="ลด" className="w-11 h-11 rounded-xl border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-50 active:scale-95 disabled:opacity-30 transition-transform">
                    <Minus className="w-5 h-5" />
                  </button>
                  <input type="text" inputMode="numeric" value={v === 0 ? '' : String(v)} placeholder="0"
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => { const n = e.target.value.replace(/[^\d]/g, ''); setValue(item.code, n === '' ? 0 : parseInt(n, 10)) }}
                    className={cn('w-16 h-11 text-center text-lg font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]',
                      v > 0 ? 'border-[#3DD8D8] text-[#1B3A5C] bg-[#3DD8D8]/5' : 'border-slate-200 text-slate-400')} />
                  <button type="button" onClick={() => setValue(item.code, v + 1)}
                    aria-label="เพิ่ม" className="w-11 h-11 rounded-xl bg-[#1B3A5C] text-white flex items-center justify-center hover:bg-[#122740] active:scale-95 transition-transform">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-slate-400">บันทึกอัตโนมัติเมื่อปิด · กรอกตรง ไม่ต้องสแกน ไม่ต้องตรวจ</p>
          <button type="button" onClick={commitClose}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#3DD8D8] text-[#1B3A5C] hover:bg-[#2bb8b8] transition-colors">
            เสร็จ
          </button>
        </div>
      </div>
    </Modal>
  )
}
