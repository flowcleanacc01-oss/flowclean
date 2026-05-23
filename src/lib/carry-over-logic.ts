// 330 — Group-aware carry-over diff
//
// แก้ "infinity bug" เมื่อ customer ใช้ aggregate size groups:
//   - col5 (หรือ col2) เก็บที่ row anchor → ค่ารวมทั้งกลุ่ม
//   - col6 (หรือ col4) เก็บ per-row → กระจายแต่ละไซส์
//   - Per-row diff (col6_row - col5_row) → +Σ at non-anchor, -col5_anchor at anchor
//   - หักล้างกัน rows ใน LF เดียว = net จริง ก็ true แต่
//     เก็บ per-code → ทุก LF ทบกันไปเรื่อยๆ → runaway ทั้ง 2 ทิศ
//
// Solution: group-aware diff
//   - ถ้า col ที่ใช้ใน mode คือ aggregate → sum diff ทั้งกลุ่ม → store ที่ anchor
//   - ถ้าไม่ใช่ → per-row เหมือนเดิม
//
// Mode × Combination:
//   Mode 1 (col6-col5) + col5Mode=agg     → group sum at anchor
//   Mode 2 (col6-c2-c3) + col2Mode=agg    → group sum at anchor
//   Mode 3 (col4-col5) + col5Mode=agg     → group sum at anchor
//   Mode 4 (col4-c2-c3) + col2Mode=agg    → group sum at anchor
//   ที่เหลือทุก mode → per-row

import type {
  LinenItemDef,
  LinenFormRow,
  Customer,
  CarryOverMode,
  AggregateSizeGroupConfig,
} from '@/types'
import { getGroupAnchorCode } from './aggregate-groups'

/** Snapshot ของ aggregate config ที่ LF บันทึกตอนสร้าง
 *  A1 (354.1): เพิ่ม anchorCode per group → drift-proof reprint
 *  - LF เก่า ก่อน A1 → anchorCode undefined → fallback หาจาก catalog/customer
 *  - LF ใหม่ → snapshot anchor ตั้งแต่สร้าง → reprint ใช้ anchor เดิม ไม่ใช่ปัจจุบัน
 */
export type AggregateSnapshot = Record<
  string,
  {
    col2Mode: 'aggregate' | 'per_row'
    col5Mode: 'aggregate' | 'per_row'
    /** A1: anchor code ตอน LF สร้าง — กัน drift เมื่อ customer config เปลี่ยน */
    anchorCode?: string
  }
>

/** สร้าง snapshot จาก customer.aggregateSizeGroups (สำหรับ LF ใหม่ + fallback ของ LF เก่า)
 *  A1: รับ catalog เป็น optional → ถ้าให้มา → คำนวณ anchor + snapshot ไว้ด้วย
 */
export function buildAggregateSnapshot(
  configs: AggregateSizeGroupConfig[] | undefined,
  catalog?: LinenItemDef[],
): AggregateSnapshot | undefined {
  if (!configs || configs.length === 0) return undefined
  const snapshot: AggregateSnapshot = {}
  for (const c of configs) {
    snapshot[c.groupKey] = {
      col2Mode: c.col2Mode,
      col5Mode: c.col5Mode ?? 'aggregate',
    }
    // A1: snapshot anchor ถ้ามี catalog
    if (catalog) {
      const groupItems = catalog.filter(i => i.sizeGroup === c.groupKey)
      if (groupItems.length > 0) {
        snapshot[c.groupKey].anchorCode = getGroupAnchorCode(groupItems, c.anchorCode)
      }
    }
  }
  return snapshot
}

/**
 * Pre-compute anchor code ของแต่ละ group จาก catalog
 *
 * @param configAnchors  Optional map: groupKey → anchor code (จาก customer.aggregateSizeGroups)
 *                       ถ้าระบุ → ใช้ override, ไม่งั้น fallback median (335)
 */
