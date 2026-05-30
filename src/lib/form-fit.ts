// 396.2 — Fit-to-page form metrics
//
// แก้ root cause 396/396.1: density เดิม (≤N) เป็นแค่ "ป้าย" ไม่ได้คุมว่าเนื้อหา+ลายเซ็นจะพอดี 1 หน้า
// → ลายเซ็นเด้งหน้า 2 / หน้าเปล่า / preview ไม่ตรงพิมพ์จริง
//
// แนวคิด: รู้จำนวนรายการ N + ขนาดหน้า → คำนวณ "ความสูงแถว" ให้ N แถว + overhead เต็มหน้าพอดี
//   → เต็มหน้า (เขียนเยอะ) · ฟอนต์ clamp อ่านออก · ไม่ล้น · ปรับตาม N อัตโนมัติ · AI scan ง่าย
//
// ⚠️ overhead/clamp = ค่าประมาณ (เผื่อ overestimate กันล้น) — ปรับได้หลังติ๊ดเทสพิมพ์จริง

export type FitMode = 'fit' | 'loose' | 'normal' | 'dense'   // พอดีหน้า / โปร่ง / ปกติ / แน่น
export type PrintMode = 'a4' | 'a4-2up'
export type FormKind = 'lf' | 'checklist'

const MM = 3.7795275591   // CSS px ต่อ mm (96dpi)

/** พื้นที่เนื้อหาต่อ 1 หน้า (px) หลังหัก @page margin 5mm ('narrow') ทั้งสองด้าน
 *  a4 เดี่ยว = portrait สูง (297−10)mm · a4-2up = ครึ่ง landscape สูง (210−10)mm */
const PAGE_CONTENT_H: Record<PrintMode, number> = {
  'a4': Math.round((297 - 10) * MM),       // ~1085
  'a4-2up': Math.round((210 - 10) * MM),   // ~756 (ต่อครึ่ง = 1 ใบ)
}

/** overhead = หัวเอกสาร + กล่องชื่อ/วันที่/นับถุง + thead + ลายเซ็น(LF) — px (overestimate กันล้น) */
const OVERHEAD: Record<FormKind, Record<'full' | 'compact', number>> = {
  lf:        { full: 255, compact: 160 },   // มีลายเซ็น (385.1)
  checklist: { full: 210, compact: 125 },   // 392 ถอดลายเซ็น เหลือ hint line
}

const ROW_H_MIN: Record<'full' | 'compact', number> = { full: 22, compact: 15 }
const ROW_H_MAX: Record<'full' | 'compact', number> = { full: 58, compact: 38 }
const FONT_MIN:  Record<'full' | 'compact', number> = { full: 10, compact: 9 }
const FONT_MAX:  Record<'full' | 'compact', number> = { full: 15, compact: 13 }

/** preset (manual) base row height — px */
const PRESET_ROW_H: Record<'full' | 'compact', Record<'loose' | 'normal' | 'dense', number>> = {
  full:    { loose: 46, normal: 32, dense: 24 },
  compact: { loose: 30, normal: 22, dense: 17 },
}

const FONT_RATIO = 0.34    // font ≈ rowH × ratio (clamp)
const FINE_STEP = 0.08     // ปรับละเอียด ±8% ต่อระดับ
export const FINE_MIN = -4
export const FINE_MAX = 4

export interface FormMetrics {
  rowHeightPx: number    // ความสูงแถว (min-height) → พื้นที่เขียน
  fontPx: number         // ฟอนต์ตาราง/รายการ
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** คำนวณ metrics สำหรับ 1 ใบ (N รายการ + แถวว่าง) */
export function computeFormMetrics(
  itemCount: number,
  opts: { kind: FormKind; printMode: PrintMode; fitMode: FitMode; fineLevel: number },
): FormMetrics {
  const size = opts.printMode === 'a4-2up' ? 'compact' : 'full'
  const n = Math.max(1, itemCount)

  let rowH: number
  if (opts.fitMode === 'fit') {
    const tableH = PAGE_CONTENT_H[opts.printMode] - OVERHEAD[opts.kind][size]
    rowH = tableH / n
  } else {
    rowH = PRESET_ROW_H[size][opts.fitMode]
  }

  // ปรับละเอียด ±
  const fine = clamp(opts.fineLevel, FINE_MIN, FINE_MAX)
  rowH = rowH * (1 + fine * FINE_STEP)
  rowH = clamp(rowH, ROW_H_MIN[size], ROW_H_MAX[size])

  const fontPx = clamp(Math.round(rowH * FONT_RATIO), FONT_MIN[size], FONT_MAX[size])
  return { rowHeightPx: Math.floor(rowH), fontPx }   // floor กันล้น (underfill นิดเดียว OK)
}

/** ขนาดกล่อง preview (px) ของ "พื้นที่เนื้อหา 1 หน้า" — กว้าง×สูง (หลัง margin) ใช้วาด page box + คำนวณ zoom */
export function pageBoxPx(printMode: PrintMode): { w: number; h: number; halfW: number } {
  if (printMode === 'a4-2up') {
    // landscape เต็ม (297−10)×(210−10), ครึ่ง = (287/2)
    return { w: Math.round((297 - 10) * MM), h: Math.round((210 - 10) * MM), halfW: Math.round(((297 - 10) / 2) * MM) }
  }
  return { w: Math.round((210 - 10) * MM), h: Math.round((297 - 10) * MM), halfW: 0 }
}
