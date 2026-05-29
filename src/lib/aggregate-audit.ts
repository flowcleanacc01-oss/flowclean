// 330 Phase B + 390 — Aggregate config drift logic (pure, framework-agnostic)
//
// Shared โดย:
//   - AggregateModeAudit.tsx  (เครื่องมือ scan ย้อนหลัง — 330 Phase B)
//   - AggregateImpactModal.tsx (modal เด้งหลัง save config — 390)
//
// 390: extract compareSnapshots / stringifySnap / types / REASON_CONFIG ออกจาก AggregateModeAudit
//      มาไว้ที่นี่ → single source of truth ของ "เหตุผล drift" (reuse แทน duplicate)

import type { AggregateSizeGroupConfig } from '@/types'
import { buildAggregateSnapshot, type AggregateSnapshot } from './carry-over-logic'

export type AggReason =
  | 'snapshot_missing'    // LF/adj ไม่มี snapshot — fallback ใช้ customer config ปัจจุบัน
  | 'snapshot_mismatch'   // snapshot ≠ customer ปัจจุบัน (mode ของ group เปลี่ยน)
  | 'extra_groups'        // snapshot มี group ที่ customer ลบแล้ว
  | 'missing_groups'      // customer เพิ่ม group ใหม่หลัง doc สร้าง

export type AggSeverity = 'critical' | 'high' | 'warning' | 'info'

export const REASON_CONFIG: Record<AggReason, { label: string; color: string; icon: string }> = {
  snapshot_missing:  { label: 'ไม่มี snapshot',          color: 'amber',  icon: '❓' },
  snapshot_mismatch: { label: 'snapshot ≠ ปัจจุบัน',     color: 'orange', icon: '🔀' },
  extra_groups:      { label: 'มี group ที่ลบแล้ว',      color: 'orange', icon: '➖' },
  missing_groups:    { label: 'ขาด group ใหม่',          color: 'amber',  icon: '➕' },
}

/** Stringify config ให้เปรียบเทียบได้ + แสดงผล */
export function stringifySnap(snap: AggregateSnapshot | undefined): string {
  if (!snap) return '(none)'
  const keys = Object.keys(snap).sort()
  if (keys.length === 0) return '(empty)'
  return keys.map(k => `${k}:c2=${snap[k].col2Mode[0]}/c5=${snap[k].col5Mode[0]}`).join(', ')
}

/** เปรียบเทียบ snapshot 2 ตัว — เหมือนกัน return reason null, ต่าง return reason
 *  หมายเหตุ: เทียบเฉพาะ col2Mode/col5Mode + group keys (ไม่เทียบ anchorCode — anchor มี audit แยก) */
export function compareSnapshots(
  lfSnap: AggregateSnapshot | undefined,
  curSnap: AggregateSnapshot | undefined,
): { reason: AggReason | null; severity: AggSeverity; detail: string } {
  // ทั้งคู่ไม่มี → ไม่มี aggregate config → OK
  if (!lfSnap && !curSnap) {
    return { reason: null, severity: 'info', detail: 'ไม่ใช้ aggregate' }
  }
  // LF ไม่มี + customer มี → fallback active
  if (!lfSnap && curSnap) {
    return {
      reason: 'snapshot_missing',
      severity: 'warning',
      detail: 'LF ไม่มี snapshot (เก่าก่อน 330) — calc carry-over ใช้ customer ปัจจุบัน',
    }
  }
  // LF มี + customer ไม่มี → LF ติด config เก่า, customer ลบ groups ไปแล้ว
  if (lfSnap && !curSnap) {
    return {
      reason: 'extra_groups',
      severity: 'high',
      detail: `LF snapshot มี ${Object.keys(lfSnap).length} group แต่ customer ไม่มี aggregate config แล้ว`,
    }
  }
  // ทั้งคู่มี → เปรียบเทียบเนื้อหา
  if (lfSnap && curSnap) {
    const lfKeys = Object.keys(lfSnap)
    const curKeys = Object.keys(curSnap)
    const extra = lfKeys.filter(k => !curKeys.includes(k))
    const missing = curKeys.filter(k => !lfKeys.includes(k))
    const common = lfKeys.filter(k => curKeys.includes(k))
    const modeChanged = common.filter(
      k => lfSnap[k].col2Mode !== curSnap[k].col2Mode || lfSnap[k].col5Mode !== curSnap[k].col5Mode,
    )
    if (extra.length === 0 && missing.length === 0 && modeChanged.length === 0) {
      return { reason: null, severity: 'info', detail: 'ตรงปัจจุบัน' }
    }
    const parts: string[] = []
    if (modeChanged.length > 0) parts.push(`mode เปลี่ยน: ${modeChanged.join(', ')}`)
    if (extra.length > 0) parts.push(`group ที่ลบ: ${extra.join(', ')}`)
    if (missing.length > 0) parts.push(`group ใหม่: ${missing.join(', ')}`)
    let reason: AggReason = 'snapshot_mismatch'
    let sev: AggSeverity = 'high'
    if (modeChanged.length === 0 && extra.length === 0 && missing.length > 0) {
      reason = 'missing_groups'
      sev = 'warning'
    } else if (modeChanged.length === 0 && missing.length === 0 && extra.length > 0) {
      reason = 'extra_groups'
      sev = 'high'
    }
    return { reason, severity: sev, detail: parts.join(' · ') }
  }
  return { reason: null, severity: 'info', detail: '' }
}

