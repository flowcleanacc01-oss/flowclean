// 396.2 — Fit-to-page form metrics
//
// แก้ root cause 396/396.1: density เดิม (≤N) เป็นแค่ "ป้าย" ไม่ได้คุมว่าเนื้อหา+ลายเซ็นจะพอดี 1 หน้า
// → ลายเซ็นเด้งหน้า 2 / หน้าเปล่า / preview ไม่ตรงพิมพ์จริง
//
// แนวคิด: รู้จำนวนรายการ N + ขนาดหน้า → คำนวณ "ความสูงแถว" ให้ N แถว + overhead เต็มหน้าพอดี
//   → เต็มหน้า (เขียนเยอะ) · ฟอนต์ clamp อ่านออก · ไม่ล้น · ปรับตาม N อัตโนมัติ · AI scan ง่าย
//
// ⚠️ overhead/clamp = ค่าประมาณ (เผื่อ overestimate กันล้น) — ปรับได้หลังติ๊ดเทสพิมพ์จริง

import { PAPER_SIZES, MARGIN_PRESETS, type Orientation, type PaperSize, type MarginPreset } from './print-utils'

export type FitMode = 'fit' | 'loose' | 'normal' | 'dense'   // พอดีหน้า / โปร่ง / ปกติ / แน่น
export type PrintMode = 'a4' | 'a4-2up'
export type FormKind = 'lf' | 'checklist'

const MM = 3.7795275591   // CSS px ต่อ mm (96dpi)

/** 408 — แนวกระดาษจริงของ 1 ใบ: a4-2up เป็น landscape เสมอ (A4 แนวนอน ฉีกครึ่ง = 2 ใบ),
 *  a4 เดี่ยว = ตามที่ user เลือก (รองรับ AKARA landscape — 376.6) */
export function effectiveOrientation(printMode: PrintMode, orientation: Orientation): Orientation {
  return printMode === 'a4-2up' ? 'landscape' : orientation
}

/** 408 — พื้นที่เนื้อหา 1 ใบ (px) = (ด้านสูงของหน้า − ขอบบน-ล่าง) คำนวณจาก paper/orientation/margin จริง
 *  เดิม hardcode 297/210 − 10mm (narrow) → ถ้า user เปลี่ยน margin/แนว/ขนาด จะคำนวณผิด → ล้น
 *  ค่า default (A4 · a4=portrait/a4-2up=landscape · narrow) = ค่าเดิม (a4 ~1085 · a4-2up ~756) ไม่กระทบ 405 */
function pageContentHpx(printMode: PrintMode, orientation: Orientation, paperSize: PaperSize, margin: MarginPreset): number {
  const p = PAPER_SIZES[paperSize]
  const ori = effectiveOrientation(printMode, orientation)
  const pageHmm = ori === 'portrait' ? p.height : p.width   // portrait=สูง, landscape=กว้างกลายเป็นสูง
  const m = MARGIN_PRESETS[margin].value
  return Math.round((pageHmm - 2 * m) * MM)
}

/** overhead = หัวเอกสาร + กล่องชื่อ/วันที่/นับถุง + thead + ลายเซ็น(LF) — px (overestimate กันล้น)
 *  405 — re-tune: ค่าเดิม underestimate → fit จัด content เต็มหน้าเป๊ะ → ล้นเป็นหน้า 2 (ติ๊ดเจอ CK 2-up)
 *  วัด chrome จริง: CK compact ≈ หัว(46)+กล่อง(50)+thead 3 บรรทัด(34)+border(4)+hint(15) ≈ 150-165px
 *                  LF compact ≈ +ลายเซ็น (sigGap+sigLineH ผูกกับ rowHeight → สูงได้ถึง ~84px)
 *  → ตั้งให้ "เผื่อมากกว่าจริง" (เหลือพื้นที่ว่างล่างนิดหน่อย = OK · ล้นหน้า 2 = ห้าม) */
const OVERHEAD: Record<FormKind, Record<'full' | 'compact', number>> = {
  lf:        { full: 265, compact: 210 },   // มีลายเซ็น (385.1) — compact 160→210 (ลายเซ็นโตตาม rowHeight)
  checklist: { full: 240, compact: 180 },   // 392 ถอดลายเซ็น เหลือ hint line — compact 125→180 (root cause หน้า 2)
}

