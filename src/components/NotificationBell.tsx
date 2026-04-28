'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, AlertCircle, Clock, AlertTriangle, FileText, CheckCheck, Check, RotateCcw, Hourglass } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency, formatDate, todayISO } from '@/lib/utils'
import { hasDiscrepancies } from '@/lib/discrepancy'
import { canViewFinancialDashboard } from '@/lib/permissions'
import { loadAcknowledged, saveAcknowledged, pruneStale } from '@/lib/acknowledged-alerts'
import { LINEN_FORM_STATUS_CONFIG } from '@/types'

interface Alert {
  id: string
  kind: 'overdue' | 'dueSoon' | 'discrepancy' | 'qtPending' | 'lfStuck'
  icon: typeof Bell
  color: string
  /** 135.3+.4: วันที่เอกสาร (YYYY-MM-DD) — แสดงเด่นเป็นหลัก */
  date: string
  /** 135.3+.4: ชื่อย่อลูกค้า — แสดงเด่นเป็นหลัก */
  customerName: string
  /** 135.3+.4: เลขที่เอกสาร — แสดง muted (font-mono, text-slate-400) */
  docNumber: string
  /** รายละเอียดเสริม เช่น ยอดเงิน, วันเกินกำหนด, สถานะ — แสดงท้าย */
  detail: string
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

  // 124: Acknowledged alerts — localStorage per user
  const userId = currentUser?.id || 'anon'
  const [acked, setAcked] = useState<Set<string>>(() => loadAcknowledged(userId))

  // Reload on user switch
  useEffect(() => {
    setAcked(loadAcknowledged(userId))
  }, [userId])

  const alertKey = (kind: string, id: string) => `${kind}-${id}`
  const isAcked = (key: string) => acked.has(key)

  const mutateAcked = (next: Set<string>) => {
    setAcked(next)
    saveAcknowledged(userId, next)
  }
  const acknowledgeOne = (key: string) => {
    const next = new Set(acked); next.add(key); mutateAcked(next)
  }
  const unacknowledgeOne = (key: string) => {
    const next = new Set(acked); next.delete(key); mutateAcked(next)
  }

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
            date: b.issueDate,
            customerName: c?.shortName || c?.name || '-',
            docNumber: b.billingNumber,
            detail: `${formatCurrency(b.netPayable)} · เลยกำหนด ${daysLate} วัน`,
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
            date: b.issueDate,
            customerName: c?.shortName || c?.name || '-',
            docNumber: b.billingNumber,
            detail: `${formatCurrency(b.netPayable)} · ครบอีก ${days} วัน (${formatDate(b.dueDate)})`,
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
          date: f.date,
          customerName: c?.shortName || c?.name || '-',
          docNumber: f.formNumber,
          detail: 'ตรวจสอบจำนวนผ้า',
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
            date: q.date,
            customerName: c?.shortName || c?.name || '-',
            docNumber: q.quotationNumber,
            detail: `ส่งแล้ว ${days} วัน — ยังไม่ตอบรับ`,
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

