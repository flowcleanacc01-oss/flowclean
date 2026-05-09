'use client'

import { useEffect, useRef } from 'react'

/**
 * 186 — Auto-scroll page while HTML5 drag is in progress
 * 242.4 (R1) — RAF loop runs ONLY when cursor in edge zone
 *
 * เมื่อ user ลาก row ขึ้นแตะขอบบน/ล่างของ viewport →
 * page scroll เองอัตโนมัติ ไม่ต้องปล่อยแล้วจับใหม่
 *
 * Usage:
 *   useAutoScrollOnDrag(dragCode !== null)
 *
 * Optimizations (242.4):
 *   - Resolve scroll container ONCE on drag start (not per frame)
 *   - rAF loop active only when cursor in edge zone (not full 60fps loop)
 *   - Restart rAF on dragover when cursor enters edge zone
 *   - Stop rAF immediately when cursor leaves edge zone
 */
export function useAutoScrollOnDrag(
  active: boolean,
  opts: { threshold?: number; maxSpeed?: number } = {},
) {
  const { threshold = 80, maxSpeed = 18 } = opts
  const cursorY = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const modalScrollRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      cursorY.current = null
      modalScrollRef.current = null
      return
    }

    // 242.4: resolve modal scroll container ONCE at drag start (not per frame)
    modalScrollRef.current = document.querySelector<HTMLElement>('.max-h-\\[94vh\\] > .overflow-auto')

    const computeDy = (y: number): number => {
      const vh = window.innerHeight
      if (y < threshold) {
        const ratio = 1 - y / threshold
        return -Math.ceil(ratio * maxSpeed)
      } else if (y > vh - threshold) {
        const ratio = 1 - (vh - y) / threshold
        return Math.ceil(ratio * maxSpeed)
      }
      return 0
    }

    const tick = () => {
      const y = cursorY.current
      if (y === null) {
        rafRef.current = null
        return
      }
      const dy = computeDy(y)
      if (dy === 0) {
        // 242.4: stop loop when cursor leaves edge zone — restart on next dragover
        rafRef.current = null
        return
      }
      // 242.4 (R2): scroll ONE container only — modal ถ้ามี, ไม่งั้น window
      // กัน background page ขยับใต้ modal ระหว่าง drag
      const modalScroll = modalScrollRef.current
      if (modalScroll) {
        modalScroll.scrollTop += dy
      } else {
        window.scrollBy({ top: dy, behavior: 'auto' })
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const onDragOver = (e: DragEvent) => {
      cursorY.current = e.clientY
      // 242.4: kick rAF only if not already running AND cursor in edge zone
      if (rafRef.current === null && computeDy(e.clientY) !== 0) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    window.addEventListener('dragover', onDragOver)

    return () => {
      window.removeEventListener('dragover', onDragOver)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      cursorY.current = null
      modalScrollRef.current = null
    }
  }, [active, threshold, maxSpeed])
}
