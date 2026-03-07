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
  carryOver: number       // ยกมา (± ได้: ลบ=ค้างส่ง, บวก=ส่งเกิน)
  col2HotelCount: number  // ลูกค้านับส่ง
  col3Claim: number       // เคลม
  totalReceived: number   // รวมรับ = col2 + col3
  col4Approved: number    // โรงงาน OK
  col5ClaimApproved: number // โรงซักนับเข้า
  col6PackSend: number    // โรงซักแพคส่ง
  needToReturn: number    // ยอดต้องคืน = col4 + col5 - carryOver
  stock: number           // สต้อก = needToReturn - col6
  note: string            // หมายเหตุ
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
      if (row.col2_hotelCountIn > 0 || row.col3_hotelClaimCount > 0 ||
          row.col4_factoryApproved > 0 || row.col5_factoryClaimApproved > 0 ||
          (row.col6_factoryPackSend || 0) > 0) {
        usedCodes.add(row.code)
      }
    }
  }
  for (const code of Object.keys(carryOver)) {
    if (carryOver[code] !== 0) usedCodes.add(code)
  }

  const items = catalog
    .filter(i => usedCodes.has(i.code))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Build stock rows
  const rows: StockRow[] = items.map(item => {
    const co = carryOver[item.code] || 0

    let col2 = 0, col3 = 0, col4 = 0, col5 = 0, col6 = 0
    const notes: string[] = []

    for (const form of forms) {
      const row = form.rows.find(r => r.code === item.code)
      if (row) {
        col2 += row.col2_hotelCountIn
        col3 += row.col3_hotelClaimCount
        col4 += row.col4_factoryApproved
        col5 += row.col5_factoryClaimApproved
        col6 += row.col6_factoryPackSend || 0
        if (row.note) notes.push(row.note)
      }
    }

    const totalReceived = col2 + col3
    // ยอดต้องคืน = approved + claimApproved - carryOver
    const needToReturn = col4 + col5 - co
    // สต้อก = ยอดต้องคืน - แพคส่ง
    const stock = needToReturn - col6

    return {
      code: item.code,
      name: item.name,
      carryOver: co,
      col2HotelCount: col2,
      col3Claim: col3,
      totalReceived,
      col4Approved: col4,
      col5ClaimApproved: col5,
      col6PackSend: col6,
      needToReturn,
      stock,
      note: notes.length > 0 ? notes.join(', ') : '',
    }
  })

  // Grand totals
  const totals = rows.reduce((acc, r) => ({
    carryOver: acc.carryOver + r.carryOver,
    col2HotelCount: acc.col2HotelCount + r.col2HotelCount,
    col3Claim: acc.col3Claim + r.col3Claim,
    totalReceived: acc.totalReceived + r.totalReceived,
    col4Approved: acc.col4Approved + r.col4Approved,
    col5ClaimApproved: acc.col5ClaimApproved + r.col5ClaimApproved,
    col6PackSend: acc.col6PackSend + r.col6PackSend,
    needToReturn: acc.needToReturn + r.needToReturn,
    stock: acc.stock + r.stock,
  }), {
    carryOver: 0, col2HotelCount: 0, col3Claim: 0, totalReceived: 0,
    col4Approved: 0, col5ClaimApproved: 0, col6PackSend: 0, needToReturn: 0, stock: 0,
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
              <th className="border border-slate-400 px-2 py-2 text-center bg-amber-50 w-16">ยกมา<br />(±)</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">ลูกค้า<br />นับส่ง</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">เคลม</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-blue-50 font-bold w-16">รวมรับ</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">โรงงาน<br />OK</th>
              <th className="border border-slate-400 px-2 py-2 text-center w-16">โรงซัก<br />นับเข้า</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-teal-50 font-bold w-16">โรงซัก<br />แพคส่ง</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-indigo-50 w-16">ต้องคืน</th>
              <th className="border border-slate-400 px-2 py-2 text-center bg-red-50 font-bold w-16">สต้อก</th>
              <th className="border border-slate-400 px-2 py-2 text-left min-w-20">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="border border-slate-400 px-4 py-8 text-center text-slate-400">
                  ไม่มีข้อมูลสต็อกในเดือนนี้
                </td>
              </tr>
            ) : rows.map((row, idx) => (
              <tr key={row.code} className="hover:bg-slate-50">
                <td className="border border-slate-400 px-2 py-1.5 text-center">{idx + 1}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono text-slate-500">{row.code}</td>
                <td className="border border-slate-400 px-2 py-1.5">{row.name}</td>
                <td className={`border border-slate-400 px-2 py-1.5 text-center ${row.carryOver !== 0 ? (row.carryOver < 0 ? 'bg-red-50 font-medium text-red-700' : 'bg-emerald-50 font-medium text-emerald-700') : ''}`}>
                  {row.carryOver !== 0 ? (row.carryOver > 0 ? `+${row.carryOver}` : row.carryOver) : '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col2HotelCount || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col3Claim || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center font-bold bg-blue-50">
                  {row.totalReceived || '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col4Approved || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{row.col5ClaimApproved || '-'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center font-bold bg-teal-50">
                  {row.col6PackSend || '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center bg-indigo-50">
                  {row.needToReturn || '-'}
                </td>
                <td className={`border border-slate-400 px-2 py-1.5 text-center font-bold ${row.stock > 0 ? 'bg-red-50 text-red-700' : row.stock < 0 ? 'bg-emerald-50 text-emerald-700' : ''}`}>
                  {row.stock !== 0 ? row.stock : '-'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-slate-600 text-[10px]">{row.note || '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#e8eef5] font-bold">
              <td colSpan={3} className="border border-slate-400 px-2 py-2 text-right">รวมทั้งหมด</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-amber-700">
                {totals.carryOver !== 0 ? (totals.carryOver > 0 ? `+${totals.carryOver}` : totals.carryOver) : '-'}
              </td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col2HotelCount || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col3Claim || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-[#1B3A5C]">{totals.totalReceived || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col4Approved || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.col5ClaimApproved || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-teal-700">{totals.col6PackSend || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center">{totals.needToReturn || '-'}</td>
              <td className="border border-slate-400 px-2 py-2 text-center text-red-700">{totals.stock !== 0 ? totals.stock : '-'}</td>
              <td className="border border-slate-400"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-5 gap-3 text-[11px]">
        <div className="bg-slate-50 rounded p-2">
          <p className="text-slate-500">ใบรับส่งผ้า</p>
          <p className="font-bold text-slate-800">{forms.length} ใบ</p>
        </div>
        <div className="bg-blue-50 rounded p-2">
          <p className="text-slate-500">รวมรับทั้งเดือน</p>
          <p className="font-bold text-[#1B3A5C]">{totals.totalReceived} ชิ้น</p>
        </div>
        <div className="bg-emerald-50 rounded p-2">
          <p className="text-slate-500">โรงงาน OK</p>
          <p className="font-bold text-emerald-700">{totals.col4Approved} ชิ้น</p>
        </div>
        <div className="bg-teal-50 rounded p-2">
          <p className="text-slate-500">โรงซักแพคส่ง</p>
          <p className="font-bold text-teal-700">{totals.col6PackSend} ชิ้น</p>
        </div>
        <div className={`rounded p-2 ${totals.stock > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <p className="text-slate-500">สต้อกสิ้นเดือน</p>
          <p className={`font-bold ${totals.stock > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{totals.stock} ชิ้น</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
