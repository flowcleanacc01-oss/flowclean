'use client'

// 390 — Aggregate Config Impact Modal
//   เด้งหลังกด "บันทึก" ใน AggregateGroupsModal เมื่อ config เปลี่ยนจริง (เหมือน QT accept modal)
//   Trap defense 3 layers [[feedback_trap_defense_3_layers]]:
//     #1 Discover — modal เด้ง proactive หลัง save
//     #2 Warn     — นับ LF/adj เก่าที่กระทบ + แยก "calc จะเปลี่ยน" (มี snapshot ต่าง) vs "ล็อกเฉย ๆ" (ไม่มี snapshot)
//     #3 Choose   — 3 ทาง: เก็บค่าเดิม (default) / ตรวจทีละใบ (Audit = 390 B) / ปรับทั้งหมด batch (390 C)
//   390 C: rebuild ในตัว modal — batch 1 ชุด call ต่อ table (กัน fire-and-forget race), reuse buildAggregateSnapshot

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import Modal from './Modal'
import { diffConfigs, selectDriftingDocs } from '@/lib/aggregate-audit'
import { buildAggregateSnapshot } from '@/lib/carry-over-logic'
import { Package, AlertTriangle, CheckCircle2, ArrowRight, Anchor, Wrench } from 'lucide-react'
import type { Customer, AggregateSizeGroupConfig } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  customer: Customer
  prevConfigs: AggregateSizeGroupConfig[]
  nextConfigs: AggregateSizeGroupConfig[]
}

type Step = 'review' | 'confirm' | 'done'

