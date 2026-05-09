'use client'

/**
 * 240.3 — Code Reuse Detector
 *
 * แยก "name drift" ออกจาก "code reuse":
 *   - drift  = name แก้คำเล็กน้อย / typo / refactor → ยังเป็น item เดียวกัน (similarity ≥ 60)
 *   - reuse  = code เดียวกัน เปลี่ยนเป็นคนละ item เลย (similarity < 60)
 *              ผลกระทบ: QT/DN เก่ามี name เก่า + ราคาเก่า แต่ catalog ปัจจุบันเป็นอีกอย่าง
 *
 * Use case: ติ๊ดเจอ A62 reuse — ต้องตามแก้ผลกระทบ
 */
import { useMemo } from 'react'
import { useNameDrift, type DriftEntry } from './use-name-drift'
import { nameSimilarity } from './thai-search'
import type { QuotationStatus } from '@/types'

export type ReuseSeverity = 'high' | 'medium'

export interface ReuseDriftName {
  driftName: string
  similarity: number          // 0-100 vs catalogName
  severity: ReuseSeverity     // high < 30, medium 30-60
  qtCount: number              // QTs that use this driftName
}

export interface CodeReuseEntry {
  code: string
  catalogName: string
  /** drift names ที่จัดเป็น reuse suspect (similarity < 60) */
  reuseNames: ReuseDriftName[]
  /** worst (lowest similarity) — ใช้ sort */
  minSimilarity: number
  /** total QT references ที่ใช้ name เก่า reuse */
  totalQts: number
  /** raw drift entry — สำหรับ delegate ไป Promote */
  driftEntry: DriftEntry
  /** worst severity จาก reuseNames */
  worstSeverity: ReuseSeverity
}

const REUSE_THRESHOLD = 60   // ≥ 60 = drift; < 60 = reuse suspect
const HIGH_THRESHOLD = 30    // < 30 = high suspect

export function useCodeReuse() {
  const { driftMap } = useNameDrift()

  return useMemo(() => {
    const entries: CodeReuseEntry[] = []

    for (const drift of driftMap.values()) {
      const reuseNames: ReuseDriftName[] = []
      for (const driftName of drift.driftNames) {
        const similarity = nameSimilarity(driftName, drift.catalogName)
        if (similarity >= REUSE_THRESHOLD) continue // drift only — skip
        const qtCount = drift.qts.filter(q => q.nameInQT === driftName).length
        const severity: ReuseSeverity = similarity < HIGH_THRESHOLD ? 'high' : 'medium'
        reuseNames.push({ driftName, similarity, severity, qtCount })
      }
      if (reuseNames.length === 0) continue

      const minSimilarity = Math.min(...reuseNames.map(r => r.similarity))
      const totalQts = reuseNames.reduce((s, r) => s + r.qtCount, 0)
      const worstSeverity: ReuseSeverity = reuseNames.some(r => r.severity === 'high') ? 'high' : 'medium'

      entries.push({
        code: drift.code,
        catalogName: drift.catalogName,
        reuseNames: reuseNames.sort((a, b) => a.similarity - b.similarity),
        minSimilarity,
        totalQts,
        driftEntry: drift,
        worstSeverity,
      })
    }

    // Sort: high severity first, then most QTs affected, then lowest similarity
    entries.sort((a, b) => {
      if (a.worstSeverity !== b.worstSeverity) return a.worstSeverity === 'high' ? -1 : 1
      if (a.totalQts !== b.totalQts) return b.totalQts - a.totalQts
      return a.minSimilarity - b.minSimilarity
    })

    return {
      entries,
      totalCodes: entries.length,
      highSeverity: entries.filter(e => e.worstSeverity === 'high').length,
      totalQtsAffected: entries.reduce((s, e) => s + e.totalQts, 0),
    }
  }, [driftMap])
}

export type { QuotationStatus }
