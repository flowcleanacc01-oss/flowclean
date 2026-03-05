import { describe, it, expect } from 'vitest'
import { sanitizeNumber, formatCurrency, formatNumber } from '@/lib/utils'

describe('sanitizeNumber', () => {
  it('returns valid positive number', () => {
    expect(sanitizeNumber(42)).toBe(42)
    expect(sanitizeNumber('42')).toBe(42)
  })

  it('returns 0 for negative numbers', () => {
    expect(sanitizeNumber(-5)).toBe(0)
    expect(sanitizeNumber('-10')).toBe(0)
  })

  it('returns 0 for NaN', () => {
    expect(sanitizeNumber('abc')).toBe(0)
    expect(sanitizeNumber(NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(sanitizeNumber(Infinity)).toBe(0)
    expect(sanitizeNumber(-Infinity)).toBe(0)
  })

  it('clamps to max value', () => {
    expect(sanitizeNumber(10_000_000)).toBe(9_999_999) // default max
    expect(sanitizeNumber(500, 100)).toBe(100) // custom max
  })

  it('handles zero', () => {
    expect(sanitizeNumber(0)).toBe(0)
    expect(sanitizeNumber('0')).toBe(0)
  })

  it('handles decimal values', () => {
    expect(sanitizeNumber(3.14)).toBe(3.14)
    expect(sanitizeNumber('3.14')).toBe(3.14)
  })
})

describe('formatCurrency', () => {
  it('formats with 2 decimal places', () => {
    expect(formatCurrency(1000)).toBe('1,000.00')
    expect(formatCurrency(0)).toBe('0.00')
    expect(formatCurrency(1234567.89)).toBe('1,234,567.89')
  })

  it('formats small decimals', () => {
    expect(formatCurrency(0.5)).toBe('0.50')
    expect(formatCurrency(73.5)).toBe('73.50')
  })
})

describe('formatNumber', () => {
  it('formats integers with commas', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})