export default function AggregateImpactModal({ open, onClose, customer, prevConfigs, nextConfigs }: Props) {
  const router = useRouter()
  const { linenForms, carryOverAdjustments, linenCatalog, rebuildAggregateSnapshots } = useStore()
  const [step, setStep] = useState<Step>('review')
  const [doneCount, setDoneCount] = useState(0)

  const diff = useMemo(() => diffConfigs(prevConfigs, nextConfigs), [prevConfigs, nextConfigs])

  // 390 C — เอกสารที่ drift จาก config ใหม่ (reuse selectDriftingDocs = เกณฑ์เดียวกับ summarizeAffected/Audit)
  //   แยก recalcNow (snapshot_missing → ล็อกเฉย ๆ) vs driftReview (มี snapshot ต่าง → carry-over จะเปลี่ยน)
  const targets = useMemo(() => {
    const lfDocs = linenForms
      .filter(f => f.customerId === customer.id)
      .map(f => ({ id: f.id, aggregateSnapshot: f.aggregateSnapshot }))
    const adjDocs = carryOverAdjustments
      .filter(a => !a.isDeleted && a.customerId === customer.id)
      .map(a => ({ id: a.id, aggregateSnapshot: a.aggregateSnapshot }))
    const lf = selectDriftingDocs(lfDocs, nextConfigs)
    const adj = selectDriftingDocs(adjDocs, nextConfigs)
    const all = [...lf, ...adj]
    return {
      lfIds: lf.map(t => t.id),
      adjIds: adj.map(t => t.id),
      recalcNow: all.filter(t => !t.recalc).length,   // snapshot_missing → calc เท่าเดิม
      driftReview: all.filter(t => t.recalc).length,   // มี snapshot ต่าง → carry-over จะเปลี่ยน
      total: all.length,
    }
  }, [linenForms, carryOverAdjustments, customer.id, nextConfigs])

  const groupCount = (key: string) => linenCatalog.filter(i => i.sizeGroup === key).length

  const handleClose = () => {
    setStep('review')   // reset เผื่อเปิดซ้ำ
    onClose()
  }

  const goToModeAudit = () => {
    router.push(`/dashboard/reports?tab=aggaudit&customerId=${customer.id}`)
    handleClose()
  }
  const goToAnchorAudit = () => {
    router.push(`/dashboard/reports?tab=anchoraudit&customerId=${customer.id}`)
    handleClose()
  }

  // 390 C — ปรับใบเก่าทั้งหมดเป็น config ใหม่:
  //   snapshot ปลายทาง = config ใหม่ + catalog → anchorCode ติดด้วย (drift-proof reprint, เหมือน LF สร้างใหม่)
  const doRebuild = () => {
    const target = buildAggregateSnapshot(nextConfigs, linenCatalog)
    rebuildAggregateSnapshots(customer.id, customer.shortName || customer.name, targets.lfIds, targets.adjIds, target)
    setDoneCount(targets.total)
    setStep('done')
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`ผลกระทบจากการเปลี่ยนการนับรวมไซส์ — ${customer.shortName || customer.name}`}
      size="lg"
      closeLabel="saved"
    >
      {step === 'done' ? (
        /* ───────── DONE ───────── */
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">ปรับ {doneCount} เอกสารเป็น config ใหม่เรียบร้อย</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                carry-over คำนวณใหม่ตาม config ปัจจุบันแล้ว — ผ้าค้าง/คืน ของใบเหล่านี้และรายงานที่เกี่ยวข้องอัปเดตตามทันที
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={goToModeAudit}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
            >
              ตรวจผลใน Audit<ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1B3A5C] text-white hover:bg-[#122740] transition-colors"
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>
      ) : step === 'confirm' ? (
        /* ───────── CONFIRM (390 C) ───────── */
        <div className="space-y-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 flex items-start gap-2">
            <Wrench className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-orange-900">
              ปรับเอกสารเก่า <strong>{targets.total} ใบ</strong> ของ {customer.shortName || customer.name} ให้ใช้ config ใหม่ (snapshot = config ที่เพิ่งบันทึก)
            </p>
          </div>

          <div className="space-y-2 text-sm">
            {targets.driftReview > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <span className="font-semibold text-amber-800">🟡 {targets.driftReview} ใบ — carry-over จะเปลี่ยน</span>
                <p className="text-xs text-amber-700 mt-0.5">
                  ใบที่เคยล็อก config เดิมไว้ → ปรับเป็น config ใหม่ = ผ้าค้าง/คืน คำนวณใหม่
                </p>
              </div>
            )}
            {targets.recalcNow > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="font-semibold text-slate-700">🔴 {targets.recalcNow} ใบ — ล็อก snapshot (calc เท่าเดิม)</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  ใบที่ไม่มี snapshot ใช้ config ปัจจุบันผ่าน fallback อยู่แล้ว → rebuild แค่ล็อกค่าให้ชัด ไม่เปลี่ยนตัวเลข
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            <p className="font-semibold text-red-900 mb-1">⚠ ก่อนยืนยัน</p>
            col1_carryOver ของ LF ใบถัดไป + รายงานทั้งหมด (drift audit / สรุปปิดเดือน / dashboard) จะ update ตาม ·
            ย้อนกลับด้วยปุ่มเดียวไม่ได้ — ถ้าจะคืนค่าต้องตั้ง config กลับเป็นแบบเดิมแล้ว rebuild อีกครั้ง
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep('review')}
              className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={doRebuild}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Wrench className="w-4 h-4" />ยืนยันปรับ {targets.total} ใบ
            </button>
          </div>
        </div>
      ) : (
        /* ───────── REVIEW ───────── */
        <div className="space-y-4">
          {/* บันทึกแล้ว */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900">
              บันทึก config ใหม่เรียบร้อยแล้ว — ตรวจผลกระทบกับเอกสารเก่าด้านล่างก่อนตัดสินใจ
            </p>
          </div>

          {/* A: เปลี่ยนอะไรบ้าง */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">เปลี่ยนอะไรบ้าง</div>
            <div className="space-y-1.5">
              {diff.added.map(k => (
                <div key={`a-${k}`} className="flex items-center gap-2 text-sm rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                  <span className="text-emerald-700 font-semibold">➕ เปิดนับรวม</span>
                  <span className="font-mono font-bold text-slate-800">{k}</span>
                  <span className="text-xs text-slate-500">· {groupCount(k)} รายการ</span>
                </div>
              ))}
              {diff.removed.map(k => (
                <div key={`r-${k}`} className="flex items-center gap-2 text-sm rounded-lg bg-red-50 border border-red-200 px-3 py-1.5">
                  <span className="text-red-700 font-semibold">➖ ปิดนับรวม</span>
                  <span className="font-mono font-bold text-slate-800">{k}</span>
                </div>
              ))}
              {diff.modified.map(m => (
                <div key={`m-${m.groupKey}`} className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-700 font-semibold">🔀 แก้ไข</span>
                    <span className="font-mono font-bold text-slate-800">{m.groupKey}</span>
                  </div>
                  <ul className="mt-1 ml-6 list-disc text-xs text-slate-600 space-y-0.5">
                    {m.changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* B: เอกสารเก่าที่กระทบ */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              เอกสารเก่าของลูกค้านี้ที่เกี่ยวข้อง
            </div>
            {targets.total === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ไม่มีเอกสารเก่าที่กระทบ — ใช้ config ใหม่กับเอกสารที่สร้างต่อจากนี้ได้เลย
              </div>
            ) : (
              <div className="space-y-2">
                {targets.recalcNow > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      🔴 {targets.recalcNow} ใบ — carry-over คิดตาม config ใหม่ทันที
                    </div>
                    <p className="text-xs text-red-700 mt-1 ml-6">
                      เอกสารเก่าที่ <strong>ไม่มี snapshot</strong> (ก่อน Feat 330) ใช้ config ปัจจุบันเป็นหลัก →
                      เปลี่ยน config = ผ้าค้าง/คืน ของใบเหล่านี้ขยับตาม config ใหม่ (rebuild เพื่อ lock snapshot ได้)
                    </p>
                  </div>
                )}
                {targets.driftReview > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <Package className="w-4 h-4 flex-shrink-0" />
                      🟡 {targets.driftReview} ใบ — มี snapshot ต่างจาก config ใหม่
                    </div>
                    <p className="text-xs text-amber-700 mt-1 ml-6">
                      เอกสารเหล่านี้ <strong>ล็อก config ตอนสร้างไว้แล้ว</strong> → calc เดิมไม่เปลี่ยน (ปลอดภัย) ·
                      rebuild เพื่อปรับให้เป็น config ใหม่ได้ถ้าต้องการ
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* anchor note */}
          {diff.anchorChanged && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 flex items-start gap-2">
              <Anchor className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
              <span>
                <strong>ตำแหน่งรวม (anchor) เปลี่ยน</strong> — LF เก่าที่ snapshot anchor ไว้แล้วยังพิมพ์/รายงานด้วยค่าเดิม ·
                ตรวจ drift ได้ที่แท็บ <strong>⚓ Anchor Drift</strong>
              </span>
            </div>
          )}

          {/* guidance */}
          <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            💡 ปกติ <strong>ไม่ต้อง rebuild</strong> — เอกสารเก่าที่มี snapshot ทำงานถูกตาม config ตอนสร้าง ·
            rebuild เฉพาะเมื่อ ติ๊ดตั้งใจให้ใบเก่าใช้ config ใหม่ (เช่นตอนสร้างเลือก mode ผิด)
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              เก็บค่าเดิมไว้
            </button>
            {diff.anchorChanged && (
              <button
                type="button"
                onClick={goToAnchorAudit}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
              >
                <Anchor className="w-4 h-4" />Anchor Drift
              </button>
            )}
            {targets.total > 0 && (
              <>
                <button
                  type="button"
                  onClick={goToModeAudit}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
                >
                  ตรวจทีละใบ<ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1B3A5C] text-white hover:bg-[#122740] transition-colors inline-flex items-center gap-1.5"
                >
                  <Wrench className="w-4 h-4" />ปรับทั้งหมดเป็น config ใหม่
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
