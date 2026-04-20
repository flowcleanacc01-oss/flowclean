'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, AlertCircle, Clock, AlertTriangle, FileText, CheckCheck } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency, formatDate, todayISO } from '@/lib/utils'
import { hasDiscrepancies } from '@/lib/discrepancy'
import { canViewFinancialDashboard } from '@/lib/permissions'

interface Alert {
  id: string
  kind: 'overdue' | 'dueSoon' | 'discrepancy' | 'qtPending'
  icon: typeof Bell
  color: string
  primary: string
  secondary: string
  href: string
}

interface AlertGroup {
  title: string
  key: string
  alerts: Alert[]
  color: string
}

/**
 * Notification Bell (Feature C1)
 *
 * Aggregated alerts:
 * - WB เกินกำหนด (overdue) — red
 * - WB ใกล้ครบกำหนด 3 วัน (due soon) — amber
 * - LF นับไม่ตรง (discrepancy) — orange
 * - QT ส่งแล้วรอตอบ > 7 วัน — slate
 */
export default function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    currentUser, linenForms, billingStatements, quotations, customers,
  } = useStore()
  const showFinancial = canViewFinancialDashboard(currentUser)

  const custMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers])

  const groups = useMemo<AlertGroup[]>(() => {
    const today = todayISO()
    const todayDate = new Date(today)
    const in3Days = new Date(todayDate)
    in3Days.setDate(todayDate.getDate() + 3)
    const in3DaysISO = in3Days.toISOString().slice(0, 10)
    const daysAgo7 = new Date(todayDate)
    daysAgo7.setDate(todayDate.getDate() - 7)
    const daysAgo7ISO = daysAgo7.toISOString().slice(0, 10)

    const out: AlertGroup[] = []

    // 1. บิลเกินกำหนด
    if (showFinancial) {
      const overdue = billingStatements
        .filter(b => b.status === 'sent' && b.dueDate < today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 10)
        .map<Alert>(b => {
          const c = custMap.get(b.customerId)
          const daysLate = Math.floor((todayDate.getTime() - new Date(b.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          return {
            id: b.id,
            kind: 'overdue',
            icon: AlertCircle,
            color: 'text-red-600',
            primary: `${b.billingNumber} · ${c?.shortName || c?.name || '-'}`,
            secondary: `${formatCurrency(b.netPayable)} · เลยกำหนด ${daysLate} วัน`,
            href: `/dashboard/billing?tab=billing&detail=${b.id}`,
          }
        })
      if (overdue.length > 0) {
        out.push({
          title: 'บิลเกินกำหนดชำระ',
          key: 'overdue',
          alerts: overdue,
          color: 'text-red-600',
        })
      }
    }

    // 2. บิลใกล้ครบกำหนด 3 วัน
    if (showFinancial) {
      const dueSoon = billingStatements
        .filter(b => b.status === 'sent' && b.dueDate >= today && b.dueDate <= in3DaysISO)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 10)
        .map<Alert>(b => {
          const c = custMap.get(b.customerId)
          const days = Math.ceil((new Date(b.dueDate).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
          return {
            id: b.id,
            kind: 'dueSoon',
            icon: Clock,
            color: 'text-amber-600',
            primary: `${b.billingNumber} · ${c?.shortName || c?.name || '-'}`,
            secondary: `${formatCurrency(b.netPayable)} · ครบกำหนดอีก ${days} วัน (${formatDate(b.dueDate)})`,
            href: `/dashboard/billing?tab=billing&detail=${b.id}`,
          }
        })
      if (dueSoon.length > 0) {
        out.push({
          title: 'บิลใกล้ครบกำหนด (3 วัน)',
          key: 'dueSoon',
          alerts: dueSoon,
          color: 'text-amber-600',
        })
      }
    }

    // 3. LF นับไม่ตรง
    const discrepancy = linenForms
      .filter(f => hasDiscrepancies(f))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map<Alert>(f => {
        const c = custMap.get(f.customerId)
        return {
          id: f.id,
          kind: 'discrepancy',
          icon: AlertTriangle,
          color: 'text-orange-600',
          primary: `${f.formNumber} · ${c?.shortName || c?.name || '-'}`,
          secondary: `${formatDate(f.date)} · ตรวจสอบจำนวนผ้า`,
          href: `/dashboard/linen-forms?detail=${f.id}`,
        }
      })
    if (discrepancy.length > 0) {
      out.push({
        title: 'ลูกค้าแจ้งนับผ้าไม่ตรง',
        key: 'discrepancy',
        alerts: discrepancy,
        color: 'text-orange-600',
      })
    }

    // 4. QT ที่ส่งแล้วรอตอบ > 7 วัน
    if (showFinancial) {
      const qtPending = quotations
        .filter(q => q.status === 'sent' && q.date < daysAgo7ISO)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10)
        .map<Alert>(q => {
          const c = custMap.get(q.customerId)
          const days = Math.floor((todayDate.getTime() - new Date(q.date).getTime()) / (1000 * 60 * 60 * 24))
          return {
            id: q.id,
            kind: 'qtPending',
            icon: FileText,
            color: 'text-slate-600',
            primary: `${q.quotationNumber} · ${c?.shortName || c?.name || '-'}`,
            secondary: `ส่งแล้ว ${days} วัน — ยังไม่ตอบรับ`,
            href: `/dashboard/billing?tab=quotation&openqt=${q.id}`,
          }
        })
      if (qtPending.length > 0) {
        out.push({
          title: 'QT รอลูกค้าตอบรับ (>7 วัน)',
          key: 'qtPending',
          alerts: qtPending,
          color: 'text-slate-600',
        })
      }
    }

    return out
  }, [linenForms, billingStatements, quotations, custMap, showFinancial])

  const totalCount = useMemo(() => groups.reduce((s, g) => s + g.alerts.length, 0), [groups])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    // Delay to avoid immediate close when user clicks bell
    const t = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', handler)
    }
  }, [open])

  // Close on Esc
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const goTo = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg shadow-sm hover:border-[#3DD8D8] hover:shadow-md transition-all',
          totalCount > 0 ? 'text-amber-500' : 'text-slate-500',
        )}
        title={totalCount > 0 ? `${totalCount} การแจ้งเตือน` : 'ไม่มีการแจ้งเตือน'}
      >
        <Bell className="w-4 h-4" />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-[80vh] overflow-hidden flex flex-col animate-fadeIn">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-slate-500" />
              การแจ้งเตือน
            </h3>
            <span className="text-[11px] text-slate-400">{totalCount} รายการ</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                <CheckCheck className="w-10 h-10 mx-auto mb-2 text-emerald-200" />
                <p>ไม่มีการแจ้งเตือน</p>
                <p className="text-[11px] text-slate-400 mt-1">ทุกเอกสารเรียบร้อย 🎉</p>
              </div>
            ) : (
              groups.map(g => (
                <div key={g.key} className="border-b border-slate-100 last:border-b-0">
                  <div className={cn('px-4 py-2 bg-slate-50 text-[11px] font-semibold flex items-center justify-between', g.color)}>
                    <span>{g.title}</span>
                    <span className="text-slate-400 font-normal">{g.alerts.length}</span>
                  </div>
                  {g.alerts.map(a => {
                    const Icon = a.icon
                    return (
                      <button
                        key={`${a.kind}-${a.id}`}
                        onClick={() => goTo(a.href)}
                        className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                      >
                        <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', a.color)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">{a.primary}</p>
                          <p className="text-[11px] text-slate-500 truncate">{a.secondary}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
