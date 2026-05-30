'use client'

/**
 * Phase A.4 — Monthly Closing Checklist
 * Per-month gauge: LF / SD / WB / Adjustments — ครบไหมก่อนปิดเดือน
 * Mount: /dashboard/reports?tab=closing
 */
import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { cn, todayISO, formatCurrency, formatDate } from '@/lib/utils'
import { CARRY_OVER_REASON_CONFIG } from '@/types'
import { useRouter } from 'next/navigation'
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, FileText, Truck,
  Receipt, Wallet, ExternalLink, Sparkles,
} from 'lucide-react'

export default function MonthlyClosingChecklist() {
  const router = useRouter()
  const { linenForms, deliveryNotes, billingStatements, taxInvoices, carryOverAdjustments, customers } = useStore()

  const [month, setMonth] = useState<string>(() => todayISO().slice(0, 7))

  const custNameById = useMemo(
    () => new Map(customers.map(c => [c.id, c.shortName || c.name])),
    [customers],
  )

  const data = useMemo(() => {
    const monthStart = `${month}-01`
    const [yr, mo] = month.split('-').map(Number)
    // 400 — string math (timezone-safe): new Date(yr,mo,1).toISOString() เลื่อน -1 วันใน TZ+7 → ตัด LF/SD/adj วันสุดท้ายของเดือนทิ้ง
    const nextMonthISO = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

    // LF section
    const lfsInMonth = linenForms.filter(f => f.date >= monthStart && f.date < nextMonthISO)
    const lfByStatus = {
      draft: 0, received: 0, sorting: 0, washing: 0, packed: 0, delivered: 0, confirmed: 0,
    } as Record<string, number>
    for (const f of lfsInMonth) lfByStatus[f.status] = (lfByStatus[f.status] || 0) + 1
    const lfNonConfirmed = lfsInMonth.filter(f => f.status !== 'confirmed').length
    const lfConfirmedRatio = lfsInMonth.length === 0 ? 1 : lfByStatus.confirmed / lfsInMonth.length

    // SD section
    const sdsInMonth = deliveryNotes.filter(d => d.date >= monthStart && d.date < nextMonthISO)
    const wbLinkedSdIds = new Set(billingStatements.flatMap(b => b.deliveryNoteIds))
    const sdWithoutWb = sdsInMonth.filter(d => !wbLinkedSdIds.has(d.id))
    const sdWbRatio = sdsInMonth.length === 0 ? 1 : (sdsInMonth.length - sdWithoutWb.length) / sdsInMonth.length

    // WB section
    const wbsInMonth = billingStatements.filter(b => b.billingMonth === month)
    const wbUnpaid = wbsInMonth.filter(b => b.status !== 'paid').length
    const wbPaidRatio = wbsInMonth.length === 0 ? 1 : (wbsInMonth.length - wbUnpaid) / wbsInMonth.length
    const wbTotalPayable = wbsInMonth.reduce((s, b) => s + (b.netPayable || 0), 0)
    const wbTotalPaid = wbsInMonth.filter(b => b.status === 'paid').reduce((s, b) => s + (b.netPayable || 0), 0)

    // IV section
    const ivLinkedWbIds = new Set(taxInvoices.map(iv => iv.billingStatementId))
    const wbNeedIV = wbsInMonth.filter(b => !ivLinkedWbIds.has(b.id))
    const wbIvRatio = wbsInMonth.length === 0 ? 1 : (wbsInMonth.length - wbNeedIV.length) / wbsInMonth.length

    // Adjustments section
    const adjsInMonth = carryOverAdjustments.filter(a => !a.isDeleted && a.date >= monthStart && a.date < nextMonthISO)
    const adjCount = adjsInMonth.length

    // Overall readiness
    const readiness = (lfConfirmedRatio * 0.3 + sdWbRatio * 0.25 + wbIvRatio * 0.2 + wbPaidRatio * 0.25) * 100

    return {
      monthStart, nextMonthISO,
      lfsInMonth, lfByStatus, lfNonConfirmed, lfConfirmedRatio,
      sdsInMonth, sdWithoutWb, sdWbRatio,
      wbsInMonth, wbUnpaid, wbPaidRatio, wbTotalPayable, wbTotalPaid,
      wbNeedIV, wbIvRatio,
      adjsInMonth, adjCount,
      readiness,
    }
  }, [month, linenForms, deliveryNotes, billingStatements, taxInvoices, carryOverAdjustments])

  const readinessColor =
    data.readiness >= 95 ? 'emerald' :
    data.readiness >= 80 ? 'amber' :
    data.readiness >= 60 ? 'orange' : 'red'

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
          <ClipboardCheck className="w-3.5 h-3.5" />
          Monthly Closing Checklist
        </div>
        <h2 className="text-xl font-bold">เช็คความพร้อมก่อนปิดเดือน</h2>
        <p className="text-sm opacity-90 mt-1">
          เครื่องมือ <span className="font-semibold">monitor only</span> — LF / SD / WB / IV / Payment / Adjustments — ไม่แก้ไขข้อมูล
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">เดือน:</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          <span className="text-xs text-slate-400">({data.monthStart} ถึง {data.nextMonthISO})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">ความพร้อม</span>
          <ReadinessBadge value={data.readiness} color={readinessColor} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LF Section */}
        <Section
          icon={<FileText className="w-4 h-4" />}
          title="1. ใบส่งรับผ้า (LF)"
          subtitle={`${data.lfsInMonth.length} ใบในเดือน · ${data.lfByStatus.confirmed} confirmed (7/7)`}
          ratio={data.lfConfirmedRatio}
          color="blue"
          link={data.lfNonConfirmed > 0 ? '/dashboard/linen-forms' : null}
          linkLabel="ไปดู LF →"
          router={router}
        >
          <div className="grid grid-cols-4 gap-1.5 text-[10px]">
            {(['draft','received','sorting','washing','packed','delivered','confirmed'] as const).map(s => (
              <div key={s} className={cn(
                'px-2 py-1 rounded',
                s === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500',
              )}>
                <div className="font-mono font-bold">{data.lfByStatus[s] || 0}</div>
                <div>{s}</div>
              </div>
            ))}
          </div>
          {data.lfNonConfirmed > 0 && (
            <div className="mt-2 text-xs text-orange-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <strong>{data.lfNonConfirmed}</strong> ใบยังไม่ถึง 7/7 — ต้องปิดก่อนปิดเดือน
            </div>
          )}
        </Section>

        {/* SD Section */}
        <Section
          icon={<Truck className="w-4 h-4" />}
          title="2. ใบส่งของชั่วคราว (SD)"
          subtitle={`${data.sdsInMonth.length} ใบในเดือน · ${data.sdsInMonth.length - data.sdWithoutWb.length} ผูก WB แล้ว`}
          ratio={data.sdWbRatio}
          color="teal"
          link={data.sdWithoutWb.length > 0 ? '/dashboard/delivery' : null}
          linkLabel="ไปดู SD →"
          router={router}
        >
          {data.sdWithoutWb.length > 0 ? (
            <div className="text-xs text-orange-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <strong>{data.sdWithoutWb.length}</strong> SD ยังไม่ผูก WB — ต้องออก WB ก่อน
            </div>
          ) : (
            <div className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />ทุก SD ผูก WB แล้ว
            </div>
          )}
        </Section>

        {/* WB → IV Section */}
        <Section
          icon={<Receipt className="w-4 h-4" />}
          title="3. ใบกำกับภาษี (IV)"
          subtitle={`${data.wbsInMonth.length} WB · ${data.wbsInMonth.length - data.wbNeedIV.length} ออก IV แล้ว`}
          ratio={data.wbIvRatio}
          color="purple"
          link={data.wbNeedIV.length > 0 ? '/dashboard/billing?tab=invoice' : null}
          linkLabel="ไปออก IV →"
          router={router}
        >
          {data.wbNeedIV.length > 0 ? (
            <div className="text-xs text-orange-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <strong>{data.wbNeedIV.length}</strong> WB ยังไม่ออก IV
            </div>
          ) : (
            <div className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />ทุก WB ออก IV แล้ว
            </div>
          )}
        </Section>

        {/* Payment Section */}
        <Section
          icon={<Wallet className="w-4 h-4" />}
          title="4. การชำระเงิน"
          subtitle={`${data.wbsInMonth.length} WB · ${data.wbsInMonth.length - data.wbUnpaid} ชำระแล้ว`}
          ratio={data.wbPaidRatio}
          color="emerald"
          link={data.wbUnpaid > 0 ? '/dashboard/billing?tab=billing' : null}
          linkLabel="ไปดู WB →"
          router={router}
        >
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-slate-500">ยอดรวมเดือนนี้</span>
              <span className="font-mono font-medium text-[#1B3A5C]">{formatCurrency(data.wbTotalPayable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">รับชำระแล้ว</span>
              <span className="font-mono font-medium text-emerald-600">{formatCurrency(data.wbTotalPaid)}</span>
            </div>
            {data.wbUnpaid > 0 && (
              <div className="flex justify-between border-t border-slate-100 pt-1 mt-1">
                <span className="text-orange-600 font-medium">ค้างชำระ</span>
                <span className="font-mono font-bold text-orange-600">{formatCurrency(data.wbTotalPayable - data.wbTotalPaid)}</span>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Adjustments — informational · 400: list รายการจริง + กดเปิดเอกสาร (deep-link เปิด modal ที่ tab ผ้าค้าง) */}
      {data.adjsInMonth.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-slate-700">รายการปรับยอดผ้าค้างในเดือนนี้</span>
            <span className="text-xs text-slate-400">({data.adjsInMonth.length} รายการ — กดเพื่อเปิดดู)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {data.adjsInMonth.map(a => {
              const reasonCfg = CARRY_OVER_REASON_CONFIG[a.reasonCategory]
              return (
                <button key={a.id}
                  onClick={() => router.push(`/dashboard/reports?tab=carryover&openAdj=${a.id}`)}
                  className="w-full flex items-center justify-between gap-2 py-1.5 px-1 -mx-1 rounded text-left hover:bg-slate-50 transition-colors">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-slate-500 flex-shrink-0">{formatDate(a.date)}</span>
                    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                      a.type === 'reset' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                      {a.type === 'reset' ? 'Reset' : 'Adjust'}
                    </span>
                    <span className="text-xs font-medium text-slate-700 truncate">{custNameById.get(a.customerId) || a.customerId}</span>
                    <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                      {a.items.length} รายการ · {reasonCfg ? `${reasonCfg.icon} ${reasonCfg.label}` : a.reasonCategory}
                    </span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                </button>
              )
            })}
          </div>
          <div className="text-xs text-slate-400 mt-2">ตรวจสอบให้แน่ใจว่าทุกรายการมีหลักฐานยืนยัน</div>
        </div>
      )}

      <div className="text-xs text-slate-400 italic mt-2 px-2">
        <strong>read-only</strong> — เครื่องมือ pre-close gauge.
        <br />ค่าความพร้อม (readiness %) = LF×0.3 + SD-WB×0.25 + WB-IV×0.2 + ชำระเงิน×0.25
      </div>
    </div>
  )
}

