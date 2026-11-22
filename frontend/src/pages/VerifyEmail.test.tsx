// @vitest-environment jsdom
import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VerifyEmail from './VerifyEmail'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function open(token: string | null, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[token ? `/verify?token=${token}` : '/verify']}>
      <VerifyEmail />
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('VerifyEmail', () => {
  it('verifies a token once under StrictMode and shows VERIFIED inside the safe door', async () => {
    // The backend token is single use: a second call would answer 400.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: 'Email verified successfully. You can now sign in.' }, 200))
      .mockResolvedValue(json({ detail: 'Invalid or expired verification link' }, 400))
    vi.stubGlobal('fetch', fetchMock)
    open('strict-tok', true)

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.safe-stage')).not.toBeNull()
    expect(screen.getByText('VERIFIED')).toBeVisible()
    expect(document.querySelector('[data-part="recessed-badge"], .bg-green-50')).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveClass('safe-primary')
  })

  it('shows VERIFYING while the token is checked', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    open('slow-tok')
    expect(screen.getByText('VERIFYING')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Verifying your email' })).toBeVisible()
  })

  it('an expired link says EXPIRED and offers a new link for an email address', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ detail: 'This verification link has expired. Request a new one.' }, 400))
      .mockResolvedValueOnce(json({ message: "If that account still needs verifying, a new link is on its way. We send at most one a minute." }, 200))
    vi.stubGlobal('fetch', fetchMock)
    open('old-tok')

    expect(await screen.findByRole('heading', { name: 'This link no longer works' })).toBeVisible()
    expect(screen.getByText('EXPIRED')).toBeVisible()
    expect(screen.getByText(/^This verification link has expired\. Request a new one\./)).toBeVisible()
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'someone@example.com' } })
    expect(screen.getByRole('button', { name: 'Send a new link' })).toHaveClass('safe-primary')
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }))

    expect(await screen.findByText("If that account still needs verifying, a new link is on its way. We send at most one a minute.")).toBeVisible()
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/auth/resend-verification'), expect.objectContaining({ method: 'POST' }))
    expect(screen.getByRole('button', { name: /Send a new link in [0-9]+s/ })).toBeDisabled()
  })

  // Review finding M1 (c): a link was sent from another page a moment ago, so this page waits too.
  it('waits out a countdown started on another page for the same address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Invalid or expired verification link' }, 400)))
    sessionStorage.setItem('docvault.linkSent.verify:someone@example.com', String(Date.now() + 45_000))
    open('replaced-tok')
    await screen.findByRole('heading', { name: 'This link no longer works' })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'Someone@Example.com' } })
    expect(screen.getByRole('button', { name: /Send a new link in [0-9]+s/ })).toBeDisabled()
  })

  // Review finding L-new-1: a deadline that passed before the address was typed must not freeze the button.
  it('enables the button for an address whose countdown ended before it was typed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Invalid or expired verification link' }, 400)))
    vi.useFakeTimers({ toFake: ['Date'] })
    sessionStorage.setItem('docvault.linkSent.verify:someone@example.com', String(Date.now() + 30_000))
    open('old-tok')
    await screen.findByRole('heading', { name: 'This link no longer works' })
    vi.setSystemTime(Date.now() + 31_000)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'someone@example.com' } })
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeEnabled()
    vi.useRealTimers()
  })

  it('a rejected token says INVALID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Invalid or expired verification link' }, 400)))
    open('bad-tok')
    expect(await screen.findByRole('heading', { name: 'This link no longer works' })).toBeVisible()
    expect(screen.getByText('INVALID')).toBeVisible()
    expect(document.querySelector('[data-part="recessed-badge"], .bg-green-50')).toBeNull()
  })

  it('a link without a token says INVALID without calling the server', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    open(null)
    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a server failure is not reported as a bad link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })))
    open('net-tok')
    expect(await screen.findByRole('heading', { name: 'Verification failed' })).toBeVisible()
    expect(screen.getByText('Server unavailable')).toBeVisible()
  })
})