    // 5. 122.4.1: LF ค้างสถานะ > 7 วัน (ไม่ถึง confirmed)
    const lfStuckThreshold = new Date(todayDate)
    lfStuckThreshold.setDate(todayDate.getDate() - 7)
    const lfStuckThresholdISO = lfStuckThreshold.toISOString().slice(0, 10)
    const lfStuck = linenForms
      .filter(f => f.status !== 'confirmed' && f.date < lfStuckThresholdISO)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 15)
      .map<Alert>(f => {
        const c = custMap.get(f.customerId)
        const days = Math.floor((todayDate.getTime() - new Date(f.date).getTime()) / (1000 * 60 * 60 * 24))
        const statusLabel = LINEN_FORM_STATUS_CONFIG[f.status]?.label || f.status
        return {
          id: f.id,
          kind: 'lfStuck',
          icon: Hourglass,
          color: 'text-purple-600',
          date: f.date,
          customerName: c?.shortName || c?.name || '-',
          docNumber: f.formNumber,
          detail: `ค้างที่ ${statusLabel} มา ${days} วัน`,
          href: `/dashboard/linen-forms?detail=${f.id}`,
        }
      })
    if (lfStuck.length > 0) {
      out.push({
        title: 'LF ค้างสถานะ (>7 วัน)',
        key: 'lfStuck',
        alerts: lfStuck,
        color: 'text-purple-600',
      })
    }

    return out
  }, [linenForms, billingStatements, quotations, custMap, showFinancial])

  // 124: Active alert keys (for prune + split new/acked)
  const activeKeys = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const a of g.alerts) s.add(alertKey(a.kind, a.id))
    return s
  }, [groups])

  // Auto-prune acked keys that no longer appear in active alerts
  useEffect(() => {
    const pruned = pruneStale(acked, activeKeys)
    if (pruned.size !== acked.size) mutateAcked(pruned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKeys])

  // 124: Split groups into new (unacknowledged) and seen (acknowledged)
  const splitGroups = useMemo(() => {
    const newGroups: AlertGroup[] = []
    const seenGroups: AlertGroup[] = []
    for (const g of groups) {
      const newAlerts = g.alerts.filter(a => !isAcked(alertKey(a.kind, a.id)))
      const seenAlerts = g.alerts.filter(a => isAcked(alertKey(a.kind, a.id)))
      if (newAlerts.length > 0) newGroups.push({ ...g, alerts: newAlerts })
      if (seenAlerts.length > 0) seenGroups.push({ ...g, alerts: seenAlerts })
    }
    return { newGroups, seenGroups }
  }, [groups, acked])

  const newCount = useMemo(() => splitGroups.newGroups.reduce((s, g) => s + g.alerts.length, 0), [splitGroups])
  const seenCount = useMemo(() => splitGroups.seenGroups.reduce((s, g) => s + g.alerts.length, 0), [splitGroups])
  const totalCount = newCount + seenCount

  const acknowledgeAll = () => {
    const next = new Set(acked)
    for (const g of splitGroups.newGroups) for (const a of g.alerts) next.add(alertKey(a.kind, a.id))
    mutateAcked(next)
  }

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
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={totalCount > 0 ? `การแจ้งเตือน ${totalCount} รายการ` : 'ไม่มีการแจ้งเตือน'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'relative w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg shadow-sm hover:border-[#3DD8D8] hover:shadow-md transition-all',
          totalCount > 0 ? 'text-amber-500' : 'text-slate-500',
        )}
        title={totalCount > 0 ? `${totalCount} การแจ้งเตือน` : 'ไม่มีการแจ้งเตือน'}
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {newCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none" aria-hidden="true">
            {newCount > 99 ? '99+' : newCount}
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
            <div className="flex items-center gap-2">
              {newCount > 0 && (
                <button
                  onClick={acknowledgeAll}
                  className="text-[10px] text-slate-500 hover:text-[#1B3A5C] hover:bg-slate-100 px-2 py-1 rounded transition-colors flex items-center gap-1"
                  title="รับทราบทุกการแจ้งเตือนใหม่"
                >
                  <CheckCheck className="w-3 h-3" />รับทราบทั้งหมด
                </button>
              )}
              <span className="text-[11px] text-slate-400">
                {newCount > 0 ? `ใหม่ ${newCount}` : `${seenCount} รายการ`}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {totalCount === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                <CheckCheck className="w-10 h-10 mx-auto mb-2 text-emerald-200" />
                <p>ไม่มีการแจ้งเตือน</p>
                <p className="text-[11px] text-slate-400 mt-1">ทุกเอกสารเรียบร้อย 🎉</p>
              </div>
            ) : (
              <>
                {/* NEW section */}
                {splitGroups.newGroups.map(g => (
                  <div key={`new-${g.key}`} className="border-b border-slate-100 last:border-b-0">
                    <div className={cn('px-4 py-2 bg-slate-50 text-[11px] font-semibold flex items-center justify-between', g.color)}>
                      <span>{g.title}</span>
                      <span className="text-slate-400 font-normal">{g.alerts.length}</span>
                    </div>
                    {g.alerts.map(a => {
                      const Icon = a.icon
                      const key = alertKey(a.kind, a.id)
                      return (
                        <div key={key} className="flex items-start hover:bg-slate-50 transition-colors">
                          <button
                            onClick={() => goTo(a.href)}
                            className="flex-1 min-w-0 flex items-start gap-2.5 px-4 py-2.5 text-left"
                          >
                            <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', a.color)} />
                            <div className="flex-1 min-w-0">
                              {/* 135.3+.4: date + shortName = ตัวเด่น, docNumber = muted */}
                              <p className="text-xs truncate">
                                <span className="font-medium text-slate-700 mr-1.5">{formatDate(a.date)}</span>
                                <span className="font-medium text-slate-800">{a.customerName}</span>
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                <span className="font-mono text-slate-400 mr-1.5">{a.docNumber}</span>
                                {a.detail}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); acknowledgeOne(key) }}
                            className="flex-shrink-0 px-2 py-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="รับทราบ"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* SEEN section (dimmed) */}
                {splitGroups.seenGroups.length > 0 && (
                  <>
                    {splitGroups.newGroups.length > 0 && (
                      <div className="px-4 py-1.5 bg-slate-100 text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCheck className="w-3 h-3" />
                        รับทราบแล้ว ({seenCount})
                      </div>
                    )}
                    {splitGroups.seenGroups.map(g => (
                      <div key={`seen-${g.key}`} className="border-b border-slate-100 last:border-b-0 opacity-60">
                        <div className={cn('px-4 py-2 bg-slate-50/50 text-[11px] font-semibold flex items-center justify-between text-slate-500')}>
                          <span>{g.title}</span>
                          <span className="text-slate-400 font-normal">{g.alerts.length}</span>
                        </div>
                        {g.alerts.map(a => {
                          const Icon = a.icon
                          const key = alertKey(a.kind, a.id)
                          return (
                            <div key={key} className="flex items-start hover:bg-slate-50 transition-colors">
                              <button
                                onClick={() => goTo(a.href)}
                                className="flex-1 min-w-0 flex items-start gap-2.5 px-4 py-2 text-left"
                              >
                                <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate">
                                    <span className="text-slate-500 mr-1.5">{formatDate(a.date)}</span>
                                    <span className="text-slate-500">{a.customerName}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    <span className="font-mono mr-1.5">{a.docNumber}</span>
                                    {a.detail}
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); unacknowledgeOne(key) }}
                                className="flex-shrink-0 px-2 py-2 text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="ยกเลิกการรับทราบ (กลับเป็นใหม่)"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
