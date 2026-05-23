'use client'

/**
 * 348 — Name Duplicate Detector (Trap reducer #1)
 *
 * เคสจริง (ติ๊ดเล่า 1468c3b feedback): user เผลอสร้าง R-code ใหม่ที่ name
 * เหมือนกับ catalog item ที่มีอยู่ → aggregate group matching พลาดเพราะ
 * R-code ไม่อยู่ใน sizeGroup
 *
 * เครื่องมือนี้ scan catalog ทุกคู่ → flag pairs ที่ name similarity ≥ 80%
 * แต่ code ต่างกัน → user เห็นก่อนผิดพลาด (proactive)
 *
 * ต่างกับ:
 * - Name Drift (188): catalog vs QT (cross-table)
 * - Code Reuse (240.3): same code, different names ใน QT เก่า
 * - Name Duplicates (348): same/similar name, DIFFERENT codes ใน catalog เดียวกัน
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { nameSimilarity } from '@/lib/thai-search'

export interface NameDuplicatePair {
  codeA: string
  nameA: string
  catA: string
  groupA?: string  // sizeGroup ของ A (ถ้ามี)
  protectedA: boolean
  codeB: string
  nameB: string
  catB: string
  groupB?: string
  protectedB: boolean
  similarity: number
  severity: 'high' | 'medium'  // high ≥ 95 (likely identical), medium 80-94
}

const SIMILARITY_THRESHOLD = 80
const HIGH_THRESHOLD = 95

export function useNameDuplicates() {
  const { linenCatalog } = useStore()

  return useMemo(() => {
    const pairs: NameDuplicatePair[] = []
    // O(n²) — ok สำหรับ catalog ≤ 500 items
    for (let i = 0; i < linenCatalog.length; i++) {
      for (let j = i + 1; j < linenCatalog.length; j++) {
        const a = linenCatalog[i]
        const b = linenCatalog[j]
        const sim = nameSimilarity(a.name, b.name)
        if (sim < SIMILARITY_THRESHOLD) continue
        pairs.push({
          codeA: a.code, nameA: a.name, catA: a.category,
          groupA: a.sizeGroup,
          protectedA: !!a.isProtected,
          codeB: b.code, nameB: b.name, catB: b.category,
          groupB: b.sizeGroup,
          protectedB: !!b.isProtected,
          similarity: sim,
          severity: sim >= HIGH_THRESHOLD ? 'high' : 'medium',
        })
      }
    }
    // Sort: high severity → high similarity desc → codeA
    pairs.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1
      if (a.similarity !== b.similarity) return b.similarity - a.similarity
      return a.codeA.localeCompare(b.codeA)
    })
    const high = pairs.filter(p => p.severity === 'high').length
    // คู่ที่อยู่ใน sizeGroup ต่างกัน (หรืออันหนึ่งมี อันหนึ่งไม่มี) — aggregate risk!
    const aggregateRisk = pairs.filter(p =>
      (p.groupA || p.groupB) && p.groupA !== p.groupB,
    ).length
    return {
      pairs,
      total: pairs.length,
      high,
      aggregateRisk,
    }
  }, [linenCatalog])
}
