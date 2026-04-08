/**
 * Recent Customers Tracker (Feature A2)
 *
 * เก็บ customer IDs ที่ใช้บ่อยใน localStorage
 * แสดงด้านบน select dropdown ทุกที่ที่เลือก customer
 */

const STORAGE_KEY = 'flowclean_recent_customers'
const MAX_RECENT = 5

/**
 * Get list of recent customer IDs (newest first)
 */
export function getRecentCustomerIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Mark a customer as recently used (move to top, max 5)
 * Call this whenever user selects a customer in any modal
 */
export function trackRecentCustomer(customerId: string): void {
  if (typeof window === 'undefined' || !customerId) return
  try {
    const current = getRecentCustomerIds()
    const filtered = current.filter(id => id !== customerId)
    const updated = [customerId, ...filtered].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}

/**
 * Clear all recent customers
 */
export function clearRecentCustomers(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Sort customers with recent ones first (within active customers)
 * Returns: [recent customers (newest first), then rest sorted by name]
 */
export function sortCustomersWithRecent<T extends { id: string; isActive: boolean; shortName?: string; name: string }>(
  customers: T[],
): T[] {
  const active = customers.filter(c => c.isActive)
  const recentIds = getRecentCustomerIds()
  const recentSet = new Set(recentIds)

  // Recent customers in order
  const recents = recentIds
    .map(id => active.find(c => c.id === id))
    .filter((c): c is T => !!c)

  // Rest sorted by name
  const rest = active
    .filter(c => !recentSet.has(c.id))
    .sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name))

  return [...recents, ...rest]
}
