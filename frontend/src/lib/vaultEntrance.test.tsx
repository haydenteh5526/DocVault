// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useVaultEntrance } from './vaultEntrance'

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function Shell() {
  const entrance = useVaultEntrance()
  const location = useLocation()
  return <div data-testid="shell" className={entrance} data-state={JSON.stringify(location.state)} />
}

function renderAt(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/app', state }]}>
      <Routes><Route path="/app" element={<Shell />} /></Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the /app entrance after the vault opens', () => {
  it('plays when the app was reached through the vault door', () => {
    stubMotion(false)
    renderAt({ fromVault: true })
    expect(screen.getByTestId('shell')).toHaveClass('vault-entrance')
  })

  it('clears the flag from history, so a reload does not play it again, but keeps playing this time', () => {
    stubMotion(false)
    renderAt({ fromVault: true })
    expect(screen.getByTestId('shell')).toHaveAttribute('data-state', 'null')
    expect(screen.getByTestId('shell')).toHaveClass('vault-entrance')
  })

  it('does not play on an ordinary visit', () => {
    stubMotion(false)
    renderAt()
    expect(screen.getByTestId('shell')).not.toHaveClass('vault-entrance')
  })

  it('does not play under reduced motion', () => {
    stubMotion(true)
    renderAt({ fromVault: true })
    expect(screen.getByTestId('shell')).not.toHaveClass('vault-entrance')
  })
})
