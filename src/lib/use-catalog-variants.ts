'use client'

/**
 * 320 — Catalog Variants Hook
 *
 * รวบรวมชื่อ variant ของแต่ละ code ที่ user เคยใส่ใน QT/SD/LF/DN
 * ใช้กับ useSimilarItems เพื่อจับคู่ search query กับชื่อที่ user เคยใช้
 *
 * Example:
 *   - Catalog: { code: 'B/R', name: 'เสื้อคลุม', nameEn: 'Bathrobe' }
 *   - QT items มี: { code: 'B/R', name: 'เสื้อหมอ' }, { code: 'B/R', name: 'เสื้อกาวน์' }
 *   - SD items มี: { code: 'B/R', displayName: 'เสื้อคลุมแขก' }
 *   - return: { 'B/R': ['เสื้อหมอ', 'เสื้อกาวน์', 'เสื้อคลุมแขก'] }
 *
 * เมื่อ user พิมพ์ "เสื้อหมอ" ใน Wizard → useSimilarItems เจอ via variant match
 */

import { useMemo } from 'react'
import { useStore } from './store'

export function useCatalogVariants(): Map<string, string[]> {
  const { quotations, deliveryNotes } = useStore()

  return useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (code: string, name: string | undefined | null) => {
      if (!code || !name) return
      const trimmed = name.trim()
      if (!trimmed) return
      if (!map.has(code)) map.set(code, new Set())
      map.get(code)!.add(trimmed)
    }

    for (const q of quotations) {
      for (const qi of q.items) add(qi.code, qi.name)
    }
    for (const dn of deliveryNotes) {
      for (const di of dn.items) {
        add(di.code, di.displayName)
        if (di.isAdhoc) add(di.code, di.adhocName)
      }
    }

    // Convert Sets → arrays
    const result = new Map<string, string[]>()
    for (const [code, names] of map.entries()) {
      result.set(code, Array.from(names))
    }
    return result
  }, [quotations, deliveryNotes])
}
