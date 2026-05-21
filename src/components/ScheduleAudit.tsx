'use client'

/**
 * 311 — Schedule-Based SD Audit
 *
 * Mount: /dashboard/reports?tab=scheduleaudit&customerId={id}
 *
 * - เลือกลูกค้าที่ setup schedule แล้ว
 * - เทียบ SD จริง vs ตาราง schedule (regular SDs)
 * - แสดง missing days, extra rounds, multiple regular per day
 * - Migration section: "ต้อง tag extra round" (วันที่มี SD ≥ 2 ที่ทั้งหมด isExtraRound=false)
 */

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { runScheduleAudit, findMultipleRegularGroups, type ScheduleAuditDayResult } from '@/lib/schedule-audit'
import { formatDate, cn, startOfMonthISO, endOfMonthISO } from '@/lib/utils'
import DateFilter from '@/components/DateFilter'
import {
  CalendarClock, CheckCircle2, AlertTriangle, AlertOctagon, Settings,
  ExternalLink, Sparkles, Calendar,
} from 'lucide-react'
import { SCHEDULE_TYPE_CONFIG, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/types'

const STATUS_CONFIG: Record<ScheduleAuditDayResult['status'], { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  ok:                { label: 'ปกติ',           color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: CheckCircle2 },
  missing:           { label: 'ขาด SD',         color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     icon: AlertOctagon },
  'extra-only':      { label: 'มีแต่รอบเสริม',   color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: AlertTriangle },
  'multiple-regular':{ label: 'หลายใบในวันเดียว', color: 'text-orange-700', bg: 'bg-orange-50',   border: 'border-orange-200',  icon: AlertTriangle },
  'off-schedule':    { label: 'นอก schedule',    color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200',   icon: Calendar },
}

export default function ScheduleAudit() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { customers, deliveryNotes, getCustomer, updateDeliveryNote } = useStore()

  const urlCustomerId = searchParams.get('customerId')

  // ลูกค้าที่ setup แล้ว
  const setupCustomers = useMemo(
    () => customers.filter(c => c.scheduleType && c.scheduleType !== 'none' && c.isActive)
      .sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name)),
    [customers],
  )

  // ลูกค้าที่ยังไม่ setup (active)
  const unsetupCustomers = useMemo(
    () => customers.filter(c => (!c.scheduleType || c.scheduleType === 'none') && c.isActive),
    [customers],
  )

  const [customerId, setCustomerId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>(() => startOfMonthISO())
  const [dateTo, setDateTo] = useState<string>(() => endOfMonthISO())
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('range')

  // Auto-select customer จาก URL → fallback → first setup customer
  useEffect(() => {
    if (urlCustomerId && setupCustomers.some(c => c.id === urlCustomerId)) {
      setCustomerId(urlCustomerId)
    } else if (!customerId && setupCustomers.length > 0) {
      setCustomerId(setupCustomers[0].id)
    }
  }, [urlCustomerId, setupCustomers, customerId])

  const selectedCustomer = customerId ? getCustomer(customerId) : null

  const audit = useMemo(() => {
    if (!selectedCustomer) return null
    const customerDNs = deliveryNotes.filter(d => d.customerId === selectedCustomer.id)
    return runScheduleAudit(selectedCustomer, customerDNs, dateFrom, dateTo)
  }, [selectedCustomer, deliveryNotes, dateFrom, dateTo])

  // 311.5 — Migration section: วันที่มี regular SD ≥ 2 (อาจลืม tag extra)
  const multipleRegularGroups = useMemo(
    () => findMultipleRegularGroups(setupCustomers, deliveryNotes).slice(0, 50),
    [setupCustomers, deliveryNotes],
  )

  // Active filter
  const [statusFilter, setStatusFilter] = useState<'all' | ScheduleAuditDayResult['status']>('all')

  const filteredDays = useMemo(() => {
    if (!audit) return []
    if (statusFilter === 'all') return audit.days
    return audit.days.filter(d => d.status === statusFilter)
  }, [audit, statusFilter])

  // 311.5 inline tag — quick mark SD as isExtraRound
  const markAsExtra = (dnId: string) => {
    updateDeliveryNote(dnId, { isExtraRound: true })
  }

  if (setupCustomers.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">ยังไม่มีลูกค้าที่ตั้งค่าตารางคิว</h3>
            <p className="text-sm text-amber-700 mb-3">
              Schedule Audit ใช้กับลูกค้าที่ตั้งค่าตารางคิวแล้วเท่านั้น — ไปตั้งค่าจากหน้า "ลูกค้า" → เลือกลูกค้า → กดปุ่ม "ตั้งค่า" ที่การ์ดตารางคิวส่งผ้า
            </p>
            <Link
              href="/dashboard/customers"
              className="inline-flex items-center gap-1 text-sm text-amber-800 font-medium hover:underline"
            >
              ไปหน้าลูกค้า <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header + Customer picker + Date filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-indigo-600" />Schedule Audit
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              ตรวจ SD จริง vs ตารางคิว — เช็คว่ามี SD ครบทุกวันที่ควรส่ง · {setupCustomers.length} ลูกค้า setup แล้ว
              {unsetupCustomers.length > 0 && ` · ${unsetupCustomers.length} ลูกค้ายังไม่ setup`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">ลูกค้า</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#3DD8D8] focus:ring-1 focus:ring-[#3DD8D8]"
            >
              {setupCustomers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.shortName || c.name} · {SCHEDULE_TYPE_CONFIG[c.scheduleType || 'none'].label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <DateFilter
              mode={dateFilterMode}
              onModeChange={setDateFilterMode}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onClear={() => { setDateFrom(startOfMonthISO()); setDateTo(endOfMonthISO()) }}
            />
          </div>
        </div>

        {/* Schedule info */}
        {selectedCustomer && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-indigo-900">
                {selectedCustomer.shortName || selectedCustomer.name}
              </span>
              <span className="text-indigo-700">
                {SCHEDULE_TYPE_CONFIG[selectedCustomer.scheduleType || 'none'].label}
              </span>
              {selectedCustomer.scheduleType === 'weekly' && selectedCustomer.scheduleDays && (
                <span className="flex items-center gap-1">
                  <span className="text-xs text-indigo-700">วันส่ง:</span>
                  {selectedCustomer.scheduleDays.map(day => (
                    <span key={day} className="px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-200 text-indigo-900">
                      {WEEKDAY_SHORT[day]}
                    </span>
                  ))}
                </span>
              )}
              {selectedCustomer.scheduleStartDate && (
                <span className="text-xs text-indigo-700">
                  เริ่ม {formatDate(selectedCustomer.scheduleStartDate)}
                </span>
              )}
              <Link
                href={`/dashboard/customers/${selectedCustomer.id}`}
                className="ml-auto text-xs text-indigo-700 hover:underline flex items-center gap-1"
              >
                แก้ schedule <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      {audit && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="วันที่ควรส่ง"
            value={audit.totals.expectedDays}
            sub="ตามตาราง"
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            color="indigo"
          />
          <StatCard
            label="SD ปกติ"
            value={audit.totals.regularSDs}
            sub="รอบนัดหมาย"
            active={false}
            color="emerald"
          />
          <StatCard
            label="ขาด SD"
            value={audit.totals.missingDays}
            sub="ต้องตรวจสอบ"
            active={statusFilter === 'missing'}
            onClick={() => setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing')}
            color="red"
          />
          <StatCard
            label="หลายใบในวัน"
            value={audit.totals.multipleRegular}
            sub="อาจลืม tag extra"
            active={statusFilter === 'multiple-regular'}
            onClick={() => setStatusFilter(statusFilter === 'multiple-regular' ? 'all' : 'multiple-regular')}
            color="orange"
          />
          <StatCard
            label="รอบเสริม"
            value={audit.totals.extraSDs}
            sub="informational"
            active={false}
            color="violet"
          />
        </div>
      )}

      {/* Days table */}
      {audit && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-slate-700 text-sm">
              รายละเอียดวัน ({filteredDays.length} วัน)
            </h3>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="text-xs text-indigo-600 hover:underline"
              >
                ล้าง filter
              </button>
            )}
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">วันที่</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">วันในสัปดาห์</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600">ตามตาราง?</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">SD ปกติ</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">รอบเสริม</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                      {audit.days.length === 0 ? 'ไม่พบข้อมูลในช่วงที่เลือก' : 'ไม่พบรายการตาม filter'}
                    </td>
                  </tr>
                ) : (
                  filteredDays.map(day => {
                    const cfg = STATUS_CONFIG[day.status]
                    const Icon = cfg.icon
                    return (
                      <tr key={day.date} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-slate-700">{formatDate(day.date)}</td>
                        <td className="px-3 py-2 text-slate-600">{WEEKDAY_LABELS[day.dayOfWeek]}</td>
                        <td className="px-3 py-2 text-center">
                          {day.expected ? (
                            <span className="text-emerald-600">✓</span>
                          ) : (
                            <span className="text-slate-300">−</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {day.regularSDs.length === 0 ? (
                            <span className="text-slate-300">−</span>
                          ) : (
                            <div className="space-y-0.5">
                              {day.regularSDs.map(dn => (
                                <Link
                                  key={dn.id}
                                  href={`/dashboard/delivery?detail=${dn.id}`}
                                  className="block text-xs font-mono text-blue-600 hover:underline"
                                >
                                  {dn.noteNumber}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {day.extraSDs.length === 0 ? (
                            <span className="text-slate-300">−</span>
                          ) : (
                            <div className="space-y-0.5">
                              {day.extraSDs.map(dn => (
                                <Link
                                  key={dn.id}
                                  href={`/dashboard/delivery?detail=${dn.id}`}
                                  className="block text-xs font-mono text-violet-600 hover:underline"
                                >
                                  +{dn.noteNumber}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                            cfg.color, cfg.bg, cfg.border,
                          )}>
                            <Icon className="w-3 h-3" />{cfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 311.5 — Migration section: ต้อง tag extra round */}
      {multipleRegularGroups.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-orange-100 bg-orange-50">
            <h3 className="font-semibold text-orange-900 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4" />ต้อง tag extra round ({multipleRegularGroups.length} วัน)
            </h3>
            <p className="text-xs text-orange-700 mt-1">
              ทุกลูกค้า · วันที่มี SD ≥ 2 ใบ และยังไม่ได้ tag เป็นรอบเสริม — เลือกใบที่เป็นรอบเสริมแล้วกด "Tag extra round"
            </p>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-orange-800">วันที่</th>
                  <th className="text-left px-3 py-2 font-medium text-orange-800">ลูกค้า</th>
                  <th className="text-left px-3 py-2 font-medium text-orange-800">SD ในวันเดียวกัน</th>
                </tr>
              </thead>
              <tbody>
                {multipleRegularGroups.map(group => (
                  <tr key={`${group.customerId}|${group.date}`} className="border-t border-orange-50 hover:bg-orange-50/40">
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{formatDate(group.date)}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/customers/${group.customerId}`}
                        className="text-slate-700 hover:text-indigo-600 hover:underline font-medium"
                      >
                        {group.customerShortName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {group.dns.map(dn => (
                          <div key={dn.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs">
                            <Link
                              href={`/dashboard/delivery?detail=${dn.id}`}
                              className="font-mono text-blue-600 hover:underline"
                            >
                              {dn.noteNumber}
                            </Link>
                            <button
                              type="button"
                              onClick={() => markAsExtra(dn.id)}
                              className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                              title="Tag เป็นรอบเสริม — ใบนี้จะไม่นับใน Schedule Audit"
                            >
                              Tag extra
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

function StatCard({
  label, value, sub, active, onClick, color,
}: {
  label: string
  value: number
  sub: string
  active: boolean
  onClick?: () => void
  color: 'indigo' | 'emerald' | 'red' | 'orange' | 'violet'
}) {
  const COLOR_MAP: Record<typeof color, { border: string; bg: string; text: string; activeBg: string; activeBorder: string }> = {
    indigo:  { border: 'border-indigo-200',  bg: 'bg-white', text: 'text-indigo-700',  activeBg: 'bg-indigo-50',  activeBorder: 'border-indigo-400' },
    emerald: { border: 'border-emerald-200', bg: 'bg-white', text: 'text-emerald-700', activeBg: 'bg-emerald-50', activeBorder: 'border-emerald-400' },
    red:     { border: 'border-red-200',     bg: 'bg-white', text: 'text-red-700',     activeBg: 'bg-red-50',     activeBorder: 'border-red-400' },
    orange:  { border: 'border-orange-200',  bg: 'bg-white', text: 'text-orange-700',  activeBg: 'bg-orange-50',  activeBorder: 'border-orange-400' },
    violet:  { border: 'border-violet-200',  bg: 'bg-white', text: 'text-violet-700',  activeBg: 'bg-violet-50',  activeBorder: 'border-violet-400' },
  }
  const c = COLOR_MAP[color]
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={cn(
        'rounded-xl border p-3 text-left transition-all',
        active ? `${c.activeBg} ${c.activeBorder} shadow-sm` : `${c.bg} ${c.border}`,
        onClick && 'hover:shadow-md cursor-pointer',
      )}
    >
      <div className={cn('text-xs font-semibold uppercase tracking-wider', c.text)}>{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </Wrapper>
  )
}
