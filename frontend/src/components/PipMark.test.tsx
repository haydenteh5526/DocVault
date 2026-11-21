// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PipMark } from './PipMark'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it.each(['idle', 'working', 'needs-you', 'done'] as const)(
  'renders the decorative %s expression',
  (state) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const { container } = render(<PipMark state={state} />)
    expect(container.querySelector('svg')?.getAttribute('data-state')).toBe(state)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  },
)
it('omits the blink class under reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  const { container } = render(<PipMark />)
  expect(container.querySelector('.pip-blink')).toBeNull()
})
