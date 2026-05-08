'use client'

/**
 * 207 — Similarity detection สำหรับ AddItemWizard
 * 218.1 — เพิ่ม Thai phonetic class match (ซิป↔ซิบ, ฟ↔ฝ, etc.)
 *
 * ตรวจรายการใกล้เคียงใน catalog เพื่อกัน user เพิ่มรายการซ้ำ
 * Strategy (เก็บ score สูงสุด):
 *  1. Exact match → 100
 *  2. Substring → 85-90
 *  3. nameEn substring → 70
 *  4. Phonetic exact (218.1) → 92  ← เสียงเหมือนเป๊ะ (สะกดต่าง)
 *  5. Phonetic substring (218.1) → 75-80
 *  6. Token overlap → 60-85
 * Threshold: ตอบกลับเฉพาะ score >= 60 (218.1 raised from 25)
 */
import { useMemo } from 'react'
import type { LinenItemDef } from '@/types'

export interface SimilarMatch {
  item: LinenItemDef
  score: number  // 0-100, higher = more similar
  reason: string // คำอธิบายให้ user
}

const MIN_SCORE_TO_SHOW = 60 // 218.1: ขึ้นจาก 25 → 60

/**
 * 218.1 — Thai phonetic class mapping
 * ตัวอักษรที่ออกเสียงใกล้กันในภาษาไทย → map เป็น class เดียว
 * เพื่อให้ "ซิป" ≈ "ซิบ", "ฟอง" ≈ "ฝอง", "ฉัน" ≈ "ชั้น" ฯลฯ
 */
const PHONETIC_CLASSES: Record<string, string> = {
  // P class — บ/ป/พ/ผ/ภ (Thai final-consonant neutralization — เสียง /p/ /b/ /pʰ/ สับกันได้)
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
  // L class — ร/ล/ฬ (loanword สับกัน)
  'ร': 'L', 'ล': 'L', 'ฬ': 'L',
  // N class — น/ณ
  'น': 'N', 'ณ': 'N',
  // Y class — ย/ญ
  'ย': 'Y', 'ญ': 'Y',
}

const THAI_TONE_MARKS = /[่-๋์]/g // ◌่ ◌้ ◌๊ ◌๋ ◌์

/** 218.1 — Normalize string เป็น phonetic representation */
function phoneticNormalize(s: string): string {
  const cleaned = (s || '').toLowerCase().trim().replace(/\s+/g, '')
  const noTones = cleaned.replace(THAI_TONE_MARKS, '')
  let result = ''
  for (const c of noTones) {
    result += PHONETIC_CLASSES[c] || c
  }
  return result
}

