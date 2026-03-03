'use client'

import type { LinenForm, Customer, CompanyInfo, LinenItemDef } from '@/types'

interface MonthlyStockReportPrintProps {
  customer: Customer
  month: string // YYYY-MM
  linenForms: LinenForm[]
  catalog: LinenItemDef[]
  company: CompanyInfo
  getCarryOver: (customerId: string, beforeDate: string) => Record<string, number>
}

interface StockRow {
  code: string
  name: string
  carryOver: number    // ยกมา (ค้าง)
  col1Send: number     // ส่งซัก
  col2Claim: number    // เคลม
  totalSend: number    // รวมส่ง = col1 + col2
  col3Return: number   // กลับ
  col4CountIn: number  // นับเข้า
  col5PackSend: number // แพคส่ง
  accumulated: number  // ค้างสะสม
  note: string         // หมายเหตุ
}

export default function MonthlyStockReportPrint({
  customer, month, linenForms, catalog, company, getCarryOver,
}: MonthlyStockReportPrintProps) {
  // Filter forms for this customer and month
  const forms = linenForms
    .filter(f => f.customerId === customer.id && f.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Get carry-over from before this month (first day of month)
  const carryOver = getCarryOver(customer.id, `${month}-01`)

  // Get all unique item codes used in this month's forms + carry-over
  const usedCodes = new Set<string>()
  for (const form of forms) {
    for (const row of form.rows) {
      if (row.col1_normalSend > 0 || row.col2_claimSend > 0 || row.col3_washedReturn > 0 ||
          row.col4_factoryCountIn > 0 || row.col5_factoryPackSend > 0) {
        usedCodes.add(row.code)
      }
    }
  }
  for (const code of Object.keys(carryOver)) {
    if (carryOver[code] > 0) usedCodes.add(code)
  }

  const items = catalog
    .filter(i => usedCodes.has(i.code))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Build stock rows
  const rows: StockRow[] = items.map(item => {
    const co = carryOver[item.code] || 0

    let col1 = 0, col2 = 0, col3 = 0, col4 = 0, col5 = 0
    const notes: string[] = []

    for (const form of forms) {
      const row = form.rows.find(r => r.code === item.code)
      if (row) {
        col1 += row.col1_normalSend
        col2 += row.col2_claimSend
        col3 += row.col3_washedReturn
        col4 += row.col4_factoryCountIn
        col5 += row.col5_factoryPackSend
        if (row.col6_note) notes.push(row.col6_note)
      }
    }

    const totalSend = col1 + col2
    // ค้างสะสม = ยกมา + นับเข้า - แพคส่ง
    const accumulated = co + col4 - col5

    return {
      code: item.code,
      name: item.name,
      carryOver: co,
      col1Send: col1,
      col2Claim: col2,
      totalSend,
      col3Return: col3,
      col4CountIn: col4,
      col5PackSend: col5,
      accumulated: accumulated > 0 ? accumulated : 0,
      note: notes.length > 0 ? notes.join(', ') : '',
    }
  })

  // Grand totals
  const totals = rows.reduce((acc, r) => ({
    carryOver: acc.carryOver + r.carryOver,
    col1Send: acc.col1Send + r.col1Send,
    col2Claim: acc.col2Claim + r.col2Claim,
    totalSend: acc.totalSend + r.totalSend,
    col3Return: acc.col3Return + r.col3Return,
    col4CountIn: acc.col4CountIn + r.col4CountIn,
    col5PackSend: acc.col5PackSend + r.col5PackSend,
    accumulated: acc.accumulated + r.accumulated,
  }), {
    carryOver: 0, col1Send: 0, col2Claim: 0, totalSend: 0,
    col3Return: 0, col4CountIn: 0, col5PackSend: 0, accumulated: 0,
  })

  // Month label
  const [year, mon] = month.split('-').map(Number)
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const monthLabel = `${monthNames[mon - 1]} ${year + 543}`

  return (
    <div className="bg-white p-4 mx-auto text-xs print:p-0 print:shadow-none" id="print-stock-report"
      style={{ maxWidth: '297mm' }}>
      {/* Header */}
      <div className="text-center mb-4 border-b border-[#1B3A5C] pb-3">
        <h1 className="text-base font-bold text-[#1B3A5C]">{company.name}</h1>
        <h2 className="text-sm font-bold text-[#1B3A5C] mt-1">รายงานสต็อกรายเดือน</h2>
        <p className="text-[10px] text-slate-500 mt-1">ลูกค้า: {customer.name} | เดือน: {monthLabel}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-[#e8eef5]">
              <th className="border border-slate-400 px-2 py-2 text-center w-8">ลำดับ</th>
              <th className="border border-slate-400 px-2 py-2 text-left w-14">รหัส</th>
              <th className="border border-slate-400 px-2 py-2 text-left min-w-24">รายการ</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-amber-50 w-16">ยกมา<br />(ค้าง)</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">ส่งซัก<br />(col1)</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">เคลม<br />(col2)</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-blue-50 font-bold w-16">รวมส่ง</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">กลับ<br />(col3)</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">นับเข้า<br />(col4)</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">แพคส่ง<br />(col5)</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-red-50 font-bold w-16">ค้างสะสม</th>
              <th className="border border-slate-400 px-2 py-2 text-left min-w-20">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="border border-slate-400 px-4 py-8 text-center text-slate-400">
                  ไม่มีข้อมูลสต็อกในเดือนนี้
                </td>
              </tr>
            ) : rows.map((row, idx) => (
              <tr key={row.code} className="hover:bg-slate-50">
                <td className="border border-slate-400 px-2 py-1.5 text-center">{idx + 1}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono text-slate-500">{row.code}</td>
                <td className="border border-slate-400 px-2 py-1.5">{row.name}</td>
                <td className={`border border-slate-400 px-2 py-1.5 text-center ${row.carryOver > 0 ? 'bg-amber-50 font-medium text-amber-700' : ''}`}>
                  {row.carryOver || '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col1Send || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col2Claim || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center font-bold bg-blue-50">
                  {row.totalSend || '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col3Return || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col4CountIn || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col5PackSend || '-'}</td>
                <td className={`border border-slate-400 px-2 py-1.5 text-center font-bold ${row.accumulated > 0 ? 'bg-red-50 text-red-700' : ''}`}>
                  {row.accumulated || '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-slate-600 text-[10px]">{row.note || '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#e8eef5] font-bold">
              <td colSpan={3} className="border border-slate-400 px-2 py-2 text-right">รวมทั้งหมด</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-amber-700">{totals.carryOver || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col1Send || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col2Claim || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-[#1B3A5C]">{totals.totalSend || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col3Return || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col4CountIn || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col5PackSend || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-red-700">{totals.accumulated || '-'}</td>
              <td className="border border-slate-400"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-4 gap-4 text-[11px]">
        <div className="bg-slate-50 rounded p-2">
          <p className="text-slate-500">จำนวนใบรับส่งผ้า</p>
          <p className="font-bold text-slate-800">{forms.length} ใบ</p>
        </div>
        <div className="bg-blue-50 rounded p-2">
          <p className="text-slate-500">รวมส่งซักทั้งเดือน</p>
          <p className="font-bold text-[#1B3A5C]">{totals.totalSend} ชิ้น</p>
        </div>
        <div className="bg-emerald-50 rounded p-2">
          <p className="text-slate-500">แพคส่งทั้งเดือน</p>
          <p className="font-bold text-emerald-700">{totals.col5PackSend} ชิ้น</p>
        </div>
        <div className="bg-red-50 rounded p-2">
          <p className="text-slate-500">ค้างสะสมสิ้นเดือน</p>
          <p className="font-bold text-red-700">{totals.accumulated} ชิ้น</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
