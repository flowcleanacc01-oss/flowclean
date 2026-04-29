'use client'

/**
 * 194 + 196 — Catalog Hygiene Center
 *
 * รวมทุกเครื่องมือ + dashboard + decision wizard + manual ในที่เดียว
 *
 *  - Audit Dashboard: drift / orphan / clash count + Health Score
 *  - Decision Wizard: ตอบคำถาม → แนะนำ tool ที่ใช้ + เปิดให้เลย
 *  - Manual: 8 cases × 4 tools reference table
 *  - Validation toggles (sync to localStorage, ใช้ใน QT save guard)
 */
import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { useNameDrift } from '@/lib/use-name-drift'
import { useOrphanCodes } from '@/lib/use-orphan-codes'
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, CheckCircle2,
  HelpCircle, History, Layers, RefreshCcw, Settings, Shield, Sparkles, Zap,
} from 'lucide-react'
import UndoPanel from '@/components/UndoPanel'

interface Props {
  onOpenTab: (tab: 'sync' | 'merge' | 'items') => void
}

const VALIDATION_KEY = 'flowclean_catalog_validation'

interface ValidationPrefs {
  warnDrift: boolean
  warnOrphan: boolean
}

function loadValidation(): ValidationPrefs {
  if (typeof window === 'undefined') return { warnDrift: true, warnOrphan: true }
  try {
    const raw = window.localStorage.getItem(VALIDATION_KEY)
    if (!raw) return { warnDrift: true, warnOrphan: true }
    return JSON.parse(raw)
  } catch { return { warnDrift: true, warnOrphan: true } }
}

