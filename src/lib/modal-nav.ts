/**
 * Modal Keyboard Navigation (Feature 117)
 *
 * Pattern มาตรฐาน arrow/enter navigation สำหรับ number inputs ใน modals
 * ห้าม arrow keys เปลี่ยนค่าตัวเลข — ใช้ navigate ระหว่าง rows แทน
 *
 * 2 helper functions:
 * - tabularNumberNav: สำหรับตารางหลาย rows (CarryOverAdjustModal, DiscrepancyHelperModal)
 * - blockNumberArrowKeys: สำหรับ single input (PaymentRecordModal และอื่นๆ)
 */

/**
 * Navigation ระหว่าง inputs ใน tabular modal
 * - ↑ / ↓ : เลื่อน row (skip rows ที่ไม่มี input เช่น unselected rows)
 * - Enter : เลื่อน row ถัดไป
 *
 * ใช้โดย:
 * 1. เพิ่ม data-attribute ที่ input แต่ละตัว (เช่น data-navrow={rowIndex})
 * 2. เรียก tabularNumberNav(e, 'data-navrow', rowIndex, maxIndex) ใน onKeyDown
 *
 * @param attrName - data attribute ที่ใช้ query (เช่น 'data-navrow')
 * @param currentIndex - index ปัจจุบัน
 * @param maxIndex - index สูงสุด (bounds check — skip unselected rows ได้)
 */
export function tabularNumberNav(
  e: React.KeyboardEvent<HTMLInputElement>,
  attrName: string,
  currentIndex: number,
  maxIndex: number,
) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return
  e.preventDefault()
  const dir = e.key === 'ArrowUp' ? -1 : 1
  let nextIdx = currentIndex + dir
  while (nextIdx >= 0 && nextIdx <= maxIndex) {
    const next = document.querySelector<HTMLInputElement>(
      `input[${attrName}="${nextIdx}"]`,
    )
    if (next) {
      next.focus()
      next.select()
      return
    }
    nextIdx += dir
  }
}

/**
 * Block ArrowUp/ArrowDown จากการเปลี่ยนค่า number input (single input case)
 * ใช้กับ single field เช่น payment amount
 */
export function blockNumberArrowKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
  }
}
