'use client'

/**
 * A2 + A3 + B3 — Item Catalog Audit
 *
 * Multi-subtype scan ของ catalog หาปัญหาเชิงโครงสร้าง:
 *
 * A2 (initial) — item_unused_in_qt:
 *   items ใน catalog ที่ไม่มี QT ไหนใช้เลย — cleanup candidates
 *   (รวม legacy items ที่ติ๊ดเคยใช้แต่เลิกใช้แล้ว)
 *
 * A3 — item_orphan_group (added later):
 *   sizeGroup ที่มี item เดียวเลย — singleton group ไม่จำเป็น
 *
 * B3 — item_no_size_group + item_no_facets (added later):
 *   items ใน category bedsheet/duvet/etc แต่ไม่ตั้ง sizeGroup
 *   items ที่ยังไม่มี facets (Feat 213.2)
 */
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import type { LinenItemDef } from '@/types'

export type AuditSubtype =
  | 'item_unused_in_qt'      // A2
  | 'item_orphan_group'      // A3
  | 'item_no_size_group'     // B3
  | 'item_no_facets'         // B3

export interface AuditFinding {
  subtype: AuditSubtype
  code: string
  name: string
  category: string
  sizeGroup?: string
  /** เสริม context per subtype */
  detail: string
  severity: 'high' | 'medium' | 'low'
}

const SIZE_GROUP_CATEGORIES = new Set([
  'bedsheet',
  'duvet_cover',
  'duvet_insert',
  'pillow_case',
  'mattress_pad',
])

export function useItemCatalogAudit() {
  const { linenCatalog, quotations } = useStore()

  return useMemo(() => {
    const findings: AuditFinding[] = []

    // นับ QT usage per code
    const qtUsage = new Map<string, number>()
    for (const qt of quotations) {
      for (const it of qt.items || []) {
        qtUsage.set(it.code, (qtUsage.get(it.code) || 0) + 1)
      }
    }

    // นับ items per sizeGroup (ดู singleton)
    const itemsByGroup = new Map<string, LinenItemDef[]>()
    for (const it of linenCatalog) {
      if (!it.sizeGroup) continue
      const arr = itemsByGroup.get(it.sizeGroup) || []
      arr.push(it)
      itemsByGroup.set(it.sizeGroup, arr)
    }

    for (const it of linenCatalog) {
      // A2: item_unused_in_qt
      const usage = qtUsage.get(it.code) || 0
      if (usage === 0) {
        findings.push({
          subtype: 'item_unused_in_qt',
          code: it.code,
          name: it.name,
          category: it.category,
          sizeGroup: it.sizeGroup,
          detail: 'ไม่มี QT ไหนใช้รายการนี้ — อาจลบหรือ merge ได้',
          severity: 'medium',
        })
      }

      // A3: item_orphan_group (singleton sizeGroup)
      if (it.sizeGroup) {
        const groupItems = itemsByGroup.get(it.sizeGroup) || []
        if (groupItems.length === 1) {
          findings.push({
            subtype: 'item_orphan_group',
            code: it.code,
            name: it.name,
            category: it.category,
            sizeGroup: it.sizeGroup,
            detail: `sizeGroup "${it.sizeGroup}" มี item ตัวเดียว — ไม่ต้องมี group ก็ได้`,
            severity: 'low',
          })
        }
      }

      // B3: item_no_size_group (category ควรมี group แต่ไม่ตั้ง)
      if (!it.sizeGroup && SIZE_GROUP_CATEGORIES.has(it.category)) {
        findings.push({
          subtype: 'item_no_size_group',
          code: it.code,
          name: it.name,
          category: it.category,
          detail: `category "${it.category}" ปกติมี sizeGroup — รายการนี้ยังไม่ตั้ง`,
          severity: 'medium',
        })
      }

      // B3: item_no_facets
      if (!it.facets || Object.keys(it.facets).length === 0) {
        findings.push({
          subtype: 'item_no_facets',
          code: it.code,
          name: it.name,
          category: it.category,
          sizeGroup: it.sizeGroup,
          detail: 'ยังไม่ระบุ facets (color/size/material) — Wizard 2.0 จะใช้',
          severity: 'low',
        })
      }
    }

    // Sort: severity desc → category → code
    const sevRank: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 }
    findings.sort((a, b) => {
      if (a.severity !== b.severity) return sevRank[a.severity] - sevRank[b.severity]
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.code.localeCompare(b.code)
    })

    // Counts per subtype
    const countBySubtype: Record<AuditSubtype, number> = {
      item_unused_in_qt: 0,
      item_orphan_group: 0,
      item_no_size_group: 0,
      item_no_facets: 0,
    }
    for (const f of findings) countBySubtype[f.subtype]++

    return {
      findings,
      total: findings.length,
      countBySubtype,
    }
  }, [linenCatalog, quotations])
}
