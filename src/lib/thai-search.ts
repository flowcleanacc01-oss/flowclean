/**
 * 241 / 245 — Thai-aware search helper (tolerant filter)
 *
 * 4-layer match (each layer is fallback if prior fails):
 *   1. Plain substring (English/digits/Thai exact)
 *   2. Phonetic substring (ซิป↔ซิบ, ฟ↔ฝ — Thai only)
 *   3. Phonetic Levenshtein ≤ 1 (สครับ↔สคับ — Thai, query ≥ 3)
 *   4. Recursive split-and-match (ปลอกเล็กชมพู → ปลอก+เล็ก+ชมพู — Thai compound, query ≥ 4)
 *
 * Source of truth ของ phonetic classes — ก่อนหน้า logic นี้อยู่ใน use-similar-items.ts
 * แต่ใช้แค่ใน AddItemWizard เท่านั้น · 241 ย้ายมาที่ shared util เพื่อใช้ใน list filters ทั่วระบบ
 * · 245 เพิ่ม Levenshtein phonetic + split-and-match
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

/** Levenshtein edit distance (2-row optimization) — used for phonetic fuzzy */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  let prev: number[] = Array.from({ length: bl + 1 }, (_, i) => i)
  let curr: number[] = Array(bl + 1).fill(0)
  for (let i = 1; i <= al; i++) {
    curr[0] = i
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[bl]
}

/**
 * 245 — Edit distance between phonetic representations of 2 strings
 * Useful for catching typos like "สครับ" vs "สคับ" (1-char drop)
 */
export function phoneticDistance(a: string, b: string): number {
  return levenshtein(phoneticThai(a), phoneticThai(b))
}

/**
 * Phonetic Levenshtein substring — sliding window of length qp.length ± maxDist
 * Returns true if any window has edit distance ≤ maxDist with query phonetic
 */
function phoneticFuzzyIncludes(textPhonetic: string, queryPhonetic: string, maxDist = 1): boolean {
  const qp = queryPhonetic
  const tp = textPhonetic
  if (!qp || !tp) return false
  if (qp.length < 3) return false // guard short queries (avoid false positives)
  if (tp.length + maxDist < qp.length) return false

  const minLen = Math.max(1, qp.length - maxDist)
  const maxLen = qp.length + maxDist
  for (let i = 0; i <= tp.length - minLen; i++) {
    for (let len = minLen; len <= maxLen; len++) {
      if (i + len > tp.length) break
      const window = tp.slice(i, i + len)
      if (levenshtein(qp, window) <= maxDist) return true
    }
  }
  return false
}

/**
 * Core match (layers 1-3, no recursion) — used internally by splitAndMatch
 * Layer 1: plain substring · Layer 2: phonetic substring · Layer 3: phonetic Lev ≤ 1
 */
function matchesThaiQueryCore(text: string, query: string): boolean {
  const q = norm(query)
  if (!q) return true
  const t = norm(text)
  if (!t) return false

  // Layer 1: Plain substring
  if (t.includes(q)) return true

  // Layer 2 & 3: Thai-only fallback
  if (!containsThai(q)) return false
  if (q.length < 2) return false

  const qPhonetic = phoneticThai(q)
  const tPhonetic = phoneticThai(t)
  if (!qPhonetic || !tPhonetic) return false

  // Layer 2: phonetic substring
  if (tPhonetic.includes(qPhonetic)) return true

  // Layer 3: phonetic Levenshtein ≤ 1 (min query 3 chars)
  if (q.length >= 3 && phoneticFuzzyIncludes(tPhonetic, qPhonetic, 1)) return true

  return false
}

/**
 * Layer 4 — Recursive split-and-match for Thai compound words (no space)
 * เช่น "ปลอกเล็กชมพู" → split เป็น "ปลอก" + "เล็ก" + "ชมพู" → AND ทุก slice
 *
 * Guard: query ≥ 4 chars, each slice ≥ 2 chars, depth ≤ 3
 */
function splitAndMatch(text: string, query: string, depth = 0): boolean {
  if (depth >= 3) return false
  if (query.length < 4) return false
  for (let i = 2; i <= query.length - 2; i++) {
    const left = query.slice(0, i)
    const right = query.slice(i)
    if (matchesThaiQueryCore(text, left)) {
      if (matchesThaiQueryCore(text, right)) return true
      if (splitAndMatch(text, right, depth + 1)) return true
    }
  }
  return false
}

/**
 * Tolerant filter — 4-layer match (each is fallback if prior fails)
 *
 * Layer 1: Plain substring (English/digits/Thai exact)
 * Layer 2: Phonetic substring (ซิป↔ซิบ, ฟ↔ฝ)
 * Layer 3: Phonetic Levenshtein ≤ 1 (สครับ↔สคับ, query ≥ 3)
 * Layer 4: Recursive split (ปลอกเล็กชมพู, no space, query ≥ 4)
 *
 * ตัวอย่าง:
 *   matchesThaiQuery("ปลอกหมอน", "ปลอก")        → true (L1 substring)
 *   matchesThaiQuery("ปลอกหมอนซิบ", "ซิป")      → true (L2 phonetic)
 *   matchesThaiQuery("ผ้าสครับ", "สคับ")         → true (L3 Lev 1)
 *   matchesThaiQuery("ปลอกหมอนเล็ก ชมพู", "ปลอกเล็ก") → true (L4 split)
 *   matchesThaiQuery("Hotel Slipper", "slipper") → true (L1, English)
 */
export function matchesThaiQuery(text: string, query: string): boolean {
  if (matchesThaiQueryCore(text, query)) return true

  // Layer 4: Recursive split for Thai compounds (no space, ≥ 4 chars)
  const q = norm(query)
  if (containsThai(q) && q.length >= 4) {
    const compact = q.replace(/\s+/g, '')
    if (compact.length >= 4) {
      return splitAndMatch(text, compact)
    }
  }
  return false
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
