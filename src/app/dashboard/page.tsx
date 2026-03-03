'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatNumber, formatCurrency, formatDateShort, cn } from '@/lib/utils'
import { LINEN_FORM_STATUS_CONFIG, ALL_LINEN_STATUSES, PROCESS_STATUSES, type LinenFormStatus } from '@/types'
import { hasDiscrepancies } from '@/lib/discrepancy'
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const {
    linenForms, deliveryNotes, billingStatements,
    customers, getCustomer, getCarryOver,
  } = useStore()

  const today = new Date().toISOString().split('T')[0]

  // Stats
  const stats = useMemo(() => {
    const todayForms = linenForms.filter(f => f.date === today)
    const todayReceived = todayForms.reduce((s, f) => s + f.rows.reduce((rs, r) => rs + r.col1_normalSend + r.col2_claimSend, 0), 0)

    const inProcess = linenForms.filter(f => PROCESS_STATUSES.includes(f.status) || f.status === 'received')
    const processingCount = inProcess.reduce((s, f) => s + f.rows.reduce((rs, r) => rs + r.col1_normalSend + r.col2_claimSend, 0), 0)

    const packed = linenForms.filter(f => f.status === 'packed')
    const packedCount = packed.reduce((s, f) => s + f.rows.reduce((rs, r) => rs + r.col5_factoryPackSend, 0), 0)

    // Total carry-over across all customers
    let totalCarryOver = 0
    for (const c of customers) {
      const co = getCarryOver(c.id, '9999-12-31')
      totalCarryOver += Object.values(co).reduce((s, v) => s + v, 0)
    }

    return { todayReceived, processingCount, packedCount, totalCarryOver }
  }, [linenForms, customers, today, getCarryOver])

  // Pipeline counts by status
  const pipeline = useMemo(() => {
    const counts = Object.fromEntries(ALL_LINEN_STATUSES.map(s => [s, 0])) as Record<LinenFormStatus, number>
    linenForms.forEach(f => { counts[f.status]++ })
    return counts
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

  const statCards = [
    { label: 'ผ้ารับเข้าวันนี้', value: formatNumber(stats.todayReceived), unit: 'ชิ้น', icon: Package, color: 'bg-blue-50 text-blue-600' },
    { label: 'กำลังซัก', value: formatNumber(stats.processingCount), unit: 'ชิ้น', icon: ClipboardList, color: 'bg-amber-50 text-amber-600' },
    { label: 'พร้อมส่ง', value: formatNumber(stats.packedCount), unit: 'ชิ้น', icon: Truck, color: 'bg-teal-50 text-teal-600' },
    { label: 'ผ้าค้างรวม', value: formatNumber(stats.totalCarryOver), unit: 'ชิ้น', icon: AlertTriangle, color: stats.totalCarryOver > 0 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600' },
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

      {/* Pipeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">สถานะใบส่งรับผ้า</h2>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {ALL_LINEN_STATUSES.map((status, i) => {
            const cfg = LINEN_FORM_STATUS_CONFIG[status]
            return (
              <div key={status} className="flex items-center gap-1.5">
                <div className={cn('flex flex-col items-center px-3 py-2.5 rounded-lg min-w-16', cfg.bgColor)}>
                  <span className={cn('text-lg font-bold', cfg.color)}>{pipeline[status]}</span>
                  <span className="text-[10px] text-slate-600 whitespace-nowrap">{cfg.label}</span>
                </div>
                {i < ALL_LINEN_STATUSES.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

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
                  const totalPieces = form.rows.reduce((s, r) => s + r.col1_normalSend + r.col2_claimSend, 0)
                  const cfg = LINEN_FORM_STATUS_CONFIG[form.status]
                  return (
                    <tr key={form.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{form.formNumber}</td>
                      <td className="px-4 py-2.5 text-slate-700">{customer?.name || '-'}</td>
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
                  <Link key={form.id} href="/dashboard/linen-forms"
                    className="block text-xs bg-orange-50 rounded-lg px-3 py-2 hover:bg-orange-100 transition-colors">
                    <span className="font-mono text-orange-600">{form.formNumber}</span>
                    <span className="text-slate-500 ml-2">{getCustomer(form.customerId)?.name}</span>
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
                  <Link key={b.id} href="/dashboard/billing"
                    className="block text-xs bg-red-50 rounded-lg px-3 py-2 hover:bg-red-100 transition-colors">
                    <span className="font-mono text-red-600">{b.billingNumber}</span>
                    <span className="text-slate-500 ml-2">{formatCurrency(b.netPayable)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">ลัด</h3>
            <div className="space-y-2">
              <Link href="/dashboard/linen-forms"
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#1B3A5C] transition-colors py-1">
                <ClipboardList className="w-4 h-4" />รับผ้าเข้าใหม่
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
