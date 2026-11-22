// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthError, getAuthProviders, loginUser, registerUser, resendVerification, verify2FA } from '@/lib/api'
import AuthPage from './Auth'

const { navigateMock, loginMock } = vi.hoisted(() => ({ navigateMock: vi.fn(), loginMock: vi.fn() }))

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getAuthProviders: vi.fn(),
    // Real behaviour unless a test queues a response with mock...Once.
    loginUser: vi.fn(actual.loginUser),
    registerUser: vi.fn(actual.registerUser),
    verify2FA: vi.fn(actual.verify2FA),
    resendVerification: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ login: loginMock }) }))

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

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

describe('a rate-limited sign-in (L-3)', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('explains itself and never shows an object', async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: 'RATE_LIMITED', message: 'Too many requests.' } }), { status: 429, headers: { 'Content-Type': 'application/json' } }),
    ))
    const user = userEvent.setup()
    renderLogin()
    await user.type(await screen.findByPlaceholderText('name@example.com'), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    await user.type(await screen.findByPlaceholderText('Password'), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Too many attempts. Wait a minute, then try again.')).toBeVisible()
    expect(document.body.textContent).not.toContain('[object Object]')
  })
})

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const door = () => document.querySelector('.vault-door') as HTMLElement
const dial = () => door().querySelector('[data-part="dial"]') as HTMLElement
const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

async function reachPassword(user: ReturnType<typeof userEvent.setup>, mode: 'login' | 'register' = 'login') {
  vi.mocked(getAuthProviders).mockResolvedValue({ google: false })
  const view = render(<MemoryRouter><AuthPage mode={mode} /></MemoryRouter>)
  await user.type(screen.getByLabelText('Email address'), 'someone@example.com')
  await user.click(screen.getByRole('button', { name: /continue with email/i }))
  return view
}