// ============================================================
// 390 — Config-level diff (สำหรับ Impact Modal)
// ============================================================

function modeLabel(m: 'aggregate' | 'per_row'): string {
  return m === 'aggregate' ? 'รวม' : 'แยกไซส์'
}

export interface AggConfigDiff {
  added: string[]                                          // groupKey ที่เพิ่งเปิด aggregate
  removed: string[]                                        // groupKey ที่เพิ่งปิด
  modified: { groupKey: string; changes: string[] }[]      // mode / anchor เปลี่ยน
  anchorChanged: boolean                                   // มี group ไหน anchor เปลี่ยนไหม (audit แยก)
  modeGroupChanged: boolean                                // added/removed/mode เปลี่ยน (กระทบ carry-over calc)
  hasChanges: boolean
}

/** เทียบ config เก่า/ใหม่ → ใช้ตัดสินว่าควรเด้ง impact modal + แสดงว่าเปลี่ยนอะไร */
export function diffConfigs(
  prev: AggregateSizeGroupConfig[] | undefined,
  next: AggregateSizeGroupConfig[] | undefined,
): AggConfigDiff {
  const p = prev ?? []
  const n = next ?? []
  const pMap = new Map(p.map(c => [c.groupKey, c]))
  const nMap = new Map(n.map(c => [c.groupKey, c]))

  const added = n.filter(c => !pMap.has(c.groupKey)).map(c => c.groupKey)
  const removed = p.filter(c => !nMap.has(c.groupKey)).map(c => c.groupKey)

  const modified: { groupKey: string; changes: string[] }[] = []
  let anchorChanged = false
  let modeChangedInModified = false
  for (const c of n) {
    const prevC = pMap.get(c.groupKey)
    if (!prevC) continue  // group ใหม่ → อยู่ใน added แล้ว
    const changes: string[] = []
    if (prevC.col2Mode !== c.col2Mode) {
      changes.push(`ลูกค้านับส่ง (col2): ${modeLabel(prevC.col2Mode)} → ${modeLabel(c.col2Mode)}`)
      modeChangedInModified = true
    }
    const prevCol5 = prevC.col5Mode ?? 'aggregate'
    const nextCol5 = c.col5Mode ?? 'aggregate'
    if (prevCol5 !== nextCol5) {
      changes.push(`โรงซักนับเข้า (col5): ${modeLabel(prevCol5)} → ${modeLabel(nextCol5)}`)
      modeChangedInModified = true
    }
    if ((prevC.anchorCode || '') !== (c.anchorCode || '')) {
      changes.push(`ตำแหน่งรวม (anchor): ${prevC.anchorCode || 'อัตโนมัติ'} → ${c.anchorCode || 'อัตโนมัติ'}`)
      anchorChanged = true
    }
    if (changes.length) modified.push({ groupKey: c.groupKey, changes })
  }

  const modeGroupChanged = added.length > 0 || removed.length > 0 || modeChangedInModified
  const hasChanges = modeGroupChanged || anchorChanged
  return { added, removed, modified, anchorChanged, modeGroupChanged, hasChanges }
}

// ============================================================
// 390 — สรุปเอกสารเก่าที่กระทบ (สำหรับ Impact Modal)
// ============================================================

export interface AffectedSummary {
  scanned: number                          // docs ที่เกี่ยว aggregate (มี snapshot หรือ config ใหม่ไม่ว่าง)
  recalcNow: number                        // snapshot_missing → ใช้ config ปัจจุบัน fallback → carry-over recalc ทันที
  driftReview: number                      // มี snapshot แต่ต่าง → calc เดิม insulated, review/rebuild ได้
  byReason: Record<AggReason, number>
}

/**
 * เทียบ snapshot ของเอกสารเก่าทุกใบ (LF + adjustment) กับ config ใหม่
 * → นับว่ากระทบกี่ใบ + แยกเป็น recalc-ทันที (ไม่มี snapshot) vs drift-review (มี snapshot ต่าง)
 *
 * @param snapshots  รายการ aggregateSnapshot ของ LF/adj ของลูกค้าคนนั้น (undefined = ไม่มี)
 * @param nextConfigs  config ใหม่ที่เพิ่งบันทึก
 */
export function summarizeAffected(
  snapshots: (AggregateSnapshot | undefined)[],
  nextConfigs: AggregateSizeGroupConfig[] | undefined,
): AffectedSummary {
  const curSnap = buildAggregateSnapshot(nextConfigs)
  const byReason: Record<AggReason, number> = {
    snapshot_missing: 0, snapshot_mismatch: 0, extra_groups: 0, missing_groups: 0,
  }
  let scanned = 0, recalcNow = 0, driftReview = 0
  for (const snap of snapshots) {
    // ข้าม docs ที่ไม่เกี่ยว aggregate เลย (ไม่มี snapshot + config ใหม่ก็ว่าง)
    if (!snap && !curSnap) continue
    scanned++
    const { reason } = compareSnapshots(snap, curSnap)
    if (reason === null) continue
    byReason[reason]++
    if (reason === 'snapshot_missing') recalcNow++
    else driftReview++
  }
  return { scanned, recalcNow, driftReview, byReason }
}
