'use client'

import { useEffect, useRef } from 'react'

/**
 * 186 — Auto-scroll page while HTML5 drag is in progress
 *
 * เมื่อ user ลาก row ขึ้นแตะขอบบน/ล่างของ viewport →
 * page scroll เองอัตโนมัติ ไม่ต้องปล่อยแล้วจับใหม่
 *
 * Usage:
 *   useAutoScrollOnDrag(dragCode !== null)
 *
 * - active: ตอน drag กำลังเกิด (เช่น dragCode != null)
 * - threshold: ระยะจากขอบที่เริ่ม scroll (default 80px)
 * - maxSpeed: ความเร็วสูงสุด px/frame (default 18)
 *
 * Algorithm:
 *   - ฟัง dragover ที่ window → จับ cursor y
 *   - ถ้า y < threshold หรือ y > vh - threshold → คำนวณ speed (proportional)
 *   - rAF loop scroll window
 *   - หยุดเมื่อ active=false หรือ cursor พ้น dead zone
 */
export function useAutoScrollOnDrag(
  active: boolean,
  opts: { threshold?: number; maxSpeed?: number } = {},
) {
  const { threshold = 80, maxSpeed = 18 } = opts
  const cursorY = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      cursorY.current = null
      return
    }

    const onDragOver = (e: DragEvent) => {
      cursorY.current = e.clientY
    }

    const tick = () => {
      const y = cursorY.current
      if (y !== null) {
        const vh = window.innerHeight
        let dy = 0
        if (y < threshold) {
          // closer to top → faster up scroll
          const ratio = 1 - y / threshold
          dy = -Math.ceil(ratio * maxSpeed)
        } else if (y > vh - threshold) {
          const ratio = 1 - (vh - y) / threshold
          dy = Math.ceil(ratio * maxSpeed)
        }
        if (dy !== 0) {
          // Scroll the closest scrollable ancestor — fall back to window
          window.scrollBy({ top: dy, behavior: 'auto' })
          // Also scroll modal bodies if present (LF/Billing detail modals)
          const modalScroll = document.querySelector<HTMLElement>('.max-h-\\[94vh\\] > .overflow-auto')
          if (modalScroll) modalScroll.scrollTop += dy
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('dragover', onDragOver)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('dragover', onDragOver)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      cursorY.current = null
    }
  }, [active, threshold, maxSpeed])
}
