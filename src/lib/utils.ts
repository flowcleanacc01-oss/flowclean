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
// Document Number Generators
// ============================================================
export function genLinenFormNumber(): string {
  const now = new Date()
  const dateStr = format(now, 'yyyyMMdd')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `LF-${dateStr}-${seq}`
}

export function genDeliveryNoteNumber(): string {
  const now = new Date()
  const dateStr = format(now, 'yyyyMMdd')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `SD-${dateStr}-${seq}`
}

export function genBillingNumber(): string {
  const now = new Date()
  const monthStr = format(now, 'yyyyMM')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `WB-${monthStr}-${seq}`
}

export function genTaxInvoiceNumber(): string {
  const now = new Date()
  const monthStr = format(now, 'yyyyMM')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `IV-${monthStr}-${seq}`
}

export function genQuotationNumber(): string {
  const now = new Date()
  const monthStr = format(now, 'yyyyMM')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `QU-${monthStr}-${seq}`
}

export function genChecklistNumber(): string {
  const now = new Date()
  const dateStr = format(now, 'yyyyMMdd')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `CK-${dateStr}-${seq}`
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
