'use client'

import { LINEN_FORM_STATUS_CONFIG } from '@/types'
import type { LinenFormStatus } from '@/types'
import { ArrowRight, ArrowDown, CheckSquare, HelpCircle } from 'lucide-react'

const STATUS_ORDER: LinenFormStatus[] = ['draft', 'received', 'sorting', 'washing', 'packed', 'delivered', 'confirmed']

const STEP_DETAILS: Record<LinenFormStatus, { who: string; what: string; editCols: string; bagField: string }> = {
  draft:     { who: 'ลูกค้า', what: 'นับผ้าส่งซัก แยกประเภท + นับเคลม', editCols: 'ลูกค้านับผ้าส่งซัก, ลูกค้านับผ้าส่งเคลม, หมายเหตุ', bagField: 'จำนวนถุงกระสอบส่งซัก' },
  received:  { who: 'คนขับรถ / ขนส่ง', what: 'นับผ้ารับจากลูกค้า ตรวจจำนวน', editCols: 'โรงซักนับเข้า, หมายเหตุ', bagField: '-' },
  sorting:   { who: 'โรงซัก (แผนกรับเข้า)', what: 'คัดแยกผ้า เตรียมซัก', editCols: 'หมายเหตุ', bagField: '-' },
  washing:   { who: 'โรงซัก (แผนกซัก)', what: 'ซักอบผ้า → เสร็จแล้วกรอกจำนวนแพค', editCols: 'โรงซักแพคส่ง, หมายเหตุ', bagField: '-' },
  packed:    { who: 'โรงซัก (แผนกแพค)', what: 'แพคผ้าใส่ถุง นับจำนวนถุง', editCols: '-', bagField: 'จำนวนถุงแพคส่ง' },
  delivered: { who: 'คนขับรถ / ขนส่ง', what: 'ส่งผ้ากลับลูกค้า นับถุง ลูกค้านับผ้ากลับ', editCols: 'ลูกค้านับผ้ากลับ', bagField: 'จำนวนถุงแพคส่ง' },
  confirmed: { who: 'ลูกค้า', what: 'ลูกค้ารับผ้าคืนแล้ว ยืนยันจำนวน', editCols: '-', bagField: '-' },
}

const DEPT_CHECKBOXES = [
  { label: 'ผ้าเรียบเสร็จ', desc: 'ผ้าปูที่นอน ปลอกดูเว่ ฯลฯ ผ่านเครื่องรีดเรียบร้อย' },
  { label: 'ปลอกหมอนเสร็จ', desc: 'ปลอกหมอนรีดและพับเรียบร้อย' },
  { label: 'ผ้าขนเสร็จ', desc: 'ผ้าขนหนู ผ้าเช็ดตัว อบแห้งเรียบร้อย' },
  { label: 'สปาเสร็จ', desc: 'ผ้าสปา/ผ้าพิเศษ ซักอบเสร็จเรียบร้อย' },
]

const COL_EXPLAIN = [
  { name: 'ยกยอดมา (±)', desc: 'ยอดค้างจากรอบก่อน: ลบ = มีผ้าค้างอยู่, บวก = มีผ้าคืนค้าง', auto: true },
  { name: 'ลูกค้านับผ้าส่งซัก', desc: 'จำนวนผ้าที่ลูกค้านับส่งมาซัก', auto: false },
  { name: 'ลูกค้านับผ้าส่งเคลม', desc: 'จำนวนผ้าที่ลูกค้าแจ้งเคลม (ชำรุด/เสียหาย)', auto: false },
  { name: 'โรงซักนับเข้า', desc: 'จำนวนผ้าที่โรงซักนับรับเข้าจริง (อาจไม่ตรงกับลูกค้านับส่ง)', auto: false },
  { name: 'โรงซักแพคส่ง', desc: 'จำนวนผ้าที่โรงซักแพคส่งกลับลูกค้า', auto: false },
  { name: 'มีผ้าค้างอยู่(-)/มีผ้าคืนค้าง(+)', desc: 'แพคส่ง - นับเข้า: ลบ(แดง) = มีผ้าค้างอยู่, บวก(เขียว) = มีผ้าคืนค้าง', auto: true },
  { name: 'หมายเหตุ', desc: 'บันทึกเพิ่มเติม เช่น ผ้าชำรุด สีตก', auto: false },
  { name: 'ลูกค้านับผ้ากลับ', desc: 'จำนวนผ้าที่ลูกค้านับรับกลับ (auto-fill จากแพคส่ง, แก้ได้ ⚠ ถ้าไม่ตรง)', auto: false },
]

