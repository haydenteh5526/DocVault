// @vitest-environment jsdom
import { it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OAuthCallback from './OAuthCallback'

const { navigateMock, loginMock } = vi.hoisted(() => ({ navigateMock: vi.fn(), loginMock: vi.fn() }))

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ login: loginMock }) }))
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

function open(hash: string) {
  window.history.replaceState(null, '', `/auth/callback${hash}`)
  return render(<MemoryRouter><OAuthCallback /></MemoryRouter>)
}

it('stores the session from the fragment, clears it and goes to /app', () => {
  open('#access_token=a&refresh_token=r')
  expect(loginMock).toHaveBeenCalledWith('a', 'r')
  expect(navigateMock).toHaveBeenCalledWith('/app', { replace: true })
  expect(window.location.hash).toBe('')
  expect(screen.getByText('SIGNING IN')).toBeVisible()
  expect(document.querySelector('.safe-stage')).not.toBeNull()
})

it('shows a failed Google sign-in inside the safe door with a way back', () => {
  open('#error=oauth_denied')
  expect(screen.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible()
  expect(screen.getByText('Google sign-in was cancelled.')).toBeVisible()
  expect(screen.getByText('INVALID')).toBeVisible()
  expect(document.querySelector('.safe-badge-danger')).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  expect(loginMock).not.toHaveBeenCalled()
})
