'use client'

import Image from 'next/image'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Receipt, Customer } from '@/types'

interface Props {
  receipt: Receipt
  customer: Customer
}

/**
 * ReceiptPrint (Feature 148) — ใบเสร็จรับเงิน สำหรับลูกค้าไม่คิด VAT
 *
 * Safety design:
 * - ❌ ไม่มีชื่อบริษัทเต็ม / taxId / address / branch ของบริษัทเรา
 * - ✅ Brand name "FlowClean Laundry Service" + logo
 * - ✅ Watermark/note ชัดเจน "ไม่ใช่ใบกำกับภาษี"
 * - ✅ ลูกค้าใช้ชื่อย่อ (ไม่เอาที่อยู่/taxId ลูกค้า)
 * - ❌ ไม่มี VAT 7% / หัก ณ ที่จ่าย 3% (เพราะไม่คิด VAT)
 */
export default function ReceiptPrint({ receipt, customer }: Props) {
  const total = receipt.grandTotal

  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-receipt">
      {/* Header — brand only, no legal company info */}
      <div className="flex justify-between items-start mb-4 border-b-2 border-slate-300 pb-3">
        <div className="flex items-start gap-3">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={56} height={56} className="mt-0.5" />
          <div>
            <h1 className="text-xl font-bold text-[#1B3A5C]">FlowClean Laundry Service</h1>
            <p className="text-[11px] text-slate-500 mt-1 italic">บริการซักรีด</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-slate-700">ใบเสร็จรับเงิน</h2>
          <p className="text-xs text-slate-500">(ไม่ใช่ใบกำกับภาษี)</p>
          <p className="text-[11px] text-slate-400 italic">Non-fiscal Receipt</p>
          <p className="font-mono text-sm font-medium mt-2">{receipt.receiptNumber}</p>
          <p className="text-sm font-semibold text-[#1B3A5C]">วันที่: {formatDate(receipt.issueDate)}</p>
        </div>
      </div>

      {/* Customer (short name only, no taxId/address) */}
      <div className="mb-4 text-sm">
        <p className="text-slate-500 text-xs">ลูกค้า:</p>
        <p className="text-base font-bold text-slate-900">{customer.shortName || customer.name}</p>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-300 mb-4">
        <thead>
          <tr className="bg-slate-100">
            <th className="text-center px-3 py-2 border border-slate-300 w-12">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300">รายการ</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-16">จำนวน</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-24">ราคา/หน่วย</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-28">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lineItems.map((item, idx) => (
            <tr key={idx}>
              <td className="text-center px-3 py-1.5 border border-slate-300">{idx + 1}</td>
              <td className="px-3 py-1.5 border border-slate-300">{item.name}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{item.quantity}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.pricePerUnit)}</td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total — no VAT */}
      <div className="flex justify-end mb-4">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="px-3 py-1.5 text-right text-slate-600">รวมทั้งสิ้น</td>
              <td className="px-3 py-1.5 text-right font-bold text-[#1B3A5C] text-base min-w-[120px]">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Safety watermark / disclaimer */}
      <div className="mt-6 border-2 border-amber-400 bg-amber-50 rounded-lg p-3">
        <p className="text-xs font-semibold text-amber-800 mb-1">⚠ เอกสารนี้เป็นหลักฐานการชำระเงินเท่านั้น</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          ไม่สามารถใช้ขอคืนภาษี หรือใช้แทนใบกำกับภาษีได้
          (This document is a payment receipt only — cannot be used as a tax invoice.)
        </p>
      </div>

      {/* Signature lines */}
      <div className="mt-12 grid grid-cols-2 gap-12 text-xs text-slate-500">
        <div className="text-center">
          <div className="border-t border-slate-400 pt-1 mt-12">ผู้รับเงิน / Received by</div>
        </div>
        <div className="text-center">
          <div className="border-t border-slate-400 pt-1 mt-12">ผู้จ่ายเงิน / Paid by</div>
        </div>
      </div>
    </div>
  )
}
