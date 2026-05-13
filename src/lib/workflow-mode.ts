/**
 * 265 — Workflow mode helpers
 *
 * Customer มี 2 workflow:
 *   - cross_check (default): โรงงานนับเข้า ครบ 6 columns
 *   - trust_customer: ไม่นับเข้า ข้าม col4 + col5 ใช้สูตร Mode 2 (col6 − (col2+col3))
 *
 * LF snapshot workflowMode ตอนสร้าง → ป้องกัน drift เมื่อ customer toggle ภายหลัง
 */
import type { Customer, LinenForm, WorkflowMode, CarryOverMode, LinenFormStatus } from '@/types'
import { NEXT_LINEN_STATUS, PREV_LINEN_STATUS } from '@/types'

export function getEffectiveWorkflowMode(
  lf: Pick<LinenForm, 'workflowMode'> | null | undefined,
  customer: Pick<Customer, 'workflowMode'> | null | undefined,
): WorkflowMode {
  return lf?.workflowMode ?? customer?.workflowMode ?? 'cross_check'
}

export function getCustomerWorkflowMode(
  customer: Pick<Customer, 'workflowMode'> | null | undefined,
): WorkflowMode {
  return customer?.workflowMode ?? 'cross_check'
}

/**
 * Resolve default CarryOverMode สำหรับ reports:
 *   - มี explicit defaultCarryOverMode → ใช้เลย
 *   - ไม่มี + workflowMode = trust_customer → Mode 2
 *   - ไม่มี + workflowMode = cross_check → Mode 1
 */
export function getDefaultCarryOverMode(
  customer: Pick<Customer, 'workflowMode' | 'defaultCarryOverMode'> | null | undefined,
): CarryOverMode {
  if (customer?.defaultCarryOverMode) return customer.defaultCarryOverMode
  if (customer?.workflowMode === 'trust_customer') return 2
  return 1
}

/**
 * trust_customer LF — Hide col4 + col5 ใน grid
 */
export function shouldHideFactoryCols(mode: WorkflowMode): boolean {
  return mode === 'trust_customer'
}

/**
 * trust_customer — skip "3/7 โรงซักนับแล้ว" status (sorting)
 * เพราะไม่ได้นับเข้าจริง — ระบบจะข้ามจาก 2/7 received → 4/7 washing
 */
export function shouldSkipSortingStatus(mode: WorkflowMode): boolean {
  return mode === 'trust_customer'
}

/**
 * 265 — getNextLinenStatus / getPrevLinenStatus
 * ถ้า LF เป็น trust_customer → ข้าม sorting (3/7)
 *   received → washing (skip sorting)
 *   packed → washing (backward) — skip sorting going back
 */
export function getNextLinenStatus(lf: { status: LinenFormStatus; workflowMode?: WorkflowMode }): LinenFormStatus | null {
  if (lf.workflowMode === 'trust_customer' && lf.status === 'received') return 'washing'
  return NEXT_LINEN_STATUS[lf.status]
}

export function getPrevLinenStatus(lf: { status: LinenFormStatus; workflowMode?: WorkflowMode }): LinenFormStatus | null {
  if (lf.workflowMode === 'trust_customer' && lf.status === 'washing') return 'received'
  return PREV_LINEN_STATUS[lf.status]
}
