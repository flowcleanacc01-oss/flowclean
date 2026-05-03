/**
 * 213.2 Phase 1.1 — Facet Generators
 *
 * Pure functions: facets → facetKey, code, canonical name
 * - facetKey: deterministic — facets ชุดเดียวกันได้ key เดียวกัน → กัน dup
 * - code: short readable (TWL-BATH-3060IN-WH)
 * - name: human-readable Thai/English
 */
import type { LinenFacets } from '@/types'
import {
  TYPE_OPTIONS, COLOR_OPTIONS, WEIGHT_OPTIONS, MATERIAL_OPTIONS, PATTERN_OPTIONS,
  BED_SIZE_PRESETS, PILLOW_SIZE_PRESETS, GENERIC_SIZE_PRESETS,
  APPLICATION_OPTIONS_BY_TYPE, SIZE_UNIT_OPTIONS,
} from './linen-vocabulary'
import type { FacetOption } from './linen-vocabulary'

const FACET_KEYS_ORDERED: (keyof LinenFacets)[] = [
  'type', 'application', 'size', 'sizeUnit', 'color', 'weight', 'material', 'pattern', 'variant',
]

/** Normalize facet value for hashing — lowercase, trim, '' for null/undefined */
function normalizeFacet(v: string | null | undefined): string {
  return (v || '').toString().trim().toLowerCase()
}

/**
 * Generate deterministic facet key — รายการที่ facets เหมือนกันจะได้ key เดียวกัน
 * Format: type|app|size|unit|color|weight|material|pattern|variant
 * Use case: dup detection ระดับ schema
 */
export function buildFacetKey(facets: LinenFacets): string {
  if (!facets || !facets.type) return ''
  return FACET_KEYS_ORDERED.map(k => normalizeFacet(facets[k])).join('|')
}

/** Lookup helper — find FacetOption by value in a list */
function findOpt(list: FacetOption[], value: string | null | undefined): FacetOption | null {
  if (!value) return null
  return list.find(o => o.value === value) || null
}

/** Get application option for type+value */
function findApplicationOpt(type: string, value: string | null | undefined): FacetOption | null {
  if (!value) return null
  const list = APPLICATION_OPTIONS_BY_TYPE[type] || []
  return list.find(o => o.value === value) || null
}

/** Get size option (preset by type) */
function findSizeOpt(type: string, value: string | null | undefined): FacetOption | null {
  if (!value) return null
  const presets =
    type === 'bed_sheet' || type === 'duvet_cover' || type === 'duvet_insert' || type === 'mattress_pad'
      ? BED_SIZE_PRESETS
      : type === 'pillow_case'
        ? PILLOW_SIZE_PRESETS
        : GENERIC_SIZE_PRESETS
  return presets.find(o => o.value === value) || null
}

/**
 * Generate code from facets
 * Pattern: TYPE-APP-SIZE+UNIT-COLOR[-VARIANT]
 * Example:
 *   {type:towel, application:bath, size:'30x60', sizeUnit:inch, color:white}
 *   → TWL-BTH-3060IN-WH
 *   {type:towel, size:small, application:foot_massage, color:tan, variant:'oil'}
 *   → TWL-FTM-S-TN-OIL
 */
export function generateCodeFromFacets(facets: LinenFacets): string {
  if (!facets || !facets.type) return ''
  const parts: string[] = []

  const typeOpt = findOpt(TYPE_OPTIONS, facets.type)
  parts.push(typeOpt?.codeShort || facets.type.toUpperCase().slice(0, 3))

  if (facets.application) {
    const appOpt = findApplicationOpt(facets.type, facets.application)
    parts.push(appOpt?.codeShort || facets.application.toUpperCase().slice(0, 3))
  }

  if (facets.size) {
    // ถ้าเป็น preset → ใช้ codeShort, ถ้าเป็น custom (e.g., 30x60) → ใช้ตรงๆ
    const sizeOpt = findSizeOpt(facets.type, facets.size)
    let sizeStr = sizeOpt?.codeShort || facets.size.replace(/\s+/g, '').toUpperCase()
    if (facets.sizeUnit && facets.sizeUnit !== 'standard') {
      const unitOpt = SIZE_UNIT_OPTIONS.find(u => u.value === facets.sizeUnit)
      if (unitOpt?.codeShort) sizeStr += unitOpt.codeShort
    }
    parts.push(sizeStr)
  }

  if (facets.color) {
    const colorOpt = findOpt(COLOR_OPTIONS, facets.color)
    parts.push(colorOpt?.codeShort || facets.color.toUpperCase().slice(0, 3))
  }

  if (facets.weight) {
    const wOpt = findOpt(WEIGHT_OPTIONS, facets.weight)
    if (wOpt) parts.push(wOpt.codeShort)
  }

  if (facets.pattern && facets.pattern !== 'plain') {
    const pOpt = findOpt(PATTERN_OPTIONS, facets.pattern)
    if (pOpt) parts.push(pOpt.codeShort)
  }

  if (facets.variant) {
    const v = facets.variant.replace(/[^a-zA-Z0-9ก-๙]/g, '').toUpperCase().slice(0, 4)
    if (v) parts.push(v)
  }

  return parts.join('-')
}

