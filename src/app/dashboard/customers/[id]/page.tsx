'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatCurrency, formatNumber, cn, formatDate, buildPriceMapFromQT } from '@/lib/utils'
import { canViewPrice } from '@/lib/permissions'
import {
  X, Building2, Phone, Mail, MapPin, FileText, CreditCard, Edit2,
  Truck, Receipt, ClipboardCheck, TrendingUp, Package, AlertTriangle, Link2, ExternalLink, CalendarClock, Boxes,
} from 'lucide-react'
import Link from 'next/link'
import {
  LINEN_FORM_STATUS_CONFIG, BILLING_STATUS_CONFIG, CARRY_OVER_MODE_CONFIG,
  SCHEDULE_TYPE_CONFIG, WEEKDAY_SHORT,
} from '@/types'
import type { LinenFormStatus, BillingStatus } from '@/types'
import RevenueTrendChart from '@/components/RevenueTrendChart'
import CustomerSearchInline from '@/components/CustomerSearchInline'
import Modal from '@/components/Modal'
import ScheduleSetupModal from '@/components/ScheduleSetupModal'
import ScheduleOverrideList from '@/components/ScheduleOverrideList'
import AggregateGroupsModal from '@/components/AggregateGroupsModal'
import { groupCarryOver, customerUsesAggregateGroups } from '@/lib/carry-over-groups'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const {
    currentUser,
    getCustomer, linenForms, deliveryNotes, billingStatements,
    taxInvoices, checklists, getCarryOver, linenCatalog, quotations, getCustomerCategoryLabel,
    legacyDocuments,
  } = useStore()

  const customer = getCustomer(id)
  const showPrice = canViewPrice(currentUser)

  // All docs for this customer
  const custForms = useMemo(() =>
    linenForms.filter(f => f.customerId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [linenForms, id])

  const custDelivery = useMemo(() =>
    deliveryNotes.filter(d => d.customerId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [deliveryNotes, id])

  const custBilling = useMemo(() =>
    billingStatements.filter(b => b.customerId === id).sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) * -1),
    [billingStatements, id])

  const custTaxInv = useMemo(() =>
    taxInvoices.filter(t => t.customerId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    [taxInvoices, id])

  const custChecklists = useMemo(() =>
    checklists.filter(c => c.customerId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [checklists, id])

  // 168.1: Legacy WB for this customer (kind=WB) — pre-VAT amount used as subtotal
  const custLegacyWB = useMemo(() =>
    legacyDocuments.filter(d => d.kind === 'WB' && d.customerId === id),
    [legacyDocuments, id])

  // Pre-aggregate legacy entries by YYYY-MM for chart
  const legacyMonthEntries = useMemo(() => {
    const out: { month: string; amount: number }[] = []
    for (const d of custLegacyWB) {
      const m = (d.docDate || '').slice(0, 7) // YYYY-MM
      if (!m) continue
      const existing = out.find(e => e.month === m)
      if (existing) existing.amount += d.amount || 0
      else out.push({ month: m, amount: d.amount || 0 })
    }
    return out
  }, [custLegacyWB])

  const legacyTotalRevenue = useMemo(() =>
    custLegacyWB.reduce((s, d) => s + (d.amount || 0), 0),
    [custLegacyWB])

  // Stats
  const stats = useMemo(() => {
    const currentTotal = custBilling.reduce((s, b) => s + b.subtotal, 0)
    const totalRevenue = currentTotal + legacyTotalRevenue
    const paidBills = custBilling.filter(b => b.status === 'paid')
    // 142.1: ค้างชำระ = ทุกใบ status=sent (ไม่จำกัดเวลา) — ตรงกับ dashboard logic
    const unpaidBills = custBilling.filter(b => b.status === 'sent')
    const unpaidAmount = unpaidBills.reduce((s, b) => s + b.netPayable, 0)
    const totalPieces = custDelivery.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.quantity, 0), 0)

    // Current month stats
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthRevenue = custBilling.filter(b => b.billingMonth === thisMonth).reduce((s, b) => s + b.subtotal, 0)
    const monthForms = custForms.filter(f => f.date.startsWith(thisMonth)).length
    const monthDelivery = custDelivery.filter(d => d.date.startsWith(thisMonth)).length

    // 142: ยอดใบส่งของเดือนนี้ (ก่อน VAT) — sum SD totals ของเดือนนี้
    const monthSDs = custDelivery.filter(d => d.date.startsWith(thisMonth))
    const monthSDAmount = customer ? monthSDs.reduce((sum, dn) => {
      const isPer = customer.enablePerPiece ?? true
      const priceMap = (dn.priceSnapshot && Object.keys(dn.priceSnapshot).length > 0)
        ? dn.priceSnapshot
        : buildPriceMapFromQT(dn.customerId, quotations)
      // Feat 266: claim = discount (subtract instead of skip)
      const itemSubtotal = isPer
        ? dn.items.reduce((s, i) => {
            const amt = i.quantity * (priceMap[i.code] || 0)
            return i.isClaim ? s - amt : s + amt
          }, 0)
        : 0
      return sum + itemSubtotal + (dn.transportFeeTrip || 0) + (dn.transportFeeMonth || 0) + (dn.extraCharge || 0) - (dn.discount || 0)
    }, 0) : 0

    return { totalRevenue, unpaidAmount, unpaidBills: unpaidBills.length, paidBills: paidBills.length, totalPieces, monthRevenue, monthForms, monthDelivery, monthSDAmount }
  }, [custBilling, custDelivery, custForms, customer, quotations, legacyTotalRevenue])

  // Carry-over
  const carryOverRaw = useMemo(() => {
    return getCarryOver(id, '9999-12-31')
  }, [getCarryOver, id])

  const carryOver = useMemo(() =>
    Object.entries(carryOverRaw).filter(([, v]) => v !== 0),
    [carryOverRaw])

  const catalogMap = useMemo(() =>
    Object.fromEntries(linenCatalog.map(i => [i.code, i.name])),
    [linenCatalog])

  // 317: Carry-over grouped by sizeGroup
  const carryOverGrouped = useMemo(() => {
    if (!customer) return { groups: [], ungrouped: [] }
    return groupCarryOver(carryOverRaw, customer, linenCatalog)
  }, [carryOverRaw, customer, linenCatalog])

  const usesGroups = customer ? customerUsesAggregateGroups(customer) : false

  // 238: orphan code cleanup modal — เปิดจาก carry-over badge
  const [orphanCleanupCode, setOrphanCleanupCode] = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showAggregateGroupsModal, setShowAggregateGroupsModal] = useState(false)
  // 317: by-group view toggle — default = on ถ้าลูกค้า opt-in aggregate groups
  const [carryViewMode, setCarryViewMode] = useState<'group' | 'item'>('group')

  // Linked accepted QT for this customer (matched by customerId, only 1 allowed)
  const linkedQT = useMemo(() =>
    customer ? quotations.find(q => q.status === 'accepted' && q.customerId === customer.id) || null : null,
    [quotations, customer])

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 mb-4">ไม่พบลูกค้า</p>
        <button onClick={() => router.push('/dashboard/customers')}
          className="text-sm text-[#1B3A5C] hover:underline">กลับหน้าลูกค้า</button>
      </div>
    )
  }

  return (
    <div>
      {/* 185.2.3: Sticky header — ชื่อลูกค้า + search ค้นหาเปลี่ยนลูกค้าได้เลย
          top-14 = ใต้ dashboard top bar (h-14)
          242.2: เอา backdrop-blur ออก — flicker เมื่อ drag-select text ใต้ sticky */}
      <div className="sticky top-14 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-4 bg-slate-50 border-b border-slate-200">
        {/* 286.1: ย้าย "เปลี่ยนไปลูกค้าอื่น" ขึ้นมาแถวบน ซ้าย — ใช้งานสะดวกกว่า */}
        <div className="flex items-center gap-3 mb-2">
          <CustomerSearchInline
            mode="detail"
            currentCustomerId={id}
            placeholder="เปลี่ยนไปลูกค้ารายอื่น — พิมพ์ชื่อ/รหัส"
            className="flex-1 sm:max-w-md"
          />
          <button onClick={() => router.push('/dashboard/customers')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0"
            title="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* ชื่อลูกค้า + 286.2: edit icon */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#e8eef5] flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-[#1B3A5C]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800 truncate flex items-center gap-2">
              <span className="truncate">{customer.shortName || customer.name}</span>
              <button
                onClick={() => router.push(`/dashboard/customers?edit=${id}&returnTo=/dashboard/customers/${id}`)}
                title="แก้ไขข้อมูลลูกค้า"
                className="flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-[#1B3A5C] hover:bg-[#3DD8D8]/10 transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              {customer.workflowMode === 'trust_customer' && (
                <span title="Trust Customer — โรงงานไม่นับเข้า (col5 ว่าง) · col4 ลูกค้านับกลับ ยังกรอกได้"
                  className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  ✅ Trust
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {customer.shortName ? customer.name : customer.nameEn}
              {customer.customerCode && ` • ${customer.customerCode}`}
            </p>
          </div>
        </div>
      </div>

      {/* Badges + meta (ไม่ sticky — ปุ่มปิดและชื่อย้ายขึ้น sticky header แล้ว) */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full',
          customer.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
          {customer.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
        </span>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          {getCustomerCategoryLabel(customer.customerType)}
        </span>
        {(customer.enablePerPiece ?? true) && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">ตามหน่วย</span>
        )}
        {customer.enableMinPerTrip && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            ขั้นต่ำ/ครั้ง {formatCurrency(customer.minPerTrip)}
            {customer.enableWaive && ` (เวฟ≥${formatCurrency(customer.minPerTripThreshold)})`}
          </span>
        )}
        {customer.enableMinPerMonth && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">ขั้นต่ำ/ด. {formatCurrency(customer.monthlyFlatRate)}</span>
        )}
        {/* 274.3: Workflow mode + default carry-over mode badges */}
        {customer.workflowMode === 'trust_customer' && (
          <span title="Trust Customer — โรงงานไม่นับเข้า (col5 ว่าง) · col4 ลูกค้านับกลับ ยังกรอกได้"
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            ✅ Trust
          </span>
        )}
        {customer.defaultCarryOverMode && (
          <span title="Default carry-over mode (สำหรับ reports)"
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            Mode {customer.defaultCarryOverMode}: {CARRY_OVER_MODE_CONFIG[customer.defaultCarryOverMode]?.short ?? ''}
          </span>
        )}
        {linkedQT ? (
          <Link href={`/dashboard/billing?tab=quotation&openqt=${linkedQT.id}&qtcustomer=${id}`}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
            <Link2 className="w-3 h-3" />{linkedQT.quotationNumber}
            {linkedQT.acceptedScanPath && <span title="มีเอกสารตอบรับแนบ (ลายเซ็นลูกค้า)">📎</span>}
          </Link>
        ) : (
          <Link href={`/dashboard/billing?tab=quotation&newqt=${id}&qtcustomer=${id}`}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200">
            <Link2 className="w-3 h-3" />ยังไม่มี QT
          </Link>
        )}
      </div>

      {/* Stats Cards — 142: 5 cards, ค้างชำระ ซ้ายสุด, ยอดใบส่งของเดือนนี้ ขวาสุด */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {/* 142.1: ค้างชำระ → ซ้ายสุด */}
        <StatCard icon={<CreditCard className="w-5 h-5" />} label="ค้างชำระ" value={formatCurrency(stats.unpaidAmount)}
          sub={stats.unpaidBills > 0 ? `${stats.unpaidBills} บิล` : undefined} color={stats.unpaidAmount > 0 ? 'text-red-600' : 'text-slate-600'} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="รายได้รวม (ทุกเดือน ก่อน VAT)" value={formatCurrency(stats.totalRevenue)} color="text-emerald-600" />
        <StatCard icon={<Package className="w-5 h-5" />} label="ผ้าส่งทั้งหมด (ทุกเดือน)" value={formatNumber(stats.totalPieces) + ' ชิ้น'} color="text-blue-600" />
        <StatCard icon={<FileText className="w-5 h-5" />} label="เดือนนี้" value={`${stats.monthForms} ใบรับ / ${stats.monthDelivery} ใบส่ง`} color="text-[#1B3A5C]" />
        {/* 142: ยอดใบส่งของเดือนนี้ (ก่อน VAT) → ขวาสุด */}
        <StatCard icon={<Truck className="w-5 h-5" />} label="ยอดใบส่งของเดือนนี้ (ก่อน VAT)" value={formatCurrency(stats.monthSDAmount)} color="text-blue-600" />
      </div>

      {/* 142.4 + 168.1: Revenue Trend Chart — รวม legacy WB + ปัจจุบัน */}
      <div className="mb-6">
        <RevenueTrendChart billingStatements={custBilling} months={12} extraEntries={legacyMonthEntries} />
        {legacyTotalRevenue > 0 && (
          <p className="text-[11px] text-slate-400 mt-1.5 px-1">
            รวมรายได้ legacy (NeoSME): <span className="font-mono font-medium text-slate-600">{formatCurrency(legacyTotalRevenue)}</span> · {custLegacyWB.length} ใบวางบิล
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Info + Items */}
        <div className="space-y-6">
          {/* Contact Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">ข้อมูลติดต่อ</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <span>{customer.address || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{customer.contactName} — {customer.contactPhone || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{customer.contactEmail || '-'}</span>
              </div>
              {customer.taxId && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Receipt className="w-4 h-4 text-slate-400" />
                  <span>เลขผู้เสียภาษี: {customer.taxId} {customer.branch && `(${customer.branch})`}</span>
                </div>
              )}
              <div className="text-xs text-slate-400 pt-1">เครดิต {customer.creditDays} วัน</div>
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', customer.enableVat !== false ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                  {customer.enableVat !== false ? 'คิด VAT' : 'ไม่คิด VAT'}
                </span>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', customer.enableWithholding !== false ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>
                  {customer.enableWithholding !== false ? 'หัก ณ ที่จ่าย' : 'ไม่หัก ณ ที่จ่าย'}
                </span>
              </div>
            </div>
          </div>

          {/* QT Link Status Card */}
          <div className={cn('rounded-xl border p-5', linkedQT ? 'bg-white border-emerald-200' : 'bg-amber-50 border-amber-200')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={cn('font-semibold flex items-center gap-2', linkedQT ? 'text-emerald-800' : 'text-amber-800')}>
                <Link2 className="w-4 h-4" />ใบเสนอราคา (QT ราคา)
              </h3>
              {linkedQT ? (
                <Link href={`/dashboard/billing?tab=quotation&openqt=${linkedQT.id}&qtcustomer=${id}`}
                  className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                  ดู QT <ExternalLink className="w-3 h-3" />
                </Link>
              ) : (
                <Link href={`/dashboard/billing?tab=quotation&newqt=${id}&qtcustomer=${id}`}
                  className="text-xs text-amber-600 hover:underline flex items-center gap-1">
                  สร้าง QT <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            {linkedQT ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-semibold text-emerald-700">{linkedQT.quotationNumber}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-600">{formatDate(linkedQT.date)}</span>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ตกลง</span>
                </div>
                <div className="border border-emerald-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-50">
                        <th className="text-left px-3 py-1.5 font-medium text-emerald-700">รายการ</th>
                        {showPrice && <th className="text-right px-3 py-1.5 font-medium text-emerald-700">ราคา/หน่วย</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {linkedQT.items.map(item => (
                        <tr key={item.code} className="border-t border-emerald-50">
                          <td className="px-3 py-1 text-slate-600">
                            <span className="font-mono text-slate-400 mr-1">{item.code}</span>{item.name}
                          </td>
                          {showPrice && (
                            <td className="px-3 py-1 text-right text-slate-700 font-medium">
                              {item.pricePerUnit > 0 ? formatCurrency(item.pricePerUnit) : <span className="text-slate-300">-</span>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-700">ยังไม่มีใบเสนอราคาที่มีสถานะ "ตกลง" — รายการผ้าและราคาของลูกค้านี้จะถูกกำหนดผ่าน QT</p>
            )}
          </div>

          {/* 311 — Schedule Setup Card */}
          <div className={cn(
            'rounded-xl border p-5',
            (customer.scheduleType && customer.scheduleType !== 'none')
              ? 'bg-white border-indigo-200'
              : 'bg-slate-50 border-slate-200',
          )}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-slate-800">
                <CalendarClock className="w-4 h-4" />ตารางคิวส่งผ้า
              </h3>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="text-xs text-[#1B3A5C] hover:underline flex items-center gap-1 font-medium"
              >
                {customer.scheduleType && customer.scheduleType !== 'none' ? 'แก้ไข' : 'ตั้งค่า'}
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            {customer.scheduleType && customer.scheduleType !== 'none' ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">ประเภท:</span>
                  <span className="font-semibold text-indigo-700">{SCHEDULE_TYPE_CONFIG[customer.scheduleType].label}</span>
                </div>
                {(customer.scheduleType === 'weekly' || customer.scheduleType === 'biweekly') && customer.scheduleDays && customer.scheduleDays.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-slate-500">วันส่ง:</span>
                    {customer.scheduleDays.map(day => (
                      <span key={day} className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        {WEEKDAY_SHORT[day]}
                      </span>
                    ))}
                    {customer.scheduleType === 'biweekly' && <span className="text-xs text-slate-400">(เว้นสัปดาห์)</span>}
                  </div>
                )}
                {customer.scheduleType === 'every_n_days' && customer.scheduleEveryNDays && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">ความถี่:</span>
                    <span className="font-semibold text-indigo-700">
                      ทุก {customer.scheduleEveryNDays} วัน{customer.scheduleEveryNDays === 2 ? ' (48 ชม.)' : ''}
                    </span>
                  </div>
                )}
                {customer.scheduleStartDate && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>เริ่ม:</span>
                    <span className="font-mono">{formatDate(customer.scheduleStartDate)}</span>
                  </div>
                )}
                {customer.scheduleNote && (
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                    {customer.scheduleNote}
                  </div>
                )}
                <Link
                  href={`/dashboard/reports?tab=scheduleaudit&customerId=${customer.id}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1"
                >
                  ดู Schedule Audit <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                ลูกค้านี้ยังไม่ได้ตั้งคิวส่ง — ตั้งค่าเพื่อเปิดใช้ Schedule Audit (ตรวจสอบว่ามี SD ครบทุกวันที่ควรส่ง)
              </p>
            )}
          </div>

          {/* 311 P2.4 — Schedule Override List (skip/extra/reschedule) */}
          {customer.scheduleType && customer.scheduleType !== 'none' && (
            <ScheduleOverrideList customerId={customer.id} />
          )}

          {/* 317: Aggregate Size Groups Card */}
          <div className={cn(
            'rounded-xl border p-5',
            customer.aggregateSizeGroups && customer.aggregateSizeGroups.length > 0
              ? 'bg-white border-indigo-200'
              : 'bg-slate-50 border-slate-200',
          )}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-slate-800">
                <Boxes className="w-4 h-4" />การนับรวมไซส์
              </h3>
              <button
                type="button"
                onClick={() => setShowAggregateGroupsModal(true)}
                className="text-xs text-[#1B3A5C] hover:underline flex items-center gap-1 font-medium"
              >
                {customer.aggregateSizeGroups && customer.aggregateSizeGroups.length > 0 ? 'แก้ไข' : 'ตั้งค่า'}
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            {customer.aggregateSizeGroups && customer.aggregateSizeGroups.length > 0 ? (
              <div className="space-y-2 text-sm">
                {customer.aggregateSizeGroups.map(cfg => {
                  const itemsInGroup = linenCatalog.filter(i => i.sizeGroup === cfg.groupKey)
                  // 342: QT items count — items ที่ active จริงใน LF (จาก accepted QT)
                  const qtCodes = new Set((linkedQT?.items ?? []).map(it => it.code))
                  const itemsInQT = itemsInGroup.filter(i => qtCodes.has(i.code))
                  const isEmptyInLF = itemsInQT.length === 0
                  const col5Mode = cfg.col5Mode ?? 'aggregate'
                  return (
                    <div key={cfg.groupKey} className={cn(
                      'rounded-lg border p-2',
                      isEmptyInLF ? 'border-amber-300 bg-amber-50/40' : 'border-indigo-100 bg-indigo-50/30',
                    )}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-bold text-indigo-700 text-xs">{cfg.groupKey}</span>
                        <span className="text-[10px] text-slate-500">
                          · catalog {itemsInGroup.length} · QT {itemsInQT.length}
                          {isEmptyInLF && itemsInGroup.length > 0 && (
                            <span className="ml-1 text-amber-700 font-medium" title="กลุ่มนี้มีรายการใน catalog แต่ไม่มีใน QT — จะไม่แสดงใน LF Grid">
                              ⚠ ไม่มีใน QT
                            </span>
                          )}
                          {itemsInGroup.length === 0 && (
                            <span className="ml-1 text-red-700 font-medium" title="ไม่มีรายการใน catalog เลย — เพิ่มรายการที่ใช้ sizeGroup นี้ก่อน">
                              ⚠ ไม่มีใน catalog
                            </span>
                          )}
                        </span>
                        <span className="ml-auto flex gap-1 flex-wrap">
                          <span
                            title="col2 — ลูกค้าส่งซัก"
                            className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                              cfg.col2Mode === 'aggregate' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                            )}>
                            col2: {cfg.col2Mode === 'aggregate' ? '🧺 ส่งรวม' : '📋 ส่งแยก'}
                          </span>
                          <span
                            title="col5 — โรงซักนับเข้า"
                            className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                              col5Mode === 'aggregate' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
                            )}>
                            col5: {col5Mode === 'aggregate' ? '🧺 นับรวม' : '📋 นับแยก'}
                          </span>
                        </span>
                      </div>
                      {/* 342: แสดง code + tag ว่ามีใน QT หรือไม่ */}
                      <div className="flex flex-wrap gap-1">
                        {itemsInGroup.map(it => {
                          const inQT = qtCodes.has(it.code)
                          return (
                            <span key={it.code} className={cn(
                              'text-[10px] font-mono px-1 rounded',
                              inQT ? 'text-slate-600' : 'text-slate-400 line-through',
                            )}
                            title={inQT ? 'มีใน QT' : 'ไม่มีใน QT — จะไม่แสดงใน LF'}>
                              {it.code}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <p className="text-[10px] text-slate-400 pt-1">
                  💡 Phase 1: Carry-over คำนวณ at group level ใน view by-group · Phase 2: LF UI จะมีช่องกรอกรวม
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                ลูกค้านี้นับแยกไซส์ทุกรายการ — ตั้งค่าถ้าต้องการให้บาง group นับรวมไซส์ตอนรับเข้า (เช่น ผ้าปูเตียง)
              </p>
            )}
          </div>

          {/* Carry-over · 317: รองรับ by-group view */}
          {carryOver.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />ผ้าค้าง
                </h3>
                {/* 317: View toggle — แสดงเฉพาะลูกค้าที่ opt-in size groups */}
                {usesGroups && carryOverGrouped.groups.length > 0 && (
                  <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setCarryViewMode('group')}
                      className={cn(
                        'px-2 py-1 rounded font-medium transition-colors',
                        carryViewMode === 'group' ? 'bg-white text-[#1B3A5C] shadow-sm' : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      📦 รวมกลุ่ม
                    </button>
                    <button
                      type="button"
                      onClick={() => setCarryViewMode('item')}
                      className={cn(
                        'px-2 py-1 rounded font-medium transition-colors',
                        carryViewMode === 'item' ? 'bg-white text-[#1B3A5C] shadow-sm' : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      📋 แยกไซส์
                    </button>
                  </div>
                )}
              </div>

              {/* By-group view — default ถ้าลูกค้า opt-in */}
              {usesGroups && carryViewMode === 'group' && carryOverGrouped.groups.length > 0 ? (
                <div className="space-y-3">
                  {/* Grouped items */}
                  {carryOverGrouped.groups.map(grp => (
                    <details key={grp.groupKey} className="rounded-lg border border-indigo-100 bg-indigo-50/20 overflow-hidden">
                      <summary className="cursor-pointer px-3 py-2 hover:bg-indigo-50 transition-colors list-none flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="font-mono font-bold text-indigo-700 text-xs">{grp.groupKey}</span>
                          <span className="text-[10px] text-slate-500">{grp.items.length} ไซส์</span>
                        </span>
                        <span className={cn(
                          'font-bold text-sm',
                          grp.netCarry < 0 ? 'text-red-600' : 'text-emerald-600',
                        )}>
                          {grp.netCarry > 0 ? '+' : ''}{grp.netCarry}
                        </span>
                      </summary>
                      <div className="px-3 pb-2 pt-1 space-y-0.5 border-t border-indigo-100 text-xs">
                        {grp.items.map(it => (
                          <div key={it.code} className="flex justify-between py-0.5">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <code className="font-mono text-slate-400">{it.code}</code>
                              <span>{it.name}</span>
                            </span>
                            <span className={cn('font-medium', it.carry < 0 ? 'text-red-500' : 'text-emerald-600')}>
                              {it.carry > 0 ? '+' : ''}{it.carry}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}

                  {/* Ungrouped items (ไม่อยู่ใน opt-in group) */}
                  {carryOverGrouped.ungrouped.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      {carryOverGrouped.ungrouped.map(it => {
                        const isOrphan = !catalogMap[it.code]
                        return (
                          <div key={it.code} className="flex justify-between text-sm py-1">
                            <span className="text-slate-600 flex items-center gap-2">
                              {isOrphan ? (
                                <>
                                  <span className="font-mono text-orange-700">{it.code}</span>
                                  <button
                                    type="button"
                                    onClick={() => setOrphanCleanupCode(it.code)}
                                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 transition-colors"
                                    title="รหัสนี้ถูกลบจาก catalog แล้ว · คลิกเพื่อจัดการ"
                                  >
                                    ลบจาก catalog แล้ว
                                  </button>
                                </>
                              ) : (
                                catalogMap[it.code]
                              )}
                            </span>
                            <span className={cn('font-medium', it.carry < 0 ? 'text-red-600' : 'text-emerald-600')}>
                              {it.carry > 0 ? '+' : ''}{it.carry}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 pt-1 italic">
                    💡 รวมกลุ่ม = sum ของทุก code ใน group · ตรงกับ "ค้าง/คืน" จริงเมื่อนับรวมไซส์ตอนรับเข้า
                  </p>
                </div>
              ) : (
                /* By-item view (เดิม) */
                <div className="space-y-1">
                  {carryOver.map(([code, qty]) => {
                    const isOrphan = !catalogMap[code]
                    return (
                      <div key={code} className="flex justify-between text-sm py-1">
                        <span className="text-slate-600 flex items-center gap-2">
                          {isOrphan ? (
                            <>
                              <span className="font-mono text-orange-700">{code}</span>
                              <button
                                type="button"
                                onClick={() => setOrphanCleanupCode(code)}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 transition-colors"
                                title="รหัสนี้ถูกลบจาก catalog แล้ว · คลิกเพื่อจัดการ"
                              >
                                ลบจาก catalog แล้ว
                              </button>
                            </>
                          ) : (
                            catalogMap[code]
                          )}
                        </span>
                        <span className={cn('font-medium', qty < 0 ? 'text-red-600' : 'text-emerald-600')}>
                          {qty > 0 ? '+' : ''}{qty}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column — Document history */}
        <div className="lg:col-span-2 space-y-6">
          {/* Linen Forms */}
          <DocSection
            title="ใบรับส่งผ้า"
            icon={<ClipboardCheck className="w-4 h-4" />}
            count={custForms.length}
            linkTo="/dashboard/linen-forms"
          >
            {custForms.length === 0 ? (
              <EmptyRow />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">สถานะ</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">รายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {custForms.slice(0, 10).map(f => {
                    const sc = LINEN_FORM_STATUS_CONFIG[f.status as LinenFormStatus] || LINEN_FORM_STATUS_CONFIG.draft
                    const totalPcs = f.rows.reduce((s, r) => s + r.col2_hotelCountIn, 0)
                    return (
                      <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{formatDate(f.date)}</td>
                        <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{f.formNumber}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', sc.bgColor, sc.color)}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-2 text-right">{formatNumber(totalPcs)} ชิ้น</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {custForms.length > 10 && <MoreRow count={custForms.length - 10} />}
          </DocSection>

          {/* Delivery Notes */}
          <DocSection
            title="ใบส่งของ"
            icon={<Truck className="w-4 h-4" />}
            count={custDelivery.length}
            linkTo="/dashboard/delivery"
          >
            {custDelivery.length === 0 ? (
              <EmptyRow />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">สถานะ</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {custDelivery.slice(0, 10).map(d => {
                    const totalPcs = d.items.reduce((s, i) => s + i.quantity, 0)
                    return (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{d.noteNumber}</td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {d.isPrinted && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">พิมพ์แล้ว</span>}
                            {d.isBilled && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">วางบิลแล้ว</span>}
                            {!d.isPrinted && !d.isBilled && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">รอ</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{formatNumber(totalPcs)} ชิ้น</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {custDelivery.length > 10 && <MoreRow count={custDelivery.length - 10} />}
          </DocSection>

          {/* Billing Statements */}
          <DocSection
            title="ใบวางบิล"
            icon={<CreditCard className="w-4 h-4" />}
            count={custBilling.length}
            linkTo="/dashboard/billing"
          >
            {custBilling.length === 0 ? (
              <EmptyRow />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่ออก</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เดือน</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">สถานะ</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">ยอดรวม</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">สุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {custBilling.slice(0, 10).map(b => {
                    const sc = BILLING_STATUS_CONFIG[b.status as BillingStatus] || BILLING_STATUS_CONFIG.draft
                    return (
                      <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{formatDate(b.issueDate)}</td>
                        <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{b.billingNumber}</td>
                        <td className="px-4 py-2 text-slate-600">{b.billingMonth}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', sc.bgColor, sc.color)}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(b.grandTotal)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(b.netPayable)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {custBilling.length > 10 && <MoreRow count={custBilling.length - 10} />}
          </DocSection>

          {/* Tax Invoices */}
          {custTaxInv.length > 0 && (
            <DocSection title="ใบกำกับภาษี" icon={<Receipt className="w-4 h-4" />} count={custTaxInv.length} linkTo="/dashboard/billing">
              {/* 144.1: วันที่ col แรก + เด่น, เลขที่ muted */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">ยอดรวม (VAT)</th>
                  </tr>
                </thead>
                <tbody>
                  {custTaxInv.slice(0, 10).map(t => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{formatDate(t.issueDate)}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{t.invoiceNumber}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(t.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {custTaxInv.length > 10 && <MoreRow count={custTaxInv.length - 10} />}
            </DocSection>
          )}

          {/* Checklists */}
          {custChecklists.length > 0 && (
            <DocSection title="ใบเช็คสินค้า" icon={<ClipboardCheck className="w-4 h-4" />} count={custChecklists.length} linkTo="/dashboard/checklist">
              {/* 144.1: วันที่ col แรก + เด่น, เลขที่ muted */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">ประเภท</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {custChecklists.slice(0, 5).map(c => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{formatDate(c.date)}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{c.checklistNumber}</td>
                      <td className="px-4 py-2">{c.type === 'qc' ? 'QC' : 'Loading'}</td>
                      <td className="px-4 py-2 text-xs">{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DocSection>
          )}
        </div>
      </div>

      {/* 238: Orphan code cleanup modal — เปิดจาก carry-over badge */}
      {orphanCleanupCode && (
        <Modal
          open={true}
          onClose={() => setOrphanCleanupCode(null)}
          title={`จัดการรหัสผ้า ${orphanCleanupCode}`}
          size="md"
          closeLabel="cancel"
        >
          <OrphanCleanupContent
            code={orphanCleanupCode}
            onClose={() => setOrphanCleanupCode(null)}
            router={router}
          />
        </Modal>
      )}

      {/* 311: Schedule Setup Modal */}
      <ScheduleSetupModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        customer={customer}
      />

      {/* 317: Aggregate Size Groups Modal */}
      <AggregateGroupsModal
        open={showAggregateGroupsModal}
        onClose={() => setShowAggregateGroupsModal(false)}
        customer={customer}
      />
    </div>
  )
}

// 238: Orphan code cleanup — แสดง preview + 3 ปุ่ม delegate ไปหน้า items
function OrphanCleanupContent({
  code,
  onClose,
  router,
}: {
  code: string
  onClose: () => void
  router: ReturnType<typeof useRouter>
}) {
  const { customers, quotations, deliveryNotes, linenForms } = useStore()

  // นับ usage ของ orphan code ทั่วระบบ
  const usage = useMemo(() => {
    const lf = linenForms.filter(f => (f.rows || []).some(r => r.code === code)).length
    const qt = quotations.filter(q => (q.items || []).some(it => it.code === code)).length
    const sd = deliveryNotes.filter(d => (d.items || []).some(it => it.code === code)).length
    const cust = customers.filter(c =>
      (c.enabledItems || []).includes(code) ||
      (c.priceList || []).some(p => p.code === code)
    ).length
    return { lf, qt, sd, cust }
  }, [code, linenForms, quotations, deliveryNotes, customers])

  const goItems = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params)
    router.push(`/dashboard/items?${sp.toString()}`)
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
        <div className="flex items-center gap-2 text-sm text-orange-800 mb-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-semibold">รหัส <span className="font-mono">{code}</span> ถูกลบจาก catalog แล้ว</span>
        </div>
        <div className="text-xs text-orange-700">
          แต่ยังถูก reference อยู่ใน:
          <span className="ml-1 font-mono">
            {usage.lf} LF · {usage.qt} QT · {usage.sd} SD · {usage.cust} ลูกค้า
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => goItems({ tab: 'merge', mergeSource: code })}
          className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-[#3DD8D8] hover:bg-cyan-50 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800 text-sm">Map รวมกับรหัสที่มีอยู่</div>
              <div className="text-xs text-slate-500 mt-0.5">เปลี่ยนทุก reference เป็น code ใหม่ (เลือก target ได้)</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#3DD8D8]" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => goItems({ addCode: code })}
          className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800 text-sm">เพิ่มกลับเข้า catalog</div>
              <div className="text-xs text-slate-500 mt-0.5">สร้าง item ใหม่ด้วย code <span className="font-mono">{code}</span> + ตั้งชื่อใหม่</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => goItems({ tab: 'merge', mergeSource: code, deleteAfter: '1' })}
          className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-red-400 hover:bg-red-50 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800 text-sm">ลบรหัสนี้ออกจากระบบ</div>
              <div className="text-xs text-slate-500 mt-0.5">รวมเป็นรหัสอื่น + ลบทิ้งหลัง merge (ต้องเลือก target)</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
          </div>
        </button>
      </div>

      <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
        ทุก action ใช้ Hygiene Center → MergeCodesTool (รองรับ undo)
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={cn('mb-2', color)}>{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function DocSection({ title, icon, count, linkTo, children }: {
  title: string; icon: React.ReactNode; count: number; linkTo: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
          {icon}{title}
          <span className="text-xs font-normal text-slate-400">({count})</span>
        </div>
        <a href={linkTo} className="text-xs text-[#3DD8D8] hover:underline">ดูทั้งหมด</a>
      </div>
      {/* F6: scroll narrow tables horizontally inside the card instead of pushing the page */}
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

function EmptyRow() {
  return <div className="text-center py-6 text-sm text-slate-400">ไม่มีข้อมูล</div>
}

function MoreRow({ count }: { count: number }) {
  return <div className="text-center py-2 text-xs text-slate-400 border-t border-slate-100">และอีก {count} รายการ</div>
}
