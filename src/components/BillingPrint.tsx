'use client'

import Image from 'next/image'
import { formatDate, formatCurrency, formatBranch } from '@/lib/utils'
import type { BillingStatement, Customer, CompanyInfo } from '@/types'

interface BillingPrintProps {
  billing: BillingStatement
  customer: Customer
  company: CompanyInfo
}

export default function BillingPrint({ billing, customer, company }: BillingPrintProps) {
  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-billing">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 border-b border-slate-300 pb-4">
        <div className="flex items-start gap-3">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={48} height={48} className="mt-0.5 print:w-[48px] print:h-[48px]" />
          <div>
            <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
            <p className="text-xs text-slate-500">{company.nameEn}</p>
            <p className="text-xs text-slate-500 mt-1">{company.address}</p>
            <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {company.taxId}</p>
            <p className="text-xs text-slate-500">โทร: {company.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบวางบิล</h2>
          <p className="text-xs text-slate-500">Billing Statement</p>
          <p className="font-mono text-sm font-medium mt-2">{billing.billingNumber}</p>
          <p className="text-xs text-slate-500">วันที่: {formatDate(billing.issueDate)}</p>
          <p className="text-xs text-slate-500">ครบกำหนด: {formatDate(billing.dueDate)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="mb-6 text-xs">
        <p className="text-slate-500">เรียน:</p>
        <p className="font-medium text-slate-800">{customer.name}</p>
        <p className="text-slate-500">{customer.address}</p>
        <p className="text-slate-500">เลขผู้เสียภาษี: {customer.taxId} ({formatBranch(customer.branch)})</p>
      </div>

      {/* Billing Period */}
      <div className="bg-slate-50 rounded px-3 py-2 mb-4 text-xs">
        <p className="text-slate-600">ค่าบริการซักรีดประจำเดือน: <strong>{billing.billingMonth}</strong></p>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-300 mb-4">
        <thead>
          <tr className="bg-slate-100">
            <th className="text-center px-3 py-2 border border-slate-300 w-12">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300">รายการ</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-16">จำนวน</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-20">ราคา/หน่วย</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-24">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {billing.lineItems.map((item, idx) => (
            <tr key={item.code}>
              <td className="text-center px-3 py-1.5 border border-slate-300">{idx + 1}</td>
              <td className="px-3 py-1.5 border border-slate-300">
                <span className="font-mono text-xs text-slate-400 mr-1">{item.code}</span>
                {item.name}
              </td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{item.quantity}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.pricePerUnit)}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300 font-medium">รวม</td>
            <td className="text-right px-3 py-1.5 border border-slate-300 font-medium">{formatCurrency(billing.subtotal)}</td>
          </tr>
          <tr className="bg-slate-50">
            <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300">ภาษีมูลค่าเพิ่ม 7%</td>
            <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(billing.vat)}</td>
          </tr>
          <tr className="bg-slate-50">
            <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300 font-medium">รวมทั้งสิ้น</td>
            <td className="text-right px-3 py-1.5 border border-slate-300 font-bold">{formatCurrency(billing.grandTotal)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300 text-red-600">หัก ณ ที่จ่าย 3%</td>
            <td className="text-right px-3 py-1.5 border border-slate-300 text-red-600">-{formatCurrency(billing.withholdingTax)}</td>
          </tr>
          <tr className="bg-[#e8eef5]">
            <td colSpan={4} className="text-right px-3 py-2 border border-slate-300 font-bold text-[#1B3A5C]">ยอดจ่ายสุทธิ</td>
            <td className="text-right px-3 py-2 border border-slate-300 font-bold text-[#1B3A5C] text-base">{formatCurrency(billing.netPayable)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Payment Info */}
      <div className="border border-slate-200 rounded p-3 mb-6 text-xs">
        <p className="font-medium text-slate-700 mb-1">ข้อมูลการชำระเงิน:</p>
        <p className="text-slate-600">{company.bankName} | ชื่อบัญชี: {company.bankAccountName}</p>
        <p className="text-slate-600">เลขบัญชี: {company.bankAccountNumber}</p>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-12 text-xs text-center">
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้วางบิล</p>
          <p className="text-slate-400">{company.name}</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้รับบิล</p>
          <p className="text-slate-400">{customer.name}</p>
        </div>
      </div>
    </div>
  )
}