/**
 * Generate canonical Thai name from facets
 * Pattern: {type} {application} {size}{unit} {color} ({variant})
 */
export function generateNameFromFacets(facets: LinenFacets, lang: 'th' | 'en' = 'th'): string {
  if (!facets || !facets.type) return ''

  const typeOpt = findOpt(TYPE_OPTIONS, facets.type)
  const typeLabel = typeOpt ? (lang === 'th' ? typeOpt.labelTh : typeOpt.labelEn) : facets.type

  const parts: string[] = [typeLabel]

  if (facets.application) {
    const appOpt = findApplicationOpt(facets.type, facets.application)
    if (appOpt) parts.push(lang === 'th' ? appOpt.labelTh : appOpt.labelEn)
  }

  if (facets.size) {
    const sizeOpt = findSizeOpt(facets.type, facets.size)
    let sizeStr = sizeOpt
      ? (lang === 'th' ? sizeOpt.labelTh : sizeOpt.labelEn)
      : facets.size
    // append unit ถ้าเป็น custom + ไม่ใช่ standard
    if (!sizeOpt && facets.sizeUnit && facets.sizeUnit !== 'standard') {
      const unitMap: Record<string, string> = { inch: '"', cm: 'ซม.', ft: 'ฟุต' }
      sizeStr += unitMap[facets.sizeUnit] || ''
    }
    parts.push(sizeStr)
  }

  if (facets.color && facets.color !== 'pattern') {
    const colorOpt = findOpt(COLOR_OPTIONS, facets.color)
    if (colorOpt) {
      parts.push(lang === 'th' ? `สี${colorOpt.labelTh}` : colorOpt.labelEn)
    }
  }

  if (facets.weight) {
    const wOpt = findOpt(WEIGHT_OPTIONS, facets.weight)
    if (wOpt) parts.push(lang === 'th' ? wOpt.labelTh : wOpt.labelEn)
  }

  if (facets.pattern && facets.pattern !== 'plain') {
    const pOpt = findOpt(PATTERN_OPTIONS, facets.pattern)
    if (pOpt) parts.push(lang === 'th' ? `ลาย${pOpt.labelTh}` : pOpt.labelEn)
  }

  if (facets.material) {
    const mOpt = findOpt(MATERIAL_OPTIONS, facets.material)
    if (mOpt) parts.push(`(${lang === 'th' ? mOpt.labelTh : mOpt.labelEn})`)
  }

  if (facets.variant) {
    parts.push(`(${facets.variant})`)
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Convenience helper สำหรับเช็ค dup ก่อนเพิ่ม */
export function findItemByFacetKey<T extends { facetKey?: string }>(
  catalog: T[], facets: LinenFacets,
): T | null {
  const key = buildFacetKey(facets)
  if (!key) return null
  return catalog.find(c => c.facetKey === key) || null
}

/**
 * Resolve display name สำหรับลูกค้าที่กำหนด nickname
 * - ถ้าลูกค้านี้มี itemNicknames[code] → ใช้ nickname
 * - ถ้าไม่มี → ใช้ catalog name
 * - ถ้า code ไม่อยู่ใน catalog → return code
 *
 * ใช้ใน LF/SD/QT/print rendering layer
 * ⚠️ ห้ามใช้ใน reports/audit/Cmd+K (ใช้ canonical เสมอ)
 */
export function resolveDisplayName(
  code: string,
  catalogName: string | null | undefined,
  customerNicknames: Record<string, string> | null | undefined,
): string {
  if (customerNicknames && customerNicknames[code]) {
    return customerNicknames[code]
  }
  return catalogName || code
}
