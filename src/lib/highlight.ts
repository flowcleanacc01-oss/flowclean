/**
 * Highlight helper (Feature 147.2)
 *
 * ใช้กับหน้าที่ link มาจาก Global Search เพื่อ highlight keyword
 * - URL param: ?q=<query>
 * - Wrap matched substrings ด้วย <mark> สีเหลือง
 * - Multi-token support (split by whitespace)
 */
import type { ReactNode } from 'react'
import React from 'react'

export function highlightText(text: string, query: string): ReactNode {
  if (!query || !query.trim() || !text) return text
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return text
  const sorted = [...tokens].sort((a, b) => b.length - a.length)
  const pattern = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  if (!pattern) return text
  const splitRe = new RegExp(`(${pattern})`, 'gi')
  const tokenSet = new Set(sorted)
  return text.split(splitRe).map((p, i) =>
    tokenSet.has(p.toLowerCase())
      ? React.createElement('mark', { key: i, className: 'bg-yellow-200 text-slate-900 rounded px-0.5' }, p)
      : React.createElement(React.Fragment, { key: i }, p)
  )
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
