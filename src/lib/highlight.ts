/**
 * Highlight helper (Feature 147.2 → 258 phonetic-aware)
 *
 * ใช้กับหน้าที่ link มาจาก Global Search เพื่อ highlight keyword
 * - URL param: ?q=<query>
 * - Wrap matched substrings ด้วย <mark> สีเหลือง
 * - Multi-token support (split by whitespace)
 *
 * 258: ใช้ findMatchRanges (จาก thai-search) แทน regex —
 *   query "เสื้อหมอ" จะ highlight "เสื้อ" + "หมอ" แยก
 *   (Cmd+K Layer 4 split → catalog page highlight ก็ต้องตรงกัน)
 */
import type { ReactNode } from 'react'
import React from 'react'
import { findMatchRanges } from './thai-search'

export function highlightText(text: string, query: string): ReactNode {
  if (!query || !query.trim() || !text) return text
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return text

  // 258: collect ranges from all tokens via findMatchRanges (direct + phonetic + split)
  const allRanges: Array<[number, number]> = []
  for (const t of tokens) {
    const ranges = findMatchRanges(text, t)
    if (ranges.length > 0) allRanges.push(...ranges)
  }
  if (allRanges.length === 0) return text

  // Merge overlapping ranges
  const sorted = allRanges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]
    const last = merged[merged.length - 1]
    if (s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }

  // Render
  const parts: ReactNode[] = []
  let pos = 0
  merged.forEach(([s, e], i) => {
    if (s > pos) parts.push(React.createElement(React.Fragment, { key: `t${i}` }, text.slice(pos, s)))
    parts.push(React.createElement('mark', { key: `m${i}`, className: 'bg-yellow-200 text-slate-900 rounded px-0.5' }, text.slice(s, e)))
    pos = e
  })
  if (pos < text.length) parts.push(React.createElement(React.Fragment, { key: 'end' }, text.slice(pos)))
  return parts
}

/**
 * Feature 162 — Numeric amount matcher for search boxes.
 *
 * ผู้ใช้พิมพ์ตัวเลข (เช่น "12500" / "12,500" / "12500.00") เพื่อหายอดเงิน
 * ใน column "ยอดรวม" / "จ่ายสุทธิ" — match หาก digit-only form ของ query
 * ปรากฏใน digit-only form ของยอดใดๆ
 */
export function matchesAmountQuery(query: string, amounts: number[]): boolean {
  const digits = query.replace(/[^\d]/g, '')
  if (!digits) return false
  for (const a of amounts) {
    if (!Number.isFinite(a)) continue
    // toFixed(2) → "12500.00" → digits-only "1250000"
    const aDigits = a.toFixed(2).replace(/[^\d]/g, '')
    if (aDigits.includes(digits)) return true
    // also try integer form (drop trailing zeros)
    const intDigits = String(Math.round(a))
    if (intDigits.includes(digits)) return true
  }
  return false
}

/**
 * Highlight wrapper สำหรับ formatted currency strings — match digits-only form
 * เพื่อให้ "12500" highlight ทับ "12,500.00" ที่แสดงผลได้
 */
export function highlightAmount(formatted: string, query: string): ReactNode {
  if (!query || !query.trim()) return formatted
  const qDigits = query.replace(/[^\d]/g, '')
  if (!qDigits) return formatted
  // Strip currency formatting from displayed string to find match position in digit space
  const fDigits = formatted.replace(/[^\d]/g, '')
  if (!fDigits.includes(qDigits)) return formatted
  // Highlight whole formatted string when amount matches
  return React.createElement('mark', { className: 'bg-yellow-200 text-slate-900 rounded px-0.5' }, formatted)
}
