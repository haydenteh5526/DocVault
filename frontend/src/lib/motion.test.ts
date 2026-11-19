// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { enableMotion } from './motion'

function media(reduce: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('no-preference') ? !reduce : reduce,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  document.documentElement.classList.remove('motion-ok')
  vi.unstubAllGlobals()
})

describe('enableMotion', () => {
  it('adds motion-ok when motion is allowed and IntersectionObserver exists', () => {
    media(false)
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
    enableMotion()
    expect(document.documentElement).toHaveClass('motion-ok')
  })

  it('never adds motion-ok under prefers-reduced-motion: reduce', () => {
    media(true)
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
    enableMotion()
    expect(document.documentElement).not.toHaveClass('motion-ok')
  })

  it('does not add motion-ok without IntersectionObserver', () => {
    media(false)
    vi.stubGlobal('IntersectionObserver', undefined)
    enableMotion()
    expect(document.documentElement).not.toHaveClass('motion-ok')
  })
})
