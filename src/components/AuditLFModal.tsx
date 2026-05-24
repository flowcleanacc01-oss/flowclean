'use client'

// 366.2 — Audit LF: สแกนใบส่งรับผ้า + ใบเช็คผ้า (ของ LF นั้นๆ) → เทียบกับค่าใน LF
// → ยืนยัน provenance (ลูกค้า/วันที่ตรง) + จับ data-entry error ทุกคอลัมน์ในครั้งเดียว
// reuse extractSheet (form 4col) + extractChecklist (per-bag) + cross-check (363)

import { useState, useRef, useCallback } from 'react'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { extractSheet, extractChecklist } from '@/lib/ai-scan-client'
import { matchesThaiQueryAnyField } from '@/lib/thai-search'
import type { CustomerItemHint } from '@/lib/ai-extract-types'
import type { LinenFormRow } from '@/types'
import { Loader2, AlertTriangle, Check, FileText, ClipboardCheck, X } from 'lucide-react'

const COLS = [
  { key: 'col2', field: 'col2_hotelCountIn', label: 'นับส่ง' },
  { key: 'col3', field: 'col3_hotelClaimCount', label: 'เคลม' },
  { key: 'col5', field: 'col5_factoryClaimApproved', label: 'นับเข้า' },
  { key: 'col6', field: 'col6_factoryPackSend', label: 'แพคส่ง' },
] as const

interface Finding {
  code: string
  name: string
  label: string
  lfVal: number
  docVal: number
  source: string
}

interface FormVals { col2: number | null; col3: number | null; col5: number | null; col6: number | null }

interface Props {
  open: boolean
  onClose: () => void
  lfRows: LinenFormRow[]
  items: CustomerItemHint[]
  itemName: (code: string) => string
  expectCustomer?: string
  expectDate?: string
  onApply?: (updates: { code: string; vals: Partial<FormVals>; col6Breakdown?: number[] }[]) => void
}

