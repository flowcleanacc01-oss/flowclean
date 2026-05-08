'use client'

/**
 * 232 — Visual warning component for code reuse conflict
 * ใช้ใน PromoteModal / Items Quick Add / AddItemWizard
 */
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CodeRefSummary, ConflictLevel } from '@/lib/code-reference-check'

interface Props {
  code: string
  plannedName: string
  refs: CodeRefSummary
  conflict: ConflictLevel
  /** Compact = แสดงแบบสั้น (สำหรับ inline form) */
  compact?: boolean
}

export default function CodeConflictWarning({ code, plannedName, refs, conflict, compact }: Props) {
  if (conflict === 'no_refs') return null // ไม่ต้องแสดงอะไร

  // Color + icon
  const cfg = {
    name_match: {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      icon: <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />,
      title: '✅ ปลอดภัย — ชื่อตรงกับ ref ที่มีอยู่',
    },
    nameless_only: {
      bg: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: <Info className="w-4 h-4 flex-shrink-0 text-blue-600" />,
      title: 'ℹ️ มี ref ค้างใน LF/Customer (ไม่มี name field) — จะรวมเข้าชื่อใหม่',
    },
    name_drift: {
      bg: 'bg-amber-50 border-amber-300 text-amber-900',
      icon: <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />,
      title: '⚠ Code reuse จะทำให้เกิด name drift!',
    },
  }[conflict]

  const differingNames = refs.uniqueNames.filter(n => n !== plannedName.trim())

  if (compact) {
    return (
      <div className={cn('text-xs px-2.5 py-1.5 rounded border flex items-start gap-1.5', cfg.bg)}>
        {cfg.icon}
        <div className="flex-1">
          <div className="font-medium">{cfg.title}</div>
          <div className="opacity-90 mt-0.5 text-[11px]">
            <CodeRefSummaryLine refs={refs} />
            {differingNames.length > 0 && (
              <span className="ml-1">— ชื่อที่ค้าง: {differingNames.map(n => `"${n}"`).join(', ')}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('p-3 rounded-lg border', cfg.bg)}>
      <div className="flex items-start gap-2 mb-2">
        {cfg.icon}
        <div className="font-semibold">{cfg.title}</div>
      </div>

      <div className="text-xs space-y-1 ml-6">
        <div>
          รหัส <code className="font-mono bg-white/60 px-1 rounded">{code}</code>
          {' '}ในระบบมี ref ค้างอยู่ <strong>{refs.totalRefs}</strong> records
        </div>
        <CodeRefDetailList refs={refs} />

        {conflict === 'name_drift' && (
          <div className="mt-2 pt-2 border-t border-amber-200">
            <div className="font-medium mb-1">⚠ ผลที่จะเกิด:</div>
            <div className="space-y-0.5 text-[11px]">
              <div>• QT/DN เก่าจะกลายเป็น <strong>name drift</strong> — ชื่อใน items ไม่ตรง catalog</div>
              <div>• ชื่อใน QT เก่า: {differingNames.map(n => <code key={n} className="font-mono bg-white/60 px-1 rounded mx-0.5">"{n}"</code>)}</div>
              <div>• ชื่อใน catalog ใหม่: <code className="font-mono bg-white/60 px-1 rounded">"{plannedName}"</code></div>
              <div className="mt-1 text-amber-800 font-medium">→ คำแนะนำ: <strong>ใช้ code อื่น</strong> หรือ Reassign ref เก่าก่อน promote</div>
            </div>
          </div>
        )}

        {conflict === 'nameless_only' && refs.totalRefs > 0 && (
          <div className="mt-2 text-[11px] opacity-90">
            ℹ ref เหล่านี้จะรวมเข้า catalog item ใหม่ <code className="font-mono bg-white/60 px-1 rounded">{plannedName}</code> โดยอัตโนมัติ
          </div>
        )}
      </div>
    </div>
  )
}

function CodeRefSummaryLine({ refs }: { refs: CodeRefSummary }) {
  const parts: string[] = []
  if (refs.qts.length) parts.push(`QT ${refs.qts.length}`)
  if (refs.lfs.length) parts.push(`LF ${refs.lfs.reduce((s, l) => s + l.rowsCount, 0)} (${refs.lfs.length} ใบ)`)
  if (refs.dns.length) parts.push(`DN ${refs.dns.length}`)
  if (refs.customers.length) parts.push(`Customer ${refs.customers.length}`)
  return <>มี ref ใน: {parts.join(' · ')}</>
}

function CodeRefDetailList({ refs }: { refs: CodeRefSummary }) {
  return (
    <ul className="space-y-0.5 text-[11px]">
      {refs.qts.length > 0 && (
        <li>
          <strong>QT:</strong> {refs.qts.length} ใบ —
          {refs.qts.slice(0, 3).map(q => ` ${q.number} (${q.status})`).join(',')}
          {refs.qts.length > 3 && ` +${refs.qts.length - 3} อื่นๆ`}
        </li>
      )}
      {refs.lfs.length > 0 && (() => {
        const byCust = new Map<string, number>()
        for (const l of refs.lfs) byCust.set(l.customerShortName, (byCust.get(l.customerShortName) || 0) + l.rowsCount)
        return (
          <li>
            <strong>LF:</strong> {refs.lfs.reduce((s, l) => s + l.rowsCount, 0)} rows ใน {refs.lfs.length} ใบ —
            ลูกค้า: {Array.from(byCust.entries()).map(([c, n]) => `${c}(${n})`).join(', ')}
          </li>
        )
      })()}
      {refs.dns.length > 0 && (
        <li>
          <strong>DN:</strong> {refs.dns.length} items —
          {refs.dns.slice(0, 3).map(d => ` ${d.noteNumber}`).join(',')}
          {refs.dns.length > 3 && ` +${refs.dns.length - 3} อื่นๆ`}
        </li>
      )}
      {refs.customers.length > 0 && (
        <li>
          <strong>Customer:</strong> {refs.customers.length} ราย —
          {refs.customers.slice(0, 3).map(c => ` ${c.shortName}`).join(',')}
          {refs.customers.length > 3 && ` +${refs.customers.length - 3} อื่นๆ`}
        </li>
      )}
    </ul>
  )
}
