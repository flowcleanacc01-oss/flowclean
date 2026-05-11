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
const TONE_TEST = /[่-๋์]/ // non-global version for .test() (stateful /g bug)
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
 * Phonetic Levenshtein substring — sliding window with edit distance check
 *
 * 249.1: stricter window — minLen = qp.length (was qp.length - maxDist)
 * Why: window shorter than query allowed query-char-deletion which made
 * "ซิป" (qp SิP, len 3) match window "SP" (len 2, Lev 1 by deleting ิ).
 * New rule: window must be at least query-length → no deletions in query allowed.
 * Insertions in window still allowed (window can be 1 char longer than query).
 *
 * 249.1: length cap 3-10 — short queries lack specificity, long queries are
 * better served by Layer 4 split. Lev is O(qp.length × window.length × text.length),
 * cubic for long queries.
 */
function phoneticFuzzyIncludes(textPhonetic: string, queryPhonetic: string, maxDist = 1): boolean {
  const qp = queryPhonetic
  const tp = textPhonetic
  if (!qp || !tp) return false
  if (qp.length < 3 || qp.length > 10) return false // 249.1: cap (was ≥ 5)
  if (tp.length < qp.length) return false

  const minLen = qp.length // 249.1: was qp.length - maxDist
  const maxLen = qp.length + maxDist
  for (let i = 0; i + minLen <= tp.length; i++) {
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
 *
 * 249.1: accepts pre-computed tPhonetic (haystack phonetic) to avoid recomputing
 * across recursive splitAndMatch calls (same text, different queries).
 */
function matchesThaiQueryCore(text: string, query: string, tPhonetic?: string): boolean {
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
  const tp = tPhonetic ?? phoneticThai(t)
  if (!qPhonetic || !tp) return false

  // Layer 2: phonetic substring
  if (tp.includes(qPhonetic)) return true

  // Layer 3: phonetic Levenshtein ≤ 1
  if (phoneticFuzzyIncludes(tp, qPhonetic, 1)) return true

  return false
}

/**
 * Core match WITHOUT Layer 3 Lev — for use inside splitAndMatch recursion.
 * Lev is too expensive when called repeatedly on each split slice — and most
 * compound queries can be resolved via substring + phonetic-substring only.
 *
 * 249.1: extracted to make splitAndMatch ~10x cheaper per slice.
 */
function matchesThaiQueryCoreNoLev(text: string, query: string, tPhonetic: string): boolean {
  const q = norm(query)
  if (!q) return true
  const t = norm(text)
  if (!t) return false
  if (t.includes(q)) return true
  if (!containsThai(q)) return false
  if (q.length < 2) return false
  const qPhonetic = phoneticThai(q)
  if (!qPhonetic || !tPhonetic) return false
  return tPhonetic.includes(qPhonetic)
}

/**
 * Layer 4 — Recursive split-and-match for Thai compound words (no space)
 * เช่น "ปลอกเล็กชมพู" → split เป็น "ปลอก" + "เล็ก" + "ชมพู" → AND ทุก slice
 *
 * 249.1: stricter to prevent exponential blowup + false positives
 *   - depth ≤ 2 (was 3) → max 4 slices total
 *   - min slice 3 chars (was 2) → "เหมอ" (4 chars) no longer splits to "เห"+"มอ"
 *   - min query 6 chars (was 4) → 4-5 char queries skip Layer 4 entirely
 *   - slices use core-no-Lev (substring + phonetic-substring only)
 *   - tPhonetic threaded through recursion (text never changes)
 */
function splitAndMatch(text: string, query: string, depth: number, tPhonetic: string): boolean {
  if (depth >= 2) return false
  if (query.length < 6) return false
  for (let i = 3; i <= query.length - 3; i++) {
    const left = query.slice(0, i)
    const right = query.slice(i)
    if (matchesThaiQueryCoreNoLev(text, left, tPhonetic)) {
      if (matchesThaiQueryCoreNoLev(text, right, tPhonetic)) return true
      if (splitAndMatch(text, right, depth + 1, tPhonetic)) return true
    }
  }
  return false
}

/**
 * Tolerant filter — 4-layer match (each is fallback if prior fails)
 *
 * Layer 1: Plain substring (English/digits/Thai exact)
 * Layer 2: Phonetic substring (ซิป↔ซิบ, ฟ↔ฝ — Thai class mapping)
 * Layer 3: Phonetic Levenshtein ≤ 1 (สครับ↔สคับ, query 3-10 chars)
 * Layer 4: Recursive split (ปลอกเล็กชมพู → ปลอก+เล็ก+ชมพู, query ≥ 6, slice ≥ 3)
 *
 * 249.1: accepts optional pre-computed `tPhonetic` (text phonetic) — caller
 * can cache it (e.g., at index build time) to avoid recomputation. Reduces
 * cost of Cmd+K search by ~10x for long queries with many entries.
 *
 * ตัวอย่าง:
 *   matchesThaiQuery("ปลอกหมอน", "ปลอก")        → true (L1 substring)
 *   matchesThaiQuery("ปลอกหมอนซิบ", "ซิป")      → true (L2 phonetic)
 *   matchesThaiQuery("ผ้าสครับ", "สคับ")         → true (L3 Lev 1)
 *   matchesThaiQuery("ปลอกหมอนเล็ก ชมพู", "ปลอกเล็ก") → true (L4 split)
 *   matchesThaiQuery("Hotel Slipper", "slipper") → true (L1, English)
 */
export function matchesThaiQuery(text: string, query: string, tPhonetic?: string): boolean {
  // 249.1: compute tPhonetic once, share across core + split recursion
  const t = norm(text)
  const tp = tPhonetic ?? (t && containsThai(t) ? phoneticThai(t) : '')

  if (matchesThaiQueryCore(text, query, tp)) return true

  // Layer 4: Recursive split for Thai compounds (no space, ≥ 6 chars)
  const q = norm(query)
  if (containsThai(q) && q.length >= 6) {
    const compact = q.replace(/\s+/g, '')
    if (compact.length >= 6) {
      return splitAndMatch(text, compact, 0, tp)
    }
  }
  return false
}

/**
 * Multi-token tolerant filter — split query เป็น tokens แล้วเช็คทุก token ต้อง match
 *
 * ใช้กับ search ที่ user พิมพ์หลายคำ คั่นด้วย space
 * 249.1: precompute tPhonetic once per text (shared across tokens)
 */
export function matchesThaiQueryAllTokens(text: string, query: string): boolean {
  const q = norm(query)
  if (!q) return true
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const t = norm(text)
  const tp = t && containsThai(t) ? phoneticThai(t) : ''
  return tokens.every(tk => matchesThaiQuery(text, tk, tp))
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

// ════════════════════════════════════════════════════════════════
// 248 — Highlight: find match ranges in text (for <mark> wrapping)
// ════════════════════════════════════════════════════════════════

/** Direct case-insensitive substring matches */
function findDirectRanges(lowerText: string, lowerQuery: string): Array<[number, number]> {
  if (!lowerQuery) return []
  const ranges: Array<[number, number]> = []
  let idx = 0
  while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
    ranges.push([idx, idx + lowerQuery.length])
    idx += lowerQuery.length
  }
  return ranges
}

/**
 * Phonetic substring matches — back-map phonetic-substring index to original text index.
 *
 * For each char in lowerText:
 *   - tone marks (่-๋์) are skipped (not in phonetic)
 *   - other chars map via PHONETIC_CLASSES (single char → class letter), or kept as-is
 *   - CH class adds 2 chars to phonetic per 1 original (จ→CH, ช→CH, ฉ→CH, ฌ→CH)
 * Track tpStart[i] = original-text index where phonetic[i] originated.
 *
 * After finding phonetic substring [pi, pj] in tpStr, original range is
 * [tpStart[pi], tpStart[pj]+1] extended to include trailing tone marks.
 */
function findPhoneticRanges(lowerText: string, lowerQuery: string): Array<[number, number]> {
  if (!lowerQuery || !containsThai(lowerQuery)) return []
  const qp = phoneticThai(lowerQuery)
  if (!qp || qp.length < 2) return []

  // Build phonetic of text + position map (skip tones)
  const tpChars: string[] = []
  const tpStart: number[] = []
  for (let i = 0; i < lowerText.length; i++) {
    const c = lowerText[i]
    if (TONE_TEST.test(c)) continue
    const mapped = PHONETIC_CLASSES[c] || c
    for (let j = 0; j < mapped.length; j++) {
      tpChars.push(mapped[j])
      tpStart.push(i)
    }
  }
  const tpStr = tpChars.join('')

  const ranges: Array<[number, number]> = []
  let idx = 0
  while ((idx = tpStr.indexOf(qp, idx)) !== -1) {
    const startInText = tpStart[idx]
    const lastPhoneticIdx = idx + qp.length - 1
    const lastOrigIdx = tpStart[lastPhoneticIdx]
    let endInText = lastOrigIdx + 1
    // Include trailing tone marks (rendered as combining chars after base char)
    while (endInText < lowerText.length && TONE_TEST.test(lowerText[endInText])) {
      endInText++
    }
    ranges.push([startInText, endInText])
    idx += qp.length
  }
  return ranges
}

/**
 * Find ranges in `text` where `query` matches — for highlight rendering.
 * Returns array of [start, end) indices in the ORIGINAL text (case + tones preserved).
 *
 * Match layers (mirror matchesThaiQuery):
 *   1. Direct substring (case-insensitive)
 *   2. Phonetic substring (if Thai)
 *   3. Simple binary split (depth 1) — for compound queries like "ปลอกเล็กชมพู"
 *
 * Layer 3 fuzzy (Lev) intentionally skipped — too hard to back-map; if matched only
 * via Lev, no highlight shown (rare in practice — Layer 2/3 catch most cases).
 */
export function findMatchRanges(text: string, query: string): Array<[number, number]> {
  if (!text || !query) return []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase().trim()
  if (!lowerQuery) return []

  // 1. Direct substring
  const direct = findDirectRanges(lowerText, lowerQuery)
  if (direct.length > 0) return direct

  // 2. Phonetic substring
  if (containsThai(lowerQuery)) {
    const phon = findPhoneticRanges(lowerText, lowerQuery)
    if (phon.length > 0) return phon
  }

  // 3. Binary split fallback (depth 1) — 249.1: min slice 3, min query 6
  if (lowerQuery.length >= 6 && containsThai(lowerQuery)) {
    const compact = lowerQuery.replace(/\s+/g, '')
    for (let i = 3; i <= compact.length - 3; i++) {
      const left = compact.slice(0, i)
      const right = compact.slice(i)
      const leftRanges = findDirectRanges(lowerText, left).length > 0
        ? findDirectRanges(lowerText, left)
        : findPhoneticRanges(lowerText, left)
      const rightRanges = findDirectRanges(lowerText, right).length > 0
        ? findDirectRanges(lowerText, right)
        : findPhoneticRanges(lowerText, right)
      if (leftRanges.length > 0 && rightRanges.length > 0) {
        return mergeRanges([...leftRanges, ...rightRanges])
      }
    }
  }

  return []
}

/** Merge overlapping/adjacent ranges into a sorted, non-overlapping list */
function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return ranges
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]
    const last = merged[merged.length - 1]
    if (s <= last[1]) {
      last[1] = Math.max(last[1], e)
    } else {
      merged.push([s, e])
    }
  }
  return merged
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
