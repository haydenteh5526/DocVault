// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup } from '@testing-library/react'
import { VaultDoor, type VaultState } from './VaultDoor'

function mockMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('VaultDoor', () => {
  it.each(['closed', 'entering', 'error', 'unlocking', 'open'] as VaultState[])('sets the %s class', state => {
    mockMotion(false)
    const { container } = render(<VaultDoor state={state} />)
    expect(container.firstElementChild).toHaveClass('vault-door', `vault-${state}`)
  })

  it('turns the dial 12 degrees per character, capped at 30 characters', () => {
    mockMotion(false)
    const { container, rerender } = render(<VaultDoor state="entering" progress={5} />)
    const dial = container.querySelector('[data-part="dial"]') as HTMLElement
    expect(dial.style.transform).toBe('rotate(60deg)')
    rerender(<VaultDoor state="entering" progress={99} />)
    expect(dial.style.transform).toBe('rotate(360deg)')
  })

  it('rests at 0 degrees when closed and turns to 270 when unlocking', () => {
    mockMotion(false)
    const { container, rerender } = render(<VaultDoor state="closed" progress={7} />)
    const dial = container.querySelector('[data-part="dial"]') as HTMLElement
    expect(dial.style.transform).toBe('rotate(0deg)')
    rerender(<VaultDoor state="unlocking" progress={7} />)
    expect(dial.style.transform).toBe('rotate(270deg)')
  })

  it('draws each badge only when asked', () => {
    mockMotion(false)
    const { container, rerender } = render(<VaultDoor state="closed" />)
    expect(container.querySelector('[data-part="badge-key"]')).toBeNull()
    expect(container.querySelector('[data-part="badge-second-ring"]')).toBeNull()
    rerender(<VaultDoor state="closed" badge="key" />)
    expect(container.querySelector('[data-part="badge-key"]')).not.toBeNull()
    rerender(<VaultDoor state="unlocking" badge="second-ring" />)
    expect(container.querySelector('[data-part="badge-second-ring"]')).not.toBeNull()
  })

  it('is hidden from assistive technology', () => {
    mockMotion(false)
    const { container } = render(<VaultDoor state="closed" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('is still under reduced motion and moves otherwise', () => {
    mockMotion(true)
    const first = render(<VaultDoor state="open" />)
    expect(first.container.firstElementChild).toHaveClass('vault-still')
    cleanup()
    mockMotion(false)
    const second = render(<VaultDoor state="open" />)
    expect(second.container.firstElementChild).not.toHaveClass('vault-still')
  })
})
