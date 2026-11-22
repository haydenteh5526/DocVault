// @vitest-environment jsdom
import { it, expect, afterEach, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthError, resetPassword } from '@/lib/api'
import ResetPassword from './ResetPassword'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, resetPassword: vi.fn() }
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const door = () => document.querySelector('.vault-door') as HTMLElement
const dial = () => door().querySelector('[data-part="dial"]') as HTMLElement
const field = () => screen.getByLabelText('New password')

function open(path = '/reset-password?token=tok') {
  return render(<MemoryRouter initialEntries={[path]}><ResetPassword /></MemoryRouter>)
}

async function submit(password: string) {
  fireEvent.change(field(), { target: { value: password } })
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  await settle()
}

it('sits inside the safe door with the label above the field and the eye button on the field', () => {
  open()
  expect(document.querySelector('.safe-stage')).not.toBeNull()
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  expect(screen.getByRole('link', { name: /Back to sign in/ })).toBeVisible()
  const label = screen.getByText('New password', { selector: 'label' })
  const eye = screen.getByRole('button', { name: 'Show password' })
  // The label is outside the positioned wrapper, so it cannot overlap the field's focus ring,
  // and the eye button is centred on a wrapper that holds only the input.
  expect(label.parentElement).not.toBe(eye.parentElement)
  expect(eye.parentElement).toContainElement(field())
  expect(eye.parentElement?.children).toHaveLength(2)
  expect(field()).toHaveAttribute('maxLength', '128')
})

it('turns the dial as the password is typed and lists the server rules', () => {
  open()
  fireEvent.change(field(), { target: { value: 'abcde' } })
  expect(door()).toHaveClass('vault-entering')
  expect(dial().style.transform).toBe('rotate(60deg)')
  for (const rule of ['8 to 128 characters', 'One uppercase letter', 'One lowercase letter', 'One number', 'One special character']) {
    expect(screen.getByText(rule)).toBeVisible()
  }
  // Every rule has a marker in the same column: a tick when met, a hollow circle when not.
  const marker = (rule: string) => screen.getByText(rule).closest('li')!.querySelector('[data-part="rule-marker"]')!
  expect(marker('One lowercase letter')).toHaveAttribute('data-met', 'true')
  expect(marker('One uppercase letter')).toHaveAttribute('data-met', 'false')
  expect(marker('One uppercase letter')).toHaveClass('rule-unmet')
})

it('refuses a password that breaks the rules without calling the server', async () => {
  open()
  await submit('weakpass')
  expect(resetPassword).not.toHaveBeenCalled()
  expect(screen.getByText(/Use at least 8 characters/)).toBeVisible()
  expect(door()).toHaveClass('vault-error')
})

it('shows UPDATING while waiting, then UPDATED with a Sign in button and no automatic redirect', async () => {
  open()
  let release!: (v: unknown) => void
  vi.mocked(resetPassword).mockReturnValueOnce(new Promise(r => { release = r }) as never)
  await submit('NewPass789!')
  expect(screen.getByText('UPDATING')).toBeVisible()
  release({ message: 'ok' })
  await settle()
  expect(screen.getByRole('heading', { name: 'Password updated' })).toBeVisible()
  expect(screen.getByText('UPDATED')).toBeVisible()
  expect(document.querySelector('[data-part="status-led"]')).toHaveAttribute('data-led', 'unlocked')
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveClass('safe-primary')
  expect(document.querySelector('[data-part="recessed-badge"], .bg-green-50')).toBeNull()
  await settle(5_000)
  expect(screen.getByRole('heading', { name: 'Password updated' })).toBeVisible()
})

it('a rejected password shakes INVALID and keeps the form', async () => {
  open()
  vi.mocked(resetPassword).mockRejectedValueOnce(new AuthError('Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.', 422))
  await submit('NewPass789!')
  expect(screen.getByText('INVALID')).toBeVisible()
  expect(door()).toHaveClass('vault-error')
  expect(field()).toBeVisible()
  await settle(400)
  expect(door()).toHaveClass('vault-entering')
})

it('a used, expired or replaced link shows its own panel with a link to request a new one', async () => {
  open()
  vi.mocked(resetPassword).mockRejectedValueOnce(new AuthError('Invalid or expired reset link', 400))
  await submit('NewPass789!')
  expect(screen.getByRole('heading', { name: 'This reset link no longer works' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/forgot-password')
  expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveClass('safe-primary')
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  expect(document.querySelector('[data-part="recessed-badge"], .bg-green-50')).toBeNull()
})

it('a link without a token shows the same panel at once', () => {
  open('/reset-password')
  expect(screen.getByRole('heading', { name: 'This reset link no longer works' })).toBeVisible()
  expect(screen.getByText('INVALID')).toBeVisible()
})
