'use client'

/**
 * 207 — Universal Add-Item Wizard
 *
 * 1 component, 4 entry points (items / qt / lf / sd)
 * 3 steps: ใส่ชื่อ → รายละเอียด → ยืนยัน
 *
 * Features:
 *  - Live similarity check (กัน duplicates) — Step 1
 *  - Auto-suggest code/category จากชื่อ — Step 2
 *  - "ใช่อันนี้แหละ" shortcut → use existing code (skip ต่อ)
 *  - Auto-add ตาม context: catalog (always) + QT + current doc
 */
import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { useStore } from '@/lib/store'
import {
  useSimilarItems, guessCategory, suggestNextCode, isCodeUnique,
} from '@/lib/use-similar-items'
import type { LinenItemDef, Quotation } from '@/types'
import {
  Sparkles, ArrowRight, ArrowLeft, Check, AlertTriangle,
  CheckCircle2, Wand2, Layers, ShoppingBag, ListPlus, Search,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

export type WizardContext = 'items' | 'qt' | 'lf' | 'sd'

export interface AddItemWizardResult {
  /** code ของรายการที่ใช้ — ทั้งกรณีเลือก existing หรือสร้างใหม่ */
  code: string
  /** ชื่อ — สำหรับใส่ลง row ปัจจุบัน */
  name: string
  /** ราคา — เฉพาะ context ที่มี customer (จาก QT/customer price ถ้ามี) */
  pricePerUnit?: number
  /** ผู้ใช้เลือก existing item ไม่ได้สร้างใหม่ */
  selectedExisting: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  /** เมื่อจบ wizard — return ผลลัพธ์ให้ parent ใส่ลง row */
  onComplete: (result: AddItemWizardResult) => void
  context: WizardContext
  /** Customer ID (null สำหรับ context='items') */
  customerId?: string | null
  /** เริ่มต้นด้วยชื่อที่พิมพ์ค้างไว้ (สำหรับ pre-fill) */
  initialName?: string
}

const CONTEXT_CONFIG: Record<WizardContext, { title: string; addToHere: string; icon: React.ReactNode }> = {
  items: { title: 'เพิ่มรายการใหม่ใน Catalog',                  addToHere: '',                                icon: <Layers className="w-5 h-5" /> },
  qt:    { title: 'เพิ่มรายการใหม่ใน QT',                       addToHere: 'ใบเสนอราคาที่กำลังแก้',           icon: <ListPlus className="w-5 h-5" /> },
  lf:    { title: 'เพิ่มผ้ารายการใหม่ — ขณะกรอกใบรับส่งผ้า',  addToHere: 'ใบรับส่งผ้าที่กำลังกรอก',         icon: <Sparkles className="w-5 h-5" /> },
  sd:    { title: 'เพิ่มรายการใหม่ — ขณะทำใบส่งของ',          addToHere: 'ใบส่งของที่กำลังทำ',              icon: <ShoppingBag className="w-5 h-5" /> },
}

export default function AddItemWizard({
  open, onClose, onComplete, context, customerId, initialName = '',
}: Props) {
  const {
    linenCatalog, addLinenItem, linenCategories,
    customers, quotations, updateQuotation,
    updateCustomer,
  } = useStore()

  // ───── Wizard state ─────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [nameInput, setNameInput] = useState(initialName)

  // Step 2 fields
  const [code, setCode] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [category, setCategory] = useState('other')
  const [unit, setUnit] = useState('ชิ้น')
  const [defaultPrice, setDefaultPrice] = useState(0)

  // QT add fields (sd/lf/qt context)
  const [addToQT, setAddToQT] = useState(true)
  const [customerPrice, setCustomerPrice] = useState(0)

  const [error, setError] = useState('')

  // Reset when modal opens
  useEffect(() => {
    if (!open) return
    setStep(1)
    setNameInput(initialName)
    setCode('')
    setNameEn('')
    setCategory('other')
    setUnit('ชิ้น')
    setDefaultPrice(0)
    setAddToQT(context !== 'items')
    setCustomerPrice(0)
    setError('')
  }, [open, initialName, context])

  // Customer + active QT (most recent accepted/sent QT for this customer)
  const customer = useMemo(
    () => customerId ? customers.find(c => c.id === customerId) : null,
    [customerId, customers]
  )
  const activeQT: Quotation | null = useMemo(() => {
    if (!customerId) return null
    const list = quotations
      .filter(q => q.customerId === customerId && (q.status === 'accepted' || q.status === 'sent'))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return list[0] || null
  }, [customerId, quotations])

  // ───── Step 1: similarity ───────────────────────────────
  const matches = useSimilarItems(nameInput, linenCatalog, 5)
  const hasExactMatch = matches.length > 0 && matches[0].score >= 90

  // ───── Auto-derive Step 2 defaults from Step 1 ──────────
  const goToStep2 = () => {
    const cat = guessCategory(nameInput)
    setCategory(cat)
    setCode(suggestNextCode(linenCatalog, cat))
    setStep(2)
    setError('')
  }

  // ───── Validation ───────────────────────────────────────
  const validateStep2 = (): string => {
    if (!nameInput.trim()) return 'กรุณาใส่ชื่อรายการ'
    if (!code.trim()) return 'กรุณาใส่รหัส'
    if (!isCodeUnique(code, linenCatalog)) return `รหัส "${code}" มีอยู่แล้วใน catalog`
    if (!unit.trim()) return 'กรุณาใส่หน่วย'
    if (defaultPrice < 0) return 'ราคาต้องไม่ติดลบ'
    if (addToQT && customerPrice < 0) return 'ราคาลูกค้าต้องไม่ติดลบ'
    return ''
  }

  // ───── Final: apply ──────────────────────────────────────
  const handleSelectExisting = (item: LinenItemDef, reason: string) => {
    void reason
    // Get price for this customer if QT exists
    let priceForCustomer = item.defaultPrice
    if (activeQT) {
      const qtRow = activeQT.items.find(it => it.code === item.code)
      if (qtRow) priceForCustomer = qtRow.pricePerUnit
    }
    onComplete({
      code: item.code,
      name: item.name,
      pricePerUnit: priceForCustomer,
      selectedExisting: true,
    })
    onClose()
  }

  const handleConfirm = () => {
    const err = validateStep2()
    if (err) { setError(err); setStep(2); return }

    // 1. Add to catalog
    const newItem: LinenItemDef = {
      code: code.trim().toUpperCase(),
      name: nameInput.trim(),
      nameEn: nameEn.trim(),
      category,
      unit: unit.trim(),
      defaultPrice,
      sortOrder: linenCatalog.length + 1,
    }
    addLinenItem(newItem)

    // 2. Add to active QT (if context allows)
    if (addToQT && activeQT && customerId) {
      const newRow = {
        code: newItem.code,
        name: newItem.name,
        pricePerUnit: customerPrice || defaultPrice,
      }
      const exists = activeQT.items.some(it => it.code === newItem.code)
      if (!exists) {
        updateQuotation(activeQT.id, { items: [...activeQT.items, newRow] })
      }
      // Add to customer enabledItems + priceList (legacy compat)
      if (customer) {
        const enabled = customer.enabledItems.includes(newItem.code)
          ? customer.enabledItems
          : [...customer.enabledItems, newItem.code]
        const pl = customer.priceList.some(p => p.code === newItem.code)
          ? customer.priceList
          : [...customer.priceList, { code: newItem.code, price: customerPrice || defaultPrice }]
        updateCustomer(customer.id, { enabledItems: enabled, priceList: pl })
      }
    }

    // 3. Return result for parent to add to current doc
    onComplete({
      code: newItem.code,
      name: newItem.name,
      pricePerUnit: addToQT ? (customerPrice || defaultPrice) : defaultPrice,
      selectedExisting: false,
    })
    onClose()
  }

  // ───── Render ───────────────────────────────────────────
  const cfg = CONTEXT_CONFIG[context]

  return (
    <Modal open={open} onClose={onClose} title={cfg.title} size="lg" closeLabel="cancel">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-5">
        {[1, 2, 3].map(n => (
          <div key={n} className="flex items-center">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
              step >= n ? 'bg-[#3DD8D8] text-[#1B3A5C]' : 'bg-slate-100 text-slate-400'
            )}>
              {step > n ? <Check className="w-3.5 h-3.5" /> : n}
            </div>
            {n < 3 && (
              <div className={cn('w-12 h-0.5 mx-1', step > n ? 'bg-[#3DD8D8]' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      {/* ━━━━━━━━━━━━━ STEP 1: ชื่อ + similarity ━━━━━━━━━━━━━ */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Wand2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <div className="font-semibold mb-0.5">ใส่ชื่อรายการที่อยากเพิ่ม</div>
              <p className="text-xs text-blue-700">ระบบจะตรวจหา catalog ที่ใกล้เคียง — ถ้าเจอตรงกัน เลือกอันนั้นได้เลย ไม่ต้องเพิ่มใหม่</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">ชื่อรายการ (ภาษาไทย)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && nameInput.trim()) {
                    e.preventDefault()
                    if (!hasExactMatch) goToStep2()
                  }
                }}
                placeholder="เช่น ผ้าเช็ดตัว 27x54 สีขาว"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none"
              />
            </div>
          </div>

          {/* Similarity matches */}
          {matches.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                {hasExactMatch ? 'ใช่อันนี้ใช่มั้ย?' : 'พบรายการคล้ายใน catalog'}
              </div>
              <div className="space-y-1.5">
                {matches.map(m => (
                  <button
                    key={m.item.code}
                    onClick={() => handleSelectExisting(m.item, m.reason)}
                    className={cn(
                      'w-full text-left p-2.5 rounded-lg border-2 transition-colors group',
                      m.score >= 90
                        ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                        : 'border-slate-200 hover:border-[#3DD8D8] hover:bg-[#3DD8D8]/5'
                    )}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">{m.item.code}</span>
                          <span className="text-sm text-slate-800 font-medium truncate">{m.item.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {m.reason} · ราคา default {formatCurrency(m.item.defaultPrice)} · {m.item.unit}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                          m.score >= 90 ? 'bg-emerald-200 text-emerald-800' :
                          m.score >= 70 ? 'bg-amber-200 text-amber-800' :
                                          'bg-slate-200 text-slate-700'
                        )}>{m.score}%</span>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#1B3A5C]" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              ยกเลิก
            </button>
            <button
              onClick={goToStep2}
              disabled={!nameInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg text-sm font-medium hover:bg-[#122740] disabled:opacity-40 disabled:cursor-not-allowed">
              {hasExactMatch ? 'ไม่ใช่ ขอเพิ่มใหม่' : 'ถัดไป'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━ STEP 2: รายละเอียด ━━━━━━━━━━━━━ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <Layers className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <div className="font-semibold mb-0.5">รายละเอียดรายการใหม่</div>
              <p className="text-xs text-amber-800">ระบบ suggest รหัส + หมวดให้ — แก้ไขได้ตามต้องการ</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">ชื่อรายการ (ไทย) *</label>
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">รหัส *</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="เช่น T05"
                className={cn(
                  'w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                  code && !isCodeUnique(code, linenCatalog)
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-300'
                )}
              />
              {code && !isCodeUnique(code, linenCatalog) && (
                <p className="text-[11px] text-red-600 mt-0.5">รหัสนี้มีอยู่แล้ว</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">ชื่อ EN (optional)</label>
              <input
                type="text"
                value={nameEn}
                onChange={e => setNameEn(e.target.value)}
                placeholder="เช่น Bath Towel 27x54"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">หมวด *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-white"
              >
                {linenCategories.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">หน่วย *</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none bg-white"
              >
                <option value="ผืน">ผืน</option>
                <option value="ใบ">ใบ</option>
                <option value="ตัว">ตัว</option>
                <option value="คู่">คู่</option>
                <option value="ชิ้น">ชิ้น</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">ราคา default (บาท/{unit})</label>
              <input
                type="number"
                value={defaultPrice}
                onChange={e => setDefaultPrice(Number(e.target.value) || 0)}
                min={0}
                step={0.5}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
              />
            </div>
          </div>

          {/* QT integration (เฉพาะ context ที่มี customer) */}
          {context !== 'items' && customer && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addToQT}
                  onChange={e => setAddToQT(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-900">
                    เพิ่มใน QT ของลูกค้า "{customer.shortName}" ด้วย
                  </div>
                  <p className="text-[11px] text-blue-700">
                    {activeQT
                      ? `→ QT ${activeQT.quotationNumber} (${activeQT.status})`
                      : '⚠️ ยังไม่มี QT active — จะ skip'}
                  </p>
                </div>
              </label>
              {addToQT && activeQT && (
                <div>
                  <label className="text-xs font-medium text-blue-900 block mb-1">ราคาสำหรับลูกค้านี้</label>
                  <input
                    type="number"
                    value={customerPrice || defaultPrice}
                    onChange={e => setCustomerPrice(Number(e.target.value) || 0)}
                    min={0}
                    step={0.5}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm text-right bg-white focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />{error}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button onClick={() => setStep(1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-4 h-4" />ย้อนกลับ
            </button>
            <button
              onClick={() => {
                const err = validateStep2()
                if (err) { setError(err); return }
                setError('')
                setStep(3)
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg text-sm font-medium hover:bg-[#122740]">
              ตรวจสอบ<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━ STEP 3: ยืนยัน ━━━━━━━━━━━━━ */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <div className="font-semibold mb-0.5">ยืนยันก่อนเพิ่ม</div>
              <p className="text-xs text-emerald-800">ตรวจสอบข้อมูลให้ถูกต้อง ก่อนกดยืนยัน</p>
            </div>
          </div>

          {/* Preview card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">รายการใหม่</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-500">รหัส:</span> <span className="font-mono font-semibold">{code}</span></div>
              <div><span className="text-slate-500">หมวด:</span> {linenCategories.find(c => c.key === category)?.label || category}</div>
              <div className="col-span-2"><span className="text-slate-500">ชื่อ:</span> <span className="font-medium">{nameInput}</span>
                {nameEn && <span className="text-slate-400 ml-1">/ {nameEn}</span>}
              </div>
              <div><span className="text-slate-500">หน่วย:</span> {unit}</div>
              <div><span className="text-slate-500">ราคา default:</span> {formatCurrency(defaultPrice)}</div>
            </div>
          </div>

          {/* Where it will be added */}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-2">📍 จะเพิ่มที่ไหนบ้าง</div>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span><strong>Catalog</strong> — รายการกลางของระบบ</span>
              </li>
              {context !== 'items' && customer && addToQT && activeQT && (
                <li className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span><strong>QT {activeQT.quotationNumber}</strong> ของลูกค้า "{customer.shortName}" — ราคา {formatCurrency(customerPrice || defaultPrice)}</span>
                </li>
              )}
              {cfg.addToHere && (
                <li className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span><strong>{cfg.addToHere}</strong> — row ใหม่</span>
                </li>
              )}
            </ul>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button onClick={() => setStep(2)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-4 h-4" />แก้ไข
            </button>
            <button
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700">
              <Check className="w-4 h-4" />ยืนยันเพิ่ม
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
