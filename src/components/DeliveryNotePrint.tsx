'use client'

import { formatDate } from '@/lib/utils'
import type { DeliveryNote, Customer, CompanyInfo, LinenItemDef } from '@/types'

interface DeliveryNotePrintProps {
  note: DeliveryNote
  customer: Customer
  company: CompanyInfo
  catalog: LinenItemDef[]
}

export default function DeliveryNotePrint({ note, customer, company, catalog }: DeliveryNotePrintProps) {
  const itemNameMap = Object.fromEntries(catalog.map(i => [i.code, i.name]))
  const totalItems = note.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="bg-white p-8 max-w-[210mm] mx-auto text-sm print:p-0 print:shadow-none" id="print-delivery">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 border-b border-slate-300 pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A5C]">{company.name}</h1>
          <p className="text-xs text-slate-500">{company.nameEn}</p>
          <p className="text-xs text-slate-500 mt-1">{company.address}</p>
          <p className="text-xs text-slate-500">โทร: {company.phone}</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-[#1B3A5C]">ใบส่งของชั่วคราว</h2>
          <p className="text-xs text-slate-500">Delivery Note</p>
          <p className="font-mono text-sm font-medium mt-2">{note.noteNumber}</p>
          <p className="text-xs text-slate-500">วันที่: {formatDate(note.date)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
        <div>
          <p className="text-slate-500">ลูกค้า:</p>
          <p className="font-medium text-slate-800">{customer.name}</p>
          <p className="text-slate-500">{customer.address}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-500">คนขับ: <span className="text-slate-800">{note.driverName || '-'}</span></p>
          <p className="text-slate-500">ทะเบียน: <span className="text-slate-800">{note.vehiclePlate || '-'}</span></p>
          <p className="text-slate-500">ผู้รับ: <span className="text-slate-800">{note.receiverName || '-'}</span></p>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100">
            <th className="text-center px-3 py-2 border border-slate-300 w-12">ลำดับ</th>
            <th className="text-left px-3 py-2 border border-slate-300 w-16">รหัส</th>
            <th className="text-left px-3 py-2 border border-slate-300">รายการ</th>
            <th className="text-right px-3 py-2 border border-slate-300 w-20">จำนวน</th>
          </tr>
        </thead>
        <tbody>
          {note.items.map((item, idx) => (
            <tr key={`${item.code}-${idx}`}>
              <td className="text-center px-3 py-1.5 border border-slate-300">{idx + 1}</td>
              <td className="px-3 py-1.5 border border-slate-300 font-mono text-xs">{item.code}</td>
              <td className="px-3 py-1.5 border border-slate-300">
                {itemNameMap[item.code] || item.code}
                {item.isClaim && <span className="ml-1 text-xs text-orange-600">(เคลม)</span>}
              </td>
              <td className="text-right px-3 py-1.5 border border-slate-300">{item.quantity}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-medium">
            <td colSpan={3} className="text-right px-3 py-2 border border-slate-300">รวมทั้งหมด</td>
            <td className="text-right px-3 py-2 border border-slate-300">{totalItems}</td>
          </tr>
        </tbody>
      </table>

      {/* Notes */}
      {note.notes && (
        <div className="mt-4 text-xs text-slate-600">
          <p className="font-medium">หมายเหตุ: {note.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 mt-12 text-xs text-center">
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้ส่ง</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้ขนส่ง</p>
        </div>
        <div>
          <div className="border-b border-slate-300 pb-8 mb-2"></div>
          <p className="text-slate-500">ผู้รับ</p>
        </div>
      </div>
    </div>
  )
}