describe('the vault door on the sign-in page', () => {
  beforeEach(() => {
    stubMotion(false)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    sessionStorage.clear()
  })
  const setup = () => userEvent.setup({ delay: null })
  // Typing runs on real timers; the clock is faked from the moment of submit so the 450 ms and 400 ms waits are exact.
  const submit = async (name: string) => {
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name }))
    await settle()
  }
  const password = () => screen.getByLabelText('Password', { exact: true })

  it('turns the dial as the password is typed and closes when it is cleared; the email does not move it', async () => {
    const user = setup()
    await reachPassword(user)
    expect(door()).toHaveClass('vault-closed')
    await user.type(password(), 'abcde')
    expect(door()).toHaveClass('vault-entering')
    expect(dial().style.transform).toBe('rotate(60deg)')
    await user.clear(password())
    expect(door()).toHaveClass('vault-closed')
  })

  it('calls the API once, at once, and the door unlocks while waiting', async () => {
    const user = setup()
    await reachPassword(user)
    let release!: (v: unknown) => void
    vi.mocked(loginUser).mockReturnValueOnce(new Promise(r => { release = r }) as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    expect(loginUser).toHaveBeenCalledTimes(1)
    expect(door()).toHaveClass('vault-unlocking')
    expect(loginMock).not.toHaveBeenCalled()
    release({ access_token: 'a', refresh_token: 'r' })
    await settle(700)
  })

  it('opens, announces "Signed in", stores the session and goes to /app after 700 ms', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    await settle()
    expect(door()).toHaveClass('vault-open')
    expect(screen.getByRole('status')).toHaveTextContent('Signed in')
    expect(navigateMock).not.toHaveBeenCalled()
    await settle(699)
    expect(navigateMock).not.toHaveBeenCalled()
    await settle(1)
    expect(loginMock).toHaveBeenCalledWith('a', 'r')
    expect(navigateMock).toHaveBeenCalledWith('/app', { state: { fromVault: true } })
  })

  it('goes at once, with the session stored first, when a key is pressed during the wait', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    await settle()
    expect(navigateMock).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(loginMock).toHaveBeenCalledWith('a', 'r')
    expect(navigateMock).toHaveBeenCalledTimes(1)
    await settle(1000)
    expect(navigateMock).toHaveBeenCalledTimes(1)
  })

  it('goes at once on a pointer press during the wait', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ access_token: 'a' } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    await settle()
    fireEvent.pointerDown(document.body)
    expect(navigateMock).toHaveBeenCalledWith('/app', { state: { fromVault: true } })
  })

  it('does not wait under reduced motion', async () => {
    stubMotion(true)
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    await settle()
    expect(door()).toHaveClass('vault-still')
    expect(loginMock).toHaveBeenCalledWith('a', 'r')
    expect(navigateMock).toHaveBeenCalledWith('/app', { state: { fromVault: true } })
  })

  it('shakes on failure with the existing message, then closes after 400 ms', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockRejectedValueOnce(new Error('Invalid email or password'))
    await user.type(password(), 'wrongpass1')
    await submit('Sign in')
    await settle()
    expect(screen.getByText('Invalid email or password')).toBeVisible()
    expect(door()).toHaveClass('vault-error')
    await settle(399)
    expect(door()).toHaveClass('vault-error')
    await settle(1)
    expect(door()).toHaveClass('vault-closed')
    expect(loginMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows the second ring on the two-factor step and continues to success', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ requires_2fa: true } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    await settle()
    expect(screen.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible()
    expect(door()).toHaveClass('vault-unlocking')
    expect(door().querySelector('[data-part="badge-second-ring"]')).not.toBeNull()
    vi.mocked(verify2FA).mockResolvedValueOnce({ access_token: 'a2', refresh_token: 'r2' } as never)
    vi.useRealTimers()
    await user.click(screen.getAllByRole('textbox')[0])
    await user.keyboard('123456')
    await submit('Verify')
    await settle()
    expect(door()).toHaveClass('vault-open')
    await settle(700)
    expect(loginMock).toHaveBeenCalledWith('a2', 'r2')
    expect(navigateMock).toHaveBeenCalledWith('/app', { state: { fromVault: true } })
  })

  it('shows "Check your email" in the interior behind the open door when registering, with no navigation', async () => {
    const user = setup()
    await reachPassword(user, 'register')
    vi.mocked(registerUser).mockResolvedValueOnce({} as never)
    await user.type(password(), 'Password123!')
    await submit('Create account')
    await settle()
    expect(door()).toHaveClass('vault-open')
    const interior = document.querySelector('.safe-interior') as HTMLElement
    expect(interior).toContainElement(screen.getByRole('heading', { name: 'Check your email' }))
    expect(document.querySelector('.safe-door')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.safe-stage')).not.toHaveClass('safe-settled')
    await settle(700)
    expect(document.querySelector('.safe-stage')).toHaveClass('safe-settled')
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('labels the lock with text: LOCKED, VERIFYING, INVALID, then LOCKED again', async () => {
    const user = setup()
    await reachPassword(user)
    expect(screen.getByText('LOCKED')).toBeVisible()
    let release!: (v: unknown) => void
    vi.mocked(loginUser).mockReturnValueOnce(new Promise((_, reject) => { release = reject }) as never)
    await user.type(password(), 'wrongpass1')
    await submit('Sign in')
    expect(screen.getByText('VERIFYING')).toBeVisible()
    release(new Error('Invalid email or password'))
    await settle()
    expect(screen.getByText('INVALID')).toBeVisible()
    await settle(400)
    expect(screen.getByText('LOCKED')).toBeVisible()
  })

  it('has no split-screen bill preview any more', async () => {
    const user = setup()
    await reachPassword(user)
    expect(screen.queryByText('Synthetic Example Energy bill')).not.toBeInTheDocument()
    expect(document.querySelector('aside')).toBeNull()
  })

  // Review finding H1: /login and /register share one AuthPage, so state left by a registration must not leak into sign-in.
  it('after registering, "Go to sign in" gives a working Sign in button', async () => {
    const user = setup()
    const view = await reachPassword(user, 'register')
    vi.mocked(registerUser).mockResolvedValueOnce({} as never)
    await user.type(password(), 'Password123!')
    await submit('Create account')
    await settle(700)
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    view.rerender(<MemoryRouter><AuthPage mode="login" /></MemoryRouter>)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }))
    await settle()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(door()).toHaveClass('vault-closed')
  })

  it('a registration that settles leaves nothing loading', async () => {
    const user = setup()
    await reachPassword(user, 'register')
    vi.mocked(registerUser).mockResolvedValueOnce({} as never)
    await user.type(password(), 'Password123!')
    await submit('Create account')
    const createButton = () => document.querySelector('.safe-door form button[type="submit"]') as HTMLButtonElement
    // Disabled while the door opens, so a second click cannot send a second request...
    expect(createButton()).toBeDisabled()
    await settle(700)
    // ...and released once the door has settled.
    expect(createButton()).toBeEnabled()
  })

  // Review finding M1: a shake timer from an earlier failure must not undo a later success.
  it('a quick resubmit after a failure opens the door and leaves no skip listener behind', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser)
      .mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    expect(door()).toHaveClass('vault-error')
    await settle(100)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await settle()
    expect(door()).toHaveClass('vault-open')
    // The old shake timer would have fired at 400 ms.
    await settle(350)
    expect(door()).toHaveClass('vault-open')
    await settle(700)
    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(loginMock).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.pointerDown(document.body)
    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(loginMock).toHaveBeenCalledTimes(1)
  })

  it('a wrong two-factor code shakes the door and returns it to the second-factor state', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ requires_2fa: true } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    vi.mocked(verify2FA).mockRejectedValueOnce(new Error('Invalid code'))
    vi.useRealTimers()
    await user.click(screen.getAllByRole('textbox')[0])
    await user.keyboard('123456')
    await submit('Verify')
    expect(screen.getByText('Invalid code')).toBeVisible()
    expect(door()).toHaveClass('vault-error')
    await settle(400)
    expect(door()).toHaveClass('vault-unlocking')
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled()
    expect(loginMock).not.toHaveBeenCalled()
  })

  // Review finding L-new-1: a quick second code must not be checked under a stale INVALID.
  it('a second two-factor code sent within 400 ms of a wrong one shows VERIFYING, then shakes again if wrong', async () => {
    const user = setup()
    await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ requires_2fa: true } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    let rejectSecond!: (e: Error) => void
    vi.mocked(verify2FA)
      .mockRejectedValueOnce(new Error('Invalid code'))
      .mockReturnValueOnce(new Promise((_, reject) => { rejectSecond = reject }) as never)
    vi.useRealTimers()
    await user.click(screen.getAllByRole('textbox')[0])
    await user.keyboard('123456')
    await submit('Verify')
    expect(door()).toHaveClass('vault-error')
    await settle(100)
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await settle()
    expect(door()).toHaveClass('vault-unlocking')
    expect(screen.getByText('VERIFYING')).toBeVisible()
    rejectSecond(new Error('Invalid code'))
    await settle()
    expect(door()).toHaveClass('vault-error')
    await settle(400)
    expect(door()).toHaveClass('vault-unlocking')
  })

  it('leaving the page while the door is open cancels the wait and its skip listeners', async () => {
    const user = setup()
    const view = await reachPassword(user)
    vi.mocked(loginUser).mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' } as never)
    await user.type(password(), 'Password123!')
    await submit('Sign in')
    expect(door()).toHaveClass('vault-open')
    view.unmount()
    await settle(1000)
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.pointerDown(document.body)
    expect(navigateMock).not.toHaveBeenCalled()
    expect(loginMock).not.toHaveBeenCalled()
  })
})

