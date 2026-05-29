// 390 — Aggregate Impact logic tests (diffConfigs / summarizeAffected / compareSnapshots)
import { describe, it, expect } from 'vitest'
import { diffConfigs, summarizeAffected, compareSnapshots } from '@/lib/aggregate-audit'
import type { AggregateSnapshot } from '@/lib/carry-over-logic'
import type { AggregateSizeGroupConfig } from '@/types'

const C = (
  groupKey: string,
  col2Mode: 'aggregate' | 'per_row' = 'aggregate',
  col5Mode: 'aggregate' | 'per_row' = 'aggregate',
  anchorCode?: string,
): AggregateSizeGroupConfig => ({ groupKey, col2Mode, col5Mode, anchorCode })

const S = (
  groupKey: string,
  col2Mode: 'aggregate' | 'per_row' = 'aggregate',
  col5Mode: 'aggregate' | 'per_row' = 'aggregate',
): AggregateSnapshot => ({ [groupKey]: { col2Mode, col5Mode } })

describe('diffConfigs', () => {
  it('ไม่เปลี่ยน → hasChanges false', () => {
    const d = diffConfigs([C('BEDSHEET')], [C('BEDSHEET')])
    expect(d.hasChanges).toBe(false)
    expect(d.added).toEqual([])
    expect(d.removed).toEqual([])
    expect(d.modified).toEqual([])
  })

  it('col5Mode undefined ถือเป็น aggregate (default) → ไม่นับว่าเปลี่ยน', () => {
    // prev ไม่ระบุ col5Mode, next = aggregate → ค่าจริงเท่ากัน
    const prev: AggregateSizeGroupConfig[] = [{ groupKey: 'BEDSHEET', col2Mode: 'aggregate' }]
    const d = diffConfigs(prev, [C('BEDSHEET', 'aggregate', 'aggregate')])
    expect(d.hasChanges).toBe(false)
  })

  it('เพิ่ม group', () => {
    const d = diffConfigs([], [C('DUVET')])
    expect(d.added).toEqual(['DUVET'])
    expect(d.modeGroupChanged).toBe(true)
    expect(d.hasChanges).toBe(true)
  })

  it('ลบ group', () => {
    const d = diffConfigs([C('DUVET')], [])
    expect(d.removed).toEqual(['DUVET'])
    expect(d.modeGroupChanged).toBe(true)
  })

  it('col2Mode เปลี่ยน → modified + modeGroupChanged', () => {
    const d = diffConfigs([C('BEDSHEET', 'aggregate')], [C('BEDSHEET', 'per_row')])
    expect(d.modified).toHaveLength(1)
    expect(d.modified[0].groupKey).toBe('BEDSHEET')
    expect(d.modeGroupChanged).toBe(true)
    expect(d.anchorChanged).toBe(false)
  })

  it('เปลี่ยนแค่ anchor → anchorChanged แต่ไม่ใช่ modeGroupChanged', () => {
    const d = diffConfigs(
      [C('BEDSHEET', 'aggregate', 'aggregate', 'H05')],
      [C('BEDSHEET', 'aggregate', 'aggregate', 'H06')],
    )
    expect(d.anchorChanged).toBe(true)
    expect(d.modeGroupChanged).toBe(false)
    expect(d.hasChanges).toBe(true)
    expect(d.modified[0].changes.join(' ')).toContain('anchor')
  })
})

describe('summarizeAffected', () => {
  it('LF ไม่มี snapshot + config ใหม่ไม่ว่าง → recalcNow (snapshot_missing)', () => {
    const r = summarizeAffected([undefined], [C('BEDSHEET')])
    expect(r.scanned).toBe(1)
    expect(r.recalcNow).toBe(1)
    expect(r.driftReview).toBe(0)
    expect(r.byReason.snapshot_missing).toBe(1)
  })

  it('snapshot ตรง config ใหม่ → 0 กระทบ', () => {
    const r = summarizeAffected([S('BEDSHEET', 'aggregate', 'aggregate')], [C('BEDSHEET', 'aggregate', 'aggregate')])
    expect(r.recalcNow).toBe(0)
    expect(r.driftReview).toBe(0)
  })

  it('snapshot mode ต่างจาก config ใหม่ → driftReview (snapshot_mismatch)', () => {
    const r = summarizeAffected([S('BEDSHEET', 'aggregate', 'aggregate')], [C('BEDSHEET', 'per_row', 'aggregate')])
    expect(r.driftReview).toBe(1)
    expect(r.byReason.snapshot_mismatch).toBe(1)
  })

  it('มี snapshot แต่ลบ config หมด → extra_groups (driftReview)', () => {
    const r = summarizeAffected([S('BEDSHEET')], [])
    expect(r.scanned).toBe(1)
    expect(r.driftReview).toBe(1)
    expect(r.byReason.extra_groups).toBe(1)
  })

  it('ไม่มี snapshot + ไม่มี config → ไม่นับ (ไม่เกี่ยว aggregate)', () => {
    const r = summarizeAffected([undefined, undefined], [])
    expect(r.scanned).toBe(0)
    expect(r.recalcNow).toBe(0)
    expect(r.driftReview).toBe(0)
  })

  it('ผสม: 2 ไม่มี snapshot + 1 ตรง + 1 ต่าง → recalcNow 2, driftReview 1', () => {
    const r = summarizeAffected(
      [undefined, undefined, S('BEDSHEET', 'aggregate', 'aggregate'), S('BEDSHEET', 'per_row', 'aggregate')],
      [C('BEDSHEET', 'aggregate', 'aggregate')],
    )
    expect(r.recalcNow).toBe(2)
    expect(r.driftReview).toBe(1)
    expect(r.scanned).toBe(4)
  })
})

describe('compareSnapshots (moved verbatim — lock behavior)', () => {
  it('undefined ทั้งคู่ → reason null', () => {
    expect(compareSnapshots(undefined, undefined).reason).toBeNull()
  })
  it('LF ไม่มี + customer มี → snapshot_missing', () => {
    expect(compareSnapshots(undefined, S('X')).reason).toBe('snapshot_missing')
  })
  it('เหมือนกัน → null', () => {
    expect(compareSnapshots(S('X', 'aggregate', 'aggregate'), S('X', 'aggregate', 'aggregate')).reason).toBeNull()
  })
  it('group ใหม่ฝั่ง customer → missing_groups', () => {
    const cur: AggregateSnapshot = { ...S('X'), ...S('Y') }
    expect(compareSnapshots(S('X'), cur).reason).toBe('missing_groups')
  })
})
