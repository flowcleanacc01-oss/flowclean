'use client'

// 374 — Form Generator v2: ฟอร์มเปล่า flexible
//  374.1/2 toggle ชื่อ/วันที่ → ใช้ฟอร์มเดียวหลายลูกค้า (ไม่ต้องสต๊อกเยอะ)
//  374.3 พิมพ์ A4→2×A5 (แนวนอน ฉีกกลาง) หรือ A5 เดี่ยว
//  374.4 แยกใบ/แผนก (เดาให้ตามหมวด + ปรับได้เต็มที่) → items ต่อใบน้อย fit A5

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import Modal from '@/components/Modal'
import { useStore } from '@/lib/store'
import { getCustomerEnabledCodes } from '@/lib/customer-pricing'
import { todayISO, genId, cn } from '@/lib/utils'
import BlankLinenFormPrint from '@/components/BlankLinenFormPrint'
import BlankChecklistPrint from '@/components/BlankChecklistPrint'
import ExportButtons from '@/components/ExportButtons'
import SortableHeader from '@/components/SortableHeader'
import CustomerSearchInline from '@/components/CustomerSearchInline'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import { loadFormTemplates, saveFormTemplates, type FormTemplate } from '@/lib/form-template-service'
import { type FormLang } from '@/lib/form-i18n'
import { computeFormMetrics, pageBoxPx, FINE_MIN, FINE_MAX, type FitMode } from '@/lib/form-fit'
import { PAPER_SIZES, MARGIN_PRESETS, type PrintSettings } from '@/lib/print-utils'
import { Plus, X, FileText, Users, Check, Search, ArrowUpDown, ChevronUp, ChevronDown, Save, Trash2, BookMarked } from 'lucide-react'
import type { LinenItemDef } from '@/types'

// 408 — print settings เริ่มต้นตาม printMode: a4 เดี่ยว = portrait · a4-2up = landscape (ฉีกครึ่ง) · narrow เสมอ
function defaultPrintSettings(printMode: 'a4' | 'a4-2up'): PrintSettings {
  return printMode === 'a4-2up'
    ? { paperSize: 'A4', orientation: 'landscape', margin: 'narrow' }
    : { paperSize: 'A4', orientation: 'portrait', margin: 'narrow' }
}

// 408 — ขนาดกล่องเนื้อหา 1 ใบ (mm) สำหรับ preview — ตรงกับที่พิมพ์จริง (paper/orientation/margin)
//   a4-2up บังคับ landscape (A4 แนวนอน ฉีกครึ่ง) · a4 เดี่ยว = ตาม settings.orientation
function contentBoxMm(printMode: 'a4' | 'a4-2up', s: PrintSettings): { wmm: number; hmm: number; halfWmm: number } {
  const ori = printMode === 'a4-2up' ? 'landscape' : s.orientation
  const p = PAPER_SIZES[s.paperSize]
  const m = MARGIN_PRESETS[s.margin].value
  const wmm = (ori === 'portrait' ? p.width : p.height) - 2 * m
  const hmm = (ori === 'portrait' ? p.height : p.width) - 2 * m
  return { wmm, hmm, halfWmm: wmm / 2 }
}

interface FormSheet { id: string; title: string; codes: string[]; extraRows?: number }  // 389.4 extraRows per-sheet (optional, default 0)
const NONE = '__none__'  // ฟอร์มกลาง (ไม่ระบุลูกค้า)

// 374.4 auto-suggest: เดาแบ่งตามหมวด — ผ้าปู/เรียบ vs ผ้าขน+ปลอก+อื่นๆ (ส่วนมาก 2 ใบ)
function suggestSheets(items: LinenItemDef[]): FormSheet[] {
  const bedsheet = items.filter(i => i.category === 'bedsheet')
  const rest = items.filter(i => i.category !== 'bedsheet')
  const out: FormSheet[] = []
  if (bedsheet.length) out.push({ id: genId(), title: 'ผ้าปู / ผ้าเรียบ', codes: bedsheet.map(i => i.code) })
  if (rest.length) out.push({ id: genId(), title: 'ผ้าขน / ปลอกหมอน / อื่นๆ', codes: rest.map(i => i.code) })
  if (out.length === 0) out.push({ id: genId(), title: 'รายการทั้งหมด', codes: items.map(i => i.code) })
  return out
}

