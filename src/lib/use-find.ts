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
    // 242.3: debounce + ตัด characterData
    // 242.4 (R1): narrow scope จาก document.body → <main> + open dialogs
    //   ก่อนหน้านี้ observe ทั้ง body → header / sidebar / portal mutate ก็ trigger scan
    let scanTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedScan = () => {
      if (scanTimer) clearTimeout(scanTimer)
      scanTimer = setTimeout(scan, 80)
    }
    const obs = new MutationObserver(debouncedScan)
    // ใช้ <main> เป็น scope หลัก — ครอบคลุม content ที่ render mark
    const main = document.querySelector('main')
    const targets: Element[] = []
    if (main) targets.push(main)
    // เพิ่ม open dialog/modal (mark อาจอยู่ใน modal ที่ portal ออกนอก main)
    document.querySelectorAll('[role="dialog"]').forEach(d => targets.push(d))
    // Fallback: ถ้าหา target ไม่ได้เลย → กลับไปใช้ body (กัน edge case render order)
    if (targets.length === 0) targets.push(document.body)
    for (const t of targets) {
      obs.observe(t, { subtree: true, childList: true })
    }
    return () => {
      obs.disconnect()
      if (scanTimer) clearTimeout(scanTimer)
    }
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
