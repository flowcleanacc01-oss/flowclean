'use client'

import { useMemo } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { Customer, LinenForm, DeliveryNote, LinenItemDef } from '@/types'

interface MonthlySummaryGridProps {
  customer: Customer
  month: string // YYYY-MM
  linenForms: LinenForm[]
  deliveryNotes: DeliveryNote[]
  catalog: LinenItemDef[]
}

export default function MonthlySummaryGrid({ customer, month, linenForms, deliveryNotes, catalog }: MonthlySummaryGridProps) {
  const itemNameMap = Object.fromEntries(catalog.map(i => [i.code, i.name]))
  const summary = useMemo(() => {
    const [year, m] = month.split('-').map(Number)
    const daysInMonth = new Date(year, m, 0).getDate()
    const enabledCodes = customer.enabledItems
    const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))

    // Build grid: code → day → quantity (from col5 of linen forms)
    const grid: Record<string, Record<number, number>> = {}
    for (const code of enabledCodes) {
      grid[code] = {}
    }

    // Primary: use linen forms col6 (packed & sent) — only forms that reached packed/delivered/confirmed
    const monthForms = linenForms.filter(f =>
      f.customerId === customer.id && f.date.startsWith(month)
      && ['packed', 'delivered', 'confirmed'].includes(f.status)
    )
    for (const form of monthForms) {
      const day = parseInt(form.date.split('-')[2])
      for (const row of form.rows) {
        const packSend = row.col6_factoryPackSend || 0
        // Billing qty = all packed items (col6) — ตรงกับ core logic / test
        const qty = packSend
        if (grid[row.code] && qty > 0) {
          grid[row.code][day] = (grid[row.code][day] || 0) + qty
        }
      }
    }

    // Fallback: delivery notes (only for days with no linen form data)
    const monthNotes = deliveryNotes.filter(dn =>
      dn.customerId === customer.id && dn.date.startsWith(month)
    )
    for (const dn of monthNotes) {
      const day = parseInt(dn.date.split('-')[2])
      for (const item of dn.items) {
        // Skip claim items — they're not revenue
        if (item.isClaim) continue
        if (grid[item.code] && !grid[item.code][day]) {
          grid[item.code][day] = (grid[item.code][day] || 0) + item.quantity
        }
      }
    }

    // Calculate totals
    const itemTotals: Record<string, { qty: number; amount: number }> = {}
    let grandQty = 0
    let grandAmount = 0

    for (const code of enabledCodes) {
      const total = Object.values(grid[code] || {}).reduce((s, v) => s + v, 0)
      const price = priceMap[code] || 0
      itemTotals[code] = { qty: total, amount: total * price }
      grandQty += total
      grandAmount += total * price
    }

    const vat = Math.round(grandAmount * 0.07 * 100) / 100
    const withholding = Math.round(grandAmount * 0.03 * 100) / 100
    const net = Math.round((grandAmount + vat - withholding) * 100) / 100

    return { daysInMonth, enabledCodes, priceMap, grid, itemTotals, grandQty, grandAmount, vat, withholding, net }
  }, [customer, month, linenForms, deliveryNotes])

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="text-xs whitespace-nowrap">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky left-0 bg-slate-50 z-10 text-left px-3 py-2 font-medium text-slate-600 border-r border-slate-200 min-w-32">
              รายการ
            </th>
            {Array.from({ length: summary.daysInMonth }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center font-medium text-slate-500 min-w-8">{i + 1}</th>
            ))}
            <th className="px-3 py-2 text-right font-medium text-slate-700 border-l border-slate-200 min-w-16">รวม</th>
            <th className="px-3 py-2 text-right font-medium text-slate-700 min-w-16">ราคา</th>
            <th className="px-3 py-2 text-right font-medium text-slate-700 min-w-20">มูลค่า</th>
          </tr>
        </thead>
        <tbody>
          {summary.enabledCodes.map(code => (
            <tr key={code} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="sticky left-0 bg-white z-10 px-3 py-1.5 font-medium text-slate-700 border-r border-slate-200">
                <span className="font-mono text-slate-400 mr-1">{code}</span>
                {itemNameMap[code]}
              </td>
              {Array.from({ length: summary.daysInMonth }, (_, i) => {
                const val = summary.grid[code]?.[i + 1] || 0
                return (
                  <td key={i} className="px-2 py-1.5 text-center text-slate-600">
                    {val || <span className="text-slate-200">-</span>}
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-right font-medium text-slate-700 border-l border-slate-200">
                {summary.itemTotals[code]?.qty || 0}
              </td>
              <td className="px-3 py-1.5 text-right text-slate-500">
                {formatCurrency(summary.priceMap[code] || 0)}
              </td>
              <td className="px-3 py-1.5 text-right text-slate-600">
                {formatCurrency(summary.itemTotals[code]?.amount || 0)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
            <td className="sticky left-0 bg-slate-50 z-10 px-3 py-2 border-r border-slate-200">รวมทั้งหมด</td>
            {Array.from({ length: summary.daysInMonth }, (_, i) => {
              const dayTotal = summary.enabledCodes.reduce((s, code) => s + (summary.grid[code]?.[i + 1] || 0), 0)
              return <td key={i} className="px-2 py-2 text-center">{dayTotal || ''}</td>
            })}
            <td className="px-3 py-2 text-right border-l border-slate-200">{formatNumber(summary.grandQty)}</td>
            <td className="px-3 py-2 text-right"></td>
            <td className="px-3 py-2 text-right">{formatCurrency(summary.grandAmount)}</td>
          </tr>
          <tr className="bg-slate-50">
            <td colSpan={summary.daysInMonth + 3} className="px-3 py-1.5 text-right text-slate-600">VAT 7%</td>
            <td className="px-3 py-1.5 text-right">{formatCurrency(summary.vat)}</td>
          </tr>
          <tr className="bg-slate-50">
            <td colSpan={summary.daysInMonth + 3} className="px-3 py-1.5 text-right text-slate-600">หัก ณ ที่จ่าย 3%</td>
            <td className="px-3 py-1.5 text-right text-red-600">-{formatCurrency(summary.withholding)}</td>
          </tr>
          <tr className="bg-[#e8eef5]">
            <td colSpan={summary.daysInMonth + 3} className="px-3 py-2 text-right font-semibold text-[#1B3A5C]">ยอดจ่ายสุทธิ</td>
            <td className="px-3 py-2 text-right font-bold text-[#1B3A5C]">{formatCurrency(summary.net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
