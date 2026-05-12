/**
 * 261 — Shared utility: sort items by latest accepted QT order
 *
 * Source of truth: QT items[] order (per ติ๊ด's design — Fix 253)
 * Items not in QT fall back to catalog.sortOrder.
 *
 * Used by:
 *   - Fix 253: SD creation (delivery handleFormToggle)
 *   - Feat 254: Batch SD create
 *   - Feat 260: SD detail "Re-sort by QT" button
 *   - Feat 261: LF detail + WB detail Re-sort buttons
 */
import type { LinenItemDef, Quotation } from '@/types'

export interface SortByQTResult<T> {
  sorted: T[]
  /** latest accepted QT (null if none) — caller can use for messaging */
  latestQT: Quotation | null
  /** true ถ้าลำดับเดิม === ลำดับใหม่ (caller use for "no change" message) */
  sameOrder: boolean
}

/**
 * Sort `items` by latest accepted QT.items order (per customer).
 * Falls back to catalog.sortOrder for items not in QT.
 *
 * Generic over T extends {code} — works for LF rows, SD items, WB lineItems.
 *
 * Returns:
 *   - sorted: new array (does not mutate input)
 *   - latestQT: the QT used for ordering (or null if customer has none accepted)
 *   - sameOrder: whether input was already in correct order
 */
export function sortByQTOrder<T extends { code: string }>(
  items: T[],
  customerId: string,
  quotations: Quotation[],
  catalog: LinenItemDef[],
): SortByQTResult<T> {
  const latestQT = quotations
    .filter(q => q.customerId === customerId && q.status === 'accepted')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null

  if (!latestQT || items.length <= 1) {
    return { sorted: items, latestQT, sameOrder: true }
  }

  const qtOrderMap: Record<string, number> = {}
  latestQT.items.forEach((it, idx) => { qtOrderMap[it.code] = idx })

  const sorted = [...items].sort((a, b) => {
    const qa = qtOrderMap[a.code]
    const qb = qtOrderMap[b.code]
    if (qa !== undefined && qb !== undefined) return qa - qb
    if (qa !== undefined) return -1
    if (qb !== undefined) return 1
    const ai = catalog.findIndex(i => i.code === a.code)
    const bi = catalog.findIndex(i => i.code === b.code)
    return ai - bi
  })

  const sameOrder = sorted.every((it, idx) => it.code === items[idx].code)
  return { sorted, latestQT, sameOrder }
}

/**
 * 261 — WB lineItems variant: keep special items (transport/extra/discount)
 * at the bottom unchanged. Sort only the actual product lines by QT.
 */
const WB_SPECIAL_CODES = new Set([
  'TRANSPORT_TRIP', 'TRANSPORT_MONTH', 'EXTRA_CHARGE', 'DISCOUNT',
])

export function sortWBLineItemsByQT<T extends { code: string }>(
  lineItems: T[],
  customerId: string,
  quotations: Quotation[],
  catalog: LinenItemDef[],
): SortByQTResult<T> {
  const regular: T[] = []
  const special: T[] = []
  for (const li of lineItems) {
    if (WB_SPECIAL_CODES.has(li.code)) special.push(li)
    else regular.push(li)
  }
  const result = sortByQTOrder(regular, customerId, quotations, catalog)
  return {
    sorted: [...result.sorted, ...special],
    latestQT: result.latestQT,
    sameOrder: result.sameOrder,
  }
}