function Section({ icon, title, subtitle, ratio, color, children, link, linkLabel, router }: {
  icon: React.ReactNode; title: string; subtitle: string; ratio: number; color: string
  children: React.ReactNode; link: string | null; linkLabel: string
  router: ReturnType<typeof useRouter>
}) {
  const colorMap: Record<string, { bar: string; text: string }> = {
    blue:    { bar: 'bg-blue-500', text: 'text-blue-600' },
    teal:    { bar: 'bg-[#3DD8D8]', text: 'text-[#1B3A5C]' },
    purple:  { bar: 'bg-purple-500', text: 'text-purple-600' },
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-600' },
  }
  const cfg = colorMap[color] || colorMap.blue
  const pct = Math.round(ratio * 100)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className={cn('flex items-center gap-1.5 text-sm font-semibold', cfg.text)}>
            {icon}{title}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        </div>
        <div className={cn('text-2xl font-bold', cfg.text)}>{pct}%</div>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full transition-all', cfg.bar)} style={{ width: `${pct}%` }} />
      </div>
      <div>{children}</div>
      {link && (
        <button onClick={() => router.push(link)}
          className="text-xs text-[#1B3A5C] hover:underline inline-flex items-center gap-1">
          {linkLabel}
        </button>
      )}
    </div>
  )
}

function ReadinessBadge({ value, color }: { value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
  }
  return (
    <span className={cn('inline-flex items-center px-3 py-1 rounded-lg font-bold text-lg', colorMap[color])}>
      {Math.round(value)}%
    </span>
  )
}
