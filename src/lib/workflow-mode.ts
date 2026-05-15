/**
 * 265 — Workflow mode helpers
 *
 * Customer มี 2 workflow:
 *   - cross_check (default): โรงงานนับเข้า ครบ 6 columns
 *   - trust_customer: ไม่นับเข้า ข้าม col4 + col5 ใช้สูตร Mode 2 (col6 − (col2+col3))
 *
 * LF snapshot workflowMode ตอนสร้าง → ป้องกัน drift เมื่อ customer toggle ภายหลัง
 */
import type { Customer, LinenForm, WorkflowMode, CarryOverMode } from '@/types'

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

