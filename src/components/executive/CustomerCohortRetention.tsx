'use client'

/**
 * 222.3 — Customer Cohort Retention
 * Group customers by first-seen month → retention % at each subsequent month
 * Source: bills + legacy WB
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Users } from 'lucide-react'
import type { CohortData } from '@/lib/use-executive-tier23'
import { Card, Empty } from './ItemMixProfitability'

interface Props { data: CohortData; usingLegacy: boolean }

export default function CustomerCohortRetention({ data, usingLegacy }: Props) {
  const maxCols = Math.min(13, data.maxMonthIndex + 1) // 13 cols = M0..M12

  const totalCustomers = useMemo(() => data.cohorts.reduce((s, c) => s + c.size, 0), [data])

  if (data.cohorts.length === 0) {
    return <Empty msg="ไม่มี cohort data ในช่วงนี้" />
  }

  // Compute average retention by month-index (across cohorts that have data)
  const avgByIndex: number[] = []
  for (let idx = 0; idx < maxCols; idx++) {
    const valid = data.cohorts.filter(c => c.cells.length > idx)
    if (valid.length === 0) { avgByIndex.push(0); continue }
    const avg = valid.reduce((s, c) => s + c.cells[idx].retentionPct, 0) / valid.length
    avgByIndex.push(avg)
  }

  return (
    <Card title="222.3 Customer Cohort Retention" icon={<Users className="w-4 h-4 text-pink-600" />}
      sub={`${data.cohorts.length} cohort · รวม ${totalCustomers} ลูกค้า`}
      legacyNote={usingLegacy ? '✅ first-seen ใช้ legacy' : undefined}>
      {/* Average retention curve */}
      <div className="mb-4 flex items-stretch gap-1 overflow-x-auto">
        <div className="text-[10px] text-slate-500 font-medium flex items-center px-2 min-w-[50px]">เฉลี่ย</div>
        {avgByIndex.map((v, i) => (
          <div key={i} className={cn('text-center text-[10px] py-1 px-1 rounded min-w-[44px] flex-1',
            v >= 80 ? 'bg-emerald-100 text-emerald-700' :
            v >= 50 ? 'bg-amber-100 text-amber-700' :
            v > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400')}>
            <div className="font-medium">M{i}</div>
            <div className="font-bold">{v.toFixed(0)}%</div>
          </div>
        ))}
      </div>

      {/* Cohort heatmap */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-slate-600 sticky left-0 bg-slate-50">Cohort</th>
              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Size</th>
              {Array.from({ length: maxCols }).map((_, i) => (
                <th key={i} className="px-2 py-1.5 text-center font-medium text-slate-500">M{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map(c => (
              <tr key={c.cohortMonth} className="border-t border-slate-100">
                <td className="px-2 py-1.5 font-mono text-slate-700 sticky left-0 bg-white">{c.cohortMonth}</td>
                <td className="px-2 py-1.5 text-right text-slate-500">{c.size}</td>
                {Array.from({ length: maxCols }).map((_, i) => {
                  const cell = c.cells[i]
                  if (!cell) return <td key={i} className="px-2 py-1.5"></td>
                  const pct = cell.retentionPct
                  const bg = pct >= 90 ? 'bg-emerald-200 text-emerald-900'
                    : pct >= 70 ? 'bg-emerald-100 text-emerald-700'
                    : pct >= 50 ? 'bg-amber-100 text-amber-700'
                    : pct > 0 ? 'bg-red-50 text-red-600'
                    : 'bg-slate-50 text-slate-300'
                  return (
                    <td key={i} className={cn('px-2 py-1.5 text-center font-mono', bg)}>
                      {pct.toFixed(0)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 p-3 bg-pink-50 border border-pink-200 rounded-lg text-xs text-pink-800">
        <strong>📖 Cohort = กลุ่มลูกค้าที่เริ่มเดือนเดียวกัน</strong> ·
        M0 = เดือนแรก (=100%) · M3 = หลัง 3 เดือนยังอยู่กี่ % ·
        <span className="text-emerald-700 font-medium"> สีเขียว = retention ดี</span> ·
        <span className="text-red-600 font-medium"> สีแดง = retention ตก</span>
      </div>
    </Card>
  )
}
