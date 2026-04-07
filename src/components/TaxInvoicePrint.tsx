'use client'

import Image from 'next/image'
import { formatDate, formatCurrency, formatBranch } from '@/lib/utils'
import type { TaxInvoice, Customer, CompanyInfo } from '@/types'

interface TaxInvoicePrintProps {
  invoice: TaxInvoice
  customer: Customer
  company: CompanyInfo
  withholdingTax?: number
  netPayable?: number
}

export default function TaxInvoicePrint({ invoice, customer, company, withholdingTax, netPayable }: TaxInvoicePrintProps) {
  const wht = withholdingTax ?? (invoice.subtotal * 0.03)
  const net = netPayable ?? (invoice.grandTotal - wht)
  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-tax-invoice">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b border-slate-300 pb-3 print:mb-3 print:pb-2">
        <div className="flex items-start gap-3">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={48} height={48} className="mt-0.5 print:w-[48px] print:h-[48px]" />
          <div>
            <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
            <p className="text-xs text-slate-500">{company.nameEn}</p>
            <p className="text-xs text-slate-500 mt-1">{company.address}</p>
            <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {company.taxId}{company.branch ? ` | ${formatBranch(company.branch)}` : ''}</p>
            <p className="text-xs text-slate-500">โทร: {company.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบกำกับภาษี/ใบเสร็จรับเงิน</h2>
          <p className="text-xs text-slate-500">Tax Invoice / Receipt</p>
          <p className="font-mono text-sm font-medium mt-2">{invoice.invoiceNumber}</p>
          <p className="text-xs text-slate-500">วันที่: {formatDate(invoice.issueDate)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="mb-4 text-xs">
        <p className="text-slate-500">ลูกค้า / Customer:</p>
        <p className="font-medium text-slate-800">{customer.name}</p>
        {customer.nameEn && <p className="text-slate-500">{customer.nameEn}</p>}
        <p className="text-slate-500 mt-1">{customer.address}</p>
        <p className="text-slate-500">เลขผู้เสียภาษี: {customer.taxId} | {formatBranch(customer.branch)}</p>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-300 mb-4">
        <thead>
          <tr className="bg-[#e8eef5]">
            <th className="text-center px-3 py-2 border border-slate-300 w-12">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300">รายการ / Description</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-16">จำนวน</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-20">ราคา/หน่วย</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-24">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((item, idx) => (
            <tr key={item.code}>
              <td className="text-center px-3 py-1.5 border border-slate-300">{idx + 1}</td>
              <td className="px-3 py-1.5 border border-slate-300">{item.name}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{item.quantity}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.pricePerUnit)}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300 font-medium">{invoice.vat > 0 ? 'รวมก่อน VAT' : 'รวม'}</td>
            <td className="text-right px-3 py-1.5 border border-slate-300 font-medium">{formatCurrency(invoice.subtotal)}</td>
          </tr>
          {invoice.vat > 0 && (
            <tr className="bg-slate-50">
              <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300">ภาษีมูลค่าเพิ่ม {invoice.subtotal > 0 ? `${Math.round(invoice.vat / invoice.subtotal * 100)}%` : ''}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(invoice.vat)}</td>
            </tr>
          )}
          <tr className="bg-slate-50">
            <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300 font-medium">รวมทั้งสิ้น</td>
            <td className="text-right px-3 py-1.5 border border-slate-300 font-medium">{formatCurrency(invoice.grandTotal)}</td>
          </tr>
          {wht > 0 && (
            <tr>
              <td colSpan={4} className="text-right px-3 py-1.5 border border-slate-300 text-red-600">หัก ณ ที่จ่าย {invoice.subtotal > 0 ? `${Math.round(wht / invoice.subtotal * 100)}%` : ''}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300 text-red-600">-{formatCurrency(wht)}</td>
            </tr>
          )}
          <tr className="bg-[#e8eef5]">
            <td colSpan={4} className="text-right px-3 py-2 border border-slate-300 font-bold text-[#1B3A5C]">ยอดชำระสุทธิ / Net Payable</td>
            <td className="text-right px-3 py-2 border border-slate-300 font-bold text-[#1B3A5C] text-base">{formatCurrency(net)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Notes */}
      {invoice.notes && (
        <div className="text-xs text-slate-600 mb-6">
          <p className="font-medium">หมายเหตุ: {invoice.notes}</p>
        </div>
      )}

      {/* Receipt Confirmation */}
      <div className="border border-emerald-300 rounded-lg p-4 mb-6 bg-emerald-50">
        <p className="text-sm font-medium text-emerald-800 mb-1">ใบเสร็จรับเงิน / Receipt</p>
        <p className="text-xs text-emerald-700">ได้รับเงินจำนวน <strong>{formatCurrency(net)}</strong> บาท เรียบร้อยแล้ว</p>
        <p className="text-xs text-emerald-600 mt-1">ชำระเข้า: {company.bankName} | {company.bankAccountName} | เลขบัญชี: {company.bankAccountNumber}</p>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-8 text-xs text-center">
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้ออกเอกสาร / Authorized Signature</p>
          <p className="text-slate-400">{company.name}</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้รับเอกสาร / Receiver</p>
          <p className="text-slate-400">{customer.name}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
        <p>เอกสารนี้ออกโดยระบบ FlowClean — {company.name}</p>
      </div>
    </div>
  )
}
