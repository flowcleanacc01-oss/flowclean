'use client'

import type { DeliveryNote, Customer, CompanyInfo, LinenItemDef } from '@/types'

interface MonthlyDeliveryReportPrintProps {
  customer: Customer
  month: string // YYYY-MM
  deliveryNotes: DeliveryNote[]
  catalog: LinenItemDef[]
  company: CompanyInfo
}

export default function MonthlyDeliveryReportPrint({
  customer, month, deliveryNotes, catalog, company,
}: MonthlyDeliveryReportPrintProps) {
  // Filter notes for this customer and month
  const notes = deliveryNotes
    .filter(dn => dn.customerId === customer.id && dn.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Get all unique item codes used
  const usedCodes = new Set<string>()
  for (const dn of notes) {
    for (const item of dn.items) {
      usedCodes.add(item.code)
    }
  }

  const items = catalog
    .filter(i => usedCodes.has(i.code))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Get days in month
  const [year, mon] = month.split('-').map(Number)
  const daysInMonth = new Date(year, mon, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Build data matrix: code -> day -> qty
  const matrix: Record<string, Record<number, number>> = {}
  for (const item of items) {
    matrix[item.code] = {}
  }
  for (const dn of notes) {
    const day = parseInt(dn.date.split('-')[2])
    for (const item of dn.items) {
      if (matrix[item.code]) {
        matrix[item.code][day] = (matrix[item.code][day] || 0) + item.quantity
      }
    }
  }

  // Row totals
  const rowTotals: Record<string, number> = {}
  for (const item of items) {
    rowTotals[item.code] = Object.values(matrix[item.code]).reduce((s, v) => s + v, 0)
  }

  // Grand total
  const grandTotal = Object.values(rowTotals).reduce((s, v) => s + v, 0)

  // Month label
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const monthLabel = `${monthNames[mon - 1]} ${year + 543}`

  return (
    <div className="bg-white p-4 mx-auto text-xs print:p-0 print:shadow-none" id="print-delivery-report"
      style={{ maxWidth: '297mm' }}>
      {/* Header */}
      <div className="text-center mb-4 border-b border-[#1B3A5C] pb-3">
        <h1 className="text-base font-bold text-[#1B3A5C]">{company.name}</h1>
        <h2 className="text-sm font-bold text-[#1B3A5C] mt-1">รายงานส่งสินค้ารายเดือน</h2>
        <p className="text-[10px] text-slate-500 mt-1">ลูกค้า: {customer.name} | เดือน: {monthLabel}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-[#e8eef5]">
              <th className="border border-slate-400 px-1 py-1 text-left sticky left-0 bg-[#e8eef5] z-10 min-w-16">รายการ</th>
              {days.map(d => (
                <th key={d} className="border border-slate-400 px-0.5 py-1 text-center min-w-7">{d}</th>
              ))}
              <th className="border border-slate-400 px-1 py-1 text-center font-bold min-w-12 bg-[#e8eef5]">รวม</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.code} className="hover:bg-slate-50">
                <td className="border border-slate-400 px-1 py-0.5 text-left sticky left-0 bg-white z-10 whitespace-nowrap">
                  <span className="font-mono text-slate-400 mr-0.5">{item.code}</span>
                  {item.name}
                </td>
                {days.map(d => {
                  const val = matrix[item.code][d]
                  return (
                    <td key={d} className="border border-slate-400 px-0.5 py-0.5 text-center">
                      {val || ''}
                    </td>
                  )
                })}
                <td className="border border-slate-400 px-1 py-0.5 text-center font-bold bg-slate-50">
                  {rowTotals[item.code] || ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#e8eef5] font-bold">
              <td className="border border-slate-400 px-1 py-1 text-right sticky left-0 bg-[#e8eef5] z-10">รวมทั้งหมด</td>
              {days.map(d => {
                const dayTotal = items.reduce((s, item) => s + (matrix[item.code][d] || 0), 0)
                return (
                  <td key={d} className="border border-slate-400 px-0.5 py-1 text-center">
                    {dayTotal || ''}
                  </td>
                )
              })}
              <td className="border border-slate-400 px-1 py-1 text-center text-[#1B3A5C]">{grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name} | จำนวนใบส่งของ: {notes.length} ใบ</p>
      </div>
    </div>
  )
}
