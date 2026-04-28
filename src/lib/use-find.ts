'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 175.1 In-page Find — เลือก match จาก <mark> ที่ระบบ highlight อยู่แล้ว
 * จัดการ active match + scroll into view + counter
 *
 * - target = ทุก <mark> ใน document (ไม่ต้องเพิ่ม attr ที่หน้า)
 * - re-scan เมื่อ query เปลี่ยน หรือ DOM เปลี่ยน (MutationObserver)
 * - active mark ได้ attribute `data-find-active="true"` → CSS แยกสี
 */
export function useFindMatches(active: boolean) {
  const [matches, setMatches] = useState<HTMLElement[]>([])
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  indexRef.current = index

  // Scan <mark> elements (skip ones inside the FindBar itself)
  const scan = useCallback(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('mark'))
    const visible = all.filter(m => {
      // ignore marks inside the FindBar/GlobalSearch modal itself
      if (m.closest('[data-find-skip]')) return false
      return true
    })
    setMatches(prev => {
      // preserve index when set is unchanged
      if (prev.length === visible.length && prev.every((p, i) => p === visible[i])) return prev
      return visible
    })
  }, [])

  // Observe DOM mutations while bar is open
  useEffect(() => {
    if (!active) return
    scan()
    const obs = new MutationObserver(() => scan())
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
    return () => obs.disconnect()
  }, [active, scan])

  // Clamp index when match list changes
  useEffect(() => {
    if (matches.length === 0) {
      setIndex(0)
      return
    }
    if (indexRef.current >= matches.length) setIndex(matches.length - 1)
  }, [matches])

  // Apply active attribute + scroll
  useEffect(() => {
    if (!active) return
    matches.forEach((el, i) => {
      if (i === index) el.setAttribute('data-find-active', 'true')
      else el.removeAttribute('data-find-active')
    })
    const current = matches[index]
    if (current) {
      // delay so layout settles
      requestAnimationFrame(() => {
        current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      })
    }
    return () => {
      matches.forEach(el => el.removeAttribute('data-find-active'))
    }
  }, [active, matches, index])

  const next = useCallback(() => {
    setIndex(i => (matches.length === 0 ? 0 : (i + 1) % matches.length))
  }, [matches.length])

  const prev = useCallback(() => {
    setIndex(i => (matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length))
  }, [matches.length])

  return { matches, index, total: matches.length, next, prev, rescan: scan }
}