/** 405 — safety buffer: หักเพิ่มจากพื้นที่หน้า (mode 'fit' เท่านั้น) เพื่อให้ content "underfill"
 *  เสมอ — กัน rounding mm→px + ความหนา border สะสม ดันล้นไปหน้า 2 (เนื้อหาเต็มหน้าเป๊ะ = เปราะ) */
const FIT_SAFETY_PX = 24

const ROW_H_MIN: Record<'full' | 'compact', number> = { full: 22, compact: 15 }
// 398.2 — compact cap 38→72: CK ส่วนมาก 5-10 แถว เดิม fit ชน 38 ทำให้ตารางเล็ก หน้าโล่ง เติมไม่เต็ม A5
const ROW_H_MAX: Record<'full' | 'compact', number> = { full: 58, compact: 72 }
const FONT_MIN:  Record<'full' | 'compact', number> = { full: 10, compact: 9 }
// 398.2 — compact 13→15: แถวสูงขึ้นได้ ฟอนต์ใหญ่ตามอ่านง่าย
const FONT_MAX:  Record<'full' | 'compact', number> = { full: 15, compact: 15 }

/** preset (manual) base row height — px */
// 398.2 — re-tune compact (เดิม 30/22/17 ทุกค่า < fit(≤38) → 3 ปุ่ม "โปร่ง/ปกติ/แน่น" กลายเป็นแค่ระดับบีบ)
//   ใหม่ 56/40/28: span ตั้งแต่โปร่ง→แน่น ใช้ได้จริงสำหรับ CK 5-10 แถว (full คงเดิม — LF a4 เดี่ยว 10-30 แถวพอดีอยู่แล้ว)
const PRESET_ROW_H: Record<'full' | 'compact', Record<'loose' | 'normal' | 'dense', number>> = {
  full:    { loose: 46, normal: 32, dense: 24 },
  compact: { loose: 56, normal: 40, dense: 28 },
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

/** คำนวณ metrics สำหรับ 1 ใบ (N รายการ + แถวว่าง)
 *  408 — opts.orientation/paperSize/margin (optional) → fit ตามแนว/ขนาด/ขอบจริง
 *        default: A4 · a4=portrait/a4-2up=landscape · narrow (= พฤติกรรมเดิม) */
export function computeFormMetrics(
  itemCount: number,
  opts: {
    kind: FormKind; printMode: PrintMode; fitMode: FitMode; fineLevel: number
    orientation?: Orientation; paperSize?: PaperSize; margin?: MarginPreset
  },
): FormMetrics {
  const size = opts.printMode === 'a4-2up' ? 'compact' : 'full'
  const n = Math.max(1, itemCount)
  const orientation = opts.orientation ?? (opts.printMode === 'a4-2up' ? 'landscape' : 'portrait')
  const paperSize = opts.paperSize ?? 'A4'
  const margin = opts.margin ?? 'narrow'

  let rowH: number
  if (opts.fitMode === 'fit') {
    // 405 — หัก safety เพิ่ม → content < พื้นที่พิมพ์จริงเสมอ (underfill กันล้นหน้า 2)
    const tableH = pageContentHpx(opts.printMode, orientation, paperSize, margin) - OVERHEAD[opts.kind][size] - FIT_SAFETY_PX
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

/** ขนาดกล่อง preview (px) ของ "พื้นที่เนื้อหา 1 หน้า" — กว้าง×สูง (หลัง margin) ใช้วาด page box + คำนวณ zoom
 *  408 — orientation/paperSize/margin (optional) → กล่อง preview ตรงกับที่พิมพ์จริง (รวม landscape เดี่ยว)
 *        default (A4 · a4=portrait/a4-2up=landscape · narrow) = ค่าเดิม */
export function pageBoxPx(
  printMode: PrintMode,
  orientation?: Orientation, paperSize?: PaperSize, margin?: MarginPreset,
): { w: number; h: number; halfW: number } {
  const ori = effectiveOrientation(printMode, orientation ?? (printMode === 'a4-2up' ? 'landscape' : 'portrait'))
  const p = PAPER_SIZES[paperSize ?? 'A4']
  const m = MARGIN_PRESETS[margin ?? 'narrow'].value
  const wmm = (ori === 'portrait' ? p.width : p.height) - 2 * m
  const hmm = (ori === 'portrait' ? p.height : p.width) - 2 * m
  const w = Math.round(wmm * MM)
  return { w, h: Math.round(hmm * MM), halfW: printMode === 'a4-2up' ? Math.round(w / 2) : 0 }
}
