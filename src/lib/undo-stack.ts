'use client'

/**
 * 197 — Undo system สำหรับ Catalog Hygiene operations
 *
 * Concept: snapshot ทุก record ที่จะถูกแก้ก่อน execute → push เข้า stack ใน
 * localStorage → admin สามารถ undo ได้ภายใน 7 วัน
 *
 * ครอบคลุม Sync (188), Promote (190), Merge (174), Reassign (193)
 *
 * ❗ Limitation:
 *   - per-device (localStorage) — ไม่ sync ระหว่าง browser
 *   - ถ้า data ในระบบเปลี่ยนหลัง action (เช่น admin คนอื่นแก้ต่อ)
 *     → restore อาจ overwrite work ของคนอื่น (ระบบจะแจ้งเตือนถ้า detect ได้)
 *   - WB/IV ที่ออกแล้ว — undo ก็คืน data ได้ แต่ document compliance อาจมีปัญหา
 */

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'flowclean_undo_stack'
const MAX_ACTIONS = 50
const TTL_DAYS = 7

export type SnapshotTable =
  | 'linen_items'
  | 'quotations'
  | 'customers'
  | 'delivery_notes'
  | 'billing_statements'
  | 'tax_invoices'

export interface SnapshotChange {
  table: SnapshotTable
  /** primary key value */
  id: string
  /** 'update' = restore oldData; 'insert' = delete; 'delete' = restore */
  op: 'update' | 'insert' | 'delete'
  /** สำหรับ update/delete: เก็บ data ก่อนแก้ (สำหรับ restore) */
  oldData?: Record<string, unknown>
  /** สำหรับ insert: เก็บ data ที่ใส่เข้า (สำหรับลบ) */
  newData?: Record<string, unknown>
}

export interface UndoAction {
  id: string
  /** ISO timestamp */
  ts: string
  /** ประเภทเครื่องมือ */
  type: 'sync_names' | 'promote_name' | 'merge_codes' | 'reassign_orphan'
  /** สรุปสั้น แสดงให้ admin เห็น */
  description: string
  /** detail เพิ่มเติม (จำนวนเอกสารที่กระทบ ฯลฯ) */
  meta?: Record<string, unknown>
  changes: SnapshotChange[]
  /** undone หรือยัง — กัน undo ซ้ำ */
  undone?: boolean
  /** ทำใครเป็น executor */
  executedBy?: string
}

function readStack(): UndoAction[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const stack: UndoAction[] = JSON.parse(raw)
    // ลบของเก่ากว่า TTL
    const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000
    return stack.filter(a => new Date(a.ts).getTime() >= cutoff)
  } catch { return [] }
}

function writeStack(stack: UndoAction[]) {
  if (typeof window === 'undefined') return
  try {
    // จำกัด MAX_ACTIONS
    const trimmed = stack.slice(-MAX_ACTIONS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    // ส่ง event ให้ component ที่ subscribe ได้รับรู้
    window.dispatchEvent(new CustomEvent('flowclean:undo-stack-changed'))
  } catch { /* quota or json error */ }
}

/** Push action ใหม่เข้า stack */
export function pushUndoAction(action: Omit<UndoAction, 'id' | 'ts' | 'undone'>): UndoAction {
  const full: UndoAction = {
    ...action,
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    undone: false,
  }
  const stack = readStack()
  stack.push(full)
  writeStack(stack)
  return full
}

/** Mark ว่าทำการ undo แล้ว (กัน undo ซ้ำ) */
export function markUndone(id: string) {
  const stack = readStack().map(a => a.id === id ? { ...a, undone: true } : a)
  writeStack(stack)
}

/** ล้าง stack */
export function clearUndoStack() {
  writeStack([])
}

/** Hook subscribe ตัว stack — re-render เมื่อมีการเปลี่ยน */
export function useUndoStack(): UndoAction[] {
  const [stack, setStack] = useState<UndoAction[]>(() => readStack())
  useEffect(() => {
    const refresh = () => setStack(readStack())
    window.addEventListener('flowclean:undo-stack-changed', refresh)
    window.addEventListener('storage', refresh) // เผื่อแก้จาก tab อื่น
    return () => {
      window.removeEventListener('flowclean:undo-stack-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  // newest first
  return [...stack].reverse()
}
