/**
 * 241 — Thai-aware search helper (tolerant filter)
 *
 * Behavior:
 *   - English/digits only → plain substring match (logic เดิม, ไม่กระทบ performance)
 *   - มี Thai char → ลอง substring ก่อน → fallback phonetic match (ซิป↔ซิบ, ฟ↔ฝ)
 *
 * Source of truth ของ phonetic classes — ก่อนหน้า logic นี้อยู่ใน use-similar-items.ts
 * แต่ใช้แค่ใน AddItemWizard เท่านั้น · 241 ย้ายมาที่ shared util เพื่อใช้ใน list filters ทั่วระบบ
 */

/**
 * 218.1 — Thai phonetic class mapping
 * ตัวอักษรที่ออกเสียงใกล้กันในภาษาไทย → map เป็น class เดียว
 * เพื่อให้ "ซิป" ≈ "ซิบ", "ฟอง" ≈ "ฝอง", "ฉัน" ≈ "ชั้น" ฯลฯ
 */
export const PHONETIC_CLASSES: Record<string, string> = {
  // P class — บ/ป/พ/ผ/ภ
  'บ': 'P', 'ป': 'P', 'พ': 'P', 'ผ': 'P', 'ภ': 'P',
  // S class — ส/ซ/ศ/ษ
  'ส': 'S', 'ซ': 'S', 'ศ': 'S', 'ษ': 'S',
  // K class — ก/ค/ข/ฆ
  'ก': 'K', 'ค': 'K', 'ข': 'K', 'ฆ': 'K',
  // T class — ท/ต/ฏ/ฐ/ฑ/ฒ/ด/ถ/ธ
  'ท': 'T', 'ต': 'T', 'ฏ': 'T', 'ฐ': 'T', 'ฑ': 'T', 'ฒ': 'T', 'ด': 'T', 'ถ': 'T', 'ธ': 'T',
  // F class — ฟ/ฝ
  'ฟ': 'F', 'ฝ': 'F',
  // H class — ห/ฮ
  'ห': 'H', 'ฮ': 'H',
  // CH class — จ/ช/ฉ/ฌ
  'จ': 'CH', 'ช': 'CH', 'ฉ': 'CH', 'ฌ': 'CH',
  // L class — ร/ล/ฬ
  'ร': 'L', 'ล': 'L', 'ฬ': 'L',
  // N class — น/ณ
  'น': 'N', 'ณ': 'N',
  // Y class — ย/ญ
  'ย': 'Y', 'ญ': 'Y',
}

const THAI_TONE_MARKS = /[่-๋์]/g
const THAI_RANGE = /[฀-๿]/

/** เช็คว่า string มี Thai char ไหม (ใช้ตัดสินว่าจะ apply phonetic หรือไม่) */
export function containsThai(s: string): boolean {
  return THAI_RANGE.test(s)
}

/** Normalize string เป็น phonetic representation (ลด tone marks + map class) */
export function phoneticThai(s: string): string {
  const cleaned = (s || '').toLowerCase().trim().replace(/\s+/g, '')
  const noTones = cleaned.replace(THAI_TONE_MARKS, '')
  let result = ''
  for (const c of noTones) {
    result += PHONETIC_CLASSES[c] || c
  }
  return result
}

/** Normalize ทั่วไป (lower + trim + collapse spaces) */
function norm(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Tolerant filter — เทียบ query กับ haystack (text)
 *
 * Returns true ถ้า:
 *   1. Plain substring match (logic เดิม) — ใช้กับ English/digits เสมอ
 *   2. (Thai only) Phonetic substring fallback — ถ้า substring ไม่เจอ
 *
 * ตัวอย่าง:
 *   matchesThaiQuery("ปลอกหมอน", "ปลอก")     → true (substring)
 *   matchesThaiQuery("ปลอกหมอนซิบ", "ซิป")   → true (phonetic: ซิป↔ซิบ)
 *   matchesThaiQuery("Hotel Slipper", "slipper") → true (substring, no phonetic needed)
 *   matchesThaiQuery("H17", "h17")            → true (substring, English)
 */
export function matchesThaiQuery(text: string, query: string): boolean {
  const q = norm(query)
  if (!q) return true
  const t = norm(text)
  if (!t) return false

  // 1. Plain substring (case insensitive) — handles English, digits, Thai exact
  if (t.includes(q)) return true

  // 2. Phonetic fallback — เฉพาะเมื่อ query มี Thai char (กัน false positive)
  if (!containsThai(q)) return false
  if (q.length < 2) return false

  const qPhonetic = phoneticThai(q)
  const tPhonetic = phoneticThai(t)
  if (!qPhonetic || !tPhonetic) return false
  return tPhonetic.includes(qPhonetic)
}

/**
 * Multi-token tolerant filter — split query เป็น tokens แล้วเช็คทุก token ต้อง match
 *
 * ใช้กับ search ที่ user พิมพ์หลายคำ คั่นด้วย space
 */
export function matchesThaiQueryAllTokens(text: string, query: string): boolean {
  const q = norm(query)
  if (!q) return true
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every(tk => matchesThaiQuery(text, tk))
}

/**
 * Multi-field tolerant filter — เช็คว่า query match field ใด field หนึ่ง
 *
 * ใช้กับ filter ที่มี code + name + nameEn — ต้อง OR ระหว่าง fields
 */
export function matchesThaiQueryAnyField(fields: (string | undefined | null)[], query: string): boolean {
  const q = norm(query)
  if (!q) return true
  for (const f of fields) {
    if (f && matchesThaiQuery(f, q)) return true
  }
  return false
}

/**
 * 240.3 — คำนวณ similarity score ระหว่าง 2 ชื่อ (0-100)
 *
 * ใช้สำหรับ Code Reuse Detector — เช็คว่า drift name กับ catalog name
 * เป็น "typo/refactor" หรือ "reuse คนละ item เลย"
 *
 * Score:
 *   100 = identical
 *    90 = substring match (a in b or b in a)
 *    75 = phonetic substring (Thai)
 *    30-70 = token overlap (proportional)
 *    0 = no relation
 *
 * Threshold for callers:
 *   < 30  → high reuse suspect (ไม่เกี่ยวกัน)
 *   30-60 → medium suspect (อาจเกี่ยวบางส่วน)
 *   ≥ 60  → drift only (typo/refactor)
 */
export function nameSimilarity(a: string, b: string): number {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 100

  // 1. Substring (case-insensitive, normalized)
  if (na.includes(nb) || nb.includes(na)) return 90

  // 2. Phonetic substring (Thai only — ถ้า a/b มี Thai char)
  if (containsThai(na) || containsThai(nb)) {
    const pa = phoneticThai(na)
    const pb = phoneticThai(nb)
    if (pa && pb && pa.length >= 3 && pb.length >= 3) {
      if (pa === pb) return 85
      if (pa.includes(pb) || pb.includes(pa)) return 75
    }
  }

  // 3. Token overlap
  const ta = na.split(/[\s_/\-]+/).filter(t => t.length >= 2)
  const tb = nb.split(/[\s_/\-]+/).filter(t => t.length >= 2)
  if (ta.length === 0 || tb.length === 0) return 0
  const common = ta.filter(t => tb.some(tt => tt.includes(t) || t.includes(tt)))
  if (common.length === 0) return 0
  const ratio = common.length / Math.max(ta.length, tb.length)
  return Math.round(ratio * 70) // max 70
}