const FLOW_AFTER = [
  { step: 'สร้างใบส่งของ', desc: 'จากใบรับส่งผ้าที่สถานะ "นับแพคแล้ว" → สร้างใบส่งของชั่วคราว (SD)', from: 'ใบรับส่งผ้า (packed)' },
  { step: 'สร้างใบวางบิล', desc: 'จากใบส่งของที่ส่งแล้ว → สร้างใบวางบิล (WB) รายเดือน', from: 'ใบส่งของ' },
  { step: 'สร้างใบกำกับภาษี', desc: 'จากใบวางบิล → สร้างใบกำกับภาษี/ใบเสร็จ (IV)', from: 'ใบวางบิล' },
]

export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1B3A5C]">คู่มือการใช้งาน</h1>
        <p className="text-slate-500 mt-1">ขั้นตอนการทำงานตั้งแต่รับผ้าจนออกบิล</p>
      </div>

      {/* ===== Section 1: Status Flow ===== */}
      <section>
        <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 flex items-center gap-2">
          <ArrowRight className="w-5 h-5" />
          ขั้นตอนสถานะใบรับส่งผ้า (7 ขั้นตอน)
        </h2>
        <div className="space-y-3">
          {STATUS_ORDER.map((status, idx) => {
            const cfg = LINEN_FORM_STATUS_CONFIG[status]
            const detail = STEP_DETAILS[status]
            return (
              <div key={status}>
                <div className="border border-slate-200 rounded-lg p-4 bg-white">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: cfg.dotColor }}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-sm text-slate-500">— {detail.who}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{detail.what}</p>
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                        <span className="text-slate-500">
                          <span className="font-medium text-teal-700">กรอก:</span> {detail.editCols}
                        </span>
                        {detail.bagField !== '-' && (
                          <span className="text-slate-500">
                            <span className="font-medium text-indigo-700">ถุง:</span> {detail.bagField}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {idx < STATUS_ORDER.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ===== Section 2: Department Checkboxes ===== */}
      <section>
        <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 flex items-center gap-2">
          <CheckSquare className="w-5 h-5" />
          เช็คแผนก (ติ๊กได้หลังสถานะ "ซักอบเสร็จ")
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEPT_CHECKBOXES.map(d => (
            <div key={d.label} className="border border-slate-200 rounded-lg p-3 bg-white">
              <p className="font-medium text-slate-700 text-sm">☐ {d.label}</p>
              <p className="text-xs text-slate-500 mt-1">{d.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">* เช็คแผนกเป็นอิสระจากสถานะหลัก ติ๊กได้พร้อมกันหลายแผนก</p>
      </section>

      {/* ===== Section 3: Column Explanation ===== */}
      <section>
        <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5" />
          คำอธิบายคอลัมน์ในใบรับส่งผ้า
        </h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-2 font-medium text-slate-600 w-40">คอลัมน์</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">คำอธิบาย</th>
                <th className="text-center px-4 py-2 font-medium text-slate-600 w-20">ประเภท</th>
              </tr>
            </thead>
            <tbody>
              {COL_EXPLAIN.map(col => (
                <tr key={col.name} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-700">{col.name}</td>
                  <td className="px-4 py-2 text-slate-600">{col.desc}</td>
                  <td className="px-4 py-2 text-center">
                    {col.auto ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">อัตโนมัติ</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">กรอกเอง</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Section 4: Document Flow ===== */}
      <section>
        <h2 className="text-lg font-bold text-[#1B3A5C] mb-4 flex items-center gap-2">
          <ArrowRight className="w-5 h-5" />
          ขั้นตอนออกเอกสาร
        </h2>
        <div className="space-y-3">
          {FLOW_AFTER.map((f, idx) => (
            <div key={f.step}>
              <div className="border border-slate-200 rounded-lg p-4 bg-white flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1B3A5C] flex items-center justify-center text-white font-bold text-sm">
                  {idx + 1}
                </div>
                <div>
                  <p className="font-medium text-slate-700">{f.step}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{f.desc}</p>
                  <p className="text-xs text-slate-400 mt-1">สร้างจาก: {f.from}</p>
                </div>
              </div>
              {idx < FLOW_AFTER.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="w-4 h-4 text-slate-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== Section 5: Billing ===== */}
      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-sm font-bold text-[#1B3A5C] mb-2">สูตรคำนวณบิล</h2>
        <div className="space-y-1 text-sm text-slate-700">
          <p><span className="font-medium">ยอดก่อน VAT</span> = จำนวนผ้า × ราคาต่อชิ้น (ตามสัญญาลูกค้า)</p>
          <p><span className="font-medium">VAT 7%</span> = ยอดก่อน VAT × 0.07</p>
          <p><span className="font-medium">หัก ณ ที่จ่าย 3%</span> = ยอดก่อน VAT × 0.03</p>
          <p><span className="font-medium text-[#1B3A5C]">ยอดจ่ายสุทธิ</span> = ยอดก่อน VAT + VAT - หัก ณ ที่จ่าย</p>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 pb-8">
        FlowClean — ระบบบริหารโรงซักรีด
      </div>
    </div>
  )
}
