'use client'

/**
 * 219 — Tab + Browser History sync (universal)
 *
 * ใช้กับทุกหน้าที่มี sub-tab — ทำให้ปุ่ม Back/Forward ของ browser
 * ทำงานข้าม tab ได้ (ไม่กระโดดออกหน้าเลย)
 *
 * Behavior:
 *  - Click tab → router.push (เพิ่ม history entry → Back ใช้ได้)
 *  - Browser Back/Forward → useEffect detect URL change → update state
 *  - Idempotent: ถ้า URL = state แล้ว ไม่ push ซ้ำ (กัน loop)
 *  - Preserve query params อื่น (q, detail, openqt, ฯลฯ)
 */
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

export function useTabUrlSync<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  paramName: string = 'tab',
): [T, (t: T) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Stable ref to validTabs — กัน inline array literal ทำให้ effect re-fire ทุก render
  const validRef = useRef(validTabs)
  validRef.current = validTabs
  const isValid = (v: string | null): v is T =>
    v !== null && (validRef.current as readonly string[]).includes(v)

  const [tab, setTabState] = useState<T>(() => {
    const t = searchParams.get(paramName)
    return isValid(t) ? t : defaultTab
  })

  // Sync URL → state (back/forward, programmatic URL changes)
  useEffect(() => {
    const t = searchParams.get(paramName)
    const next: T = isValid(t) ? t : defaultTab
    setTabState(prev => (prev === next ? prev : next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, paramName, defaultTab])

  // setTab from click → push (history entry → Back works)
  const setTab = (t: T) => {
    if (searchParams.get(paramName) === t) {
      setTabState(t)
      return
    }
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    sp.set(paramName, t)
    router.push(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  return [tab, setTab]
}
