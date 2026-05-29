'use client'

// 390 — Aggregate Config Impact Modal
//   เด้งหลังกด "บันทึก" ใน AggregateGroupsModal เมื่อ config เปลี่ยนจริง (เหมือน QT accept modal)
//   Trap defense 3 layers [[feedback_trap_defense_3_layers]]:
//     #1 Discover — modal เด้ง proactive หลัง save
//     #2 Warn     — นับ LF/adj เก่าที่กระทบ + แยก "recalc ทันที" (ไม่มี snapshot) vs "drift review" (มี snapshot ต่าง)
//     #3 Block    — ไม่ auto rebuild · ปุ่ม default = "เก็บค่าเดิมไว้" · rebuild ต้องเข้า audit เอง

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import Modal from './Modal'
import { diffConfigs, summarizeAffected } from '@/lib/aggregate-audit'
import type { AggregateSnapshot } from '@/lib/carry-over-logic'
import { Package, AlertTriangle, CheckCircle2, ArrowRight, Anchor } from 'lucide-react'
import type { Customer, AggregateSizeGroupConfig } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  customer: Customer
  prevConfigs: AggregateSizeGroupConfig[]
  nextConfigs: AggregateSizeGroupConfig[]
}

export default function AggregateImpactModal({ open, onClose, customer, prevConfigs, nextConfigs }: Props) {
  const router = useRouter()
  const { linenForms, carryOverAdjustments, linenCatalog } = useStore()

  const diff = useMemo(() => diffConfigs(prevConfigs, nextConfigs), [prevConfigs, nextConfigs])

  const affected = useMemo(() => {
    const snaps: (AggregateSnapshot | undefined)[] = [
      ...linenForms.filter(f => f.customerId === customer.id).map(f => f.aggregateSnapshot),
      ...carryOverAdjustments.filter(a => !a.isDeleted && a.customerId === customer.id).map(a => a.aggregateSnapshot),
    ]
    return summarizeAffected(snaps, nextConfigs)
  }, [linenForms, carryOverAdjustments, customer.id, nextConfigs])

  const groupCount = (key: string) => linenCatalog.filter(i => i.sizeGroup === key).length
  const totalAffected = affected.recalcNow + affected.driftReview

  const goToModeAudit = () => {
    router.push(`/dashboard/reports?tab=aggaudit&customerId=${customer.id}`)
    onClose()
  }
  const goToAnchorAudit = () => {
    router.push(`/dashboard/reports?tab=anchoraudit&customerId=${customer.id}`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`ผลกระทบจากการเปลี่ยนการนับรวมไซส์ — ${customer.shortName || customer.name}`}
      size="lg"
      closeLabel="saved"
    >
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
          {totalAffected === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ไม่มีเอกสารเก่าที่กระทบ — ใช้ config ใหม่กับเอกสารที่สร้างต่อจากนี้ได้เลย
            </div>
          ) : (
            <div className="space-y-2">
              {affected.recalcNow > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    🔴 {affected.recalcNow} ใบ — carry-over คิดตาม config ใหม่ทันที
                  </div>
                  <p className="text-xs text-red-700 mt-1 ml-6">
                    เอกสารเก่าที่ <strong>ไม่มี snapshot</strong> (ก่อน Feat 330) ใช้ config ปัจจุบันเป็นหลัก →
                    เปลี่ยน config = ผ้าค้าง/คืน ของใบเหล่านี้ขยับตาม config ใหม่ (เข้า audit เพื่อ lock snapshot ได้)
                  </p>
                </div>
              )}
              {affected.driftReview > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                    <Package className="w-4 h-4 flex-shrink-0" />
                    🟡 {affected.driftReview} ใบ — มี snapshot ต่างจาก config ใหม่
                  </div>
                  <p className="text-xs text-amber-700 mt-1 ml-6">
                    เอกสารเหล่านี้ <strong>ล็อก config ตอนสร้างไว้แล้ว</strong> → calc เดิมไม่เปลี่ยน (ปลอดภัย) ·
                    เข้า audit เพื่อ review/rebuild เป็น config ใหม่ได้ถ้าต้องการ
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
            onClick={onClose}
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
          {totalAffected > 0 && (
            <button
              type="button"
              onClick={goToModeAudit}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1B3A5C] text-white hover:bg-[#122740] transition-colors inline-flex items-center gap-1.5"
            >
              เปิด Aggregate Mode Audit<ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
