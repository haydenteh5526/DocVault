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

describe('public pages are always light (R-D)', () => {
  it.each(['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify', '/auth/callback'])(
    'has no dark class on %s, even with a dark system theme',
    path => {
      startAt(path)
      expect(isDark()).toBe(false)
    },
  )

  it('stays light on a public page when the saved preference is dark, and keeps that preference', () => {
    localStorage.setItem('theme', 'dark')
    startAt('/')
    expect(isDark()).toBe(false)
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})

describe('the signed-in app follows the theme', () => {
  it.each(['/app', '/app/documents'])('has the dark class on %s with a dark system theme', path => {
    startAt(path)
    expect(isDark()).toBe(true)
  })

  it('has no dark class on /app when the preference is light', () => {
    localStorage.setItem('theme', 'light')
    startAt('/app')
    expect(isDark()).toBe(false)
  })

  it('turns light after leaving /app for a public page, and dark again on returning', () => {
    startAt('/app/documents')
    expect(isDark()).toBe(true)
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('route-change'))
    expect(isDark()).toBe(false)
    window.history.pushState({}, '', '/app')
    window.dispatchEvent(new Event('route-change'))
    expect(isDark()).toBe(true)
  })
})
