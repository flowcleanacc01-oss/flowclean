import bcrypt from 'bcryptjs'
import type { AppUser, UserRole } from '@/types'

// ============================================================
// Password Hashing
// ============================================================

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function validatePassword(pw: string): string | null {
  if (!pw) return 'กรุณากรอกรหัสผ่าน'
  if (pw.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
  if (pw.length > 72) return 'รหัสผ่านต้องไม่เกิน 72 ตัวอักษร'
  return null
}

// ============================================================
// Session Management (sessionStorage, 8-hour expiry)
// ============================================================

interface SessionData {
  userId: string
  userName: string
  userEmail: string
  userRole: UserRole
  expiresAt: number
}

const SESSION_KEY = 'flowclean_session'
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000 // 8 hours

export function createSession(user: AppUser): void {
  const session: SessionData = {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  }
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }
}

export function getSession(): SessionData | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session: SessionData = JSON.parse(raw)
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY)
    // Also remove legacy key
    sessionStorage.removeItem('flowclean_user')
  }
}
