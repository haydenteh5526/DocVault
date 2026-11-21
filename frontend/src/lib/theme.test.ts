// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { initialiseTheme, isAppPath } from './theme'

function systemDark(dark: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('dark') ? dark : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

const isDark = () => document.documentElement.classList.contains('dark')
let stop: (() => void) | undefined

function startAt(path: string) {
  window.history.pushState({}, '', path)
  stop = initialiseTheme()
}

beforeEach(() => systemDark(true))

afterEach(() => {
  stop?.()
  stop = undefined
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('isAppPath', () => {
  it('is true for /app and anything under it, and nothing else', () => {
    expect(isAppPath('/app')).toBe(true)
    expect(isAppPath('/app/documents')).toBe(true)
    expect(isAppPath('/app/documents/abc')).toBe(true)
    for (const path of ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify', '/auth/callback', '/application', '/apple']) {
      expect(isAppPath(path), path).toBe(false)
    }
  })
})

describe('isAppPath is not case-sensitive (N1)', () => {
  it('treats /APP/documents as the app, because the router does', () => {
    expect(isAppPath('/APP')).toBe(true)
    expect(isAppPath('/APP/documents')).toBe(true)
    expect(isAppPath('/App/Documents')).toBe(true)
  })

  it('still treats /apple and /application as public pages', () => {
    expect(isAppPath('/apple')).toBe(false)
    expect(isAppPath('/APPLE')).toBe(false)
    expect(isAppPath('/application')).toBe(false)
  })
})

describe('public pages are always dark', () => {
  const publicPaths = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify', '/auth/callback']

  it.each(publicPaths)('has the dark class on %s with every preference', path => {
    for (const value of [null, 'dark', 'light', 'system']) {
      localStorage.clear()
      if (value) localStorage.setItem('theme', value)
      systemDark(false)
      startAt(path)
      expect(isDark(), `${path} with ${value}`).toBe(true)
      stop?.()
      stop = undefined
      document.documentElement.classList.remove('dark')
    }
  })

  it('keeps the saved preference for the app when a public page is shown', () => {
    localStorage.setItem('theme', 'light')
    startAt('/')
    expect(isDark()).toBe(true)
    expect(localStorage.getItem('theme')).toBe('light')
  })
})

describe('the signed-in app follows the preference', () => {
  it.each(['/app', '/app/documents', '/APP/documents'])('is dark on %s when nothing is stored, even with a light system theme', path => {
    systemDark(false)
    startAt(path)
    expect(isDark()).toBe(true)
  })

  it('is light with the light preference', () => {
    localStorage.setItem('theme', 'light')
    startAt('/app')
    expect(isDark()).toBe(false)
  })

  it('follows the media query with the system preference', () => {
    localStorage.setItem('theme', 'system')
    systemDark(true)
    startAt('/app')
    expect(isDark()).toBe(true)
    stop?.()
    stop = undefined
    document.documentElement.classList.remove('dark')
    systemDark(false)
    startAt('/app')
    expect(isDark()).toBe(false)
  })

  it('stays dark when moving from the app to a public page, and follows the preference again on returning', () => {
    localStorage.setItem('theme', 'light')
    startAt('/app/documents')
    expect(isDark()).toBe(false)
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('route-change'))
    expect(isDark()).toBe(true)
    window.history.pushState({}, '', '/app')
    window.dispatchEvent(new Event('route-change'))
    expect(isDark()).toBe(false)
  })
})