/** Normalize Thai/English string สำหรับเปรียบเทียบ */
function norm(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Extract meaningful tokens (length >= 2) */
function tokenize(s: string): string[] {
  return norm(s).split(/[\s_/\-]+/).filter(t => t.length >= 2)
}

/** คำนวณ similarity score ระหว่าง query กับ item */
function computeScore(query: string, item: LinenItemDef): { score: number; reason: string } {
  const q = norm(query)
  const name = norm(item.name)
  const nameEn = norm(item.nameEn)

  if (!q || q.length < 2) return { score: 0, reason: '' }

  // 1. Exact match
  if (q === name) return { score: 100, reason: 'ชื่อเหมือนกันเป๊ะ' }
  if (q === nameEn) return { score: 100, reason: 'ตรงกับชื่อ EN' }

  // 2. Substring match (whole query เป็น substring ของชื่อ หรือ vice versa)
  if (name.includes(q)) return { score: 90, reason: `"${item.name}" มีคำที่พิมพ์อยู่` }
  if (q.includes(name)) return { score: 85, reason: `"${item.name}" เป็นส่วนหนึ่งของที่พิมพ์` }
  if (nameEn && (nameEn.includes(q) || q.includes(nameEn))) {
    return { score: 70, reason: `ใกล้กับ EN "${item.nameEn}"` }
  }

  // 3. Phonetic match (218.1 + 234) — เสียงเหมือนแต่สะกดต่าง (ซิป↔ซิบ, ฉัน↔ชั้น, ฟอง↔ฝอง)
  if (q.length >= 3) {
    const qPhonetic = phoneticNormalize(q)
    const namePhonetic = phoneticNormalize(name)
    if (qPhonetic && namePhonetic && qPhonetic === namePhonetic) {
      return { score: 92, reason: `"${item.name}" — เสียงเหมือนกัน (สะกดต่าง)` }
    }
    // 234 fix: ลด threshold จาก 4 → 3 เพื่อให้ "ซิป" (3 chars phonetic = "SิP") match substring ใน "ปลอกหมอนซิบ" ได้
    if (qPhonetic.length >= 3 && namePhonetic.length >= 3) {
      if (namePhonetic.includes(qPhonetic)) {
        return { score: 80, reason: `"${item.name}" — มีเสียงคล้ายอยู่ในชื่อ` }
      }
      if (qPhonetic.includes(namePhonetic)) {
        return { score: 75, reason: `"${item.name}" — เป็นส่วนหนึ่งของเสียงที่พิมพ์` }
      }
    }
  }

  // 4. Token overlap
  const qTokens = tokenize(q)
  const nameTokens = tokenize(name)
  if (qTokens.length === 0 || nameTokens.length === 0) return { score: 0, reason: '' }
  const common = qTokens.filter(t => nameTokens.some(nt => nt.includes(t) || t.includes(nt)))
  if (common.length === 0) return { score: 0, reason: '' }

  // ratio = common / max(qTokens, nameTokens)
  const ratio = common.length / Math.max(qTokens.length, nameTokens.length)
  const score = Math.round(ratio * 85) // 218.1: max 85 (raised from 60)
  if (score < MIN_SCORE_TO_SHOW) return { score: 0, reason: '' }
  return { score, reason: `คล้ายคำ "${common.join(', ')}"` }
}

/** Hook: หา top-N similar items ใน catalog */
export function useSimilarItems(query: string, catalog: LinenItemDef[], topN = 5): SimilarMatch[] {
  return useMemo(() => {
    if (!query || query.trim().length < 2) return []
    const matches: SimilarMatch[] = []
    for (const item of catalog) {
      const { score, reason } = computeScore(query, item)
      if (score >= MIN_SCORE_TO_SHOW) matches.push({ item, score, reason })
    }
    matches.sort((a, b) => b.score - a.score)
    return matches.slice(0, topN)
  }, [query, catalog, topN])
}

/** Helper: guess category จากชื่อรายการ */
export function guessCategory(name: string): string {
  const n = norm(name)
  if (/ผ้าเช็ด|ขนหนู|towel|bath|face|hand/.test(n)) return 'towel'
  if (/ผ้าปู|sheet|bed/.test(n)) return 'bedsheet'
  if (/ปลอกดูเว่|duvet cover|cover/.test(n)) return 'duvet_cover'
  if (/ไส้ดูเว่|duvet insert|insert/.test(n)) return 'duvet_insert'
  if (/รองกันเปื้อน|mattress|pad/.test(n)) return 'mattress_pad'
  return 'other'
}

/** Helper: suggest unique code โดย prefix ตาม category + next number */
export function suggestNextCode(catalog: LinenItemDef[], category: string): string {
  // Map category → prefix
  const prefixMap: Record<string, string> = {
    towel: 'T', bedsheet: 'S', duvet_cover: 'D', duvet_insert: 'I',
    mattress_pad: 'M', other: 'X',
  }
  const prefix = prefixMap[category] || 'X'

  // Find existing codes with this prefix + number suffix (e.g., T01, T12)
  const usedCodes = new Set(catalog.map(i => i.code.toUpperCase()))
  for (let i = 1; i <= 99; i++) {
    const candidate = `${prefix}${i.toString().padStart(2, '0')}`
    if (!usedCodes.has(candidate)) return candidate
  }
  // fallback: timestamp suffix
  return `${prefix}-${Date.now().toString().slice(-4)}`
}

/** Helper: validate code unique */
export function isCodeUnique(code: string, catalog: LinenItemDef[]): boolean {
  const c = (code || '').trim().toUpperCase()
  if (!c) return false
  return !catalog.some(it => it.code.toUpperCase() === c)
}
