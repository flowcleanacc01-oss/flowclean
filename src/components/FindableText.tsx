'use client'

/**
 * 233 — Hidden text companion ที่ render <mark> ภายใน sr-only span
 * ใช้คู่กับ <input> field ที่ FindBar/highlight ภายในไม่ได้
 *
 * Pattern:
 *   <td>
 *     <input value={item.name} ... />
 *     <FindableText value={item.name} highlightQ={query} />
 *   </td>
 *
 * — sr-only ทำให้มองไม่เห็น แต่ DOM tree ยังมี <mark> ที่ FindBar scan เจอ
 * — scrollIntoView จะ scroll ไปยังตำแหน่ง span (= ตำแหน่ง td/row)
 */
import { highlightText } from '@/lib/highlight'

interface Props {
  value: string
  highlightQ: string
  /** Optional: ปกติ sr-only แต่อยากเห็น preview ตอนค้นหาก็ได้ */
  visible?: boolean
}

export default function FindableText({ value, highlightQ, visible = false }: Props) {
  if (!highlightQ.trim() || !value) return null
  // Skip ถ้า value ไม่ contain query (no match — render nothing)
  const tokens = highlightQ.toLowerCase().split(/\s+/).filter(Boolean)
  const lowerValue = value.toLowerCase()
  const hasMatch = tokens.some(t => lowerValue.includes(t))
  if (!hasMatch) return null

  return (
    <span
      aria-hidden="true"
      className={visible ? 'block text-xs text-slate-500 mt-0.5' : 'sr-only'}
    >
      {highlightText(value, highlightQ)}
    </span>
  )
}
