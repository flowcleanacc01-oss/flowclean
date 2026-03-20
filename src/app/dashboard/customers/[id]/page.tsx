'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, FileText, CreditCard,
  Truck, Receipt, ClipboardCheck, TrendingUp, Package, AlertTriangle, Link2, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import {
  LINEN_FORM_STATUS_CONFIG, BILLING_STATUS_CONFIG,
} from '@/types'
import type { LinenFormStatus, BillingStatus } from '@/types'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const {
    getCustomer, linenForms, deliveryNotes, billingStatements,
    taxInvoices, checklists, getCarryOver, linenCatalog, quotations, getCustomerCategoryLabel,
  } = useStore()

  const customer = getCustomer(id)

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

  // Stats
  const stats = useMemo(() => {
    const totalRevenue = custBilling.reduce((s, b) => s + b.subtotal, 0)
    const paidBills = custBilling.filter(b => b.status === 'paid')
    const unpaidBills = custBilling.filter(b => b.status !== 'paid')
    const unpaidAmount = unpaidBills.reduce((s, b) => s + b.netPayable, 0)
    const totalPieces = custDelivery.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.quantity, 0), 0)

    // Current month stats
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthRevenue = custBilling.filter(b => b.billingMonth === thisMonth).reduce((s, b) => s + b.subtotal, 0)
    const monthForms = custForms.filter(f => f.date.startsWith(thisMonth)).length
    const monthDelivery = custDelivery.filter(d => d.date.startsWith(thisMonth)).length

    return { totalRevenue, unpaidAmount, unpaidBills: unpaidBills.length, paidBills: paidBills.length, totalPieces, monthRevenue, monthForms, monthDelivery }
  }, [custBilling, custDelivery, custForms])

  // Carry-over
  const carryOver = useMemo(() => {
    const co = getCarryOver(id, '9999-12-31')
    return Object.entries(co).filter(([, v]) => v !== 0)
  }, [getCarryOver, id])

  const catalogMap = useMemo(() =>
    Object.fromEntries(linenCatalog.map(i => [i.code, i.name])),
    [linenCatalog])

  // Linked accepted QT for this customer (matched by customerName, only 1 allowed)
  const linkedQT = useMemo(() =>
    customer ? quotations.find(q => q.status === 'accepted' && q.customerName === customer.name) || null : null,
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/dashboard/customers')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#e8eef5] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#1B3A5C]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{customer.shortName || customer.name}</h1>
              <p className="text-sm text-slate-400">{customer.shortName ? customer.name : customer.nameEn} {customer.customerCode && `• ${customer.customerCode}`}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {linkedQT ? (
            <Link href="/dashboard/billing?tab=quotation"
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
              <Link2 className="w-3 h-3" />{linkedQT.quotationNumber}
            </Link>
          ) : (
            <Link href={`/dashboard/billing?tab=quotation&newqt=${id}`}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200">
              <Link2 className="w-3 h-3" />ยังไม่มี QT
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="รายได้รวม" value={formatCurrency(stats.totalRevenue)} color="text-emerald-600" />
        <StatCard icon={<CreditCard className="w-5 h-5" />} label="ค้างชำระ" value={formatCurrency(stats.unpaidAmount)}
          sub={stats.unpaidBills > 0 ? `${stats.unpaidBills} บิล` : undefined} color={stats.unpaidAmount > 0 ? 'text-red-600' : 'text-slate-600'} />
        <StatCard icon={<Package className="w-5 h-5" />} label="ผ้าส่งทั้งหมด" value={formatNumber(stats.totalPieces) + ' ชิ้น'} color="text-blue-600" />
        <StatCard icon={<FileText className="w-5 h-5" />} label="เดือนนี้" value={`${stats.monthForms} ใบรับ / ${stats.monthDelivery} ใบส่ง`} color="text-[#1B3A5C]" />
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
              {customer.taxGroupName && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">ออกใบกำกับภาษีในชื่อ:</p>
                  <p className="text-sm font-medium text-slate-700">{customer.taxGroupName}</p>
                  {customer.taxGroupTaxId && <p className="text-xs text-slate-400">เลขภาษี: {customer.taxGroupTaxId}</p>}
                </div>
              )}
            </div>
          </div>

          {/* QT Link Status Card */}
          <div className={cn('rounded-xl border p-5', linkedQT ? 'bg-white border-emerald-200' : 'bg-amber-50 border-amber-200')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={cn('font-semibold flex items-center gap-2', linkedQT ? 'text-emerald-800' : 'text-amber-800')}>
                <Link2 className="w-4 h-4" />ใบเสนอราคา (QT ราคา)
              </h3>
              {linkedQT ? (
                <Link href="/dashboard/billing?tab=quotation"
                  className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                  ดู QT <ExternalLink className="w-3 h-3" />
                </Link>
              ) : (
                <Link href={`/dashboard/billing?tab=quotation&newqt=${id}`}
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
                  <span className="text-slate-600">{linkedQT.date}</span>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ตกลง</span>
                </div>
                <div className="border border-emerald-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-50">
                        <th className="text-left px-3 py-1.5 font-medium text-emerald-700">รายการ</th>
                        <th className="text-right px-3 py-1.5 font-medium text-emerald-700">ราคา/หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedQT.items.map(item => (
                        <tr key={item.code} className="border-t border-emerald-50">
                          <td className="px-3 py-1 text-slate-600">
                            <span className="font-mono text-slate-400 mr-1">{item.code}</span>{item.name}
                          </td>
                          <td className="px-3 py-1 text-right text-slate-700 font-medium">
                            {item.pricePerUnit > 0 ? formatCurrency(item.pricePerUnit) : <span className="text-slate-300">-</span>}
                          </td>
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

          {/* Price List */}
          {customer.enabledItems.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">รายการผ้า ({customer.enabledItems.length} ชนิด)</h3>
              <div className="space-y-1">
                {customer.enabledItems.map(code => {
                  const price = customer.priceList.find(p => p.code === code)
                  return (
                    <div key={code} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-600">
                        <span className="font-mono text-xs text-slate-400 mr-2">{code}</span>
                        {catalogMap[code] || code}
                      </span>
                      {(customer.enablePerPiece ?? true) && (
                        <span className="text-slate-800 font-medium">{formatCurrency(price?.price ?? 0)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Carry-over */}
          {carryOver.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-5">
              <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />ผ้าค้าง
              </h3>
              <div className="space-y-1">
                {carryOver.map(([code, qty]) => (
                  <div key={code} className="flex justify-between text-sm py-1">
                    <span className="text-slate-600">{catalogMap[code] || code}</span>
                    <span className={cn('font-medium', qty < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {qty > 0 ? '+' : ''}{qty}
                    </span>
                  </div>
                ))}
              </div>
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
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
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
                        <td className="px-4 py-2 font-mono text-xs">{f.formNumber}</td>
                        <td className="px-4 py-2 text-slate-600">{f.date}</td>
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
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">สถานะ</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {custDelivery.slice(0, 10).map(d => {
                    const totalPcs = d.items.reduce((s, i) => s + i.quantity, 0)
                    return (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{d.noteNumber}</td>
                        <td className="px-4 py-2 text-slate-600">{d.date}</td>
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
                        <td className="px-4 py-2 font-mono text-xs">{b.billingNumber}</td>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">ยอดรวม (VAT)</th>
                  </tr>
                </thead>
                <tbody>
                  {custTaxInv.slice(0, 10).map(t => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">{t.invoiceNumber}</td>
                      <td className="px-4 py-2 text-slate-600">{t.issueDate}</td>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">เลขที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">วันที่</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">ประเภท</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {custChecklists.slice(0, 5).map(c => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">{c.checklistNumber}</td>
                      <td className="px-4 py-2 text-slate-600">{c.date}</td>
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
      {children}
    </div>
  )
}

function EmptyRow() {
  return <div className="text-center py-6 text-sm text-slate-400">ไม่มีข้อมูล</div>
}

function MoreRow({ count }: { count: number }) {
  return <div className="text-center py-2 text-xs text-slate-400 border-t border-slate-100">และอีก {count} รายการ</div>
}
