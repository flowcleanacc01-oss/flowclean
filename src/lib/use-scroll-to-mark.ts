'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * 171.1: Scroll first <mark> element into view when arriving from global
 * search with ?q= query param.
 *
 * - Waits for content to render (RAF + small delay) before locating the mark
 * - Searches inside any open modal first (.fixed.z-50, .max-h-[94vh]),
 *   falls back to document body
 * - Scrolls smoothly with `block: 'center'` so user's eye lands on the keyword
 */
export function useScrollToMark(deps: unknown[] = []) {
  const searchParams = useSearchParams()
  const q = searchParams.get('q')

  useEffect(() => {
    if (!q || !q.trim()) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 20 // ~1 sec total
    // 242.4 (R1): track active handles for proper cleanup — กัน overlapping pollers
    let activeTimeoutId: ReturnType<typeof setTimeout> | null = null
    let activeRafId: number | null = null

    const tryScroll = () => {
      activeTimeoutId = null
      if (cancelled) return
      attempts++
      // Search modal scroll containers first (so we scroll inside the modal),
      // fallback to whole document
      const containers: ParentNode[] = [
        ...Array.from(document.querySelectorAll<HTMLElement>('.max-h-\\[94vh\\] .overflow-auto')),
        ...Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')),
        document,
      ]
      let mark: HTMLElement | null = null
      for (const c of containers) {
        const found = c.querySelector?.('mark') as HTMLElement | null
        if (found) { mark = found; break }
      }
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (attempts < maxAttempts) {
        activeTimeoutId = setTimeout(tryScroll, 50)
      }
    }
    // RAF + small delay to allow first paint after route push
    activeRafId = requestAnimationFrame(() => {
      activeRafId = null
      activeTimeoutId = setTimeout(tryScroll, 60)
    })

    return () => {
      cancelled = true
      if (activeRafId !== null) cancelAnimationFrame(activeRafId)
      if (activeTimeoutId !== null) clearTimeout(activeTimeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ...deps])
}
