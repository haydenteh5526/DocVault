// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { useReveal, REVEAL_SAFETY_MS } from './useReveal'

let callback: IntersectionObserverCallback = () => {}
const disconnect = vi.fn()

function Section() {
  const ref = useReveal<HTMLElement>()
  return <section ref={ref} data-testid="section">text</section>
}

beforeEach(() => {
  vi.useFakeTimers()
  disconnect.mockClear()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: IntersectionObserverCallback) { callback = cb }
    observe() {}
    disconnect = disconnect
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useReveal', () => {
  it('sets data-revealed when the observer reports an intersection, then disconnects', () => {
    render(<Section />)
    const section = screen.getByTestId('section')
    expect(section).not.toHaveAttribute('data-revealed')
    act(() => callback([{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(section).toHaveAttribute('data-revealed')
    expect(disconnect).toHaveBeenCalled()
  })

  it('ignores an entry that is not intersecting', () => {
    render(<Section />)
    const section = screen.getByTestId('section')
    act(() => callback([{ isIntersecting: false, target: section } as unknown as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(section).not.toHaveAttribute('data-revealed')
  })

  it('reveals after the safety timer when nothing intersects', () => {
    render(<Section />)
    const section = screen.getByTestId('section')
    act(() => { vi.advanceTimersByTime(REVEAL_SAFETY_MS - 1) })
    expect(section).not.toHaveAttribute('data-revealed')
    act(() => { vi.advanceTimersByTime(1) })
    expect(section).toHaveAttribute('data-revealed')
    expect(REVEAL_SAFETY_MS).toBe(2500)
  })

  it('reveals at once when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Section />)
    expect(screen.getByTestId('section')).toHaveAttribute('data-revealed')
  })
})
