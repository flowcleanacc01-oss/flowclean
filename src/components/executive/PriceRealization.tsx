'use client'

/**
 * 220.D — Price Realization (Discount Leakage)
 * Expected revenue (จาก QT) vs Actual revenue (จาก DN snapshot) — leakage = expected - actual
 */
import { useMemo } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { TrendingDown, DollarSign } from 'lucide-react'
import type { PriceRealizationRow } from '@/lib/use-executive-dashboard'

interface Props {
  rows: PriceRealizationRow[]
}

export default function PriceRealization({ rows }: Props) {
  const totals = useMemo(() => {
    const expected = rows.reduce((s, r) => s + r.expectedRevenue, 0)
    const actual = rows.reduce((s, r) => s + r.actualRevenue, 0)
    const leakage = expected - actual
    const realizationPct = expected === 0 ? 100 : (actual / expected) * 100
    return { expected, actual, leakage, realizationPct }
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        ไม่มีข้อมูล Price Realization (ต้องมี DN ในเดือนนี้ + accepted QT)
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-600" />
            220.D Price Realization — Discount Leakage
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ราคาที่เก็บได้จริง vs ราคาที่ควรจะได้ตาม QT
          </p>
        </div>
        <RealizationBadge pct={totals.realizationPct} />
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card label="Expected (QT)" value={formatCurrency(totals.expected)} sub="ราคาที่ตกลงไว้" color="slate" />
        <Card label="Actual (จริง)" value={formatCurrency(totals.actual)} sub="ราคาที่เก็บจริง" color="indigo" />
        <Card label="Leakage" value={formatCurrency(totals.leakage)} sub={`${totals.expected === 0 ? 0 : ((totals.leakage / totals.expected) * 100).toFixed(1)}% หาย`}
          color={totals.leakage > 0 ? 'red' : 'emerald'} />
        <Card label="Realization" value={`${totals.realizationPct.toFixed(1)}%`} sub={totals.realizationPct >= 95 ? 'ดี' : totals.realizationPct >= 90 ? 'พอใช้' : 'ต่ำ'}
          color={totals.realizationPct >= 95 ? 'emerald' : totals.realizationPct >= 90 ? 'amber' : 'red'} />
      </div>

      {/* Per-customer table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">ลูกค้า</th>
              <th className="px-3 py-2 text-right">Expected (QT)</th>
              <th className="px-3 py-2 text-right">Actual (จริง)</th>
              <th className="px-3 py-2 text-right">Leakage</th>
              <th className="px-3 py-2 text-right">Realization</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.customerId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-700">{r.shortName}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">{formatCurrency(r.expectedRevenue)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.actualRevenue)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  <span className={cn(
                    r.leakage > 0.01 ? 'text-red-600' : r.leakage < -0.01 ? 'text-emerald-600' : 'text-slate-500',
                  )}>
                    {r.leakage > 0 ? '-' : r.leakage < 0 ? '+' : ''}{formatCurrency(Math.abs(r.leakage))}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <RealizationPill pct={r.realizationPct} />
                </td>
                <td className="px-3 py-2">
                  {r.leakagePct > 5 && <TrendingDown className="w-4 h-4 text-red-500" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totals.leakage > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <strong>💸 Insight:</strong> เดือนนี้รายได้หายไป <strong>{formatCurrency(totals.leakage)}</strong> ({((totals.leakage / totals.expected) * 100).toFixed(1)}%)
          จากการให้ส่วนลด/ปรับยอด — ถ้าเทียบเป็นปี = ~{formatCurrency(totals.leakage * 12)} ที่หายไปกับ discount
        </div>
      )}
    </div>
  )
}

function RealizationBadge({ pct }: { pct: number }) {
  const color = pct >= 95 ? 'emerald' : pct >= 90 ? 'amber' : 'red'
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-100 text-amber-700 border-amber-200',
    red:     'bg-red-100 text-red-700 border-red-200',
  }
  return (
    <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium', colorMap[color])}>
      Overall: {pct.toFixed(1)}%
    </div>
  )
}

function RealizationPill({ pct }: { pct: number }) {
  const color = pct >= 95 ? 'emerald' : pct >= 90 ? 'amber' : pct >= 80 ? 'orange' : 'red'
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    orange:  'bg-orange-100 text-orange-700',
    red:     'bg-red-100 text-red-700',
  }
  return <span className={cn('inline-block px-1.5 py-0.5 rounded font-medium text-xs', colorMap[color])}>{pct.toFixed(1)}%</span>
}

function Card({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    slate:   'bg-slate-50 border-slate-200 text-slate-700',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={cn('p-3 border rounded-lg', colorMap[color])}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-base font-bold mt-1 truncate">{value}</div>
      <div className="text-[11px] opacity-70">{sub}</div>
    </div>
  )
}