describe('recovery and verification from the sign-in page', () => {
  beforeEach(() => {
    stubMotion(true)
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    sessionStorage.clear()
  })
  const password = () => screen.getByLabelText('Password', { exact: true })

  it('offers "Forgot password?" on the email step of sign-in, and not on register', () => {
    const view = render(<MemoryRouter><AuthPage mode="login" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
    view.rerender(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument()
  })

  it('an unverified sign-in (403) offers to resend the verification email, then counts down 60 seconds', async () => {
    const user = userEvent.setup({ delay: null })
    await reachPassword(user)
    vi.mocked(loginUser).mockRejectedValueOnce(new AuthError('Please verify your email before signing in', 403))
    vi.mocked(resendVerification).mockResolvedValueOnce({ message: "If that account still needs verifying, a new link is on its way. We send at most one a minute." })
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Please verify your email before signing in')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }))
    expect(resendVerification).toHaveBeenCalledWith('someone@example.com')
    expect(await screen.findByText("If that account still needs verifying, a new link is on its way. We send at most one a minute.")).toBeVisible()
    expect(screen.getByRole('button', { name: /Resend verification email in [0-9]+s/ })).toBeDisabled()
  })

  // Review finding M1 (a): the countdown must survive leaving the confirmation for /login.
  it('a 403 right after registering keeps the resend counting down instead of dropping a click', async () => {
    const user = userEvent.setup({ delay: null })
    const view = await reachPassword(user, 'register')
    vi.mocked(registerUser).mockResolvedValueOnce({ message: 'sent' })
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await screen.findByRole('heading', { name: 'Check your email' })
    view.rerender(<MemoryRouter><AuthPage mode="login" /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    vi.mocked(loginUser).mockRejectedValueOnce(new AuthError('Please verify your email before signing in', 403))
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('button', { name: /Resend verification email in [0-9]+s/ })).toBeDisabled()
    expect(resendVerification).not.toHaveBeenCalled()
  })

  // Review finding M1 (b): signing in again after a resend must not re-enable the button.
  it('a second 403 after a resend keeps the countdown', async () => {
    const user = userEvent.setup({ delay: null })
    await reachPassword(user)
    vi.mocked(loginUser)
      .mockRejectedValueOnce(new AuthError('Please verify your email before signing in', 403))
      .mockRejectedValueOnce(new AuthError('Please verify your email before signing in', 403))
    vi.mocked(resendVerification).mockResolvedValueOnce({ message: 'ok' })
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await user.click(await screen.findByRole('button', { name: 'Resend verification email' }))
    await screen.findByRole('button', { name: /Resend verification email in [0-9]+s/ })
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('button', { name: /Resend verification email in [0-9]+s/ })).toBeDisabled()
    expect(resendVerification).toHaveBeenCalledTimes(1)
  })

  it('a wrong password (401) offers no resend', async () => {
    const user = userEvent.setup({ delay: null })
    await reachPassword(user)
    vi.mocked(loginUser).mockRejectedValueOnce(new AuthError('Invalid email or password', 401))
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid email or password')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Resend verification email/ })).not.toBeInTheDocument()
  })

  it('the registration confirmation has no icon square, a primary sign-in link, and can resend the email', async () => {
    const user = userEvent.setup({ delay: null })
    await reachPassword(user, 'register')
    vi.mocked(registerUser).mockResolvedValueOnce({ message: 'sent' })
    vi.mocked(resendVerification).mockResolvedValueOnce({ message: "If that account still needs verifying, a new link is on its way. We send at most one a minute." })
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    // The LCD is the one status indicator: no icon square repeats it.
    expect(document.querySelector('[data-part="recessed-badge"], .bg-green-50')).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveClass('safe-primary')
    // Registration has just sent a link, so the server's 60-second cooldown is already running.
    expect(screen.getByRole('button', { name: /Resend email in [0-9]+s/ })).toBeDisabled()
    // Move the clock past the cooldown; the countdown's own interval notices within a quarter second.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000)
    await act(async () => { await new Promise(r => setTimeout(r, 600)) })
    await user.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(resendVerification).toHaveBeenCalledWith('someone@example.com')
    expect(screen.getByRole('button', { name: /Resend email in [0-9]+s/ })).toBeDisabled()
  })
})

// L-pre-1 (recorded in PR #44): a request still in flight must not finish on the other page.
describe('switching between sign-in and register while a request is in flight', () => {
  beforeEach(() => {
    stubMotion(true)
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })
  const password = () => screen.getByLabelText('Password', { exact: true })

  it('a sign-in that succeeds after the switch never enters /app from /register', async () => {
    const user = userEvent.setup({ delay: null })
    const view = await reachPassword(user)
    let release!: (v: unknown) => void
    vi.mocked(loginUser).mockReturnValueOnce(new Promise(r => { release = r }) as never)
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    view.rerender(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>)
    await act(async () => { release({ access_token: 'a', refresh_token: 'r' }) })
    expect(loginMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeVisible()
  })

  it('a registration that succeeds after the switch never shows "Check your email" on /login', async () => {
    const user = userEvent.setup({ delay: null })
    const view = await reachPassword(user, 'register')
    let release!: (v: unknown) => void
    vi.mocked(registerUser).mockReturnValueOnce(new Promise(r => { release = r }) as never)
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    view.rerender(<MemoryRouter><AuthPage mode="login" /></MemoryRouter>)
    await act(async () => { release({ message: 'sent' }) })
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  it('a failure after the switch neither shakes the door nor shows its error on the other page', async () => {
    stubMotion(false)
    const user = userEvent.setup({ delay: null })
    const view = await reachPassword(user)
    let fail!: (e: Error) => void
    vi.mocked(loginUser).mockReturnValueOnce(new Promise((_, reject) => { fail = reject }) as never)
    await user.type(password(), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    view.rerender(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>)
    await act(async () => { fail(new AuthError('Invalid email or password', 401)) })
    expect(door()).toHaveClass('vault-closed')
    expect(screen.queryByText('INVALID')).not.toBeInTheDocument()
    expect(screen.getByText('LOCKED')).toBeVisible()
    expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument()
  })
})
