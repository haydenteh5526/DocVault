/** Pure helpers shared by UI components — kept free of JSX so they're unit-testable. */

export type WarrantyState = 'none' | 'expired' | 'expiring' | 'active'

/** Days until the given ISO date (negative if past). Null-safe. */
export function daysUntil(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - now) / (1000 * 60 * 60 * 24))
}

/** Classify a warranty by its expiry date. "expiring" = within 30 days. */
export function warrantyState(expiry: string | null, now: number = Date.now()): WarrantyState {
  const days = daysUntil(expiry, now)
  if (days === null) return 'none'
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'active'
}

/** Human-friendly relative time, e.g. "just now", "5m ago", "3h ago", or a date. */
export function relativeTime(date: Date, now: number = Date.now()): string {
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })
}
