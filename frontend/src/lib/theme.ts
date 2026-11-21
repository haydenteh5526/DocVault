import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

function preference(): ThemePreference {
  const value = localStorage.getItem('theme')
  return value === 'system' || value === 'light' ? value : 'dark'
}
function resolved() {
  const mode = preference()
  return mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode
}
function subscribe(update: () => void) {
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change',update)
  window.addEventListener('storage',update)
  window.addEventListener('theme-change',update)
  return () => {media.removeEventListener('change',update);window.removeEventListener('storage',update);window.removeEventListener('theme-change',update)}
}

/** The signed-in app: /app and anything under it. Every other page is public and always dark. */
export function isAppPath(pathname: string): boolean {
  // React Router matches paths without regard to case, so /APP/documents is the app too.
  const path = pathname.toLowerCase()
  return path === '/app' || path.startsWith('/app/')
}

export function initialiseTheme() {
  const apply = () => document.documentElement.classList.toggle('dark', !isAppPath(window.location.pathname) || resolved() === 'dark')
  apply()
  window.addEventListener('route-change', apply)
  const unsubscribe = subscribe(apply)
  return () => { window.removeEventListener('route-change', apply); unsubscribe() }
}
function setPreference(value: ThemePreference) {
  localStorage.setItem('theme',value)
  window.dispatchEvent(new Event('theme-change'))
}
export function useTheme() {
  const mode = useSyncExternalStore(subscribe,preference)
  const theme = useSyncExternalStore(subscribe,resolved)
  return {mode, theme, setPreference, toggle: () => setPreference(theme === 'dark' ? 'light' : 'dark')}
}
