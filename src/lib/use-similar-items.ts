'use client'

/**
 * 207 — Similarity detection สำหรับ AddItemWizard
 *
 * ตรวจรายการใกล้เคียงใน catalog เพื่อกัน user เพิ่มรายการซ้ำ
 * Strategy:
 *  1. Exact substring (case-insensitive, ทั้งสอง direction) — น้ำหนักสูงสุด
 *  2. Token overlap (split by space/_/-) — น้ำหนักกลาง
 *  3. nameEn match — น้ำหนักต่ำ
 */
import { useMemo } from 'react'
import type { LinenItemDef } from '@/types'

export interface SimilarMatch {
  item: LinenItemDef
  score: number  // 0-100, higher = more similar
  reason: string // คำอธิบายให้ user
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

  // 3. Token overlap
  const qTokens = tokenize(q)
  const nameTokens = tokenize(name)
  if (qTokens.length === 0 || nameTokens.length === 0) return { score: 0, reason: '' }
  const common = qTokens.filter(t => nameTokens.some(nt => nt.includes(t) || t.includes(nt)))
  if (common.length === 0) return { score: 0, reason: '' }

  // ratio = common / max(qTokens, nameTokens)
  const ratio = common.length / Math.max(qTokens.length, nameTokens.length)
  const score = Math.round(ratio * 60) // max 60 from token overlap
  if (score < 25) return { score: 0, reason: '' }
  return { score, reason: `คล้ายคำ "${common.join(', ')}"` }
}

/** Hook: หา top-N similar items ใน catalog */
export function useSimilarItems(query: string, catalog: LinenItemDef[], topN = 5): SimilarMatch[] {
  return useMemo(() => {
    if (!query || query.trim().length < 2) return []
    const matches: SimilarMatch[] = []
    for (const item of catalog) {
      const { score, reason } = computeScore(query, item)
      if (score > 0) matches.push({ item, score, reason })
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