export default function BlankFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { customers, quotations, linenCatalog, linenCategories, companyInfo, getCustomer } = useStore()
  const [customerId, setCustomerId] = useState('')   // '' = ยังไม่เลือก
  const [showCustomer, setShowCustomer] = useState(false)  // 387.2/.4 — pickCustomer set ตาม chip
  const [showDate, setShowDate] = useState(false)          // 387.2/.4 default ไม่ติ๊ก
  const [formType, setFormType] = useState<'lf' | 'checklist'>('lf')      // 387.3/.4 LF เป็น default (ปุ่มแรก ซ้าย)
  const [sheets, setSheets] = useState<FormSheet[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [printMode, setPrintMode] = useState<'a4-2up' | 'a4'>('a4')        // 387.3/.4 LF default = A4 เดี่ยว (orientation auto = portrait)
  // 408 — print settings (แนว/ขนาด/ขอบ) ยกมาที่ parent → save ลง template ได้ + fit คำนวณตามแนวจริง
  const [printSettings, setPrintSettings] = useState<PrintSettings>(() => defaultPrintSettings('a4'))
  const [settingsKey, setSettingsKey] = useState(0)   // bump → remount ExportButtons re-init จาก printSettings (เฉพาะตอน reset/toggle/โหลด template)
  // เปลี่ยน printMode + รีเซ็ต settings ตาม default ของ mode นั้น + bump remount key
  const applyPrintMode = (mode: 'a4' | 'a4-2up') => {
    setPrintMode(mode)
    setPrintSettings(defaultPrintSettings(mode))
    setSettingsKey(k => k + 1)
  }
  // 375 — item picker enhance (mirror QT picker)
  const [itemSearch, setItemSearch] = useState('')
  const [itemCat, setItemCat] = useState('all')
  const [reorderMode, setReorderMode] = useState(false)
  // 376 — Form Designer v3 controls
  // 396.2 — พื้นที่พิมพ์: fit-to-page (default) + ปรับละเอียด · 396 preview zoom (วัดความกว้างคอลัมน์)
  const [fitMode, setFitMode] = useState<FitMode>('fit')
  const [fineLevel, setFineLevel] = useState(0)
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null)
  const [previewW, setPreviewW] = useState(0)
  // 389.4 — extraRows ย้ายจาก global → เก็บใน FormSheet.extraRows (per-sheet)
  // 394.1/.2 — ถอด showMy (พม่า — ใช้ Chrome translate แทน) + grouped (จัดกลุ่ม — วาดปีกกาเองแทน)
  const langs: FormLang[] = ['th', 'en']
  // 375.1 — form templates (บันทึกฟอร์มกลาง → reuse)
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  useEffect(() => { if (open) loadFormTemplates().then(setTemplates).catch(() => {}) }, [open])

  // 395 — หน้าแรก (เลือกลูกค้า) theme หน้าลูกค้า: search (กรอง + Enter จั๊มเข้าหน้า 2) + ตาราง sort
  const [custSearch, setCustSearch] = useState('')
  const [custSortKey, setCustSortKey] = useState<'shortName' | 'count'>('shortName')
  const [custSortDir, setCustSortDir] = useState<'asc' | 'desc'>('asc')

  const reset = () => { setCustomerId(''); setSheets([]); setActiveSheet(0); setShowCustomer(false); setShowDate(false); setFormType('lf'); setPrintMode('a4'); setPrintSettings(defaultPrintSettings('a4')); setSettingsKey(k => k + 1); setItemSearch(''); setItemCat('all'); setReorderMode(false); setFitMode('fit'); setFineLevel(0); setCustSearch(''); setCustSortKey('shortName'); setCustSortDir('asc') }  // 387 defaults · 389.4 extraRows reset auto ผ่าน setSheets([]) · 394.1/.2 ถอด showMy/grouped · 395 reset picker · 408 reset print settings
  const handleClose = () => { reset(); onClose() }

  // items ที่เลือกได้ (จาก QT ลูกค้า หรือ catalog ทั้งหมดถ้าฟอร์มกลาง)
  const availItems = customerId === NONE ? linenCatalog
    : customerId ? linenCatalog.filter(i => getCustomerEnabledCodes(customerId, quotations).includes(i.code))
    : []

  const pickCustomer = (id: string) => {
    const items = id === NONE ? linenCatalog : linenCatalog.filter(i => getCustomerEnabledCodes(id, quotations).includes(i.code))
    setCustomerId(id)
    setSheets(suggestSheets(items))
    setActiveSheet(0)
    // 387.2/.4 — รีเซ็ต defaults ตาม chip
    setShowCustomer(id !== NONE)   // ลูกค้า=✓ (สอดคล้อง action) · ฟอร์มกลาง=✗
    setShowDate(false)             // 394.1/.2 ถอด showMy/grouped แล้ว
    setFormType('lf')              // 387.3/.4 default formType = LF เสมอ (ปุ่มซ้าย)
    applyPrintMode('a4')           // 387.3/.4 default printMode = A4 เดี่ยว · 408 reset print settings = portrait narrow
  }

  // 395 — customer rows + จำนวนรายการ (compute count ครั้งเดียว) → filter (Thai search) → sort
  const customerRowsBase = useMemo(
    () => customers.filter(c => c.isActive).map(c => ({ c, count: getCustomerEnabledCodes(c.id, quotations).length })),
    [customers, quotations],
  )
  const customerRows = useMemo(() => {
    const q = custSearch.trim()
    const list = q
      ? customerRowsBase.filter(r => matchesThaiQueryAnyField([r.c.shortName ?? '', r.c.name, r.c.nameEn ?? '', r.c.customerCode ?? ''], q))
      : customerRowsBase
    return [...list].sort((a, b) => {
      const cmp = custSortKey === 'shortName'
        ? (a.c.shortName || a.c.name).localeCompare(b.c.shortName || b.c.name, 'th')
        : a.count - b.count
      return custSortDir === 'asc' ? cmp : -cmp
    })
  }, [customerRowsBase, custSearch, custSortKey, custSortDir])
  const handleCustSort = (key: string) => {
    if (custSortKey === key) setCustSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCustSortKey(key as 'shortName' | 'count'); setCustSortDir('asc') }
  }
  // 398 — ช่อง "กระโดดเข้า" (dropdown แยก เป๊ะแบบหน้าลูกค้า) → เลือกแล้วเข้าหน้า 2 ทันที
  //   guard: ลูกค้าไม่มี QT = ฟอร์มเปล่าจะไม่มีรายการ → แนะนำใช้ "ฟอร์มกลาง" แทน (ไม่พาเข้า dead-end)
  const jumpToCustomer = (id: string) => {
    if (getCustomerEnabledCodes(id, quotations).length === 0) {
      alert('ลูกค้านี้ยังไม่มีใบเสนอราคา (QT) — ฟอร์มจะไม่มีรายการ\nใช้ปุ่ม "ฟอร์มกลาง" ด้านบนเพื่อพิมพ์ฟอร์มเปล่าแทนได้')
      return
    }
    pickCustomer(id)
  }

  // 396.2 — metrics ต่อใบ (fit-to-page ตามจำนวนรายการ + แถวว่าง) → ส่งเข้า FormComp (rowHeightPx/fontPx)
  // 408 — ส่ง orientation/paperSize/margin → fit คำนวณตามแนว/ขนาด/ขอบจริง (รองรับ landscape เดี่ยว)
  const metricsFor = (s: FormSheet) => computeFormMetrics(
    s.codes.length + (s.extraRows ?? 0),
    { kind: formType, printMode, fitMode, fineLevel, orientation: printSettings.orientation, paperSize: printSettings.paperSize, margin: printSettings.margin },
  )
  // 396 — zoom preview ให้พอดีความกว้างคอลัมน์ขวา (screen เท่านั้น · print reset zoom:1)
  const pageBox = pageBoxPx(printMode, printSettings.orientation, printSettings.paperSize, printSettings.margin)
  // 408 — ขนาดกล่อง preview (mm) ตรงกับที่พิมพ์จริง (รวม landscape เดี่ยว / margin / paper)
  const previewBox = contentBoxMm(printMode, printSettings)
  const previewZoom = previewW > 0 ? Math.min(1, (previewW - 16) / pageBox.w) : 0.5
  useEffect(() => {
    if (!previewEl) return
    const update = () => setPreviewW(previewEl.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(previewEl)
    return () => ro.disconnect()
  }, [previewEl])

  // 387 — สลับ formType + auto set printMode · idempotent: กดปุ่มเดิม = no-op กัน wipe ค่าที่ user/template เซตไว้
  //   LF → A4 เดี่ยว portrait | CK → A4→2×A5 landscape (orientation มาจาก ExportButtons key={printMode})
  const switchFormType = (next: 'lf' | 'checklist') => {
    if (next === formType) return
    setFormType(next)
    applyPrintMode(next === 'lf' ? 'a4' : 'a4-2up')   // 408 — reset print settings ตาม mode default
  }

  // 389.4 — extraRows per-sheet · +/- toolbar update เฉพาะ active sheet (เปลี่ยน tab → ค่า +/- ของ tab นั้น)
  const curExtraRows = sheets[activeSheet]?.extraRows ?? 0
  const bumpCurExtraRows = (delta: number) => {
    setSheets(ss => ss.map((s, i) => i === activeSheet ? { ...s, extraRows: Math.max(0, Math.min(20, (s.extraRows ?? 0) + delta)) } : s))
  }

  // sheet ops
  const cur = sheets[activeSheet]
  const renameSheet = (title: string) => setSheets(ss => ss.map((s, i) => i === activeSheet ? { ...s, title } : s))
  const toggleCode = (code: string) => setSheets(ss => ss.map((s, i) => i === activeSheet
    ? { ...s, codes: s.codes.includes(code) ? s.codes.filter(c => c !== code) : [...s.codes, code] } : s))
  const addSheet = () => { if (sheets.length >= 3) return; setSheets(ss => [...ss, { id: genId(), title: `ใบที่ ${ss.length + 1}`, codes: [] }]); setActiveSheet(sheets.length) }
  const removeSheet = (idx: number) => { setSheets(ss => ss.filter((_, i) => i !== idx)); setActiveSheet(a => Math.max(0, a >= idx ? a - 1 : a)) }

  const cust = customerId && customerId !== NONE ? (getCustomer(customerId) ?? null) : null
  const FormComp = formType === 'lf' ? BlankLinenFormPrint : BlankChecklistPrint
  const sheetItems = (s: FormSheet) => s.codes.map(code => linenCatalog.find(c => c.code === code)).filter((x): x is typeof linenCatalog[number] => !!x)  // 375: ตาม codes[] order (รองรับ reorder)
  const usableSheets = sheets.filter(s => s.codes.length > 0)

  // 375 — picker helpers (search + category filter + select-all/none เคารพ filter + reorder)
  const sortedCats = [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
  const filteredAvail = availItems.filter(it =>
    (itemCat === 'all' || it.category === itemCat) &&
    (!itemSearch || matchesThaiQueryAnyField([it.code, it.name, it.nameEn], itemSearch)))
  const selectAllFiltered = () => { if (!cur) return; const add = filteredAvail.map(i => i.code).filter(c => !cur.codes.includes(c)); setSheets(ss => ss.map((s, i) => i === activeSheet ? { ...s, codes: [...s.codes, ...add] } : s)) }
  const selectNoneFiltered = () => { const rm = new Set(filteredAvail.map(i => i.code)); setSheets(ss => ss.map((s, i) => i === activeSheet ? { ...s, codes: s.codes.filter(c => !rm.has(c)) } : s)) }
  const moveCode = (code: string, dir: -1 | 1) => setSheets(ss => ss.map((s, i) => {
    if (i !== activeSheet) return s
    const idx = s.codes.indexOf(code), j = idx + dir
    if (idx < 0 || j < 0 || j >= s.codes.length) return s
    const arr = [...s.codes]; [arr[idx], arr[j]] = [arr[j], arr[idx]]; return { ...s, codes: arr }
  }))

  // 375.1 — template save / apply / delete
  const saveAsTemplate = async () => {
    const name = prompt('ตั้งชื่อ template ฟอร์มนี้ (บันทึก: หมวด+ใบ+ตัวเลือก · แนว/ขนาด/ขอบกระดาษ · แสดงชื่อลูกค้า):')?.trim()
    if (!name) return
    const t: FormTemplate = {
      id: genId(), name, formType, showCustomer, showDate, printMode, fitMode, fineLevel,
      orientation: printSettings.orientation, paperSize: printSettings.paperSize, margin: printSettings.margin,  // 408 save แนว/ขนาด/ขอบ
      customerId: customerId || NONE,  // 408.1 save ลูกค้า → โหลดแล้วโชว์ชื่อได้
      sheets: sheets.map(s => ({ title: s.title, codes: s.codes, extraRows: s.extraRows })),
      updatedAt: new Date().toISOString(),
    }  // 389.4 extraRows + 396.2 fitMode/fineLevel per-template
    const next = [...templates.filter(x => x.name !== name), t]   // ชื่อซ้ำ = ทับ
    setTemplates(next)
    try { await saveFormTemplates(next) } catch { alert('บันทึก template ไม่สำเร็จ') }
  }
  const applyTemplate = (t: FormTemplate) => {
    const pm = t.printMode === 'a4-2up' ? 'a4-2up' : 'a4'  // 381: migrate 'a5' เก่า → 'a4'
    setFormType(t.formType); setShowDate(t.showDate); setPrintMode(pm)
    setFitMode(t.fitMode ?? 'fit'); setFineLevel(t.fineLevel ?? 0)  // 396.2 restore (template เก่า → พอดีหน้า)
    // 408 — restore แนว/ขนาด/ขอบ (template เก่าไม่มี → default ตาม printMode) + remount ExportButtons
    const def = defaultPrintSettings(pm)
    setPrintSettings({
      paperSize: t.paperSize ?? def.paperSize,
      orientation: t.orientation ?? def.orientation,
      margin: t.margin ?? def.margin,
    })
    setSettingsKey(k => k + 1)
    // 408.1 — restore ลูกค้า (template เก่าไม่มี customerId → คงลูกค้าที่เลือกอยู่) ก่อน showCustomer
    //   → cust กลับมา → กล่อง "แสดงชื่อลูกค้า" ไม่ถูก disabled → showCustomer ของ template ทำงานจริง
    if (t.customerId !== undefined) setCustomerId(t.customerId)
    setShowCustomer(t.showCustomer)
    setSheets(t.sheets.map(s => ({ id: genId(), title: s.title, codes: s.codes, extraRows: s.extraRows ?? 0 })))  // 389.4 restore extraRows (template เก่าไม่มี → 0)
    setActiveSheet(0); setReorderMode(false)
  }
  const deleteTemplate = async (id: string) => {
    if (!confirm('ลบ template นี้?')) return
    const next = templates.filter(t => t.id !== id)
    setTemplates(next)
    try { await saveFormTemplates(next) } catch { /* ignore */ }
  }
  // จับคู่ 2-up: [[s1,s2],[s3]]
  const pairs: FormSheet[][] = []
  for (let i = 0; i < usableSheets.length; i += 2) pairs.push(usableSheets.slice(i, i + 2))

  return (
    <Modal open={open} onClose={handleClose} title="พิมพ์ฟอร์มเปล่า ใบส่งรับผ้า (LF) / ใบเช็คผ้า (CK)" size="wide" className="print-target">
      {!customerId ? (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-600">เลือกลูกค้า (ฟอร์มจะล้อรายการตาม QT) หรือทำฟอร์มกลางไว้เขียนมือ</label>
          <button onClick={() => pickCustomer(NONE)}
            className="w-full text-left px-4 py-3 border-2 border-dashed border-[#3DD8D8] rounded-lg hover:bg-[#3DD8D8]/5 transition-colors flex items-center gap-2">
            <Users className="w-4 h-4 text-[#3DD8D8]" />
            <span className="font-medium text-[#1B3A5C]">ฟอร์มกลาง (ไม่ระบุลูกค้า)</span>
            <span className="text-xs text-slate-500">— เว้นช่องชื่อ/วันที่ให้เขียนมือ ใช้ได้ทุกเจ้า · รายการทั้งหมด {linenCatalog.length}</span>
          </button>
          {/* 398 — 2 ช่องแยก เป๊ะแบบหน้าลูกค้า: (1) กระโดดเข้า dropdown (เลือกแล้วเข้าหน้า 2 ทันที) */}
          <CustomerSearchInline
            mode="filter"
            onSelect={jumpToCustomer}
            accent="orange"
            placeholder="กระโดดเข้าฟอร์มลูกค้า — พิมพ์ชื่อ / รหัส / เลขผู้เสียภาษี แล้วเลือก"
            className="!max-w-none"
          />

          {/* 398 — (2) กรองตาราง: filter ตารางด้านล่างอย่างเดียว (teal · เหมือนหน้าลูกค้า) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3DD8D8]" />
            <input
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
              placeholder="กรองตาราง — ชื่อย่อ / ชื่อบริษัท / รหัส"
              className="w-full pl-10 pr-4 py-2 border-2 border-[#3DD8D8] rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
            />
          </div>

          {/* 395 — ตาราง sort (ชื่อย่อ / ชื่อบริษัท / จำนวนรายการ) — คลิกแถวเพื่อเข้าหน้า 2 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="max-h-[44vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <SortableHeader label="ชื่อย่อลูกค้า" sortKey="shortName" currentSortKey={custSortKey} currentSortDir={custSortDir} onSort={handleCustSort} className="text-left" />
                    <th className="px-4 py-3 font-medium text-slate-600 text-left">ชื่อบริษัท</th>
                    <SortableHeader label="จำนวนรายการ" sortKey="count" currentSortKey={custSortKey} currentSortDir={custSortDir} onSort={handleCustSort} className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {customerRows.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-10 text-slate-400 text-sm">ไม่พบลูกค้า</td></tr>
                  ) : customerRows.map(({ c, count }) => {
                    const noQT = count === 0
                    return (
                      <tr key={c.id}
                        onClick={() => { if (!noQT) pickCustomer(c.id) }}
                        className={cn('border-b border-slate-100 last:border-0',
                          noQT ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#3DD8D8]/10')}>
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-[#1B3A5C] tracking-wide">{c.shortName || c.name}</span>
                          {noQT && <span className="ml-2 text-[10px] text-amber-600 font-medium">⚠ ยังไม่มี QT</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          <span>{c.name}</span>
                          {c.nameEn && <span className="block text-[10px] text-slate-400">{c.nameEn}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className={cn('font-semibold', noQT ? 'text-slate-400' : 'text-[#1B3A5C]')}>{count}</span>
                          <span className="text-xs text-slate-400 ml-1">รายการ</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 no-print">
            <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-700">← เลือกใหม่</button>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                {/* 387.1 — สลับลำดับ LF ↔ CK (LF ซ้าย/แรก = default) + เติม (LF)/(CK) ตามคำขอ */}
                <button onClick={() => switchFormType('lf')} className={formType === 'lf' ? 'px-3 py-1.5 bg-[#1B3A5C] text-white' : 'px-3 py-1.5 text-slate-600 hover:bg-slate-50'}>ใบส่งรับผ้า (LF)</button>
                <button onClick={() => switchFormType('checklist')} className={formType === 'checklist' ? 'px-3 py-1.5 bg-[#1B3A5C] text-white' : 'px-3 py-1.5 text-slate-600 hover:bg-slate-50'}>ใบเช็คผ้า (CK)</button>
              </div>
              <ExportButtons
                key={settingsKey}  /* 408 — remount เมื่อ reset/toggle/โหลด template (ไม่ remount ตอน user เปลี่ยนใน dropdown เอง → ไม่ flicker) → re-init จาก printSettings */
                targetId="print-blank-area"
                filename={`blank-${formType}`}
                defaultSettings={printSettings}                 /* 408 — แนว/ขนาด/ขอบ จาก state (save ลง template ได้) */
                onSettingsChange={setPrintSettings}             /* 408 — user เปลี่ยนใน dropdown → sync ขึ้น parent → fit/preview/template ตามจริง */
                showPrint={true}
              />
            </div>
          </div>

          {/* Options row: toggle ชื่อ/วันที่ (374.1/2) + print mode (374.3) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs no-print bg-slate-50 rounded-lg px-3 py-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showCustomer} onChange={e => setShowCustomer(e.target.checked)} disabled={!cust} />
              แสดงชื่อลูกค้า {!cust && <span className="text-slate-400">(ฟอร์มกลาง = เว้นช่องเขียนมือ)</span>}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showDate} onChange={e => setShowDate(e.target.checked)} />
              แสดงวันที่
            </label>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-slate-500">พิมพ์:</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button onClick={() => applyPrintMode('a4-2up')} className={printMode === 'a4-2up' ? 'px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'px-2 py-1 text-slate-600 hover:bg-slate-50'}>A4 → 2×A5</button>
                <button onClick={() => applyPrintMode('a4')} className={printMode === 'a4' ? 'px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'px-2 py-1 text-slate-600 hover:bg-slate-50'}>A4 เดี่ยว</button>
              </div>
            </div>
          </div>

          {/* 396.2 — พื้นที่พิมพ์: พอดีหน้า(auto)/โปร่ง/ปกติ/แน่น + ปรับละเอียด ± · 376.3 แถวว่าง */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs no-print bg-slate-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">พื้นที่พิมพ์:</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {([
                  { k: 'fit' as FitMode, label: '✦ พอดีหน้า' },
                  { k: 'loose' as FitMode, label: 'โปร่ง' },
                  { k: 'normal' as FitMode, label: 'ปกติ' },
                  { k: 'dense' as FitMode, label: 'แน่น' },
                ]).map(o => (
                  <button key={o.k} onClick={() => setFitMode(o.k)}
                    className={fitMode === o.k ? 'px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'px-2 py-1 text-slate-600 hover:bg-slate-50'}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">ปรับละเอียด:</span>
              <button onClick={() => setFineLevel(v => Math.max(FINE_MIN, v - 1))} disabled={fineLevel <= FINE_MIN}
                title="บีบ (เตี้ยลง)" className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40">−</button>
              <span className="w-16 text-center text-[10px] text-slate-500">{fineLevel === 0 ? 'พอดี' : fineLevel > 0 ? `ขยาย +${fineLevel}` : `บีบ ${fineLevel}`}</span>
              <button onClick={() => setFineLevel(v => Math.min(FINE_MAX, v + 1))} disabled={fineLevel >= FINE_MAX}
                title="ขยาย (สูงขึ้น)" className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40">+</button>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-slate-500">เพิ่มแถวว่าง <span className="text-[10px] text-slate-400">(เฉพาะใบนี้)</span>:</span>
              <button onClick={() => bumpCurExtraRows(-1)} className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 text-slate-600">−</button>
              <span className="w-6 text-center font-medium">{curExtraRows}</span>
              <button onClick={() => bumpCurExtraRows(1)} className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 text-slate-600">+</button>
            </div>
          </div>

          {/* 375.1 — template bar (บันทึก/โหลดฟอร์มกลาง) */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs no-print bg-[#1B3A5C]/5 rounded-lg px-3 py-2">
            <BookMarked className="w-3.5 h-3.5 text-[#1B3A5C] flex-shrink-0" />
            <span className="text-slate-600 font-medium">Template:</span>
            {templates.length === 0 ? (
              <span className="text-slate-400">— ยังไม่มี (บันทึกรูปแบบที่จัดไว้เพื่อใช้ซ้ำ) —</span>
            ) : (
              templates.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-0.5">
                  <button onClick={() => applyTemplate(t)} className="text-[#1B3A5C] hover:underline" title="โหลด template นี้">{t.name}</button>
                  <Trash2 className="w-3 h-3 text-slate-300 hover:text-red-500 cursor-pointer" onClick={() => deleteTemplate(t.id)} />
                </span>
              ))
            )}
            <button onClick={saveAsTemplate} className="ml-auto inline-flex items-center gap-1 px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] rounded hover:bg-[#2bb8b8] font-medium flex-shrink-0">
              <Save className="w-3 h-3" />บันทึกเป็น template
            </button>
          </div>

          {/* 396.3 — แบ่งซ้าย (เลือก/จัดลำดับรายการ) / ขวา (preview) · จอแคบ = ซ้อนบน-ล่าง */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start print:block">
          {/* 374.4 Sheet editor — tabs + items checklist (ซ้าย) */}
          <div className="border border-slate-200 rounded-lg no-print">
            <div className="flex items-center gap-1 border-b border-slate-200 px-2 pt-2 flex-wrap">
              {sheets.map((s, i) => (
                <button key={s.id} onClick={() => setActiveSheet(i)}
                  className={cn('px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 -mb-px flex items-center gap-1.5',
                    i === activeSheet ? 'border-[#3DD8D8] text-[#1B3A5C] bg-white' : 'border-transparent text-slate-500 hover:bg-slate-50')}>
                  <FileText className="w-3 h-3" />{s.title || `ใบ ${i + 1}`}
                  <span className="text-[10px] text-slate-400">({s.codes.length})</span>
                  {sheets.length > 1 && <X className="w-3 h-3 hover:text-red-500" onClick={e => { e.stopPropagation(); removeSheet(i) }} />}
                </button>
              ))}
              {sheets.length < 3 && (
                <button onClick={addSheet} className="px-2 py-1.5 text-xs text-[#3DD8D8] hover:bg-[#3DD8D8]/5 rounded-t-lg flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มใบ</button>
              )}
            </div>
            {cur && (
              <div className="p-3 space-y-2">
                <input value={cur.title} onChange={e => renameSheet(e.target.value)} placeholder="ชื่อใบ/แผนก เช่น ผ้าเรียบ"
                  className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#3DD8D8]" />
                {/* 375 toolbar: ค้นหา + หมวด + เลือกทั้งหมด/ไม่เลือก (เคารพ filter) + จัดลำดับ */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <div className="relative flex-1 min-w-[120px]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="ค้นหารหัส/ชื่อ..." disabled={reorderMode}
                      className="w-full pl-7 pr-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-[#3DD8D8] disabled:bg-slate-50" />
                  </div>
                  <select value={itemCat} onChange={e => setItemCat(e.target.value)} disabled={reorderMode} className="border border-slate-200 rounded px-2 py-1 bg-white disabled:bg-slate-50">
                    <option value="all">ทุกหมวด</option>
                    {sortedCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <button onClick={selectAllFiltered} disabled={reorderMode} className="px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 disabled:opacity-40">เลือกทั้งหมด</button>
                  <button onClick={selectNoneFiltered} disabled={reorderMode} className="px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 disabled:opacity-40">ไม่เลือกเลย</button>
                  <button onClick={() => setReorderMode(r => !r)} disabled={cur.codes.length === 0}
                    className={cn('px-2 py-1 rounded inline-flex items-center gap-1 disabled:opacity-40', reorderMode ? 'bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                    {reorderMode ? <><Check className="w-3 h-3" />เสร็จ</> : <><ArrowUpDown className="w-3 h-3" />จัดลำดับ</>}
                  </button>
                </div>
                {reorderMode ? (
                  <div className="space-y-1 max-h-[56vh] overflow-y-auto">
                    {sheetItems(cur).map((it, idx) => (
                      <div key={it.code} className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 text-xs bg-white">
                        <span className="w-5 text-center text-slate-400">{idx + 1}</span>
                        <span className="font-mono text-[10px] text-slate-400">{it.code}</span>
                        <span className="flex-1 truncate">{it.name}</span>
                        <button onClick={() => moveCode(it.code, -1)} disabled={idx === 0} className="text-slate-400 hover:text-[#1B3A5C] disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveCode(it.code, 1)} disabled={idx === cur.codes.length - 1} className="text-slate-400 hover:text-[#1B3A5C] disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-[56vh] overflow-y-auto">
                    {filteredAvail.map(it => (
                      <label key={it.code} className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer border',
                        cur.codes.includes(it.code) ? 'bg-[#3DD8D8]/10 border-[#3DD8D8]/40' : 'border-slate-100 hover:bg-slate-50')}>
                        <input type="checkbox" checked={cur.codes.includes(it.code)} onChange={() => toggleCode(it.code)} className="flex-shrink-0" />
                        <span className="font-mono text-[10px] text-slate-400">{it.code}</span>
                        <span className="truncate">{it.name}</span>
                      </label>
                    ))}
                    {filteredAvail.length === 0 && <p className="col-span-full text-center text-slate-400 text-xs py-3">ไม่พบรายการ</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview (ขวา) */}
          <div className="min-w-0">
          {/* Preview / Print area */}
          {usableSheets.length === 0 ? (
            <div className="p-6 text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg text-sm">⚠ ยังไม่มีรายการในใบใด — ติ๊กเลือกรายการก่อนพิมพ์</div>
          ) : (
            <div ref={setPreviewEl} className="border border-slate-200 rounded-lg p-2 bg-slate-100 max-h-[64vh] overflow-auto print:max-h-none print:overflow-visible print:border-0 print:p-0 print:bg-white">
              {/* 396 — zoom (screen) ย่อให้พอดีคอลัมน์ · print reset zoom:1 (globals) · กล่อง = พื้นที่พิมพ์จริง (กว้างหลัง margin) + min-height = 1 หน้า (เห็นขอบหน้า) */}
              <div id="print-blank-area" style={{ zoom: previewZoom } as unknown as CSSProperties}>
                {printMode === 'a4' ? (
                  usableSheets.map(s => {
                    const m = metricsFor(s)
                    return (
                      <div key={s.id} className="blank-a5-page bg-white mx-auto mb-4 shadow-sm border border-slate-300 print:shadow-none print:border-0 print:mb-0" style={{ width: `${previewBox.wmm}mm`, minHeight: `${previewBox.hmm}mm` }}>
                        <FormComp customer={cust} company={companyInfo} items={sheetItems(s)} date={todayISO()} showCustomer={showCustomer} showDate={showDate} sheetTitle={s.title} id={`bf-${s.id}`} langs={langs} rowHeightPx={m.rowHeightPx} fontPx={m.fontPx} extraRows={s.extraRows ?? 0} />
                      </div>
                    )
                  })
                ) : (
                  pairs.map((pair, pi) => (
                    <div key={pi} className="blank-a4-2up-page flex bg-white mx-auto mb-4 shadow-sm border border-slate-300 print:shadow-none print:border-0 print:mb-0" style={{ width: `${previewBox.wmm}mm`, minHeight: `${previewBox.hmm}mm` }}>
                      {pair.map(s => {
                        const m = metricsFor(s)
                        return (
                          <div key={s.id} className="blank-a5-half" style={{ width: `${previewBox.halfWmm}mm`, minHeight: `${previewBox.hmm}mm`, borderRight: '1px dashed #94a3b8' }}>
                            <FormComp customer={cust} company={companyInfo} items={sheetItems(s)} date={todayISO()} showCustomer={showCustomer} showDate={showDate} sheetTitle={s.title} compact id={`bf-${s.id}`} langs={langs} rowHeightPx={m.rowHeightPx} fontPx={m.fontPx} extraRows={s.extraRows ?? 0} />
                          </div>
                        )
                      })}
                      {pair.length === 1 && <div style={{ width: `${previewBox.halfWmm}mm` }} className="flex items-center justify-center text-slate-300 text-xs">(ฉีกครึ่ง — ครึ่งนี้ว่าง)</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {printMode === 'a4-2up' && usableSheets.length > 0 && (
            <p className="text-[11px] text-slate-400 no-print flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" />พิมพ์ลง A4 แนวนอน → ฉีกกลางตามเส้นประ = {usableSheets.length} แผ่น A5</p>
          )}
          </div>{/* /preview column (ขวา) */}
          </div>{/* /grid ซ้าย-ขวา (396.3) */}
        </div>
      )}
    </Modal>
  )
}
