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
// Document Number Generators — timestamp-based to avoid collision
// ============================================================
let _seqCounter = 0

function nextSeq(): string {
  // Use last 3 digits of timestamp + counter for uniqueness
  const ts = Date.now() % 1000
  _seqCounter = (_seqCounter + 1) % 100
  return String(ts).padStart(3, '0') + String(_seqCounter).padStart(2, '0')
}

export function genLinenFormNumber(): string {
  return `LF-${format(new Date(), 'yyyyMMdd')}-${nextSeq()}`
}

export function genDeliveryNoteNumber(): string {
  return `SD-${format(new Date(), 'yyyyMMdd')}-${nextSeq()}`
}

export function genBillingNumber(): string {
  return `WB-${format(new Date(), 'yyyyMM')}-${nextSeq()}`
}

export function genTaxInvoiceNumber(): string {
  return `IV-${format(new Date(), 'yyyyMM')}-${nextSeq()}`
}

export function genQuotationNumber(): string {
  return `QU-${format(new Date(), 'yyyyMM')}-${nextSeq()}`
}

export function genChecklistNumber(): string {
  return `CK-${format(new Date(), 'yyyyMMdd')}-${nextSeq()}`
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
export function sanitizeNumber(value: string | number, max = 9_999_999): number {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}
