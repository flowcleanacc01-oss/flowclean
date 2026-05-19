'use client'

/**
 * 207 — Universal Add-Item Wizard
 * 247 — Phase 1.4 Wizard 2.0 (faceted picker) added — toggle with classic free-text
 *
 * 1 component, 4 entry points (items / qt / lf / sd)
 *
 * Mode: 'faceted' (default, Wizard 2.0) | 'free_text' (Wizard 1.0 backward compat)
 *
 * Faceted mode (Wizard 2.0):
 *  - Step 1: Type picker (33 types in 5 groups)
 *  - Step 2: Per-type facet pickers (application/size/color/treatment/...)
 *  - Step 3: Preview generated code+name + dup check via facetKey
 *
 * Free-text mode (Wizard 1.0 — legacy):
 *  - Step 1: ใส่ชื่อ + similarity check
 *  - Step 2: รายละเอียด (code/category/name)
 *  - Step 3: ยืนยัน
 */
import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { useStore } from '@/lib/store'
import {
  useSimilarItems, guessCategory, suggestNextCode, isCodeUnique,
} from '@/lib/use-similar-items'
import type { LinenItemDef, LinenFacets, Quotation } from '@/types'
import {
  Sparkles, ArrowRight, ArrowLeft, Check, AlertTriangle,
  CheckCircle2, Wand2, Layers, ShoppingBag, ListPlus, Search, Tags,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { blockNumberArrowKeys } from '@/lib/modal-nav'
import { getCodeReferences, detectConflict } from '@/lib/code-reference-check'
import CodeConflictWarning from '@/components/CodeConflictWarning'
import {
  type FacetVocab,
  getApplicationsFromVocab, getSizePresetsFromVocab,
} from '@/lib/linen-vocabulary'
import { generateCodeFromFacets, generateNameFromFacets, buildFacetKey, findItemByFacetKey } from '@/lib/facet-generators'

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
    linenForms, deliveryNotes,
    facetVocab, // 255 Phase 1.b
  } = useStore()

  // ───── Mode toggle (247) ────────────────────────────────
  // 304: default = Wizard 1.0 (free_text) ตามคำสั่งติ๊ด — toggle ไป 2.0 ได้ภายใน UI
  const [mode, setMode] = useState<'faceted' | 'free_text'>('free_text')

  // ───── Wizard state (shared) ────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [nameInput, setNameInput] = useState(initialName)

  // Step 2 fields (free-text mode + shared price/QT)
  const [code, setCode] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [category, setCategory] = useState('other')
  const [unit, setUnit] = useState('ชิ้น')
  const [defaultPrice, setDefaultPrice] = useState(0)

  // ───── Faceted mode state (247) ─────────────────────────
  const [facets, setFacets] = useState<LinenFacets>({ type: '' })
  const [customSize, setCustomSize] = useState('')

  // QT add fields (sd/lf/qt context)
  const [addToQT, setAddToQT] = useState(true)
  const [customerPrice, setCustomerPrice] = useState(0)

  const [error, setError] = useState('')

  // Reset when modal opens
  useEffect(() => {
    if (!open) return
    setMode('free_text')  // 304: default = Wizard 1.0
    setStep(1)
    setNameInput(initialName)
    setCode('')
    setNameEn('')
    setCategory('other')
    setUnit('ชิ้น')
    setDefaultPrice(0)
    setFacets({ type: '' })
    setCustomSize('')
    setAddToQT(context !== 'items')
    setCustomerPrice(0)
    setError('')
  }, [open, initialName, context])

  // ───── Faceted derived (247) ────────────────────────────
  // 256: pass store-loaded vocab → admin edits propagate to new code/name generation
  const facetCode = useMemo(() => generateCodeFromFacets(facets, facetVocab), [facets, facetVocab])
  const facetName = useMemo(() => generateNameFromFacets(facets, 'th', facetVocab), [facets, facetVocab])
  const facetNameEn = useMemo(() => generateNameFromFacets(facets, 'en', facetVocab), [facets, facetVocab])
  const facetKey = useMemo(() => buildFacetKey(facets), [facets])
  const facetDup = useMemo(
    () => findItemByFacetKey(linenCatalog, facets),
    [linenCatalog, facets],
  )
  const codeUnique = useMemo(
    () => !facetCode || isCodeUnique(facetCode, linenCatalog),
    [facetCode, linenCatalog],
  )

  // Customer + active QT
  const customer = useMemo(
    () => customerId ? customers.find(c => c.id === customerId) : null,
    [customerId, customers]
  )
  // 208.3: เคารพ gate "QT ต้อง accepted ก่อน LF/SD จะเห็นรายการ"
  // ค้น QT เฉพาะ context lf/sd (qt context จัดการเอง ผ่าน parent setQuItems)
  const activeQT: Quotation | null = useMemo(() => {
    if (!customerId) return null
    if (context !== 'lf' && context !== 'sd') return null
    const list = quotations
      .filter(q => q.customerId === customerId && q.status === 'accepted')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return list[0] || null
  }, [customerId, quotations, context])
  // 208.3: ถ้า lf/sd แต่ไม่มี accepted QT → blocker
  const noAcceptedQT = (context === 'lf' || context === 'sd') && !activeQT

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
    let priceForCustomer = item.defaultPrice
    // 208.3 + 209: เฉพาะ lf/sd context — push เข้า accepted QT ถ้ายังไม่มี
    // qt/items context ปล่อยให้ parent (setQuItems) จัดการเอง
    if (activeQT) {
      const qtRow = activeQT.items.find(it => it.code === item.code)
      if (qtRow) {
        priceForCustomer = qtRow.pricePerUnit
      } else if (context === 'lf' || context === 'sd') {
        const newRow = {
          code: item.code,
          name: item.name,
          pricePerUnit: item.defaultPrice,
        }
        updateQuotation(activeQT.id, { items: [...activeQT.items, newRow] })
      }
    }
    onComplete({
      code: item.code,
      name: item.name,
      pricePerUnit: priceForCustomer,
      selectedExisting: true,
    })
    onClose()
  }

  // ───── Faceted: confirm + commit (247) ──────────────────
  const handleFacetConfirm = () => {
    if (!facets.type) { setError('กรุณาเลือกประเภทผ้า'); setStep(1); return }
    if (!facetCode) { setError('โปรดเลือก facets ให้ครบ'); return }
    if (facetDup) {
      setError(`มีรายการที่ facets เหมือนกันใน catalog: ${facetDup.code} - ${facetDup.name}`)
      return
    }
    if (!codeUnique) {
      setError(`รหัส "${facetCode}" ซ้ำใน catalog — ปรับ variant หรือเลือก facet ที่ต่างกัน`)
      return
    }
    if (defaultPrice < 0) { setError('ราคาต้องไม่ติดลบ'); return }

    const newItem: LinenItemDef = {
      code: facetCode,
      name: facetName,
      nameEn: facetNameEn,
      category: facets.type, // type คือ category (vocab-aligned)
      unit: unit || 'ผืน',
      defaultPrice,
      sortOrder: linenCatalog.length + 1,
      facets,
      facetKey,
    }
    addLinenItem(newItem)

    // QT integration (เหมือน free-text mode)
    if ((context === 'lf' || context === 'sd') && addToQT && activeQT && customerId) {
      const newRow = {
        code: newItem.code,
        name: newItem.name,
        pricePerUnit: customerPrice || defaultPrice,
      }
      const exists = activeQT.items.some(it => it.code === newItem.code)
      if (!exists) updateQuotation(activeQT.id, { items: [...activeQT.items, newRow] })
    }

    onComplete({
      code: newItem.code,
      name: newItem.name,
      pricePerUnit: addToQT ? (customerPrice || defaultPrice) : defaultPrice,
      selectedExisting: false,
    })
    onClose()
  }

  /** Faceted: "ใช้รายการที่มีอยู่แล้ว" — ผู้ใช้เห็น dup → ใช้ existing item */
  const handleFacetUseDup = () => {
    if (!facetDup) return
    handleSelectExisting(facetDup, `Same facetKey: ${facetKey}`)
  }

  const handleConfirm = () => {
    const err = validateStep2()
    if (err) { setError(err); setStep(2); return }

    // 1. Add to catalog (always, permanent)
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

    // 2. Add to active QT — เฉพาะ lf/sd context (live-write)
    //    qt context: parent's onComplete handles via setQuItems (form state)
    //    208.3: ลบ legacy customer.enabledItems + priceList write (QT = single source of truth)
    if ((context === 'lf' || context === 'sd') && addToQT && activeQT && customerId) {
      const newRow = {
        code: newItem.code,
        name: newItem.name,
        pricePerUnit: customerPrice || defaultPrice,
      }
      const exists = activeQT.items.some(it => it.code === newItem.code)
      if (!exists) {
        updateQuotation(activeQT.id, { items: [...activeQT.items, newRow] })
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
      {/* 247 — Mode toggle: Wizard 2.0 (facet) vs Wizard 1.0 (free-text) */}
      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          <button
            type="button"
            onClick={() => { setMode('faceted'); setStep(1); setError('') }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              mode === 'faceted' ? 'bg-[#1B3A5C] text-white shadow-sm' : 'text-slate-600 hover:bg-white',
            )}
          >
            <Tags className="w-3.5 h-3.5" />
            Wizard 2.0 — Facet picker
          </button>
          <button
            type="button"
            onClick={() => { setMode('free_text'); setStep(1); setError('') }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              mode === 'free_text' ? 'bg-[#1B3A5C] text-white shadow-sm' : 'text-slate-600 hover:bg-white',
            )}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Wizard 1.0 — Free-text
          </button>
        </div>
      </div>

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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* FACETED MODE (Wizard 2.0) — 247                  */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mode === 'faceted' && step === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Tags className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <div className="font-semibold mb-0.5">เลือกประเภทผ้า</div>
              <p className="text-xs text-blue-700">เลือก type หลัก — facets อื่นๆ จะเปิดให้เลือกใน step ถัดไป</p>
            </div>
          </div>

          {noAcceptedQT && (
            <div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-lg p-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <div className="font-semibold mb-1">ลูกค้านี้ยังไม่มี QT ที่ "ตกลง"</div>
                <p className="text-xs text-red-800 leading-relaxed">
                  สร้าง QT + accept ก่อนเพิ่มรายการใน LF/SD
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {facetVocab.groups.map(g => (
              <div key={g.key}>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{g.labelTh}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {g.typeKeys.map(t => {
                    const opt = facetVocab.types.find(o => o.value === t)
                    if (!opt) return null
                    const selected = facets.type === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setFacets({ type: t }); setError('') }}
                        disabled={noAcceptedQT}
                        className={cn(
                          'text-left px-3 py-2 rounded-lg border-2 text-xs font-medium transition-colors disabled:opacity-40',
                          selected
                            ? 'border-[#3DD8D8] bg-[#3DD8D8]/10 text-[#1B3A5C]'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-[#3DD8D8]/50',
                        )}
                      >
                        {opt.labelTh}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
            <button
              onClick={() => { setStep(2); setError('') }}
              disabled={!facets.type || noAcceptedQT}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg text-sm font-medium hover:bg-[#122740] disabled:opacity-40 disabled:cursor-not-allowed">
              ถัดไป<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {mode === 'faceted' && step === 2 && (
        <FacetedFacetsStep
          vocab={facetVocab}
          facets={facets}
          setFacets={setFacets}
          customSize={customSize}
          setCustomSize={setCustomSize}
          facetCode={facetCode}
          facetName={facetName}
          facetDup={facetDup}
          codeUnique={codeUnique}
          onBack={() => setStep(1)}
          onNext={() => {
            if (!facetCode) { setError('โปรดเลือก facets ขั้นต่ำ (type + อย่างน้อย 1 facet)'); return }
            setError('')
            setStep(3)
          }}
          error={error}
        />
      )}

      {mode === 'faceted' && step === 3 && (
        <FacetedConfirmStep
          vocab={facetVocab}
          facets={facets}
          facetCode={facetCode}
          facetName={facetName}
          facetNameEn={facetNameEn}
          facetDup={facetDup}
          unit={unit}
          setUnit={setUnit}
          defaultPrice={defaultPrice}
          setDefaultPrice={setDefaultPrice}
          context={context}
          customer={customer}
          activeQT={activeQT}
          addToQT={addToQT}
          setAddToQT={setAddToQT}
          customerPrice={customerPrice}
          setCustomerPrice={setCustomerPrice}
          onBack={() => setStep(2)}
          onConfirm={handleFacetConfirm}
          onUseDup={handleFacetUseDup}
          error={error}
        />
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* FREE-TEXT MODE (Wizard 1.0) — เดิม              */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

      {/* ━━━━━━━━━━━━━ STEP 1: ชื่อ + similarity ━━━━━━━━━━━━━ */}
      {mode === 'free_text' && step === 1 && (
        <div className="space-y-4">
          {/* 208.3: blocker เมื่อไม่มี accepted QT (lf/sd context) */}
          {noAcceptedQT && (
            <div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-lg p-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <div className="font-semibold mb-1">ลูกค้านี้ยังไม่มี QT ที่ "ตกลง"</div>
                <p className="text-xs text-red-800 leading-relaxed">
                  การเพิ่มรายการต้องผ่าน QT ที่ accepted ก่อน — เพื่อล็อคราคา + รักษา audit trail<br />
                  <strong>วิธีแก้</strong>: สร้าง QT ใหม่ → ใส่รายการ → กดเปลี่ยนสถานะเป็น "ตกลง" ก่อนเริ่มทำ LF/SD
                </p>
              </div>
            </div>
          )}
          <div className={cn(
            'flex items-start gap-3 border rounded-lg p-3',
            noAcceptedQT ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-blue-50 border-blue-200'
          )}>
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
                  if (e.key === 'Enter' && nameInput.trim() && !noAcceptedQT) {
                    e.preventDefault()
                    if (!hasExactMatch) goToStep2()
                  }
                }}
                placeholder="เช่น ผ้าเช็ดตัว 27x54 สีขาว"
                autoFocus
                disabled={noAcceptedQT}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                    disabled={noAcceptedQT}
                    className={cn(
                      'w-full text-left p-2.5 rounded-lg border-2 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed',
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
              disabled={!nameInput.trim() || noAcceptedQT}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg text-sm font-medium hover:bg-[#122740] disabled:opacity-40 disabled:cursor-not-allowed">
              {hasExactMatch ? 'ไม่ใช่ ขอเพิ่มใหม่' : 'ถัดไป'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━ STEP 2: รายละเอียด ━━━━━━━━━━━━━ */}
      {mode === 'free_text' && step === 2 && (
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
              {/* 232: Code reuse conflict warning */}
              {code && isCodeUnique(code, linenCatalog) && (() => {
                const refs = getCodeReferences(code, { quotations, linenForms, deliveryNotes, customers })
                const conflict = detectConflict(refs, nameInput)
                if (conflict === 'no_refs') return null
                return (
                  <div className="mt-2">
                    <CodeConflictWarning code={code} plannedName={nameInput} refs={refs} conflict={conflict} compact />
                  </div>
                )
              })()}
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
                onKeyDown={blockNumberArrowKeys}
                onFocus={e => e.currentTarget.select()}
                min={0}
                step={0.5}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
              />
            </div>
          </div>

          {/* QT integration — เฉพาะ lf/sd (qt จัดการเองใน parent) */}
          {(context === 'lf' || context === 'sd') && customer && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addToQT}
                  onChange={e => setAddToQT(e.target.checked)}
                  className="mt-0.5 rounded"
                  disabled={!activeQT}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-900">
                    เพิ่มใน QT ของลูกค้า "{customer.shortName}" ด้วย
                  </div>
                  <p className="text-[11px] text-blue-700">
                    {activeQT
                      ? `→ QT ${activeQT.quotationNumber} (accepted)`
                      : '⚠️ ยังไม่มี QT ที่ accepted — รายการจะไม่ปรากฏใน LF/SD'}
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
                    onKeyDown={blockNumberArrowKeys}
                    onFocus={e => e.currentTarget.select()}
                    min={0}
                    step={0.5}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm text-right bg-white focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
          {/* QT context note */}
          {context === 'qt' && customer && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800">
              <Wand2 className="w-3.5 h-3.5 inline-block mr-1 text-blue-600" />
              รายการนี้จะถูก<strong>เพิ่มเข้า form QT</strong>ที่กำลังแก้ — กด "บันทึก" ใน QT เพื่อยืนยัน
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
      {mode === 'free_text' && step === 3 && (
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
              {(context === 'lf' || context === 'sd') && customer && addToQT && activeQT && (
                <li className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span><strong>QT {activeQT.quotationNumber}</strong> ของลูกค้า "{customer.shortName}" — ราคา {formatCurrency(customerPrice || defaultPrice)}</span>
                </li>
              )}
              {context === 'qt' && customer && (
                <li className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span><strong>QT row (form)</strong> ของลูกค้า "{customer.shortName}" — เพิ่มเข้า form ที่กำลังแก้</span>
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

          {/* 208.1: Persistence banner — อธิบายว่าอันไหน "บันทึกถาวรทันที" vs "รอ save" */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs">
            <div className="font-semibold text-yellow-900 mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
              การบันทึกของแต่ละส่วน
            </div>
            <ul className="space-y-1 text-yellow-900 leading-relaxed">
              <li>📦 <strong>Catalog</strong>: บันทึกถาวรทันทีหลังกดยืนยัน — ใช้ Hygiene Center → Undo ถ้าต้องการคืน</li>
              {(context === 'lf' || context === 'sd') && activeQT && addToQT && (
                <li>📋 <strong>QT {activeQT.quotationNumber}</strong>: บันทึกทันที (live-write) — Undo ผ่าน Hygiene Center</li>
              )}
              {context === 'qt' && (
                <li>📋 <strong>QT row</strong>: เพิ่มเข้า form ที่กำลังแก้เท่านั้น — ต้องกด <strong>"บันทึก"</strong> ใน QT จึงจะเก็บลงระบบจริง · กด <strong>"ยกเลิก"</strong> = revert เฉพาะ QT (catalog ยังคงอยู่)</li>
              )}
              {cfg.addToHere && context !== 'qt' && (
                <li>📄 <strong>{cfg.addToHere}</strong>: บันทึกทันที (live-edit)</li>
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

// ════════════════════════════════════════════════════════════════
// 247 — Faceted Wizard helper components
// ════════════════════════════════════════════════════════════════

interface FacetPickerProps {
  label: string
  value: string | null | undefined
  options: { value: string; labelTh: string; labelEn: string; codeShort: string }[]
  onChange: (v: string | null) => void
  required?: boolean
  hint?: string
}

function FacetPicker({ label, value, options, onChange, required, hint }: FacetPickerProps) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
        {hint && <span className="text-[10px] text-slate-400 ml-1">{hint}</span>}
      </label>
      <div className="flex flex-wrap gap-1">
        {options.map(o => {
          const selected = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(selected ? null : o.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                selected
                  ? 'bg-[#3DD8D8]/15 border-[#3DD8D8] text-[#1B3A5C] font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#3DD8D8]/50',
              )}
            >
              {o.labelTh}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface FacetedFacetsStepProps {
  vocab: FacetVocab
  facets: LinenFacets
  setFacets: (f: LinenFacets) => void
  customSize: string
  setCustomSize: (s: string) => void
  facetCode: string
  facetName: string
  facetDup: LinenItemDef | null
  codeUnique: boolean
  onBack: () => void
  onNext: () => void
  error: string
}

function FacetedFacetsStep({
  vocab, facets, setFacets, customSize, setCustomSize, facetCode, facetName,
  facetDup, codeUnique, onBack, onNext, error,
}: FacetedFacetsStepProps) {
  const applications = getApplicationsFromVocab(vocab, facets.type)
  const sizes = getSizePresetsFromVocab(vocab, facets.type)
  const typeLabel = vocab.types.find(o => o.value === facets.type)?.labelTh || facets.type

  const update = (patch: Partial<LinenFacets>) => setFacets({ ...facets, ...patch })

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <Layers className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 flex-1">
          <div className="font-semibold mb-0.5">เลือก facets: <span className="text-[#1B3A5C]">{typeLabel}</span></div>
          <p className="text-xs text-amber-800">เลือกเท่าที่ใช้จริง — ระบบจะสร้างรหัส + ชื่อให้</p>
        </div>
      </div>

      {applications.length > 0 && (
        <FacetPicker label="ลักษณะ/การใช้งาน" options={applications} value={facets.application}
          onChange={v => update({ application: v })} />
      )}

      {sizes.length > 0 && (
        <FacetPicker label="ขนาด" options={sizes} value={facets.size}
          onChange={v => update({ size: v, sizeUnit: v ? facets.sizeUnit : null })}
          hint={facets.type.includes('uniform') ? '(S/M/L/XL)' : ''} />
      )}

      {/* Custom size fallback */}
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">หรือใส่ขนาดเอง (custom)</label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={customSize}
            onChange={e => {
              setCustomSize(e.target.value)
              if (e.target.value.trim()) update({ size: e.target.value.trim(), sizeUnit: facets.sizeUnit || 'inch' })
            }}
            placeholder="เช่น 30x60, 1.2x1.7m"
            className="flex-1 px-2.5 py-1 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
          />
          <select
            value={facets.sizeUnit || ''}
            onChange={e => update({ sizeUnit: (e.target.value || null) as LinenFacets['sizeUnit'] })}
            className="px-2 py-1 border border-slate-200 rounded-md text-xs bg-white"
          >
            <option value="">-</option>
            <option value="inch">นิ้ว</option>
            <option value="cm">ซม.</option>
            <option value="ft">ฟุต</option>
            <option value="standard">มาตรฐาน</option>
          </select>
        </div>
      </div>

      <FacetPicker label="สี" options={vocab.colors} value={facets.color}
        onChange={v => update({ color: v })} />

      <FacetPicker label="พิเศษ (treatment)" options={vocab.treatments} value={facets.treatment}
        onChange={v => update({ treatment: v })}
        hint="เช่น น้ำมัน (spa)" />

      <FacetPicker label="ลาย" options={vocab.patterns} value={facets.pattern}
        onChange={v => update({ pattern: v })} />

      <FacetPicker label="วัสดุ" options={vocab.materials} value={facets.material}
        onChange={v => update({ material: v })} />

      {(facets.type === 'towel' || facets.type === 'foot_massage_towel' || facets.type === 'bath_mat') && (
        <FacetPicker label="น้ำหนัก" options={vocab.weights} value={facets.weight}
          onChange={v => update({ weight: v as LinenFacets['weight'] })} />
      )}

      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ / variant
          <span className="text-[10px] text-slate-400 ml-1">(brand/class/edge case)</span>
        </label>
        <input
          type="text"
          value={facets.variant || ''}
          onChange={e => update({ variant: e.target.value || null })}
          placeholder="เช่น VATA, VIP, Standard"
          className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
        />
      </div>

      {/* Live preview */}
      {facetCode && (
        <div className={cn(
          'rounded-lg p-3 border',
          facetDup || !codeUnique
            ? 'bg-red-50 border-red-300'
            : 'bg-emerald-50 border-emerald-200',
        )}>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Preview</div>
          <div className="text-sm font-mono font-semibold text-[#1B3A5C]">{facetCode}</div>
          <div className="text-xs text-slate-700 mt-0.5">{facetName}</div>
          {facetDup && (
            <div className="mt-2 text-xs text-red-700">
              ⚠️ ซ้ำกับ <strong>{facetDup.code} - {facetDup.name}</strong> (facetKey เหมือนกัน) — ปรับ variant หรือเลือก facet ที่ต่างกัน
            </div>
          )}
          {!facetDup && !codeUnique && (
            <div className="mt-2 text-xs text-red-700">
              ⚠️ รหัส {facetCode} ใช้ซ้ำกับ code อื่นใน catalog — เพิ่ม variant
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />{error}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <button onClick={onBack}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />ย้อนกลับ
        </button>
        <button
          onClick={onNext}
          disabled={!facetCode || !!facetDup || !codeUnique}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg text-sm font-medium hover:bg-[#122740] disabled:opacity-40 disabled:cursor-not-allowed">
          ตรวจสอบ<ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

interface FacetedConfirmStepProps {
  facets: LinenFacets
  facetCode: string
  facetName: string
  facetNameEn: string
  facetDup: LinenItemDef | null
  unit: string
  setUnit: (s: string) => void
  defaultPrice: number
  setDefaultPrice: (n: number) => void
  context: WizardContext
  customer: { shortName?: string; name: string } | null | undefined
  activeQT: Quotation | null
  addToQT: boolean
  setAddToQT: (b: boolean) => void
  customerPrice: number
  setCustomerPrice: (n: number) => void
  onBack: () => void
  onConfirm: () => void
  onUseDup: () => void
  error: string
  vocab: FacetVocab
}

function FacetedConfirmStep({
  vocab, facets, facetCode, facetName, facetNameEn, facetDup, unit, setUnit,
  defaultPrice, setDefaultPrice, context, customer, activeQT,
  addToQT, setAddToQT, customerPrice, setCustomerPrice,
  onBack, onConfirm, onUseDup, error,
}: FacetedConfirmStepProps) {
  const typeLabel = vocab.types.find(o => o.value === facets.type)?.labelTh || facets.type
  const facetSummary: Array<[string, string]> = []
  if (facets.application) {
    const app = getApplicationsFromVocab(vocab, facets.type).find(o => o.value === facets.application)
    if (app) facetSummary.push(['ลักษณะ', app.labelTh])
  }
  if (facets.size) facetSummary.push(['ขนาด', facets.size])
  if (facets.color) {
    const c = vocab.colors.find(o => o.value === facets.color)
    if (c) facetSummary.push(['สี', c.labelTh])
  }
  if (facets.treatment && facets.treatment !== 'none') {
    const t = vocab.treatments.find(o => o.value === facets.treatment)
    if (t) facetSummary.push(['พิเศษ', t.labelTh])
  }
  if (facets.pattern) {
    const p = vocab.patterns.find(o => o.value === facets.pattern)
    if (p) facetSummary.push(['ลาย', p.labelTh])
  }
  if (facets.material) {
    const m = vocab.materials.find(o => o.value === facets.material)
    if (m) facetSummary.push(['วัสดุ', m.labelTh])
  }
  if (facets.weight) {
    const w = vocab.weights.find(o => o.value === facets.weight)
    if (w) facetSummary.push(['น้ำหนัก', w.labelTh])
  }
  if (facets.variant) facetSummary.push(['หมายเหตุ', facets.variant])

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-900">
          <div className="font-semibold mb-0.5">ยืนยันก่อนเพิ่ม</div>
          <p className="text-xs text-emerald-800">ตรวจ facets + ราคาก่อนกดยืนยัน</p>
        </div>
      </div>

      {facetDup && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900 flex-1">
              <div className="font-semibold mb-0.5">รายการที่มี facets เหมือนกันมีอยู่แล้ว</div>
              <p className="text-xs">{facetDup.code} - {facetDup.name}</p>
            </div>
          </div>
          <button onClick={onUseDup}
            className="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
            ใช้รายการนี้แทน (ไม่เพิ่มซ้ำ)
          </button>
        </div>
      )}

      {/* Preview card */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">รายการใหม่</div>
        <div className="space-y-1 text-sm">
          <div><span className="text-slate-500">รหัส:</span> <span className="font-mono font-semibold">{facetCode}</span></div>
          <div><span className="text-slate-500">ประเภท:</span> <span className="font-medium">{typeLabel}</span></div>
          <div><span className="text-slate-500">ชื่อ:</span> <span className="font-medium">{facetName}</span></div>
          {facetNameEn && <div className="text-xs text-slate-500">EN: {facetNameEn}</div>}
        </div>
        {facetSummary.length > 0 && (
          <div className="pt-2 border-t border-slate-200">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Facets</div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {facetSummary.map(([k, v]) => (
                <div key={k}><span className="text-slate-500">{k}:</span> {v}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unit + price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">หน่วย *</label>
          <select value={unit} onChange={e => setUnit(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
            <option value="ผืน">ผืน</option>
            <option value="ใบ">ใบ</option>
            <option value="ตัว">ตัว</option>
            <option value="คู่">คู่</option>
            <option value="ชิ้น">ชิ้น</option>
            <option value="กิโลกรัม">กิโลกรัม</option>
            <option value="เมตร">เมตร</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">ราคา default (บาท/{unit})</label>
          <input type="number" value={defaultPrice}
            onChange={e => setDefaultPrice(Number(e.target.value) || 0)}
            onKeyDown={blockNumberArrowKeys}
            onFocus={e => e.currentTarget.select()}
            min={0} step={0.5}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
      </div>

      {/* QT integration (lf/sd context) */}
      {(context === 'lf' || context === 'sd') && customer && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={addToQT}
              onChange={e => setAddToQT(e.target.checked)}
              disabled={!activeQT}
              className="mt-0.5 rounded" />
            <div className="flex-1">
              <div className="text-sm font-medium text-blue-900">
                เพิ่มใน QT ของลูกค้า &quot;{customer.shortName || customer.name}&quot;
              </div>
              <p className="text-[11px] text-blue-700">
                {activeQT
                  ? `→ QT ${activeQT.quotationNumber} (accepted)`
                  : '⚠️ ยังไม่มี QT ที่ accepted'}
              </p>
            </div>
          </label>
          {addToQT && activeQT && (
            <div>
              <label className="text-xs font-medium text-blue-900 block mb-1">ราคาสำหรับลูกค้านี้</label>
              <input type="number" value={customerPrice || defaultPrice}
                onChange={e => setCustomerPrice(Number(e.target.value) || 0)}
                onKeyDown={blockNumberArrowKeys}
                onFocus={e => e.currentTarget.select()}
                min={0} step={0.5}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm text-right bg-white focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />{error}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <button onClick={onBack}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />แก้ไข
        </button>
        <button
          onClick={onConfirm}
          disabled={!!facetDup}
          className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
          <Check className="w-4 h-4" />ยืนยันเพิ่ม
        </button>
      </div>
    </div>
  )
}
