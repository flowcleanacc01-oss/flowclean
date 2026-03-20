import { clsx, type ClassValue } from 'clsx'
import { format, parseISO, differenceInDays } from 'date-fns'
import { th } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function genId(): string {
  return crypto.randomUUID()
}

// ============================================================
// Document Number Generators — sequential running numbers
// Format: PREFIX-YYYYMMDD-001 (daily) or PREFIX-YYYYMM-001 (monthly)
// ============================================================

/** หา running number ถัดไป จาก existing numbers ที่มี prefix เดียวกัน */
function nextRunning(prefix: string, existingNumbers: string[]): string {
  let max = 0
  for (const num of existingNumbers) {
    if (num.startsWith(prefix)) {
      const seq = parseInt(num.slice(prefix.length), 10)
      if (!isNaN(seq) && seq > max) max = seq
    }
  }
  return String(max + 1).padStart(3, '0')
}

export function genLinenFormNumber(existingNumbers: string[]): string {
  const prefix = `LF-${format(new Date(), 'yyyyMMdd')}-`
  return prefix + nextRunning(prefix, existingNumbers)
}

export function genDeliveryNoteNumber(existingNumbers: string[]): string {
  const prefix = `SD-${format(new Date(), 'yyyyMMdd')}-`
  return prefix + nextRunning(prefix, existingNumbers)
}

export function genBillingNumber(existingNumbers: string[]): string {
  const prefix = `WB-${format(new Date(), 'yyyyMM')}-`
  return prefix + nextRunning(prefix, existingNumbers)
}

export function genTaxInvoiceNumber(existingNumbers: string[]): string {
  const prefix = `IV-${format(new Date(), 'yyyyMM')}-`
  return prefix + nextRunning(prefix, existingNumbers)
}

export function genQuotationNumber(existingNumbers: string[]): string {
  const prefix = `QT-${format(new Date(), 'yyyyMM')}-`
  return prefix + nextRunning(prefix, existingNumbers)
}

export function genChecklistNumber(existingNumbers: string[]): string {
  const prefix = `CK-${format(new Date(), 'yyyyMMdd')}-`
  return prefix + nextRunning(prefix, existingNumbers)
}

// ============================================================
// Date & Format Helpers
// ============================================================
export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: th })
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yy', { locale: th })
  } catch {
    return dateStr
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n)
}

export function daysDiff(dateStr: string): number {
  try {
    return differenceInDays(new Date(), parseISO(dateStr))
  } catch {
    return 0
  }
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getAgingBucket(daysPast: number): string {
  if (daysPast <= 0) return 'ยังไม่ถึงกำหนด'
  if (daysPast <= 30) return '1-30 วัน'
  if (daysPast <= 60) return '31-60 วัน'
  if (daysPast <= 90) return '61-90 วัน'
  return 'มากกว่า 90 วัน'
}

/**
 * Sanitize numeric input: finite, non-negative, clamped to max.
 */
/**
 * Format branch code for display on documents.
 * '00000' → 'สำนักงานใหญ่'  |  '00001' → 'สาขาที่ 00001'  |  text → text (backward compat)
 */
export function formatBranch(branch: string): string {
  if (!branch) return ''
  if (/^\d{5}$/.test(branch)) {
    return branch === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${branch}`
  }
  return branch
}

export function sanitizeNumber(value: string | number, max = 9_999_999): number {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}
