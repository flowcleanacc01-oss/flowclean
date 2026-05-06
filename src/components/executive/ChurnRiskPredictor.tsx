'use client'

/**
 * 222.4 — Churn Risk Predictor
 * Identify customers at risk of churning based on silent months + revenue history
 * Source: bills + legacy WB
 */
import { useMemo, useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { ChurnRiskRow } from '@/lib/use-executive-tier23'
import { Card, Empty } from './ItemMixProfitability'

interface Props { rows: ChurnRiskRow[]; usingLegacy: boolean }

export default function ChurnRiskPredictor({ rows, usingLegacy }: Props) {
  const [showActive, setShowActive] = useState(false)

  const grouped = useMemo(() => ({
    churned: rows.filter(r => r.status === 'churned'),
    at_risk: rows.filter(r => r.status === 'at_risk'),
    warning: rows.filter(r => r.status === 'warning'),
    active: rows.filter(r => r.status === 'active'),
  }), [rows])

  const lostRevenue = useMemo(() =>
    grouped.churned.reduce((s, r) => s + r.avgMonthlyRevenue, 0) +
    grouped.at_risk.reduce((s, r) => s + r.avgMonthlyRevenue, 0)
  , [grouped])

  if (rows.length === 0) {
    return <Empty msg="ไม่มีข้อมูลลูกค้าให้คำนวณ churn risk" />
  }

  return (
    <Card title="222.4 Churn Risk Predictor" icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
      sub="ลูกค้าที่หายเงียบ — เรียงตามความเสี่ยง"
      legacyNote={usingLegacy ? '✅ รวม legacy (เห็นลูกค้าหายนาน)' : undefined}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="🔴 Churned" count={grouped.churned.length} sub="หายไปนาน 4+ เดือน" color="red" />
        <Stat label="🟠 At Risk" count={grouped.at_risk.length} sub="หาย 2-3 เดือน" color="orange" />
        <Stat label="🟡 Warning" count={grouped.warning.length} sub="หาย 1 เดือน" color="amber" />
        <Stat label="🟢 Active" count={grouped.active.length} sub="ส่งเดือนล่าสุด" color="emerald" />
      </div>

      {lostRevenue > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <strong>💸 Risk exposure:</strong> ลูกค้าที่ Churned + At Risk เคยทำรายได้เฉลี่ย <strong>{formatCurrency(lostRevenue)}/เดือน</strong>
          {' · '}ปีละ ~<strong>{formatCurrency(lostRevenue * 12)}</strong> ที่อาจหายไป
        </div>
      )}

      <Section title="🔴 Churned (โทรกลับมาเลย)" rows={grouped.churned} />
      <Section title="🟠 At Risk (ติดตามด่วน)" rows={grouped.at_risk} />
      <Section title="🟡 Warning (ส่งข้อความเตือน)" rows={grouped.warning} />

      {grouped.active.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowActive(!showActive)}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            {showActive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showActive ? 'ซ่อน' : 'แสดง'} 🟢 Active ({grouped.active.length} ลูกค้า)
          </button>
          {showActive && <Section title="🟢 Active" rows={grouped.active} compact />}
        </div>
      )}
    </Card>
  )
}

function Section({ title, rows, compact }: { title: string; rows: ChurnRiskRow[]; compact?: boolean }) {
  if (rows.length === 0) return null
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-slate-700 mb-1.5">{title}</div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-2 py-1.5 text-left">ลูกค้า</th>
              <th className="px-2 py-1.5 text-left">Last seen</th>
              <th className="px-2 py-1.5 text-right">หายมา</th>
              <th className="px-2 py-1.5 text-right">รายได้เฉลี่ย/เดือน</th>
              {!compact && <th className="px-2 py-1.5 text-right">รวมทั้งหมด</th>}
              <th className="px-2 py-1.5 text-right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.customerId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1.5 font-medium text-slate-700">{r.shortName}</td>
                <td className="px-2 py-1.5 text-slate-500 text-xs font-mono">{r.lastActiveMonth || '—'}</td>
                <td className="px-2 py-1.5 text-right text-xs">
                  <span className={cn(
                    r.silentMonths >= 4 ? 'text-red-600 font-bold' :
                    r.silentMonths >= 2 ? 'text-orange-600 font-medium' :
                    r.silentMonths >= 1 ? 'text-amber-600' : 'text-slate-500',
                  )}>
                    {r.silentMonths === 0 ? 'เดือนนี้' : `${r.silentMonths} เดือน`}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">{formatCurrency(r.avgMonthlyRevenue)}</td>
                {!compact && <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-500">{formatCurrency(r.totalLifetimeRevenue)}</td>}
                <td className="px-2 py-1.5 text-right">
                  <RiskBar score={r.riskScore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RiskBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-orange-500' : score >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-600">{score}</span>
    </div>
  )
}

function Stat({ label, count, sub, color }: { label: string; count: number; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    red:     'bg-red-50 border-red-200 text-red-700',
    orange:  'bg-orange-50 border-orange-200 text-orange-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={cn('p-3 border rounded-lg', colorMap[color])}>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-2xl font-bold mt-1">{count}</div>
      <div className="text-[11px] opacity-70">{sub}</div>
    </div>
  )
}
