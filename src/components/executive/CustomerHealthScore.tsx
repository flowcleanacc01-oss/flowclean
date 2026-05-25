'use client'

/**
 * 220.C — Customer Health Score
 * Composite score per customer (revenue trend + stability + discrepancy + DSO)
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Heart, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { HealthScoreRow } from '@/lib/use-executive-dashboard'

interface Props {
  rows: HealthScoreRow[]
}

export default function CustomerHealthScore({ rows }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const critical = rows.filter(r => r.status === 'critical')
  const atRisk = rows.filter(r => r.status === 'at_risk')
  const healthy = rows.filter(r => r.status === 'healthy')

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        ไม่มีข้อมูลพอที่จะคำนวณ Health Score (ต้องมี billing อย่างน้อย 2 เดือนใน period ที่เลือก)
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-500" />
            220.C Customer Health Score
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Composite: Revenue trend + Volume stability + Discrepancy + Payment speed
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card label="🟢 Healthy" count={healthy.length} color="emerald" sub="≥ 70 คะแนน" />
        <Card label="🟡 At Risk" count={atRisk.length} color="amber" sub="40-69 คะแนน" />
        <Card label="🔴 Critical" count={critical.length} color="red" sub="< 40 คะแนน" />
      </div>

      {/* Sections */}
      {critical.length > 0 && (
        <Section title="🔴 Critical — ต้องโทรด่วน" rows={critical} expanded={expanded} toggle={toggle} />
      )}
      {atRisk.length > 0 && (
        <Section title="🟡 At Risk — ติดตาม" rows={atRisk} expanded={expanded} toggle={toggle} />
      )}
      {healthy.length > 0 && (
        <Section title="🟢 Healthy" rows={healthy.slice(0, 10)} expanded={expanded} toggle={toggle}
          collapsed footer={`${healthy.length} ลูกค้า — แสดง 10 อันดับแรก`} />
      )}
    </div>
  )
}

function Section({ title, rows, expanded, toggle, footer }: {
  title: string; rows: HealthScoreRow[]; expanded: Set<string>; toggle: (id: string) => void
  collapsed?: boolean; footer?: string
}) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-slate-700 mb-1.5">{title}</div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-2 py-1.5 text-left">Score</th>
              <th className="px-2 py-1.5 text-left">ลูกค้า</th>
              <th className="px-2 py-1.5 text-left">สัญญาณ</th>
              <th className="px-2 py-1.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isOpen = expanded.has(r.customerId)
              return (
                <>
                  <tr key={r.customerId} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => toggle(r.customerId)}>
                    <td className="px-2 py-2"><ScoreBadge score={r.score} status={r.status} /></td>
                    <td className="px-2 py-2 font-medium text-slate-700">{r.shortName}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.flags.length === 0
                        ? <span className="text-slate-400">—</span>
                        : <div className="flex flex-wrap gap-1">{r.flags.map((f, i) => <FlagBadge key={i} text={f} />)}</div>}
                    </td>
                    <td className="px-2 py-2 text-slate-400">
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.customerId}-detail`} className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={4} className="px-3 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <Signal label="Revenue Trend" value={`${r.signals.revenueTrend >= 0 ? '+' : ''}${r.signals.revenueTrend.toFixed(1)}%/เดือน`}
                            good={r.signals.revenueTrend >= 0} />
                          <Signal label="Stability" value={`${r.signals.volumeStability.toFixed(0)}/100`}
                            good={r.signals.volumeStability >= 70} />
                          <Signal label="Discrepancy" value={`${r.signals.discrepancyRate.toFixed(1)}%`}
                            good={r.signals.discrepancyRate < 5} />
                          <Signal label="DSO (เก็บเงิน)" value={r.signals.paymentSpeed === 0 ? 'n/a' : `${Math.round(r.signals.paymentSpeed)} วัน`}
                            good={r.signals.paymentSpeed < 45} />
                        </div>
                        <div className="text-xs text-slate-500 mt-2">{r.name}</div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
        {footer && <div className="px-3 py-1.5 bg-slate-50 text-xs text-slate-500 text-center">{footer}</div>}
      </div>
    </div>
  )
}

function ScoreBadge({ score, status }: { score: number; status: HealthScoreRow['status'] }) {
  const colorMap = {
    healthy:  'bg-emerald-100 text-emerald-700',
    at_risk:  'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  }
  return (
    <div className={cn('inline-flex items-center justify-center w-12 h-8 rounded font-bold text-sm', colorMap[status])}>
      {score}
    </div>
  )
}

function FlagBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">
      <AlertTriangle className="w-2.5 h-2.5" />
      {text}
    </span>
  )
}

function Signal({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={cn('p-2 rounded border', good ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200')}>
      <div className="text-[10px] text-slate-600 font-medium">{label}</div>
      <div className={cn('text-sm font-bold mt-0.5', good ? 'text-emerald-700' : 'text-red-700')}>{value}</div>
    </div>
  )
}

function Card({ label, count, color, sub }: { label: string; count: number; color: string; sub: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={cn('p-3 border rounded-lg', colorMap[color])}>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-2xl font-bold mt-1">{count}</div>
      <div className="text-[11px] opacity-70">{sub}</div>
    </div>
  )
}