function saveValidation(prefs: ValidationPrefs) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(VALIDATION_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

export default function CatalogHygieneCenter({ onOpenTab }: Props) {
  const { linenCatalog, quotations } = useStore()
  const { driftMap, totalCodes: driftCodes, totalQts: driftQts } = useNameDrift()
  const { orphans, totalCodes: orphanCodes, totalRows: orphanRows } = useOrphanCodes()

  // Code clashes (รหัสเดียว ชื่อต่าง — รวมทั้ง drift names + catalog name)
  const clashCount = useMemo(() => {
    let n = 0
    for (const e of driftMap.values()) {
      if (e.driftNames.length >= 1) n++ // มี name ใน QT ต่างจาก catalog ≥ 1 = clash
    }
    return n
  }, [driftMap])

  // Health Score: 100 = perfect, 0 = many issues
  const totalCatalog = linenCatalog.length
  const healthScore = useMemo(() => {
    if (totalCatalog === 0) return 100
    const totalQtRows = quotations.reduce((s, q) => s + (q.items?.length || 0), 0)
    if (totalQtRows === 0) return 100
    // weight: orphan = 3x worse than drift
    const issuePoints = (driftQts * 1) + (orphanRows * 3)
    const maxPoints = totalQtRows * 3
    const ratio = Math.min(1, issuePoints / Math.max(maxPoints, 1))
    return Math.max(0, Math.round((1 - ratio) * 100))
  }, [totalCatalog, driftQts, orphanRows, quotations])

  const healthColor = healthScore >= 90 ? 'emerald' : healthScore >= 70 ? 'amber' : 'red'
  const healthLabel = healthScore >= 90 ? 'แข็งแรง' : healthScore >= 70 ? 'ต้องดูแล' : 'ต้องแก้ด่วน'

  // Validation prefs
  const [prefs, setPrefs] = useState<ValidationPrefs>(loadValidation)
  const setPref = (k: keyof ValidationPrefs, v: boolean) => {
    const next = { ...prefs, [k]: v }
    setPrefs(next); saveValidation(next)
  }

  const [wizardOpen, setWizardOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* ── Hero — Health Score ──────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#1B3A5C] to-[#3DD8D8] rounded-xl p-6 text-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80 mb-1">
              <Shield className="w-3.5 h-3.5" />
              Catalog Hygiene Center
            </div>
            <h2 className="text-2xl font-bold">สถานะ catalog ของคุณ</h2>
            <p className="text-sm opacity-90 mt-1">
              ดู+แก้ปัญหา drift / orphan / code clash รวมที่เดียว · {totalCatalog} รายการใน catalog
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold tabular-nums">{healthScore}</div>
            <div className="text-xs uppercase tracking-wide opacity-80">/ 100 · {healthLabel}</div>
          </div>
        </div>
      </div>

      {/* ── Audit Dashboard ─────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          📊 Audit — สิ่งที่ระบบเจอ
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <DashCard
            icon={<Layers className="w-5 h-5" />}
            label="Catalog items"
            value={totalCatalog}
            color="emerald"
            sub="รายการในระบบทั้งหมด"
            actionLabel="จัดการ"
            onClick={() => onOpenTab('items')}
          />
          <DashCard
            icon={<RefreshCcw className="w-5 h-5" />}
            label="Drift Names"
            value={driftCodes}
            color={driftCodes > 0 ? 'amber' : 'slate'}
            sub={`${driftQts} QT ตามชื่อ catalog ไม่ทัน`}
            actionLabel={driftCodes > 0 ? 'ซิงก์ชื่อ' : 'ดู'}
            onClick={() => onOpenTab('sync')}
          />
          <DashCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Orphan Codes"
            value={orphanCodes}
            color={orphanCodes > 0 ? 'red' : 'slate'}
            sub={`${orphanRows} rows ใน QT ไม่มีใน catalog`}
            actionLabel={orphanCodes > 0 ? 'นำเข้า/แก้' : 'ดู'}
            onClick={() => onOpenTab('sync')}
          />
          <DashCard
            icon={<Sparkles className="w-5 h-5" />}
            label="Code Clashes"
            value={clashCount}
            color={clashCount > 0 ? 'orange' : 'slate'}
            sub="รหัสเดียวมีหลายชื่อ"
            actionLabel="รวม/Split"
            onClick={() => onOpenTab('merge')}
          />
        </div>
      </section>

      {/* ── Quick Actions ───────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          🧭 ไม่แน่ใจว่าใช้ tool ไหน?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setWizardOpen(true)}
            className="text-left p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#3DD8D8] hover:bg-[#3DD8D8]/5 transition-colors group"
          >
            <div className="flex items-center gap-2 text-[#1B3A5C] mb-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-sm">Decision Wizard</span>
            </div>
            <p className="text-xs text-slate-500">
              ตอบคำถาม 2-3 ข้อ → แนะนำ tool ที่ใช้ + เปิดให้
            </p>
          </button>
          <button
            onClick={() => setManualOpen(true)}
            className="text-left p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#1B3A5C] hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-[#1B3A5C] mb-1">
              <BookOpen className="w-4 h-4" />
              <span className="font-semibold text-sm">คู่มือ 9 เคส × 4 tools</span>
            </div>
            <p className="text-xs text-slate-500">
              ตารางอ้างอิงเคส + tool — ดูแยกได้ทุกเคส
            </p>
          </button>
        </div>
      </section>

      {/* ── Undo Panel (197) ─────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <History className="w-4 h-4" />
          ↶ Undo — ย้อนการกระทำที่เพิ่งทำ
        </h3>
        <UndoPanel />
      </section>

      {/* ── Validation Settings ─────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          ⚙️ Validation — เตือนตอน save QT
        </h3>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={prefs.warnDrift} onChange={e => setPref('warnDrift', e.target.checked)}
              className="rounded border-slate-300 mt-0.5" />
            <div>
              <div className="text-slate-700">เตือนเมื่อ save QT ที่ <strong>name</strong> ต่างจาก catalog</div>
              <p className="text-xs text-slate-500">แสดง modal ให้เลือก: ใช้ชื่อ catalog / เก็บชื่อ QT / Promote เป็น code ใหม่</p>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={prefs.warnOrphan} onChange={e => setPref('warnOrphan', e.target.checked)}
              className="rounded border-slate-300 mt-0.5" />
            <div>
              <div className="text-slate-700">เตือนเมื่อ save QT ที่ใช้ <strong>code</strong> ไม่มีใน catalog</div>
              <p className="text-xs text-slate-500">แสดง modal ให้เลือก: บันทึกแบบนี้ / Promote เข้า catalog / Reassign code</p>
            </div>
          </label>
        </div>
      </section>

      {/* ── Wizard Modal ────────────────────────────────────── */}
      {wizardOpen && (
        <DecisionWizard
          onClose={() => setWizardOpen(false)}
          onOpenTab={(t) => { setWizardOpen(false); onOpenTab(t) }}
        />
      )}

      {/* ── Manual Modal ────────────────────────────────────── */}
      {manualOpen && <ManualModal onClose={() => setManualOpen(false)} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// DashCard
// ────────────────────────────────────────────────────────────────
function DashCard({
  icon, label, value, color, sub, actionLabel, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'emerald' | 'amber' | 'red' | 'orange' | 'slate'
  sub: string
  actionLabel: string
  onClick: () => void
}) {
  const colorMap = {
    emerald: 'text-emerald-600 bg-emerald-50',
    amber:   'text-amber-600 bg-amber-50',
    red:     'text-red-600 bg-red-50',
    orange:  'text-orange-600 bg-orange-50',
    slate:   'text-slate-500 bg-slate-50',
  }[color]
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-2 ${colorMap}`}>{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color === 'slate' ? 'text-slate-600' : `text-${color}-700`}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mb-2 leading-snug">{sub}</p>
      <button onClick={onClick}
        className="text-xs text-[#1B3A5C] font-medium hover:underline inline-flex items-center gap-0.5">
        {actionLabel} <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Decision Wizard (196)
// ────────────────────────────────────────────────────────────────
type WizardAnswer = {
  q1?: 'name_drift' | 'orphan_code' | 'code_clash' | 'special_variant' | 'one_off' | 'split_multi_names'
}

function DecisionWizard({ onClose, onOpenTab }: { onClose: () => void; onOpenTab: (t: 'sync' | 'merge' | 'items') => void }) {
  const [a, setA] = useState<WizardAnswer>({})

  const recommendation = useMemo(() => {
    if (!a.q1) return null
    const map: Record<NonNullable<WizardAnswer['q1']>, { tool: string; tab: 'sync' | 'merge' | 'items' | null; how: string; example: string }> = {
      name_drift: {
        tool: 'Sync Names Tool', tab: 'sync',
        how: 'tab "ซิงก์ชื่อ" → เลือก code → กด ⟳ Sync',
        example: 'แก้ catalog "ผ้าขนหนู 12x12" → "ผ้าขนหนู 12 นิ้ว" → QT เก่ายังเป็นชื่อเดิม → Sync ทีเดียวจบ',
      },
      orphan_code: {
        tool: 'Promote / Reassign', tab: 'sync',
        how: 'tab "ซิงก์ชื่อ" → section "Orphan codes" → เลือก Promote/Reassign/Ignore',
        example: 'E029 "เสื้อสูท" อยู่ใน QT แต่ไม่มีใน catalog → Promote เข้า catalog หรือ Reassign ไป code ที่มี',
      },
      code_clash: {
        tool: 'Merge Codes Tool', tab: 'merge',
        how: 'tab "รวมรหัส" → เลือก source → target → ดำเนินการรวม',
        example: 'H22 + H23 ทั้งคู่คือ "ปลอกหมอนซิบ" → Merge H23 → H22 + ลบ H23',
      },
      special_variant: {
        tool: 'Promote (190)', tab: 'sync',
        how: 'tab "ซิงก์ชื่อ" → row drift → คลิก ⚡ ที่ chip ชื่อพิเศษ',
        example: 'user แก้ใน QT เป็น "ปลอกหมอนซิบ ลายไทย" + ราคา 8 → Promote เป็น H43 ใหม่',
      },
      one_off: {
        tool: 'Ad-hoc item ใน SD', tab: null,
        how: 'หน้า SD → เพิ่ม row → ติ๊ก isAdhoc + กรอก adhocName + adhocPrice',
        example: 'พรมโลโก้โรงแรม 2 ผืน ครั้งเดียว → ad-hoc ใน SD ไม่ปนกับ catalog/stock',
      },
      // 200: split case — 1 รหัส มีหลายชื่อใน QT (ทั้ง drift และ orphan)
      split_multi_names: {
        tool: 'Promote per-name (Split)', tab: 'sync',
        how: 'tab "ซิงก์ชื่อ" → row นั้น (drift หรือ orphan) → คลิก ⚡ ที่ chip "แต่ละชื่อ" แยกกัน',
        example: 'S007 มี 4 ชื่อใน QT (กางเกงนวด รีด/พิมพ์/ขาว/ดำ) → ⚡ ทีละชื่อ → ได้ S007 + S008 + S009 + S010 แยกกัน · QT ทุกใบ valid',
      },
    }
    return map[a.q1]
  }, [a.q1])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh] px-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[88vh] overflow-auto">
        <div className="flex items-start gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Decision Wizard</h3>
            <p className="text-xs text-slate-500 mt-1">ตอบคำถาม → แนะนำ tool ที่ใช้</p>
          </div>
        </div>

        {!a.q1 ? (
          <>
            <p className="text-sm font-medium text-slate-700 mb-3">เจอเหตุการณ์ใด?</p>
            <div className="space-y-2">
              {[
                { v: 'name_drift', label: 'ชื่อ catalog ไม่ตรงกับชื่อใน QT (typo / ปรับคำ)', icon: <RefreshCcw className="w-4 h-4 text-amber-500" /> },
                { v: 'orphan_code', label: 'มี code ใน QT ที่ไม่อยู่ใน catalog', icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
                { v: 'split_multi_names', label: '1 รหัสเดียว มีหลายชื่อใน QT (ต้องการแยกเป็นหลาย code)', icon: <Layers className="w-4 h-4 text-purple-500" /> },
                { v: 'code_clash', label: 'มี code ซ้ำ 2 ตัว ที่จริงเป็นสินค้าเดียวกัน', icon: <Layers className="w-4 h-4 text-orange-500" /> },
                { v: 'special_variant', label: 'user แก้ชื่อใน QT เป็นรายการพิเศษ + ราคาต่าง', icon: <Zap className="w-4 h-4 text-amber-500" /> },
                { v: 'one_off', label: 'รายการพิเศษครั้งเดียว ไม่อยากใส่ catalog ถาวร', icon: <Sparkles className="w-4 h-4 text-blue-500" /> },
              ].map(o => (
                <button key={o.v} onClick={() => setA({ q1: o.v as WizardAnswer['q1'] })}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-[#3DD8D8] hover:bg-[#3DD8D8]/5 flex items-center gap-2.5 text-sm">
                  {o.icon}
                  <span className="text-slate-700">{o.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : recommendation && (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-emerald-800">แนะนำใช้: {recommendation.tool}</span>
              </div>
              <p className="text-sm text-emerald-900 mb-2">
                <strong>วิธีใช้:</strong> {recommendation.how}
              </p>
              <p className="text-xs text-emerald-700">
                <strong>ตัวอย่าง:</strong> {recommendation.example}
              </p>
            </div>
            <div className="flex justify-between gap-2">
              <button onClick={() => setA({})}
                className="px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                ← ถามใหม่
              </button>
              <div className="flex gap-2">
                <button onClick={onClose}
                  className="px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                  ปิด
                </button>
                {recommendation.tab && (
                  <button onClick={() => onOpenTab(recommendation.tab!)}
                    className="px-3 py-2 text-sm bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] flex items-center gap-1.5">
                    เปิด tool ตอนนี้ <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Manual Modal — 8 cases × 4 tools
// ────────────────────────────────────────────────────────────────
function ManualModal({ onClose }: { onClose: () => void }) {
  const cases = [
    { n: 1, name: 'ราคาต่างต่อลูกค้า', tool: '(ไม่ต้องใช้ tool)', note: 'design รองรับ — QT เก็บราคาเฉพาะลูกค้า' },
    { n: 2, name: 'ปรับราคา catalog', tool: '(ไม่ต้องใช้ tool)', note: 'แก้ catalog → QT ใหม่ใช้ราคาใหม่ · QT เก่า frozen' },
    { n: 3, name: 'เปลี่ยนชื่อ catalog (typo)', tool: 'Sync Names', note: 'ซิงก์ชื่อ catalog → QT ทุกใบที่ใช้ code นั้น' },
    { n: 4, name: 'User พิมพ์ชื่อพิเศษใน QT', tool: 'Promote', note: 'สร้าง code ใหม่จากชื่อพิเศษ + ย้าย QT.items.code' },
    { n: 5, name: 'Split: 1 รหัส มีหลายชื่อใน QT (drift หรือ orphan)', tool: 'Promote ⚡ per-name (199)', note: 'คลิก ⚡ บน chip ของแต่ละชื่อ — split ทีละอัน · ครั้งแรกใช้ source code, ครั้งต่อไป suggest code ใหม่อัตโนมัติ' },
    { n: 6, name: 'Code rename (เปลี่ยน naming)', tool: 'Merge Codes', note: 'Source → Target + ติ๊ก "ลบ source"' },
    { n: 7, name: 'Consolidate duplicates', tool: 'Merge Codes', note: 'รวม 2 codes เป็นตัวเดียว — ⚠ option WB/IV' },
    { n: 8, name: 'Ad-hoc one-off', tool: 'SD ad-hoc', note: 'ใส่ใน SD ติ๊ก isAdhoc — ไม่ปน catalog/stock' },
    { n: 9, name: 'Orphan code (ไม่มีใน catalog)', tool: 'Promote / Reassign / Ignore', note: 'tab "ซิงก์ชื่อ" → section Orphan — ตัดสินใจต่อ code: เพิ่มเข้า catalog / ย้ายไป code อื่น / ซ่อน' },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[4vh] px-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 max-h-[92vh] overflow-auto">
        <div className="flex items-start gap-3 mb-4">
          <BookOpen className="w-6 h-6 text-[#1B3A5C] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800">คู่มือ 9 เคส × 4 tools</h3>
            <p className="text-xs text-slate-500 mt-1">ตารางอ้างอิงทุกเคสที่อาจเจอ + เครื่องมือที่ใช้แก้</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-center px-3 py-2 font-medium text-slate-600 w-10">#</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">เคส</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-44">Tool ที่ใช้</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">วิธีแก้</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.n} className="border-t border-slate-100">
                <td className="px-3 py-2 text-center font-mono text-slate-400">{c.n}</td>
                <td className="px-3 py-2 text-slate-700 font-medium">{c.name}</td>
                <td className="px-3 py-2">
                  <span className="text-xs bg-[#3DD8D8]/15 text-[#1B3A5C] px-2 py-0.5 rounded font-medium">{c.tool}</span>
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          💡 <strong>Tip</strong>: ถ้าไม่แน่ใจว่าใช้ tool ไหน → ใช้ <strong>Decision Wizard</strong> ที่ปุ่ม &quot;ไม่แน่ใจว่าใช้ tool ไหน?&quot;
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Helper — read prefs (export ให้ที่อื่น)
// ────────────────────────────────────────────────────────────────
export function getCatalogValidationPrefs(): ValidationPrefs {
  return loadValidation()
}
