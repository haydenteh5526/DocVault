// @vitest-environment jsdom
import { it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { forgotPassword } from '@/lib/api'
import ForgotPassword from './ForgotPassword'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, forgotPassword: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  sessionStorage.clear()
})

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

async function sendLink(email = 'someone@example.com') {
  vi.mocked(forgotPassword).mockResolvedValue({ message: 'ok' })
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
  await settle()
}

it('shows the vault door closed with a key badge', () => {
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
  const door = document.querySelector('.vault-door') as HTMLElement
  expect(door).toHaveClass('vault-closed')
  expect(door.querySelector('[data-part="badge-key"]')).not.toBeNull()
  expect(screen.getByText('LOCKED')).toBeVisible()
  expect(document.querySelector('.safe-stage')).not.toBeNull()
  expect(screen.getByRole('link', { name: /Back to sign in/ })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  expect(screen.getByLabelText('Email address')).toBeVisible()
})

it('after sending, the status reads CHECK EMAIL and the copy never says whether the account exists', async () => {
  await sendLink()
  expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect(screen.getByText('CHECK EMAIL')).toBeVisible()
  expect(screen.queryByText('LOCKED')).not.toBeInTheDocument()
  expect(screen.getByText(/If an account exists for/)).toBeVisible()
  expect(document.querySelector('[data-part="recessed-badge"], .bg-green-50')).toBeNull()
  // "Back to sign in" keeps the dark outline: it goes back, not forward.
  for (const back of screen.getAllByRole('link', { name: /Back to sign in/ })) expect(back).not.toHaveClass('safe-primary')
})

it('lets the owner resend only after the 60-second countdown', async () => {
  await sendLink()
  const resend = () => screen.getByRole('button', { name: /Resend link/ })
  expect(resend()).toBeDisabled()
  expect(resend()).toHaveTextContent('Resend link in 60s')
  await settle(59_000)
  expect(resend()).toBeDisabled()
  await settle(1_000)
  expect(resend()).toBeEnabled()
  fireEvent.click(resend())
  await settle()
  expect(forgotPassword).toHaveBeenCalledTimes(2)
  expect(forgotPassword).toHaveBeenLastCalledWith('someone@example.com')
  expect(resend()).toBeDisabled()
})

it('"Try a different email" returns to the form with the email ready to edit', async () => {
  await sendLink()
  fireEvent.click(screen.getByRole('button', { name: 'Try a different email' }))
  expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  expect(screen.getByLabelText('Email address')).toHaveValue('someone@example.com')
  expect(screen.getByText('LOCKED')).toBeVisible()
})

it('going back with the same address keeps the countdown', async () => {
  await sendLink()
  fireEvent.click(screen.getByRole('button', { name: 'Try a different email' }))
  fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
  await settle()
  expect(screen.getByRole('button', { name: /Resend link in/ })).toBeDisabled()
})