export default function AuditLFModal({ open, onClose, lfRows, items, itemName, expectCustomer, expectDate, onApply }: Props) {
  const [loading, setLoading] = useState<'' | 'form' | 'checklist'>('')
  const [formVals, setFormVals] = useState<Record<string, FormVals> | null>(null)
  const [checklistVals, setChecklistVals] = useState<Record<string, { sum: number; bags: number[] }> | null>(null)
  const [provenance, setProvenance] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const formRef = useRef<HTMLInputElement>(null)
  const clRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setLoading(''); setFormVals(null); setChecklistVals(null); setProvenance([]); setErrorMsg('')
  }, [])
  const handleClose = () => { reset(); onClose() }

  const resolveCode = (aiCode: string | null, nameRaw: string): string => {
    if (aiCode && items.some(i => i.code === aiCode)) return aiCode
    return items.find(i => matchesThaiQueryAnyField([i.name], nameRaw))?.code || ''
  }
  const checkProvenance = (cust: string | null, date: string | null, src: string) => {
    const out: string[] = []
    if (expectCustomer && cust && !matchesThaiQueryAnyField([expectCustomer], cust))
      out.push(`${src}: อ่านลูกค้า "${cust}" — LF คือ "${expectCustomer}" ⚠`)
    if (expectDate && date && date !== expectDate)
      out.push(`${src}: อ่านวันที่ ${date} — LF คือ ${expectDate} ⚠`)
    return out
  }

  const scanForm = async (file: File) => {
    setLoading('form'); setErrorMsg('')
    try {
      const { data } = await extractSheet(file, items)
      const vals: Record<string, FormVals> = {}
      for (const r of data.rows) {
        const code = resolveCode(r.code, r.name_raw || '')
        if (!code) continue
        vals[code] = { col2: r.col2_send, col3: r.col3_claim, col5: r.col5_countedIn, col6: r.col6_packSend }
      }
      setFormVals(vals)
      setProvenance(p => [...p.filter(x => !x.startsWith('ใบส่งรับผ้า')), ...checkProvenance(data.detected_customer, data.detected_date, 'ใบส่งรับผ้า')])
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : 'สแกนไม่สำเร็จ') }
    setLoading('')
  }

  const scanChecklist = async (file: File) => {
    setLoading('checklist'); setErrorMsg('')
    try {
      const { data } = await extractChecklist(file, items)
      const vals: Record<string, { sum: number; bags: number[] }> = {}
      for (const r of data.rows) {
        const code = resolveCode(r.code, r.name_raw || '')
        if (!code) continue
        const bags = (r.bags || []).filter(n => typeof n === 'number' && n >= 0)
        if (vals[code]) vals[code].bags.push(...bags)
        else vals[code] = { bags: [...bags], sum: 0 }
      }
      Object.values(vals).forEach(v => { v.sum = v.bags.reduce((s, n) => s + n, 0) })
      setChecklistVals(vals)
      setProvenance(p => [...p.filter(x => !x.startsWith('ใบเช็คผ้า')), ...checkProvenance(data.detected_customer, data.detected_date, 'ใบเช็คผ้า')])
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : 'สแกนไม่สำเร็จ') }
    setLoading('')
  }

  // findings: เทียบ LF vs เอกสารที่สแกน (เฉพาะค่าที่เอกสารมี ≠ null)
  const lfByCode = new Map(lfRows.map(r => [r.code, r]))
  const findings: Finding[] = []
  if (formVals) {
    for (const [code, fv] of Object.entries(formVals)) {
      const lf = lfByCode.get(code)
      if (!lf) continue
      for (const c of COLS) {
        const docVal = fv[c.key]
        if (docVal == null) continue
        const lfVal = lf[c.field] || 0
        if (docVal !== lfVal) findings.push({ code, name: itemName(code), label: c.label, lfVal, docVal, source: 'ใบส่งรับผ้า' })
      }
    }
  }
  if (checklistVals) {
    for (const [code, cv] of Object.entries(checklistVals)) {
      const lf = lfByCode.get(code)
      if (!lf) continue
      const lfVal = lf.col6_factoryPackSend || 0
      if (cv.sum !== lfVal) findings.push({ code, name: itemName(code), label: 'แพคส่ง', lfVal, docVal: cv.sum, source: 'ใบเช็คผ้า' })
    }
  }
  const scanned = !!(formVals || checklistVals)
  const provenanceBad = provenance.length > 0

  const apply = () => {
    if (!onApply) return
    const map = new Map<string, { code: string; vals: Partial<FormVals>; col6Breakdown?: number[] }>()
    if (formVals) for (const [code, fv] of Object.entries(formVals)) {
      const vals: Partial<FormVals> = {}
      for (const c of COLS) if (fv[c.key] != null) vals[c.key] = fv[c.key]
      map.set(code, { code, vals })
    }
    if (checklistVals) for (const [code, cv] of Object.entries(checklistVals)) {
      const e = map.get(code) || { code, vals: {} }
      e.vals.col6 = cv.sum
      e.col6Breakdown = cv.bags
      map.set(code, e)
    }
    onApply([...map.values()])
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="🔍 ตรวจสอบ LF (สแกนเทียบเอกสาร)" size="xl" closeLabel="cancel">
      <input ref={formRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanForm(f) }} />
      <input ref={clRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanChecklist(f) }} />

      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          สแกนเอกสารต้นทางของ LF นี้ → ระบบเทียบกับค่าที่บันทึกไว้ + ยืนยันว่าเป็นของลูกค้า/วันที่เดียวกัน
        </p>

        {/* 2 scan buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => formRef.current?.click()} disabled={loading !== ''}
            className={cn('flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium transition-colors',
              formVals ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-[#1B3A5C] hover:bg-slate-50')}>
            {loading === 'form' ? <Loader2 className="w-4 h-4 animate-spin" /> : formVals ? <Check className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            ใบส่งรับผ้า {formVals && `(${Object.keys(formVals).length})`}
          </button>
          <button type="button" onClick={() => clRef.current?.click()} disabled={loading !== ''}
            className={cn('flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium transition-colors',
              checklistVals ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-[#1B3A5C] hover:bg-slate-50')}>
            {loading === 'checklist' ? <Loader2 className="w-4 h-4 animate-spin" /> : checklistVals ? <Check className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
            ใบเช็คผ้า {checklistVals && `(${Object.keys(checklistVals).length})`}
          </button>
        </div>
        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

        {/* provenance */}
        {scanned && (
          <div className={cn('rounded-lg border px-3 py-2 text-xs', provenanceBad ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>
            {provenanceBad
              ? provenance.map((w, i) => <div key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{w}</div>)
              : <div className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> ลูกค้า/วันที่ตรงกับ LF</div>}
          </div>
        )}

        {/* findings */}
        {scanned && (
          findings.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-center text-sm text-emerald-700">
              <Check className="w-5 h-5 mx-auto mb-1" /> ตรงกับเอกสารทั้งหมด — LF ถูกต้อง ✓
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-orange-800 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> พบ {findings.length} จุดที่ต่างจากเอกสาร
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0 text-slate-500 text-xs">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium">รายการ</th>
                      <th className="text-left px-2 py-2 font-medium w-16">ช่อง</th>
                      <th className="text-right px-2 py-2 font-medium w-16">ใน LF</th>
                      <th className="text-right px-2 py-2 font-medium w-16">เอกสาร</th>
                      <th className="text-right px-2 py-2 font-medium w-14">ต่าง</th>
                      <th className="text-left px-2 py-2 font-medium w-20">ที่มา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-700">{f.name}</td>
                        <td className="px-2 py-1.5 text-slate-500">{f.label}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">{f.lfVal}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-[#1B3A5C]">{f.docVal}</td>
                        <td className={cn('px-2 py-1.5 text-right font-medium', f.docVal - f.lfVal > 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {f.docVal - f.lfVal > 0 ? '+' : ''}{f.docVal - f.lfVal}
                        </td>
                        <td className="px-2 py-1.5 text-[11px] text-slate-400">{f.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* actions */}
        {scanned && (
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={handleClose} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4" /> ปิด (ตรวจอย่างเดียว)
            </button>
            {onApply && findings.length > 0 && (
              <button type="button" onClick={apply}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                <Check className="w-4 h-4" /> แก้ LF ให้ตรงเอกสาร ({findings.length})
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
