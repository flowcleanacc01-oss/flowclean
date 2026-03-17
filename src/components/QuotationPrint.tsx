'use client'

import { formatDate, formatCurrency, formatBranch } from '@/lib/utils'
import type { Quotation, CompanyInfo } from '@/types'

interface QuotationPrintProps {
  quotation: Quotation
  company: CompanyInfo
}

export default function QuotationPrint({ quotation, company }: QuotationPrintProps) {
  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-quotation">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 border-b-2 border-[#1B3A5C] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
          <p className="text-xs text-slate-500">{company.nameEn}</p>
          <p className="text-xs text-slate-500 mt-1">{company.address}</p>
          <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {company.taxId} | {formatBranch(company.branch)}</p>
          <p className="text-xs text-slate-500">โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบเสนอราคา</h2>
          <p className="text-xs text-slate-500">Quotation</p>
          <p className="font-mono text-sm font-medium mt-2">{quotation.quotationNumber}</p>
          <p className="text-xs text-slate-500">วันที่: {formatDate(quotation.date)}</p>
          <p className="text-xs text-slate-500">ใช้ได้ถึง: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="mb-6 text-xs">
        <p className="text-slate-500">เรียน:</p>
        <p className="font-medium text-slate-800">{quotation.customerName}</p>
        {quotation.customerContact && (
          <p className="text-slate-500">ติดต่อ: {quotation.customerContact}</p>
        )}
      </div>

      <div className="bg-slate-50 rounded px-3 py-2 mb-4 text-xs">
        <p className="text-slate-600">เรื่อง: <strong>เสนอราคาค่าบริการซักรีด</strong></p>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-300 mb-4">
        <thead>
          <tr className="bg-[#e8eef5]">
            <th className="text-center px-3 py-2 border border-slate-300 w-12">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-16">รหัส</th>
            <th className="text-left px-3 py-2 border border-slate-300">รายการ</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-28">ราคา/หน่วย (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((item, idx) => (
            <tr key={item.code}>
              <td className="text-center px-3 py-1.5 border border-slate-300">{idx + 1}</td>
              <td className="px-3 py-1.5 border border-slate-300 font-mono text-xs text-slate-500">{item.code}</td>
              <td className="px-3 py-1.5 border border-slate-300">{item.name}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.pricePerUnit)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="text-xs text-slate-600 mb-2">
        <p>รวม {quotation.items.length} รายการ (ราคาต่อหน่วย ยังไม่รวม VAT 7%)</p>
      </div>

      {/* Conditions */}
      {quotation.conditions && (
        <div className="border border-slate-200 rounded p-3 mb-6 text-xs">
          <p className="font-medium text-slate-700 mb-1">เงื่อนไข:</p>
          <p className="text-slate-600 whitespace-pre-wrap">{quotation.conditions}</p>
        </div>
      )}

      {/* Notes */}
      {quotation.notes && (
        <div className="text-xs text-slate-600 mb-6">
          <p className="font-medium">หมายเหตุ: {quotation.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-12 text-xs text-center">
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้เสนอราคา</p>
          <p className="text-slate-400">{company.name}</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้อนุมัติ</p>
          <p className="text-slate-400">{quotation.customerName}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
