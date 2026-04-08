/**
 * Permissions Helper (69)
 *
 * Single source of truth สำหรับ role-based access control
 * ทุก guard ต้องอ้างอิงจากที่นี่ ห้าม inline check ใน component
 *
 * 5 Roles:
 * - operator: พนักงานโรงซัก
 * - driver: คนขับรถ
 * - staff: พนักงานทั่วไป
 * - accountant: พนักงานบัญชี
 * - admin: เจ้าของ/ผู้จัดการ
 */

import type { AppUser, UserRole } from '@/types'

const ALL: UserRole[] = ['operator', 'driver', 'staff', 'accountant', 'admin']

function hasRole(user: AppUser | null | undefined, allowed: UserRole[]): boolean {
  if (!user) return false
  return allowed.includes(user.role)
}

// ============================================================
// Page-level access (sidebar + page guards)
// ============================================================

/** Dashboard — ทุก role */
export const canViewDashboard = (u: AppUser | null) => hasRole(u, ALL)

/** LF — ทุก role (Operator แก้ status, Driver/Staff สร้าง+แก้, +Accountant/Admin) */
export const canViewLF = (u: AppUser | null) => hasRole(u, ALL)

/** SD — Driver, Staff, Accountant, Admin (Operator ไม่เห็น เพราะไม่เกี่ยว) */
export const canViewSD = (u: AppUser | null) => hasRole(u, ['driver', 'staff', 'accountant', 'admin'])

/** Customers — ทุก role ที่ไม่ใช่ Operator */
export const canViewCustomers = (u: AppUser | null) => hasRole(u, ['driver', 'staff', 'accountant', 'admin'])

/** Checklist — Operator + Staff */
export const canViewChecklist = (u: AppUser | null) => hasRole(u, ALL)

/** Billing (WB/IV/QT) — เฉพาะ Accountant + Admin */
export const canViewBilling = (u: AppUser | null) => hasRole(u, ['accountant', 'admin'])

/** Reports — Staff (ผ้าค้าง/ส่งของ), Accountant (รายได้/P&L), Admin (ทั้งหมด) */
export const canViewReports = (u: AppUser | null) => hasRole(u, ['staff', 'accountant', 'admin'])

/** Reports financial section (รายได้/P&L/customer rev) — Accountant + Admin */
export const canViewFinancialReports = (u: AppUser | null) => hasRole(u, ['accountant', 'admin'])

/** Expenses — Accountant + Admin */
export const canViewExpenses = (u: AppUser | null) => hasRole(u, ['accountant', 'admin'])

/** Items catalog — Admin only (เพราะกระทบราคา default) */
export const canManageItems = (u: AppUser | null) => hasRole(u, ['admin'])

/** Settings (บริษัท/ธนาคาร/ผู้ใช้) — Admin only */
export const canManageSettings = (u: AppUser | null) => hasRole(u, ['admin'])

// ============================================================
// Feature-level access (UI hide/show)
// ============================================================

/** ดูราคา (ใน customer detail, LF print, etc.) — Accountant + Admin */
export const canViewPrice = (u: AppUser | null) => hasRole(u, ['accountant', 'admin'])

/** ดู financial cards ใน Dashboard (รายได้/บิลค้าง/top customers) — Accountant + Admin */
export const canViewFinancialDashboard = (u: AppUser | null) => hasRole(u, ['accountant', 'admin'])

/** Manage users (สร้าง/แก้/ลบ) — Admin only */
export const canManageUsers = (u: AppUser | null) => hasRole(u, ['admin'])

/** Reset/Truncate database — Admin only */
export const canResetData = (u: AppUser | null) => hasRole(u, ['admin'])

/** Audit log viewer — Admin only */
export const canViewAuditLog = (u: AppUser | null) => hasRole(u, ['admin'])
