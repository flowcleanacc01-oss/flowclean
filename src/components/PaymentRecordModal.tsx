'use client'

import { useState, useEffect, useMemo } from 'react'
import { Wallet, AlertTriangle, Check } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '@/lib/store'
import { cn, todayISO, formatCurrency } from '@/lib/utils'
import type { BillingStatement, Customer } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  billing: BillingStatement
  customer: Customer
}

/**
 * Payment Record Modal (Feature 82)
 *
 * Workflow:
 * 1. User คลิก "ยังไม่ชำระ" ใน WB list/detail
 * 2. Modal เปิด — แสดงข้อมูล WB + form กรอก:
 *    - วันที่ชำระ (default = วันนี้)
 *    - ธนาคารที่รับ (จาก company.bankAccounts)
 *    - จำนวนเงินที่รับ (default = target amount)
 * 3. Validation:
 *    - target = netPayable (VAT+WHT) / grandTotal (VAT only) / subtotal (No VAT)
 *    - ถ้า paidAmount >= target → status='paid'
 *    - ถ้า paidAmount < target → status='sent' (ยังไม่ชำระ) + warning + ⚠ icon
 *    - บันทึกได้ทั้ง 2 กรณี (real-world: ลูกค้าโอนผิด)
 */
export default function PaymentRecordModal({ open, onClose, billing, customer }: Props) {
  const { updateBillingStatement, companyInfo } = useStore()

  // Calculate target amount
  const targetAmount = useMemo(() => {
    if (!customer.enableVat) return billing.subtotal      // No VAT
    if (customer.enableWithholding) return billing.netPayable  // VAT + WHT
    return billing.grandTotal                              // VAT only
  }, [customer, billing])

  const targetLabel = useMemo(() => {
    if (!customer.enableVat) return 'ยอดก่อน VAT (No VAT)'
    if (customer.enableWithholding) return 'ยอดสุทธิหลังหัก ณ ที่จ่าย'
    return 'ยอดรวม VAT'
  }, [customer])

  const [paidDate, setPaidDate] = useState(todayISO())
  const [paidBankId, setPaidBankId] = useState<string>('')
  const [paidAmount, setPaidAmount] = useState<number>(0)

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return
    setPaidDate(billing.paidDate || todayISO())
    setPaidAmount(billing.paidAmount > 0 ? billing.paidAmount : targetAmount)
    // Default bank: paid bank ที่เคยใช้ → customer's selected → company default
    const defaultBank = billing.paidBankId
      || customer.selectedBankAccountId
      || companyInfo.bankAccounts?.[0]?.id
      || ''
    setPaidBankId(defaultBank)
  }, [open, billing, customer, companyInfo, targetAmount])

  const isFullPayment = paidAmount >= targetAmount
  const shortfall = targetAmount - paidAmount
  const canSave = paidAmount > 0 && paidDate.length > 0

  const handleSave = () => {
    if (!canSave) return
    if (!isFullPayment) {
      if (!confirm(`⚠ ยอดชำระ ${formatCurrency(paidAmount)} น้อยกว่ายอดที่ต้องชำระ ${formatCurrency(targetAmount)}\n\nขาดอีก: ${formatCurrency(shortfall)}\n\nสถานะจะยังเป็น "ยังไม่ชำระ" — บันทึกต่อหรือไม่?`)) return
    }
    updateBillingStatement(billing.id, {
      paidDate,
      paidAmount,
      paidBankId,
      status: isFullPayment ? 'paid' : 'sent',
    })
    onClose()
  }

  const handleClearPayment = () => {
    if (!confirm('ยกเลิกการชำระเงิน — ลบข้อมูลทั้งหมดและตั้งสถานะเป็น "ยังไม่ชำระ"?')) return
    updateBillingStatement(billing.id, {
      paidDate: null,
      paidAmount: 0,
      paidBankId: '',
      status: 'sent',
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`💰 บันทึกการชำระเงิน — ${billing.billingNumber}`} size="lg">
      <div className="space-y-4">
        {/* Customer + Target info */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-sm">
            <span className="text-slate-500">ลูกค้า:</span>{' '}
            <span className="font-semibold text-slate-800">{customer.shortName || customer.name}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">{targetLabel}:</span>{' '}
            <span className="font-bold text-[#1B3A5C] text-lg">{formatCurrency(targetAmount)}</span>
          </p>
          <div className="text-xs text-slate-500">
            {customer.enableVat && (
              <>VAT: {formatCurrency(billing.vat)}</>
            )}
            {customer.enableVat && customer.enableWithholding && (
              <> | หัก ณ ที่จ่าย: -{formatCurrency(billing.withholdingTax)}</>
            )}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ชำระ</label>
          <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]" />
        </div>

        {/* Bank */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ธนาคารที่รับเงิน</label>
          {companyInfo.bankAccounts && companyInfo.bankAccounts.length > 0 ? (
            <select value={paidBankId} onChange={e => setPaidBankId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]">
              <option value="">— เลือกธนาคาร —</option>
              {companyInfo.bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bankName} | {b.accountName} | {b.accountNumber}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ ยังไม่มีบัญชีธนาคาร — เพิ่มที่ Settings → ข้อมูลบริษัท → ธนาคาร
            </div>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนเงินที่รับ</label>
          <input type="number" min={0} step={0.01} value={paidAmount}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
            className={cn('w-full px-3 py-2 border rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2',
              isFullPayment ? 'border-emerald-300 focus:ring-emerald-300 bg-emerald-50' : 'border-amber-300 focus:ring-amber-300 bg-amber-50')} />
          <div className="flex justify-between mt-1 text-xs">
            <span className="text-slate-500">ยอดที่ต้องชำระ: {formatCurrency(targetAmount)}</span>
            {!isFullPayment && shortfall > 0 && (
              <span className="text-amber-700 font-medium">ขาดอีก: {formatCurrency(shortfall)}</span>
            )}
            {isFullPayment && paidAmount > targetAmount && (
              <span className="text-blue-700 font-medium">เกิน: {formatCurrency(paidAmount - targetAmount)}</span>
            )}
          </div>
        </div>

        {/* Status preview */}
        <div className={cn('rounded-lg p-3 flex gap-2',
          isFullPayment ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200')}>
          {isFullPayment ? (
            <>
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="text-xs text-emerald-800">
                <p className="font-semibold">ชำระครบ</p>
                <p>สถานะจะเปลี่ยนเป็น "ชำระแล้ว" ✓</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <p className="font-semibold">ชำระไม่ครบ</p>
                <p>สถานะจะยังเป็น "ยังไม่ชำระ" + แสดง ⚠ ใน WB list (รับเงินบางส่วน)</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
          <div>
            {billing.paidAmount > 0 && (
              <button onClick={handleClearPayment}
                className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg">
                ยกเลิกการชำระ
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
            <button onClick={handleSave} disabled={!canSave}
              className="px-4 py-2 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:bg-slate-100 disabled:text-slate-400 font-semibold flex items-center gap-1.5">
              <Wallet className="w-4 h-4" />บันทึก
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
