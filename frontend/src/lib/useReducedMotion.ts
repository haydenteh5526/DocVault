import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

function subscribe(update: () => void) {
  const media = window.matchMedia?.(query)
  media?.addEventListener('change', update)
  return () => media?.removeEventListener('change', update)
}

/** True when the person asked for less motion. Without matchMedia it counts as true, so nothing moves. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? true)
}
