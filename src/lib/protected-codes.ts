/**
 * 338 — Protected Codes (X-prefix convention)
 *
 * X-prefix = "customer-specific variety placeholder"
 * Pattern: `X` followed by one or more digits (X1, X12, X001, X042, ...)
 *
 * นโยบายของ X-prefix:
 * - ห้าม merge / clean / rename (ติ๊ดใช้เก็บ variety ของลูกค้าเฉพาะราย เช่น SEN)
 * - ห้าม flag เป็น orphan (อยู่นอก catalog โดยตั้งใจ)
 * - ห้าม flag เป็น name drift / code reuse
 *
 * เหตุผล: AI/tool รู้ pattern นี้ → ไม่ไป suggest merge ผิดเคส (เคย wreck SEN config มาแล้ว)
 *
 * Note: legacy customer codes (X0058 ฯลฯ) ใน LegacyDocument.customerCode ไม่ใช่ linen item code
 * → helper นี้ใช้กับ linen item code เท่านั้น ไม่กระทบ legacy customer scan
 */

const X_PREFIX_PATTERN = /^X\d/

export function isProtectedCode(code: string | undefined | null): boolean {
  if (!code) return false
  return X_PREFIX_PATTERN.test(code.trim())
}

export const PROTECTED_CODE_LABEL = '🔒 Protected (X-prefix)'
export const PROTECTED_CODE_REASON = 'X-prefix = customer-specific variety — ห้าม merge / clean / rename'
