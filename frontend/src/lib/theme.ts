import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

function preference(): ThemePreference {
  const value = localStorage.getItem('theme')
  return value === 'dark' || value === 'light' ? value : 'system'
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

export function initialiseTheme() {
  const apply = () => document.documentElement.classList.toggle('dark', resolved() === 'dark')
  apply()
  return subscribe(apply)
}
function setPreference(value: ThemePreference) {
  if (value === 'system') localStorage.removeItem('theme')
  else localStorage.setItem('theme',value)
  window.dispatchEvent(new Event('theme-change'))
}
export function useTheme() {
  const mode = useSyncExternalStore(subscribe,preference)
  const theme = useSyncExternalStore(subscribe,resolved)
  return {mode, theme, setPreference, toggle: () => setPreference(theme === 'dark' ? 'light' : 'dark')}
}
