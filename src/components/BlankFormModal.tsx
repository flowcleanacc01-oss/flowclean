'use client'

// 366.1 — Form Generator modal: เลือกลูกค้า → ฟอร์มเปล่าล้อ QT (ใบเช็คผ้า / ใบส่งรับผ้า) → พิมพ์
// extract จาก checklist page เพื่อใช้ซ้ำหลายหน้า (checklist + linen-forms) — discoverability
// "ข้อมูลต้นทางที่ดี" — ฟอร์มมีรหัส + คอลัมน์แยก → ลดภาระ AI scan + audit ตรง

import { useState } from 'react'
import Modal from '@/components/Modal'
import { useStore } from '@/lib/store'
import { getCustomerEnabledCodes } from '@/lib/customer-pricing'
import { todayISO } from '@/lib/utils'
import BlankLinenFormPrint from '@/components/BlankLinenFormPrint'
import BlankChecklistPrint from '@/components/BlankChecklistPrint'
import ExportButtons from '@/components/ExportButtons'

export default function BlankFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { customers, quotations, linenCatalog, companyInfo, getCustomer } = useStore()
  const [customerId, setCustomerId] = useState('')
  const [formType, setFormType] = useState<'checklist' | 'lf'>('checklist')

  const handleClose = () => { setCustomerId(''); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="พิมพ์ฟอร์มเปล่า (ใบเช็คผ้า / ใบส่งรับผ้า)" size="xl" className="print-target">
      <div className="space-y-4">
        {!customerId ? (
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">เลือกลูกค้า</label>
            <div className="grid gap-2">
              {customers.filter(c => c.isActive).map(c => {
                const codes = getCustomerEnabledCodes(c.id, quotations)
                return (
                  <button key={c.id} onClick={() => setCustomerId(c.id)}
                    className="text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="font-medium text-slate-800">{c.shortName || c.name}</span>
                    <span className="text-xs text-slate-500 ml-2">({codes.length} รายการ)</span>
                    {codes.length === 0 && <span className="text-xs text-amber-600 ml-2">⚠ ยังไม่มี QT</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4 no-print">
              <button onClick={() => setCustomerId('')}
                className="text-sm text-slate-500 hover:text-slate-700">← เลือกลูกค้าอื่น</button>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                  <button onClick={() => setFormType('checklist')}
                    className={formType === 'checklist' ? 'px-3 py-1.5 bg-[#1B3A5C] text-white' : 'px-3 py-1.5 text-slate-600 hover:bg-slate-50'}>ใบเช็คผ้า</button>
                  <button onClick={() => setFormType('lf')}
                    className={formType === 'lf' ? 'px-3 py-1.5 bg-[#1B3A5C] text-white' : 'px-3 py-1.5 text-slate-600 hover:bg-slate-50'}>ใบส่งรับผ้า</button>
                </div>
                <ExportButtons targetId={formType === 'lf' ? 'print-blank-lf' : 'print-blank-checklist'} filename={formType === 'lf' ? 'blank-lf' : 'blank-checklist'} showPrint={true} />
              </div>
            </div>
            {(() => {
              const cust = getCustomer(customerId)
              if (!cust) return null
              const codes = getCustomerEnabledCodes(cust.id, quotations)
              const items = linenCatalog.filter(i => codes.includes(i.code))
              if (items.length === 0) {
                return <div className="p-6 text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                  ⚠ ลูกค้านี้ยังไม่มี accepted QT — กรุณาสร้าง QT ก่อนพิมพ์ใบเช็ค
                </div>
              }
              return formType === 'lf'
                ? <BlankLinenFormPrint customer={cust} company={companyInfo} items={items} date={todayISO()} />
                : <BlankChecklistPrint customer={cust} company={companyInfo} items={items} date={todayISO()} />
            })()}
          </div>
        )}
      </div>
    </Modal>
  )
}
