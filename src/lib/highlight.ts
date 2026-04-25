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
