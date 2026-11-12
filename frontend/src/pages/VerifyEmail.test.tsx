// @vitest-environment jsdom
import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VerifyEmail from './VerifyEmail'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('VerifyEmail', () => {
  it('verifies a token once under StrictMode and shows success', async () => {
    // The backend token is single use: a second call would answer 400.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Email verified' }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ detail: 'Invalid or expired token' }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/verify?token=strict-tok']}>
          <VerifyEmail />
        </MemoryRouter>
      </StrictMode>,
    )

    expect(await screen.findByText('Email verified!')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Verification failed')).toBeNull()
  })

  it('shows the failure for a rejected token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Invalid or expired token' }), { status: 400 }),
    ))
    render(
      <MemoryRouter initialEntries={['/verify?token=bad-tok']}>
        <VerifyEmail />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Verification failed')).toBeTruthy()
    expect(screen.getByText('Invalid or expired token')).toBeTruthy()
  })
})
