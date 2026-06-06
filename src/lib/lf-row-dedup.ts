// 413 — Pure helpers สำหรับ dedupe LF row code ซ้ำ (ไม่พึ่ง React — เรียกจาก store + hook ได้)
import type { LinenFormRow } from '@/types'

/** row "ว่าง" = ทุก col นับ (2-6) เป็น 0 — col1 (carry-over auto) ไม่นับ */
export function isRowEmpty(r: LinenFormRow): boolean {
  return (r.col2_hotelCountIn || 0) === 0 &&
    (r.col3_hotelClaimCount || 0) === 0 &&
    (r.col4_factoryApproved || 0) === 0 &&
    (r.col5_factoryClaimApproved || 0) === 0 &&
    (r.col6_factoryPackSend || 0) === 0
}

/** index ของแต่ละ code เรียงตามที่เจอครั้งแรก */
function groupByCode(rows: LinenFormRow[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  rows.forEach((r, i) => {
    if (!m.has(r.code)) m.set(r.code, [])
    m.get(r.code)!.push(i)
  })
  return m
}

/**
 * รวม row ซ้ำให้เหลือ 1 ต่อ code — ปลอดภัยเฉพาะ ghost/latent (row ไม่ว่าง ≤ 1)
 *   - เก็บ row ที่ "ไม่ว่าง" ถ้ามี 1 ตัว, ไม่งั้นเก็บตัวแรก
 *   - ทิ้งเฉพาะ row ว่างที่เกิน — ไม่แตะค่าตัวเลขใดๆ (Absent ≠ Zero safe)
 *   - รักษาลำดับเดิม
 * คืน null ถ้า LF นี้มี code ที่ "ไม่ว่าง ≥ 2" (doubled) — ต้องคนตัดสิน ห้าม auto
 */
export function collapseDuplicateRows(
  rows: LinenFormRow[],
): { rows: LinenFormRow[]; removed: number } | null {
  const byCode = groupByCode(rows)
  // guard: code ใด non-empty ≥ 2 → doubled → ไม่ auto
  for (const idxs of byCode.values()) {
    if (idxs.length < 2) continue
    if (idxs.filter(i => !isRowEmpty(rows[i])).length >= 2) return null
  }
  const keepIdx = new Set<number>()
  let removed = 0
  for (const idxs of byCode.values()) {
    if (idxs.length === 1) { keepIdx.add(idxs[0]); continue }
    const nonEmpty = idxs.filter(i => !isRowEmpty(rows[i]))
    keepIdx.add(nonEmpty.length === 1 ? nonEmpty[0] : idxs[0])
    removed += idxs.length - 1
  }
  if (removed === 0) return { rows, removed: 0 }
  return { rows: rows.filter((_, i) => keepIdx.has(i)), removed }
}

export { groupByCode }
