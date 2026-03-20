'use client'

import Image from 'next/image'
import { formatDate, formatNumber } from '@/lib/utils'
import type { LinenForm, Customer, CompanyInfo, LinenItemDef, QuotationItem } from '@/types'

interface LinenFormPrintProps {
  form: LinenForm
  customer: Customer
  company: CompanyInfo
  catalog: LinenItemDef[]
  carryOver: Record<string, number>
  qtItems?: QuotationItem[]
}

export default function LinenFormPrint({ form, customer, company, catalog, carryOver, qtItems }: LinenFormPrintProps) {
  // ใช้ชื่อจาก QT ถ้ามี, fallback ไป catalog
  const qtNameMap = qtItems ? Object.fromEntries(qtItems.map(i => [i.code, i.name])) : null
  const catalogNameMap = Object.fromEntries(catalog.map(i => [i.code, i.name]))
  const nameMap = qtNameMap || catalogNameMap

  const totalCol2 = form.rows.reduce((s, r) => s + r.col2_hotelCountIn, 0)
  const totalCol3 = form.rows.reduce((s, r) => s + r.col3_hotelClaimCount, 0)
  const totalCol5 = form.rows.reduce((s, r) => s + r.col5_factoryClaimApproved, 0)
  const totalCol6 = form.rows.reduce((s, r) => s + (r.col6_factoryPackSend || 0), 0)
  const totalCol4 = form.rows.reduce((s, r) => s + r.col4_factoryApproved, 0)

  return (
    <div className="bg-white p-6 max-w-[210mm] mx-auto text-xs print:p-4 print:shadow-none print:max-w-none print:w-full print:mx-0" id="print-lf" style={{ breakInside: 'avoid-page' }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3 border-b border-slate-300 pb-2 print:mb-2 print:pb-1">
        <div className="flex items-start gap-2">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={40} height={40} className="mt-0.5 print:w-[36px] print:h-[36px]" />
          <div>
            <h1 className="text-base font-bold text-[#1B3A5C]">{company.name}</h1>
            <p className="text-[10px] text-slate-500">{company.nameEn}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{company.address}</p>
            <p className="text-[10px] text-slate-500">โทร: {company.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-sm font-bold text-[#1B3A5C]">ใบส่งรับผ้า</h2>
          <p className="text-[10px] text-slate-500">Linen Form</p>
          <p className="font-mono text-xs font-medium mt-1">{form.formNumber}</p>
          <p className="text-[10px] text-slate-500">วันที่: {formatDate(form.date)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-[11px] print:mb-2">
        <div>
          <p className="text-slate-500">ลูกค้า:</p>
          <p className="font-medium text-slate-800">{customer.shortName || customer.name}</p>
        </div>
        <div className="text-right">
          {form.bagsSentCount > 0 && (
            <p className="text-slate-500">ถุงส่งซัก: <span className="text-slate-800 font-medium">{form.bagsSentCount}</span></p>
          )}
          {form.bagsPackCount > 0 && (
            <p className="text-slate-500">ถุงแพคส่ง: <span className="text-slate-800 font-medium">{form.bagsPackCount}</span></p>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-[11px] border border-slate-300">
        <thead>
          <tr className="bg-slate-100">
            <th className="px-1.5 py-1.5 border border-slate-300 text-left w-12">รหัส</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-left">รายการ</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-12">ยกยอด</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">ส่งซัก</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-12">เคลม</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">นับเข้า</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">แพคส่ง</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">ค้าง/คืน</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-left w-20">หมายเหตุ</th>
            <th className="px-1.5 py-1.5 border border-slate-300 text-right w-14">นับกลับ</th>
          </tr>
        </thead>
        <tbody>
          {(qtItems
            ? qtItems.map(qi => form.rows.find(r => r.code === qi.code)).filter(Boolean) as typeof form.rows
            : form.rows
          ).map(row => {
            const co = carryOver[row.code] || 0
            const diff = (row.col6_factoryPackSend || 0) - row.col5_factoryClaimApproved
            return (
              <tr key={row.code} style={{ breakInside: 'avoid' }}>
                <td className="px-1.5 py-1 border border-slate-300 font-mono text-[10px]">{row.code}</td>
                <td className="px-1.5 py-1 border border-slate-300">{nameMap[row.code] || row.code}</td>
                <td className="px-1.5 py-1 border border-slate-300 text-right">{co !== 0 ? formatNumber(co) : '-'}</td>
                <td className="px-1.5 py-1 border border-slate-300 text-right">{row.col2_hotelCountIn || '-'}</td>
                <td className="px-1.5 py-1 border border-slate-300 text-right">{row.col3_hotelClaimCount || '-'}</td>
                <td className="px-1.5 py-1 border border-slate-300 text-right">{row.col5_factoryClaimApproved || '-'}</td>
                <td className="px-1.5 py-1 border border-slate-300 text-right">{row.col6_factoryPackSend || '-'}</td>
                <td className={`px-1.5 py-1 border border-slate-300 text-right ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : ''}`}>
                  {diff !== 0 ? (diff > 0 ? `+${diff}` : diff) : '-'}
                </td>
                <td className="px-1.5 py-1 border border-slate-300 text-[10px]">{row.note || '-'}</td>
                <td className="px-1.5 py-1 border border-slate-300 text-right">{row.col4_factoryApproved || '-'}</td>
              </tr>
            )
          })}
          <tr className="bg-slate-50 font-medium">
            <td colSpan={2} className="px-1.5 py-1.5 border border-slate-300 text-right">รวม</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right"></td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol2)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol3)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol5)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol6)}</td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right"></td>
            <td className="px-1.5 py-1.5 border border-slate-300"></td>
            <td className="px-1.5 py-1.5 border border-slate-300 text-right">{formatNumber(totalCol4)}</td>
          </tr>
        </tbody>
      </table>

      {/* Notes */}
      {form.notes && (
        <div className="mt-2 text-[11px] text-slate-600">
          <p className="font-medium">หมายเหตุ: {form.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 mt-6 text-[11px] text-center print:mt-4" style={{ breakInside: 'avoid', breakBefore: 'avoid' }}>
        <div>
          <div className="border-b border-slate-300 pb-6 mb-1"></div>
          <p className="text-slate-500">ผู้ส่ง</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-6 mb-1"></div>
          <p className="text-slate-500">ผู้ตรวจสอบ</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-6 mb-1"></div>
          <p className="text-slate-500">ผู้รับ</p>
        </div>
      </div>
    </div>
  )
}
