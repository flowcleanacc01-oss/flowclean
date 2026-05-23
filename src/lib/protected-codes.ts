/**
 * 338 → 347 — Item-level Lock (replaces X-prefix regex)
 *
 * History:
 * - 338: hardcoded regex /^X\d/ → ตั้งใจ block X-prefix variety codes
 *        แต่ "ดูแปลกๆ" (ติ๊ด feedback) — ผูก convention ของระบบกับ pattern ของ user
 * - 347: admin lock/unlock per linen_item ผ่าน is_protected field
 *        + protected_reason / by / at audit
 *        admin คนอื่นเห็น "อย่าแตะ" แต่ยังปลดล็อคได้ถ้าจำเป็น
 *
 * Usage:
 *   const item = catalogMap.get(code)
 *   if (isProtectedItem(item)) { ... block / warn ... }
 */
import type { LinenItemDef } from '@/types'

export function isProtectedItem(item: LinenItemDef | undefined | null): boolean {
  return !!item?.isProtected
}

export const PROTECTED_CODE_REASON = 'รายการนี้ถูกล็อคโดย admin — ใช้ปุ่ม Unlock ก่อนถ้าต้องการแก้ไข'
