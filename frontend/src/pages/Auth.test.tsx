// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { getAuthProviders } from '@/lib/api'
import AuthPage from './Auth'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getAuthProviders: vi.fn() }
})

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ login: vi.fn() }) }))

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>,
  )
}

describe('Google sign-in button', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('is hidden when Google sign-in is not configured', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false })
    renderLogin()

    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled())
    await screen.findByRole('button', { name: /continue with email/i })
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument()
    expect(screen.queryByText('or')).not.toBeInTheDocument()
  })

  it('is shown when Google sign-in is configured', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true })
    renderLogin()

    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByText('or')).toBeInTheDocument()
  })

  it('is hidden while loading and when the call fails', async () => {
    vi.mocked(getAuthProviders).mockRejectedValue(new Error('offline'))
    renderLogin()

    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument()
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument()
  })
})

it('labels the email and password where the owner registers', async () => {
  vi.mocked(getAuthProviders).mockResolvedValue({google:false})
  render(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>)
  await userEvent.type(screen.getByLabelText('Email address'), 'demo@example.com')
  await userEvent.click(screen.getByRole('button',{name:'Continue with Email'}))
  expect(screen.getByLabelText('Password', {exact:true})).toHaveAttribute('placeholder','Password')
  cleanup()
})
