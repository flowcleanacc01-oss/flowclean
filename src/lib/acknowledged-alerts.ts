/**
 * Acknowledged Alerts Persistence (Feature 124)
 *
 * Stores user-acknowledged alert keys in localStorage (per user).
 * Alert key format: `{kind}-{id}` (e.g. "overdue-wb123", "discrepancy-lf456")
 *
 * Notes:
 * - Per-browser, not synced across devices (acceptable for UI convenience data)
 * - Auto-prunes keys that no longer appear in current alerts (stale cleanup)
 */

const STORAGE_PREFIX = 'flowclean_ack_alerts_'

function storageKey(userId: string): string {
  return STORAGE_PREFIX + userId
}

export function loadAcknowledged(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function saveAcknowledged(userId: string, keys: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...keys]))
  } catch {
    // ignore quota / privacy mode errors
  }
}

/** Remove acknowledged keys that don't appear in activeKeys (stale cleanup) */
export function pruneStale(acked: Set<string>, activeKeys: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const k of acked) if (activeKeys.has(k)) out.add(k)
  return out
}
