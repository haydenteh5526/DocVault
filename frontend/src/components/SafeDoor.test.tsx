// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SafeDoor } from './SafeDoor'
import type { VaultState } from './VaultDoor'

function mockMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderDoor(props: Partial<React.ComponentProps<typeof SafeDoor>> = {}) {
  return render(
    <MemoryRouter>
      <SafeDoor state="closed" topRight={<a href="/register">Create account</a>} {...props}>
        <h1>Welcome back</h1>
      </SafeDoor>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SafeDoor', () => {
  it.each([
    ['closed', 'LOCKED'],
    ['entering', 'LOCKED'],
    ['unlocking', 'VERIFYING'],
    ['error', 'INVALID'],
    ['open', 'UNLOCKED'],
  ] as [VaultState, string][])('shows %s as the text %s and as a class', (state, label) => {
    mockMotion(false)
    const { container } = renderDoor({ state })
    expect(screen.getByText(label)).toBeVisible()
    expect(container.querySelector('.safe-stage')).toHaveClass(`safe-${state}`)
    expect(container.querySelector('[data-part="status-led"]')).toHaveAttribute('data-led', label.toLowerCase())
  })

  it('puts a shape in the LED for invalid and unlocked, not only a colour', () => {
    mockMotion(false)
    const invalid = renderDoor({ state: 'error' })
    expect(invalid.container.querySelector('[data-part="led-cross"]')).not.toBeNull()
    cleanup()
    const open = renderDoor({ state: 'open' })
    expect(open.container.querySelector('[data-part="led-tick"]')).not.toBeNull()
  })

  it('keeps the bezel: monogram link home, the top-right toggle, hinges and three bolts', () => {
    mockMotion(false)
    const { container } = renderDoor()
    expect(screen.getByRole('link', { name: 'DocVault' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Create account' })).toBeVisible()
    expect(container.querySelectorAll('[data-part="hinge"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-part="bolt"]')).toHaveLength(3)
  })

  it('renders the form inside the console, with the dial ring above it', () => {
    mockMotion(false)
    const { container } = renderDoor({ progress: 3, badge: 'key' })
    const console_ = container.querySelector('.safe-console') as HTMLElement
    expect(console_).toContainElement(screen.getByRole('heading', { name: 'Welcome back' }))
    const ring = console_.querySelector('.vault-door') as HTMLElement
    expect(ring).not.toBeNull()
    expect(ring.compareDocumentPosition(screen.getByRole('heading'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(ring.querySelector('[data-part="badge-key"]')).not.toBeNull()
  })

  it('hides the door face from assistive technology and keyboard once it is open', () => {
    mockMotion(false)
    const closed = renderDoor({ state: 'closed' })
    expect(closed.container.querySelector('.safe-door')).not.toHaveAttribute('aria-hidden')
    cleanup()
    const open = renderDoor({ state: 'open' })
    const face = open.container.querySelector('.safe-door') as HTMLElement
    expect(face).toHaveAttribute('aria-hidden', 'true')
    expect(face).toHaveAttribute('inert')
  })

  it('shows interior content only behind the door, and marks the door settled when told', () => {
    mockMotion(false)
    const { container, rerender } = renderDoor({ state: 'closed' })
    expect(container.querySelector('.safe-interior')).toBeNull()
    rerender(
      <MemoryRouter>
        <SafeDoor state="open" settled interior={<h2>Check your email</h2>}>
          <h1>Welcome back</h1>
        </SafeDoor>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(container.querySelector('.safe-interior')).toContainElement(screen.getByRole('heading', { name: 'Check your email' }))
    expect(container.querySelector('.safe-stage')).toHaveClass('safe-settled')
  })

  it('is still under reduced motion and moves otherwise', () => {
    mockMotion(true)
    const still = renderDoor({ state: 'open' })
    expect(still.container.querySelector('.safe-stage')).toHaveClass('safe-still')
    cleanup()
    mockMotion(false)
    const moving = renderDoor({ state: 'open' })
    expect(moving.container.querySelector('.safe-stage')).not.toHaveClass('safe-still')
  })
})
