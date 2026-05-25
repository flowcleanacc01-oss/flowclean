'use client'

// 374 — Form Generator v2: ฟอร์มเปล่า flexible
//  374.1/2 toggle ชื่อ/วันที่ → ใช้ฟอร์มเดียวหลายลูกค้า (ไม่ต้องสต๊อกเยอะ)
//  374.3 พิมพ์ A4→2×A5 (แนวนอน ฉีกกลาง) หรือ A5 เดี่ยว
//  374.4 แยกใบ/แผนก (เดาให้ตามหมวด + ปรับได้เต็มที่) → items ต่อใบน้อย fit A5

import { useState } from 'react'
import Modal from '@/components/Modal'
import { useStore } from '@/lib/store'
import { getCustomerEnabledCodes } from '@/lib/customer-pricing'
import { todayISO, genId, cn } from '@/lib/utils'
import BlankLinenFormPrint from '@/components/BlankLinenFormPrint'
import BlankChecklistPrint from '@/components/BlankChecklistPrint'
import ExportButtons from '@/components/ExportButtons'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import { Plus, X, FileText, Users, Check, Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { LinenItemDef } from '@/types'

interface FormSheet { id: string; title: string; codes: string[] }
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
  const [showCustomer, setShowCustomer] = useState(true)
  const [showDate, setShowDate] = useState(true)
  const [formType, setFormType] = useState<'checklist' | 'lf'>('checklist')
  const [sheets, setSheets] = useState<FormSheet[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [printMode, setPrintMode] = useState<'a4-2up' | 'a5'>('a4-2up')
  // 375 — item picker enhance (mirror QT picker)
  const [itemSearch, setItemSearch] = useState('')
  const [itemCat, setItemCat] = useState('all')
  const [reorderMode, setReorderMode] = useState(false)

  const reset = () => { setCustomerId(''); setSheets([]); setActiveSheet(0); setShowCustomer(true); setShowDate(true); setPrintMode('a4-2up'); setItemSearch(''); setItemCat('all'); setReorderMode(false) }
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
    if (id === NONE) setShowCustomer(false)   // ฟอร์มกลาง → ปิดชื่อ default (เขียนมือ)
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
  // จับคู่ 2-up: [[s1,s2],[s3]]
  const pairs: FormSheet[][] = []
  for (let i = 0; i < usableSheets.length; i += 2) pairs.push(usableSheets.slice(i, i + 2))

  return (
    <Modal open={open} onClose={handleClose} title="พิมพ์ฟอร์มเปล่า (ใบเช็คผ้า / ใบส่งรับผ้า)" size="xl" className="print-target">
      {!customerId ? (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-600">เลือกลูกค้า (ฟอร์มจะล้อรายการตาม QT) หรือทำฟอร์มกลางไว้เขียนมือ</label>
          <button onClick={() => pickCustomer(NONE)}
            className="w-full text-left px-4 py-3 border-2 border-dashed border-[#3DD8D8] rounded-lg hover:bg-[#3DD8D8]/5 transition-colors flex items-center gap-2">
            <Users className="w-4 h-4 text-[#3DD8D8]" />
            <span className="font-medium text-[#1B3A5C]">ฟอร์มกลาง (ไม่ระบุลูกค้า)</span>
            <span className="text-xs text-slate-500">— เว้นช่องชื่อ/วันที่ให้เขียนมือ ใช้ได้ทุกเจ้า · รายการทั้งหมด {linenCatalog.length}</span>
          </button>
          <div className="grid gap-2">
            {customers.filter(c => c.isActive).map(c => {
              const codes = getCustomerEnabledCodes(c.id, quotations)
              return (
                <button key={c.id} onClick={() => pickCustomer(c.id)} disabled={codes.length === 0}
                  className="text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
                  <span className="font-medium text-slate-800">{c.shortName || c.name}</span>
                  <span className="text-xs text-slate-500 ml-2">({codes.length} รายการ)</span>
                  {codes.length === 0 && <span className="text-xs text-amber-600 ml-2">⚠ ยังไม่มี QT</span>}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 no-print">
            <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-700">← เลือกใหม่</button>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                <button onClick={() => setFormType('checklist')} className={formType === 'checklist' ? 'px-3 py-1.5 bg-[#1B3A5C] text-white' : 'px-3 py-1.5 text-slate-600 hover:bg-slate-50'}>ใบเช็คผ้า</button>
                <button onClick={() => setFormType('lf')} className={formType === 'lf' ? 'px-3 py-1.5 bg-[#1B3A5C] text-white' : 'px-3 py-1.5 text-slate-600 hover:bg-slate-50'}>ใบส่งรับผ้า</button>
              </div>
              <ExportButtons
                targetId="print-blank-area"
                filename={`blank-${formType}`}
                defaultSettings={printMode === 'a4-2up' ? { paperSize: 'A4', orientation: 'landscape', margin: 'narrow' } : { paperSize: 'A5', orientation: 'portrait', margin: 'narrow' }}
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
                <button onClick={() => setPrintMode('a4-2up')} className={printMode === 'a4-2up' ? 'px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'px-2 py-1 text-slate-600 hover:bg-slate-50'}>A4 → 2×A5</button>
                <button onClick={() => setPrintMode('a5')} className={printMode === 'a5' ? 'px-2 py-1 bg-[#3DD8D8] text-[#1B3A5C] font-medium' : 'px-2 py-1 text-slate-600 hover:bg-slate-50'}>A5 เดี่ยว</button>
              </div>
            </div>
          </div>

          {/* 374.4 Sheet editor — tabs + items checklist */}
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
                  <div className="space-y-1 max-h-[28vh] overflow-y-auto">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-[28vh] overflow-y-auto">
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

          {/* Preview / Print area */}
          {usableSheets.length === 0 ? (
            <div className="p-6 text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg text-sm">⚠ ยังไม่มีรายการในใบใด — ติ๊กเลือกรายการก่อนพิมพ์</div>
          ) : (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-100 max-h-[40vh] overflow-auto print:max-h-none print:overflow-visible print:border-0 print:p-0 print:bg-white">
              <div id="print-blank-area">
                {printMode === 'a5' ? (
                  usableSheets.map(s => (
                    <div key={s.id} className="blank-a5-page bg-white mx-auto mb-3 shadow-sm print:shadow-none print:mb-0" style={{ width: '148mm' }}>
                      <FormComp customer={cust} company={companyInfo} items={sheetItems(s)} date={todayISO()} showCustomer={showCustomer} showDate={showDate} sheetTitle={s.title} compact id={`bf-${s.id}`} />
                    </div>
                  ))
                ) : (
                  pairs.map((pair, pi) => (
                    <div key={pi} className="blank-a4-2up-page flex bg-white mx-auto mb-3 shadow-sm print:shadow-none print:mb-0" style={{ width: '297mm' }}>
                      {pair.map(s => (
                        <div key={s.id} className="blank-a5-half" style={{ width: '148.5mm', borderRight: '1px dashed #94a3b8' }}>
                          <FormComp customer={cust} company={companyInfo} items={sheetItems(s)} date={todayISO()} showCustomer={showCustomer} showDate={showDate} sheetTitle={s.title} compact id={`bf-${s.id}`} />
                        </div>
                      ))}
                      {pair.length === 1 && <div style={{ width: '148.5mm' }} className="flex items-center justify-center text-slate-300 text-xs">(ฉีกครึ่ง — ครึ่งนี้ว่าง)</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {printMode === 'a4-2up' && usableSheets.length > 0 && (
            <p className="text-[11px] text-slate-400 no-print flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" />พิมพ์ลง A4 แนวนอน → ฉีกกลางตามเส้นประ = {usableSheets.length} แผ่น A5</p>
          )}
        </div>
      )}
    </Modal>
  )
}