export function computeAnchorByGroup(
  groupKeys: Iterable<string>,
  catalog: LinenItemDef[],
  configAnchors?: Map<string, string>,
): Map<string, string> {
  const result = new Map<string, string>()
  for (const groupKey of groupKeys) {
    const items = catalog.filter(i => i.sizeGroup === groupKey)
    if (items.length > 0) {
      result.set(groupKey, getGroupAnchorCode(items, configAnchors?.get(groupKey)))
    }
  }
  return result
}

/** Per-row raw diff (เหมือน logic เดิม) */
export function rowDiff(row: LinenFormRow, mode: CarryOverMode): number {
  switch (mode) {
    case 1: return (row.col6_factoryPackSend || 0) - row.col5_factoryClaimApproved
    case 2: return (row.col6_factoryPackSend || 0) - (row.col2_hotelCountIn + row.col3_hotelClaimCount)
    case 3: return row.col4_factoryApproved - row.col5_factoryClaimApproved
    case 4: return row.col4_factoryApproved - (row.col2_hotelCountIn + row.col3_hotelClaimCount)
  }
}

/** Mode ใช้ col5 หรือ col2 — กำหนดว่าจะตรวจ col5Mode หรือ col2Mode */
export function modeUsesCol(mode: CarryOverMode): 'col5' | 'col2' {
  return mode === 1 || mode === 3 ? 'col5' : 'col2'
}

/**
 * เช็คว่าควร accumulate ระดับ group สำหรับ row นี้+mode นี้ไหม
 *
 * @returns groupKey ถ้า aggregate active, undefined ถ้า per-row
 */
export function shouldAggregateForMode(
  itemCode: string,
  mode: CarryOverMode,
  catalogMap: Map<string, LinenItemDef>,
  snapshot: AggregateSnapshot | undefined,
): string | undefined {
  if (!snapshot) return undefined
  const item = catalogMap.get(itemCode)
  const groupKey = item?.sizeGroup
  if (!groupKey) return undefined
  const cfg = snapshot[groupKey]
  if (!cfg) return undefined
  const usesCol = modeUsesCol(mode)
  if (usesCol === 'col5' && cfg.col5Mode === 'aggregate') return groupKey
  if (usesCol === 'col2' && cfg.col2Mode === 'aggregate') return groupKey
  return undefined
}

/**
 * Process LF rows → return per-code diffs ที่จะ apply
 *
 * Group-aware: rows ใน aggregate group → sum diff แล้ว store ที่ anchor
 * Per-row: rows ที่ไม่อยู่ใน aggregate → diff per code (เหมือนเดิม)
 *
 * @param resetSkipper  callback ที่บอกว่า row code นี้ + LF date นี้ ควร skip ไหม
 *                       (สำหรับ reset checkpoint logic)
 */
export function diffsForForm(
  rows: LinenFormRow[],
  effectiveMode: CarryOverMode,
  snapshot: AggregateSnapshot | undefined,
  catalogMap: Map<string, LinenItemDef>,
  anchorByGroup: Map<string, string>,
  resetSkipper: (code: string) => boolean,
): Record<string, number> {
  const result: Record<string, number> = {}
  const groupAccum = new Map<string, number>()

  for (const row of rows) {
    if (resetSkipper(row.code)) continue
    const diff = rowDiff(row, effectiveMode)
    const groupKey = shouldAggregateForMode(row.code, effectiveMode, catalogMap, snapshot)
    if (groupKey) {
      // Accumulate to group — apply ที่ anchor หลัง loop
      groupAccum.set(groupKey, (groupAccum.get(groupKey) || 0) + diff)
    } else if (diff !== 0) {
      result[row.code] = (result[row.code] || 0) + diff
    }
  }

  // Apply group totals to anchor codes
  for (const [groupKey, total] of groupAccum) {
    if (total === 0) continue
    const anchorCode = anchorByGroup.get(groupKey)
    if (!anchorCode) continue
    result[anchorCode] = (result[anchorCode] || 0) + total
  }

  return result
}
