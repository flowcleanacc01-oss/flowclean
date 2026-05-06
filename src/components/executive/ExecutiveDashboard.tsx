'use client'

/**
 * 220 — Executive Dashboard (main container)
 * รวม 6 แดชบอร์ด: 220.1 / 220.2 / 220.3 / 220.C / 220.D / 220.E
 * Permission: admin only — ตามคำขอติ๊ด
 */
import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { canViewExecutiveDashboard } from '@/lib/permissions'
import { useExecutiveDashboard, previousMonth } from '@/lib/use-executive-dashboard'
import { useExecutiveTier23 } from '@/lib/use-executive-tier23'
import { Sparkles, Calendar, Database } from 'lucide-react'
import CustomerRevenueShare from './CustomerRevenueShare'
import CategoryRevenueShare from './CategoryRevenueShare'
import MoMWaterfall from './MoMWaterfall'
import CustomerHealthScore from './CustomerHealthScore'
import PriceRealization from './PriceRealization'
import YieldPerPiece from './YieldPerPiece'
import ItemMixProfitability from './ItemMixProfitability'
import SeasonalityDecomposition from './SeasonalityDecomposition'
import CustomerCohortRetention from './CustomerCohortRetention'
import ChurnRiskPredictor from './ChurnRiskPredictor'
import CapacityUtilization from './CapacityUtilization'
import WinLossQT from './WinLossQT'

function nowYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthMinus(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m -= n
  while (m <= 0) { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}

function ymToISOStart(ym: string): string {
  return `${ym}-01`
}

function ymToISOEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${ym}-${String(last).padStart(2, '0')}`
}

export default function ExecutiveDashboard() {
  const { currentUser } = useStore()

  const [currentMonth, setCurrentMonth] = useState(() => nowYM())
  const [includeLegacy, setIncludeLegacy] = useState(true)
  const prevMonth = useMemo(() => previousMonth(currentMonth), [currentMonth])
  const trendFrom = useMemo(() => ymToISOStart(monthMinus(currentMonth, 5)), [currentMonth])
  const trendTo = useMemo(() => ymToISOEnd(currentMonth), [currentMonth])

  const data = useExecutiveDashboard({ currentMonth, prevMonth, trendFrom, trendTo })

  // Tier 2-3 — wider window (24 months back) for seasonality + cohort + churn
  const tier23From = useMemo(() => ymToISOStart(monthMinus(currentMonth, 23)), [currentMonth])
  const tier23 = useExecutiveTier23({
    dateFrom: tier23From,
    dateTo: trendTo,
    anchorMonth: currentMonth,
    includeLegacy,
  })

  if (!canViewExecutiveDashboard(currentUser)) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="text-2xl mb-2">🔒</div>
        <div className="font-semibold text-slate-700 mb-1">เฉพาะ Admin เท่านั้น</div>
        <div className="text-sm text-slate-500">Executive Dashboard เห็นข้อมูลเชิงกลยุทธ์ที่ Sensitive</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#1B3A5C] via-[#2C5481] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <Sparkles className="w-3.5 h-3.5" />
          Executive Dashboard
        </div>
        <h2 className="text-xl font-bold">มุมมองผู้บริหาร — Strategic Insights</h2>
        <p className="text-sm opacity-90 mt-1">
          วิเคราะห์เชิงลึกสำหรับการตัดสินใจ — concentration risk · momentum · health · yield
        </p>
      </div>

      {/* Period selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500 font-medium">เดือนวิเคราะห์:</span>
        <input
          type="month"
          value={currentMonth}
          onChange={e => setCurrentMonth(e.target.value)}
          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
        />
        <div className="flex items-center gap-1 ml-auto">
          {[1, 3, 6, 12].map(n => {
            const target = monthMinus(nowYM(), n)
            return (
              <button key={n} onClick={() => setCurrentMonth(target)}
                className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                {n} เดือนก่อน
              </button>
            )
          })}
          <button onClick={() => setCurrentMonth(nowYM())}
            className="text-xs px-2.5 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium">
            เดือนนี้
          </button>
        </div>
        <div className="w-full text-xs text-slate-500">
          เปรียบเทียบ: <strong>{prevMonth}</strong> → <strong>{currentMonth}</strong>
          {' · '}Health window: <strong>{trendFrom.slice(0, 7)}</strong> ถึง <strong>{currentMonth}</strong> (6 เดือน)
          {' · '}Tier 2-3 window: <strong>{tier23From.slice(0, 7)}</strong> ถึง <strong>{currentMonth}</strong> (24 เดือน)
        </div>
        <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-100">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={includeLegacy} onChange={e => setIncludeLegacy(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
            รวมข้อมูล legacy (WB เก่า ปี 2565-2568) — เห็น history ลึก เห็น seasonality + cohort จริง
          </label>
        </div>
      </div>

      {/* 220.3 Waterfall — แสดงก่อน เพราะ "ใครทำให้ขึ้น/ลง" คือคำถามแรกของผู้บริหาร */}
      <MoMWaterfall
        waterfall={data.waterfall}
        topGrowers={data.topGrowers}
        topLosers={data.topLosers}
        stats={data.stats}
        prevMonth={prevMonth}
        currentMonth={currentMonth}
      />

      {/* 220.1 Customer Share + Pareto */}
      <CustomerRevenueShare rows={data.customerShare} stats={data.stats} />

      {/* 220.2 Category Share */}
      <CategoryRevenueShare rows={data.categoryShare} totalRevenue={data.stats.totalRevenue} />

      {/* 220.C Health Score */}
      <CustomerHealthScore rows={data.healthScores} />

      {/* 220.D Price Realization */}
      <PriceRealization rows={data.priceRealization} />

      {/* 220.E Yield per Piece */}
      <YieldPerPiece rows={data.yieldRanking} />

      {/* ─────────────────────────────────────────────────── */}
      <div className="pt-2 border-t border-slate-200">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3 mt-2">
          📊 Tier 2-3 — Strategic Analytics ({tier23From.slice(0, 7)} ถึง {currentMonth})
        </div>
      </div>

      {/* 222.2 Seasonality Decomposition */}
      <SeasonalityDecomposition data={tier23.seasonality} />

      {/* 222.3 Customer Cohort Retention */}
      <CustomerCohortRetention data={tier23.cohorts} usingLegacy={includeLegacy} />

      {/* 222.4 Churn Risk Predictor */}
      <ChurnRiskPredictor rows={tier23.churnRisk} usingLegacy={includeLegacy} />

      {/* 222.1 Item Mix Profitability — current data only */}
      <ItemMixProfitability rows={tier23.itemMix} />

      {/* 222.5 Capacity Utilization — current LF only */}
      <CapacityUtilization data={tier23.capacity} />

      {/* 222.6 Win-Loss QT Analysis */}
      <WinLossQT data={tier23.winLoss} usingLegacy={includeLegacy} />

      {/* Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500 text-center">
        🔒 Executive Dashboard — เฉพาะ Admin · ข้อมูลเชิงกลยุทธ์ ห้ามแชร์ภายนอก
      </div>
    </div>
  )
}
