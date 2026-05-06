'use client'

/**
 * 222.6 — Win-Loss QT Analysis
 * QT accept/reject rate over time + overall win rate
 * Source: current QT (legacy QT count shown separately — no status mapping)
 */
import { useMemo } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import { Trophy } from 'lucide-react'
import type { WinLossData } from '@/lib/use-executive-tier23'
import { Card, Empty } from './ItemMixProfitability'

interface Props { data: WinLossData; usingLegacy: boolean }

export default function WinLossQT({ data, usingLegacy }: Props) {
  const chartData = useMemo(() => data.byMonth.map(p => ({
    period: p.period,
    accepted: p.accepted,
    rejected: p.rejected,
    sent: p.sent,
    draft: p.draft,
    winRate: Math.round(p.winRate),
  })), [data])

  if (data.totals.draft + data.totals.sent + data.totals.accepted + data.totals.rejected === 0) {
    return <Empty msg="ไม่มี QT ในช่วงนี้" />
  }

  return (
    <Card title="222.6 Win-Loss QT Analysis" icon={<Trophy className="w-4 h-4 text-amber-600" />}
      sub={`รวม ${data.totals.accepted + data.totals.rejected + data.totals.sent + data.totals.draft} QT · accepted ${data.totals.accepted} / rejected ${data.totals.rejected}`}
      legacyNote={usingLegacy && data.legacyCount > 0 ? `🟡 +${data.legacyCount} legacy QT (count only)` : undefined}>
      {/* Overall win rate */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Stat label="Win Rate" value={`${data.totals.winRate.toFixed(1)}%`}
          color={data.totals.winRate >= 70 ? 'emerald' : data.totals.winRate >= 50 ? 'amber' : 'red'} sub="accepted / (a+r)" />
        <Stat label="Draft" value={String(data.totals.draft)} color="slate" sub="ยังไม่ส่ง" />
        <Stat label="Sent" value={String(data.totals.sent)} color="blue" sub="ส่งแล้วรอตอบ" />
        <Stat label="Accepted" value={String(data.totals.accepted)} color="emerald" sub="ตกลงราคา" />
        <Stat label="Rejected" value={String(data.totals.rejected)} color="red" sub="ปฏิเสธ" />
      </div>

      {/* Stacked bar + win rate line */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 30, bottom: 30 }}>
            <XAxis dataKey="period" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'จำนวน QT', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748B' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} label={{ value: 'Win Rate %', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#10B981' } }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="accepted" stackId="a" fill="#10B981" name="Accepted" />
            <Bar yAxisId="left" dataKey="rejected" stackId="a" fill="#EF4444" name="Rejected" />
            <Bar yAxisId="left" dataKey="sent" stackId="a" fill="#3DD8D8" name="Sent" />
            <Bar yAxisId="left" dataKey="draft" stackId="a" fill="#94A3B8" name="Draft" />
            <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="#1B3A5C" strokeWidth={2.5} dot={{ r: 3 }} name="Win Rate %" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {data.legacyCount > 0 && usingLegacy && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <strong>🟡 Legacy QT note:</strong> มี {data.legacyCount} legacy QT ในช่วงนี้ — แต่ legacy ไม่มี status mapping
          จึงแสดงแค่จำนวน (ไม่นับใน win rate)
        </div>
      )}

      <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
        <strong>📖 Win Rate</strong> = QT accepted ÷ (accepted + rejected) ·
        ไม่นับ draft / sent (ยังตอบไม่ครบ) ·
        <span className="text-emerald-600 font-medium"> ≥70% = ดี</span> ·
        <span className="text-red-600 font-medium"> &lt;50% = ต้องดู pricing</span>
      </div>
    </Card>
  )
}

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-700',
  }
  return (
    <div className={cn('p-3 border rounded-lg', colorMap[color])}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
      <div className="text-[10px] opacity-60">{sub}</div>
    </div>
  )
}
