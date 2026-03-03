'use client'

import { formatDate } from '@/lib/utils'
import { CHECKLIST_TYPE_CONFIG } from '@/types'
import type { ProductChecklist, Customer, CompanyInfo } from '@/types'

interface ChecklistPrintProps {
  checklist: ProductChecklist
  customer: Customer
  company: CompanyInfo
}

export default function ChecklistPrint({ checklist, customer, company }: ChecklistPrintProps) {
  const passedCount = checklist.items.filter(i => i.passed).length
  const allPassed = passedCount === checklist.items.length

  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-checklist">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 border-b-2 border-[#1B3A5C] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
          <p className="text-xs text-slate-500">{company.nameEn}</p>
          <p className="text-xs text-slate-500 mt-1">{company.address}</p>
          <p className="text-xs text-slate-500">โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบเช็คสินค้า</h2>
          <p className="text-xs text-slate-500">{CHECKLIST_TYPE_CONFIG[checklist.type].label}</p>
          <p className="font-mono text-sm font-medium mt-2">{checklist.checklistNumber}</p>
          <p className="text-xs text-slate-500">วันที่: {formatDate(checklist.date)}</p>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
        <div>
          <p className="text-slate-500">ลูกค้า:</p>
          <p className="font-medium text-slate-800">{customer.name}</p>
        </div>
        <div>
          <p className="text-slate-500">เอกสารอ้างอิง:</p>
          <p className="font-mono font-medium">{checklist.linkedDocumentNumber}</p>
        </div>
        <div>
          <p className="text-slate-500">ผู้ตรวจ:</p>
          <p className="font-medium">{checklist.inspectorName || '-'}</p>
        </div>
        <div>
          <p className="text-slate-500">ผลรวม:</p>
          <p className={`font-medium ${allPassed ? 'text-emerald-700' : 'text-red-700'}`}>
            ผ่าน {passedCount}/{checklist.items.length} รายการ
          </p>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-300 mb-4">
        <thead>
          <tr className="bg-[#e8eef5]">
            <th className="text-center px-3 py-2 border border-slate-300 w-12">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-16">รหัส</th>
            <th className="text-left px-3 py-2 border border-slate-300">รายการ</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-20">ควรมี</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-20">จริง</th>
            <th className="text-center px-3 py-2 border border-slate-300 w-16">ผ่าน</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-32">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {checklist.items.map((item, idx) => (
            <tr key={item.code} className={!item.passed && item.actualQty > 0 ? 'bg-red-50' : ''}>
              <td className="text-center px-3 py-1.5 border border-slate-300">{idx + 1}</td>
              <td className="px-3 py-1.5 border border-slate-300 font-mono text-xs">{item.code}</td>
              <td className="px-3 py-1.5 border border-slate-300">{item.name}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{item.expectedQty}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300 font-medium">{item.actualQty}</td>
              <td className="text-center px-3 py-1.5 border border-slate-300">
                {item.passed ? '✓' : item.actualQty > 0 ? '✗' : '-'}
              </td>
              <td className="px-3 py-1.5 border border-slate-300 text-xs">{item.note || '-'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td colSpan={5} className="text-right px-3 py-2 border border-slate-300 font-medium">
              ผ่าน: {passedCount}/{checklist.items.length}
            </td>
            <td className="text-center px-3 py-2 border border-slate-300 font-bold">
              {allPassed ? (
                <span className="text-emerald-700">PASS</span>
              ) : (
                <span className="text-red-700">FAIL</span>
              )}
            </td>
            <td className="border border-slate-300"></td>
          </tr>
        </tfoot>
      </table>

      {/* Notes */}
      {checklist.notes && (
        <div className="text-xs text-slate-600 mb-6">
          <p className="font-medium">หมายเหตุ: {checklist.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-12 text-xs text-center">
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้ตรวจ</p>
          <p className="text-slate-400">{checklist.inspectorName || '-'}</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้อนุมัติ</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
