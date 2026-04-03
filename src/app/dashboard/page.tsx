'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatNumber, formatCurrency, formatDateShort, cn, todayISO } from '@/lib/utils'
import { LINEN_FORM_STATUS_CONFIG, ALL_LINEN_STATUSES, DEPARTMENT_CONFIG, type LinenFormStatus } from '@/types'
import { hasDiscrepancies } from '@/lib/discrepancy'
import Link from 'next/link'
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  BookOpen,
} from 'lucide-react'

export default function DashboardPage() {
  const {
    linenForms, billingStatements,
    customers, getCustomer, getCarryOver,
  } = useStore()

  const today = todayISO()

  // Stats
  const stats = useMemo(() => {
    // 2.1 จำนวนผ้านับเข้าแล้วรอซัก (3/7) — LF status=sorting → sum col5
    const sortingForms = linenForms.filter(f => f.status === 'sorting')
    const countedInWaiting = sortingForms.reduce((s, f) =>
      s + f.rows.reduce((rs, r) => rs + r.col5_factoryClaimApproved, 0), 0)

    // 2.2 จำนวนผ้าซักอบแล้วรอส่ง (4/7) — LF status=washing → sum col5
    const washingForms = linenForms.filter(f => f.status === 'washing')
    const washedWaiting = washingForms.reduce((s, f) =>
      s + f.rows.reduce((rs, r) => rs + r.col5_factoryClaimApproved, 0), 0)

    // 2.3 จำนวนผ้าเช็คส่งออกวันนี้ (7/7) — LF status=confirmed → sum col6
    const confirmedForms = linenForms.filter(f => f.status === 'confirmed')
    const checkedOut = confirmedForms.reduce((s, f) =>
      s + f.rows.reduce((rs, r) => rs + (r.col6_factoryPackSend || 0), 0), 0)

    // 2.4 ผ้าค้าง/คืนรวมวันนี้ — LF status=confirmed → sum (col6 - col5)
    const carryOverToday = confirmedForms.reduce((s, f) =>
      s + f.rows.reduce((rs, r) => rs + (r.col6_factoryPackSend || 0) - r.col5_factoryClaimApproved, 0), 0)

    return { countedInWaiting, washedWaiting, checkedOut, carryOverToday }
  }, [linenForms])

  // Pipeline counts by status
  const pipeline = useMemo(() => {
    const counts = Object.fromEntries(ALL_LINEN_STATUSES.map(s => [s, 0])) as Record<LinenFormStatus, number>
    linenForms.forEach(f => { counts[f.status]++ })
    return counts
  }, [linenForms])

  // Department checkbox counts (forms ที่ซักอบเสร็จ)
  const deptCounts = useMemo(() => {
    const active = linenForms.filter(f => f.status === 'washing')
    return DEPARTMENT_CONFIG.map(d => ({
      ...d,
      done: active.filter(f => f[d.key]).length,
      total: active.length,
    }))
  }, [linenForms])

  // Discrepancy alerts
  const discrepancyForms = useMemo(() => {
    return linenForms.filter(f => hasDiscrepancies(f)).slice(0, 5)
  }, [linenForms])

  // Overdue billing
  const overdueBilling = useMemo(() => {
    return billingStatements.filter(b => {
      if (b.status !== 'sent') return false
      return b.dueDate < today
    }).slice(0, 5)
  }, [billingStatements, today])

  // Recent forms
  const recentForms = useMemo(() => {
    return [...linenForms].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  }, [linenForms])

  const coVal = stats.carryOverToday
  const coDisplay = coVal === 0 ? '0' : coVal > 0 ? `+${formatNumber(coVal)}` : formatNumber(coVal)

  // Total LF in process (non-confirmed)
  const totalInProcess = ALL_LINEN_STATUSES.reduce((s, st) => st !== 'confirmed' ? s + pipeline[st] : s, 0)

  const statCards = [
    { label: 'จำนวนผ้านับเข้าแล้วรอซัก (3/7)', value: formatNumber(stats.countedInWaiting), unit: 'ผืน', icon: Package, color: 'bg-red-50 text-red-600' },
    { label: 'จำนวนผ้าซักอบแล้วรอส่ง (4/7)', value: formatNumber(stats.washedWaiting), unit: 'ผืน', icon: ClipboardList, color: 'bg-blue-50 text-blue-600' },
    { label: 'จำนวนผ้าเช็คส่งออกวันนี้ (7/7)', value: formatNumber(stats.checkedOut), unit: 'ผืน', icon: Truck, color: 'bg-teal-50 text-teal-600' },
    { label: 'ผ้าค้าง/คืนรวมวันนี้', value: coDisplay, unit: 'ผืน', icon: AlertTriangle, color: coVal < 0 ? 'bg-orange-50 text-orange-600' : coVal > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">แดชบอร์ด</h1>
        <p className="text-sm text-slate-500 mt-0.5">ภาพรวมการดำเนินงาน FlowClean</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', card.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{card.value}</p>
                  <p className="text-xs text-slate-500">{card.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pipeline — 7 สถานะหลัก */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">สถานะใบส่งรับผ้า (จำนวนลูกค้าที่อยู่ในขั้นตอนหน้างาน)</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {ALL_LINEN_STATUSES.map((status, i) => {
            const cfg = LINEN_FORM_STATUS_CONFIG[status]
            return (
              <div key={status} className="flex items-center gap-1">
                <Link href={`/dashboard/linen-forms?status=${status}`}
                  className={cn('flex flex-col items-center px-3 py-2.5 rounded-lg min-w-[74px] transition-all hover:ring-2 hover:ring-[#3DD8D8] hover:ring-offset-2 hover:shadow-md cursor-pointer', cfg.bgColor)}>
                  <span className={cn('text-lg font-bold', cfg.color)}>{pipeline[status]}</span>
                  <span className={cn('text-[9px] leading-tight text-center whitespace-nowrap', cfg.color)}>{cfg.label}</span>
                </Link>
                {i < ALL_LINEN_STATUSES.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Department checkboxes summary — สถานะแผนกย่อย */}
      {deptCounts.some(d => d.total > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/dashboard/linen-forms?status=washing"
              className={cn('flex flex-col items-center px-2 py-2 rounded-lg min-w-[70px] transition-all hover:ring-2 hover:ring-[#3DD8D8] hover:shadow-sm cursor-pointer',
                LINEN_FORM_STATUS_CONFIG.washing.bgColor)}>
              <span className={cn('text-lg font-bold', LINEN_FORM_STATUS_CONFIG.washing.color)}>{pipeline.washing}</span>
              <span className={cn('text-[9px] leading-tight text-center whitespace-nowrap', LINEN_FORM_STATUS_CONFIG.washing.color)}>{LINEN_FORM_STATUS_CONFIG.washing.label}</span>
            </Link>
            <div className="w-8 border-t-2 border-dashed border-slate-300" />
            <h2 className="text-sm font-semibold text-slate-700">สถานะแผนกย่อย (จำนวนลูกค้าซักอบเสร็จ {deptCounts[0]?.total || 0} ใบ)</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {deptCounts.map(d => (
              <Link key={d.key} href="/dashboard/linen-forms?status=washing"
                className={cn('flex flex-col px-3 py-2.5 rounded-lg transition-all hover:ring-2 hover:ring-[#3DD8D8] hover:shadow-sm', d.bgColor)}>
                <span className={cn('text-sm font-bold', d.color)}>✓ {d.label}</span>
                <span className={cn('text-xs', d.color)}>({d.done} จาก {d.total})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Forms */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">ใบส่งรับผ้าล่าสุด</h2>
            <Link href="/dashboard/linen-forms" className="text-xs text-[#3DD8D8] hover:underline flex items-center gap-1">
              ดูทั้งหมด <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">ฟอร์ม</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">โรงแรม</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">วันที่</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-500 text-xs">ชิ้น</th>
                  <th className="text-center px-4 py-2 font-medium text-slate-500 text-xs">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {recentForms.map(form => {
                  const customer = getCustomer(form.customerId)
                  const totalPieces = form.rows.reduce((s, r) => s + r.col2_hotelCountIn + r.col3_hotelClaimCount, 0)
                  const cfg = LINEN_FORM_STATUS_CONFIG[form.status]
                  return (
                    <tr key={form.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{form.formNumber}</td>
                      <td className="px-4 py-2.5 text-slate-700">{customer?.shortName || customer?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDateShort(form.date)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{totalPieces}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', cfg.bgColor, cfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dotColor)} />
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Discrepancy Alerts */}
          {discrepancyForms.length > 0 && (
            <div className="bg-white rounded-xl border border-orange-200 p-4">
              <h3 className="text-sm font-semibold text-orange-700 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" />
                จำนวนไม่ตรง ({discrepancyForms.length})
              </h3>
              <div className="space-y-2">
                {discrepancyForms.map(form => (
                  <Link key={form.id} href={`/dashboard/linen-forms?detail=${form.id}`}
                    className="block text-xs bg-orange-50 rounded-lg px-3 py-2 hover:bg-orange-100 transition-colors">
                    <span className="font-mono text-orange-600">{form.formNumber}</span>
                    <span className="text-slate-500 ml-2">{(() => { const c = getCustomer(form.customerId); return c?.shortName || c?.name })()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Overdue Billing */}
          {overdueBilling.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" />
                บิลเกินกำหนด ({overdueBilling.length})
              </h3>
              <div className="space-y-2">
                {overdueBilling.map(b => (
                  <Link key={b.id} href={`/dashboard/billing?detail=${b.id}`}
                    className="block text-xs bg-red-50 rounded-lg px-3 py-2 hover:bg-red-100 transition-colors">
                    <span className="font-mono text-red-600">{b.billingNumber}</span>
                    <span className="text-slate-500 ml-2">{formatCurrency(b.netPayable)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Guide */}
          <Link href="/dashboard/guide"
            className="block bg-gradient-to-br from-[#1B3A5C] to-[#122740] rounded-xl p-4 text-white hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">คู่มือการใช้งาน</p>
                <p className="text-xs text-slate-300 mt-0.5">ขั้นตอน สถานะ คอลัมน์ สูตรบิล</p>
              </div>
              <ArrowRight className="w-4 h-4 ml-auto text-slate-400" />
            </div>
          </Link>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">ลัด</h3>
            <div className="space-y-2">
              <Link href="/dashboard/linen-forms"
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#1B3A5C] transition-colors py-1">
                <ClipboardList className="w-4 h-4" />สร้างใบส่งรับผ้าใหม่
              </Link>
              <Link href="/dashboard/delivery"
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#1B3A5C] transition-colors py-1">
                <Truck className="w-4 h-4" />สร้างใบส่งของ
              </Link>
              <Link href="/dashboard/billing"
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#1B3A5C] transition-colors py-1">
                <CheckCircle2 className="w-4 h-4" />สร้างใบวางบิล
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
