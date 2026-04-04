'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatCurrency, formatNumber, cn, buildPriceMapFromQT } from '@/lib/utils'
import { FileDown, ExternalLink, BarChart3 } from 'lucide-react'
import ExportButtons from '@/components/ExportButtons'
import Link from 'next/link'
import MonthlySummaryGrid from '@/components/MonthlySummaryGrid'
import MonthlyDeliveryReportPrint from '@/components/MonthlyDeliveryReportPrint'
import MonthlyStockReportPrint from '@/components/MonthlyStockReportPrint'
import MonthlyConsolidationPrint from '@/components/MonthlyConsolidationPrint'
import Modal from '@/components/Modal'

type TabKey = 'monthly' | 'revenue' | 'customer' | 'item' | 'pnl' | 'carryover' | 'delivery' | 'stock' | 'consolidation'

export default function ReportsPage() {
  const { currentUser, linenForms, deliveryNotes, billingStatements, expenses, customers, getCustomer, getCarryOver, linenCatalog, companyInfo, quotations } = useStore()
  const [tab, setTab] = useState<TabKey>('monthly')
  const [showDeliveryPrint, setShowDeliveryPrint] = useState(false)
  const [showStockPrint, setShowStockPrint] = useState(false)
  const [showConsolidationPrint, setShowConsolidationPrint] = useState(false)
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('landscape')
  const [printMargin, setPrintMargin] = useState<'normal' | 'narrow'>('narrow')
  const [selCustomerIdRaw, setSelCustomerId] = useState('')
  const [selMonth, setSelMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const activeCustomers = customers.filter(c => c.isActive)
  // Derive effective customer ID — validate against active list
  const selCustomerId = selCustomerIdRaw && activeCustomers.some(c => c.id === selCustomerIdRaw)
    ? selCustomerIdRaw
    : ''
  // For per-customer tabs, auto-select first customer
  const perCustomerTabs: TabKey[] = ['monthly', 'delivery', 'stock', 'consolidation']
  const needsCustomer = perCustomerTabs.includes(tab) && !selCustomerId

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'monthly', label: 'สรุปรายเดือน' },
    { key: 'revenue', label: 'รายได้' },
    { key: 'customer', label: 'ตามลูกค้า' },
    { key: 'item', label: 'ตามสินค้า' },
    { key: 'pnl', label: 'กำไร-ขาดทุน' },
    { key: 'carryover', label: 'ผ้าค้าง' },
    { key: 'delivery', label: 'รายงานส่งของ' },
    { key: 'stock', label: 'สต็อกรายเดือน' },
    { key: 'consolidation', label: 'รวบเดือน' },
  ]

  const selCustomer = selCustomerId ? getCustomer(selCustomerId) : null

  // Revenue by customer
  const revenueByCustomer = useMemo(() => {
    const map: Record<string, number> = {}
    let bills = billingStatements.filter(b => b.billingMonth === selMonth)
    if (selCustomerId) bills = bills.filter(b => b.customerId === selCustomerId)
    for (const bs of bills) {
      map[bs.customerId] = (map[bs.customerId] || 0) + bs.subtotal
    }
    return Object.entries(map)
      .map(([id, amount]) => ({ customer: getCustomer(id), amount }))
      .filter(r => r.customer)
      .sort((a, b) => b.amount - a.amount)
  }, [billingStatements, selMonth, selCustomerId, getCustomer])

  // Item usage
  const itemUsage = useMemo(() => {
    const map: Record<string, number> = {}
    for (const dn of deliveryNotes.filter(d => d.date.startsWith(selMonth))) {
      for (const item of dn.items) {
        map[item.code] = (map[item.code] || 0) + item.quantity
      }
    }
    const nameMap = Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))
    return Object.entries(map)
      .map(([code, qty]) => ({ code, name: nameMap[code] || code, qty }))
      .sort((a, b) => b.qty - a.qty)
  }, [deliveryNotes, selMonth, linenCatalog])

  // P&L
  const pnl = useMemo(() => {
    const revenue = billingStatements
      .filter(b => b.billingMonth === selMonth)
      .reduce((s, b) => s + b.subtotal, 0)
    const totalExpense = expenses
      .filter(e => e.date.startsWith(selMonth))
      .reduce((s, e) => s + e.amount, 0)
    return { revenue, totalExpense, profit: revenue - totalExpense }
  }, [billingStatements, expenses, selMonth])

  // Carry-over per customer
  const carryOverReport = useMemo(() => {
    let list = customers.filter(c => c.isActive)
    if (selCustomerId) list = list.filter(c => c.id === selCustomerId)
    return list.map(c => {
      const co = getCarryOver(c.id, '9999-12-31')
      const total = Object.values(co).reduce((s, v) => s + v, 0)
      return { customer: c, carryOver: co, total }
    }).filter(r => r.total !== 0)
  }, [customers, selCustomerId, getCarryOver])

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">รายงาน</h1>
        <p className="text-sm text-slate-500 mt-0.5">วิเคราะห์ข้อมูลและสรุปผล</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {(tab === 'monthly' || tab === 'delivery' || tab === 'stock' || tab === 'consolidation' || tab === 'revenue' || tab === 'carryover') && (
          <div className="flex items-center gap-2">
            <select value={selCustomerId} onChange={e => setSelCustomerId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
              <option value="">ทุกลูกค้า</option>
              {customers.filter(c => c.isActive).map(c => (
                <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
              ))}
            </select>
            {selCustomerId && (
              <Link href={`/dashboard/customers/${selCustomerId}`}
                className="text-xs text-[#3DD8D8] hover:underline flex items-center gap-0.5 shrink-0">
                <ExternalLink className="w-3 h-3" />ดูรายละเอียด
              </Link>
            )}
          </div>
        )}
        <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
      </div>

      {/* Per-customer tab: select customer prompt */}
      {needsCustomer && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-700 font-medium">กรุณาเลือกลูกค้าจากเมนูด้านบน</p>
          <p className="text-sm text-amber-600 mt-1">รายงานนี้ต้องระบุลูกค้า</p>
        </div>
      )}

      {/* Monthly Summary Tab */}
      {tab === 'monthly' && selCustomer && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-800">
              สรุปรายเดือน — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
          </div>
          <MonthlySummaryGrid
            customer={selCustomer}
            month={selMonth}
            linenForms={linenForms}
            deliveryNotes={deliveryNotes}
            catalog={linenCatalog}
            priceMap={buildPriceMapFromQT(selCustomer.id, quotations)}
          />
        </div>
      )}

      {/* Revenue Tab */}
      {tab === 'revenue' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">
            รายได้{selCustomer ? ` — ${selCustomer.shortName || selCustomer.name}` : ''} ({selMonth})
          </h3>
          <div className="text-3xl font-bold text-[#1B3A5C] mb-4">
            {formatCurrency(revenueByCustomer.reduce((s, r) => s + r.amount, 0))}
          </div>
          <div className="space-y-2">
            {revenueByCustomer.map(r => (
              <div key={r.customer!.id} className="flex items-center justify-between py-2 border-b border-slate-100">
                <Link href={`/dashboard/customers/${r.customer!.id}`} className="text-sm text-slate-700 hover:text-[#1B3A5C] hover:underline">{r.customer!.shortName || r.customer!.name}</Link>
                <span className="text-sm font-medium text-slate-800">{formatCurrency(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Tab */}
      {tab === 'customer' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto" style={{ minWidth: '100%' }}>
            <table className="w-full text-sm" style={{ minWidth: '600px' }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">โรงแรม</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">ยอดวางบิล</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">จำนวนบิล</th>
              </tr>
            </thead>
            <tbody>
              {customers.filter(c => c.isActive).map(c => {
                const bills = billingStatements.filter(b => b.customerId === c.id)
                const total = bills.reduce((s, b) => s + b.subtotal, 0)
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B3A5C] hover:underline">{c.shortName || c.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(total)}</td>
                    <td className="px-4 py-3 text-center">{bills.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Item Tab */}
      {tab === 'item' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto" style={{ minWidth: '100%' }}>
            <table className="w-full text-sm" style={{ minWidth: '600px' }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">รหัส</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">รายการ</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">จำนวน (ชิ้น)</th>
              </tr>
            </thead>
            <tbody>
              {itemUsage.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-16">
                  <div className="flex flex-col items-center text-slate-400">
                    <BarChart3 className="w-12 h-12 mb-3 text-slate-300" />
                    <p className="text-base">ไม่มีข้อมูล</p>
                    <p className="text-sm mt-1">ไม่มีการใช้งานสินค้าในเดือนนี้</p>
                  </div>
                </td></tr>
              ) : itemUsage.map(item => (
                <tr key={item.code} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className="px-4 py-2 text-slate-700">{item.name}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatNumber(item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* P&L Tab */}
      {tab === 'pnl' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">กำไร-ขาดทุน — {selMonth}</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-200">
              <span className="text-slate-600">รายได้รวม</span>
              <span className="text-lg font-bold text-emerald-600">{formatCurrency(pnl.revenue)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-200">
              <span className="text-slate-600">ค่าใช้จ่ายรวม</span>
              <span className="text-lg font-bold text-red-600">{formatCurrency(pnl.totalExpense)}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-800 font-medium">กำไร (ขาดทุน)</span>
              <span className={cn('text-xl font-bold', pnl.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {formatCurrency(pnl.profit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Carry-over Tab */}
      {tab === 'carryover' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto" style={{ minWidth: '100%' }}>
            <table className="w-full text-sm" style={{ minWidth: '600px' }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">โรงแรม</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">รายการผ้าค้าง</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">รวม (ชิ้น)</th>
              </tr>
            </thead>
            <tbody>
              {carryOverReport.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-slate-400">ไม่มีผ้าค้าง</td></tr>
              ) : carryOverReport.map(r => (
                <tr key={r.customer.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/customers/${r.customer.id}`} className="font-medium text-slate-800 hover:text-[#1B3A5C] hover:underline">{r.customer.shortName || r.customer.name}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.carryOver).map(([code, qty]) => (
                        <span key={code} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          {code} x{qty}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Monthly Delivery Report Tab */}
      {tab === 'delivery' && selCustomer && (
        <div className="no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">
              รายงานส่งสินค้า — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
            <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowDeliveryPrint(true) }}
              className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <MonthlyDeliveryReportPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
            />
          </div>
        </div>
      )}

      {/* Monthly Stock Report Tab */}
      {tab === 'stock' && selCustomer && (
        <div className="no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">
              สต็อกรายเดือน — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
            <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowStockPrint(true) }}
              className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <MonthlyStockReportPrint
              customer={selCustomer}
              month={selMonth}
              linenForms={linenForms}
              catalog={linenCatalog}
              company={companyInfo}
              getCarryOver={getCarryOver}
            />
          </div>
        </div>
      )}

      {/* Consolidation Tab (รวบเดือน) */}
      {tab === 'consolidation' && selCustomer && (
        <div className="no-print">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">
              รวบเดือน — {selCustomer.shortName || selCustomer.name} ({selMonth})
            </h3>
            <button onClick={() => { setPrintOrientation('landscape'); setPrintMargin('narrow'); setShowConsolidationPrint(true) }}
              className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
              <FileDown className="w-4 h-4" />พิมพ์/ส่งออกเอกสาร
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <MonthlyConsolidationPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
              priceMap={buildPriceMapFromQT(selCustomer.id, quotations)}
            />
          </div>
        </div>
      )}

      {/* Delivery Report Print Modal */}
      <Modal open={showDeliveryPrint} onClose={() => setShowDeliveryPrint(false)} title="พิมพ์รายงานส่งสินค้า" size="full" className="print-target">
        {selCustomer && (
          <div>
            {/* Dynamic @page override */}
            <style>{`@media print { @page { size: A4 ${printOrientation}; margin: ${printMargin === 'narrow' ? '5mm' : '10mm'}; } }`}</style>

            {/* Print options */}
            <div className="no-print flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">แนวกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintOrientation('portrait')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'portrait' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวตั้ง
                  </button>
                  <button onClick={() => setPrintOrientation('landscape')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'landscape' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวนอน
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ขอบกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintMargin('normal')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'normal' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    ปกติ (10mm)
                  </button>
                  <button onClick={() => setPrintMargin('narrow')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'narrow' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แคบ (5mm)
                  </button>
                </div>
              </div>
            </div>

            <MonthlyDeliveryReportPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-delivery-report" filename={`delivery-report-${selCustomer.shortName || selCustomer.name}-${selMonth}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>

      {/* Consolidation Print Modal */}
      <Modal open={showConsolidationPrint} onClose={() => setShowConsolidationPrint(false)} title="พิมพ์รวบเดือน" size="full" className="print-target">
        {selCustomer && (
          <div>
            <style>{`@media print { @page { size: A4 ${printOrientation}; margin: ${printMargin === 'narrow' ? '5mm' : '10mm'}; } }`}</style>

            <div className="no-print flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">แนวกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintOrientation('portrait')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'portrait' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวตั้ง
                  </button>
                  <button onClick={() => setPrintOrientation('landscape')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'landscape' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวนอน
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ขอบกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintMargin('normal')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'normal' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    ปกติ (10mm)
                  </button>
                  <button onClick={() => setPrintMargin('narrow')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'narrow' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แคบ (5mm)
                  </button>
                </div>
              </div>
            </div>

            <MonthlyConsolidationPrint
              customer={selCustomer}
              month={selMonth}
              deliveryNotes={deliveryNotes}
              catalog={linenCatalog}
              company={companyInfo}
              priceMap={buildPriceMapFromQT(selCustomer.id, quotations)}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-consolidation" filename={`รวบเดือน-${selCustomer.shortName || selCustomer.name}-${selMonth}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>

      {/* Stock Report Print Modal */}
      <Modal open={showStockPrint} onClose={() => setShowStockPrint(false)} title="พิมพ์สต็อกรายเดือน" size="full" className="print-target">
        {selCustomer && (
          <div>
            {/* Dynamic @page override */}
            <style>{`@media print { @page { size: A4 ${printOrientation}; margin: ${printMargin === 'narrow' ? '5mm' : '10mm'}; } }`}</style>

            {/* Print options */}
            <div className="no-print flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">แนวกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintOrientation('portrait')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'portrait' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวตั้ง
                  </button>
                  <button onClick={() => setPrintOrientation('landscape')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printOrientation === 'landscape' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แนวนอน
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ขอบกระดาษ:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-200">
                  <button onClick={() => setPrintMargin('normal')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'normal' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    ปกติ (10mm)
                  </button>
                  <button onClick={() => setPrintMargin('narrow')}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                      printMargin === 'narrow' ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                    แคบ (5mm)
                  </button>
                </div>
              </div>
            </div>

            <MonthlyStockReportPrint
              customer={selCustomer}
              month={selMonth}
              linenForms={linenForms}
              catalog={linenCatalog}
              company={companyInfo}
              getCarryOver={getCarryOver}
            />
            <div className="flex justify-end mt-4 no-print">
              <ExportButtons targetId="print-stock-report" filename={`stock-report-${selCustomer.shortName || selCustomer.name}-${selMonth}`} showPrint={true} orientation={printOrientation} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
