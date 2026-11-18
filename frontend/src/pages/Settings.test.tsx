// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { confirm2FA, setup2FA } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import Settings from './Settings'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    setup2FA: vi.fn(),
    confirm2FA: vi.fn(),
    disable2FA: vi.fn(),
    getProfile: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ logout: vi.fn() }) }))

function renderAccount() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <Settings initialTab="account" />
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function startSetup() {
  await userEvent.click(screen.getByRole('button', { name: /enable 2fa/i }))
  return screen.findByLabelText('Code from your authenticator app')
}

describe('two-factor setup', () => {
  beforeEach(() => {
    vi.mocked(setup2FA).mockResolvedValue({ secret: 'ABCDEF', qr_code: 'data:image/png;base64,AAAA', uri: 'otpauth://x' })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not report 2FA as enabled until a code is confirmed', async () => {
    renderAccount()
    await startSetup()

    expect(screen.queryByText('2FA is enabled')).not.toBeInTheDocument()
    expect(screen.getByText('ABCDEF')).toBeInTheDocument()
    expect(confirm2FA).not.toHaveBeenCalled()
  })

  it('keeps Turn on 2FA disabled until six digits are entered', async () => {
    renderAccount()
    const input = await startSetup()
    const button = screen.getByRole('button', { name: 'Turn on 2FA' })

    expect(button).toBeDisabled()
    await userEvent.type(input, '12345')
    expect(button).toBeDisabled()
    await userEvent.type(input, '6')
    expect(button).toBeEnabled()
    expect(input).toHaveAttribute('inputmode', 'numeric')
  })

  it('shows the message from the API when the code is wrong', async () => {
    vi.mocked(confirm2FA).mockRejectedValue(new Error("That code didn't match. Check the time on your phone and try again."))
    renderAccount()
    const input = await startSetup()
    await userEvent.type(input, '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Turn on 2FA' }))

    expect(await screen.findByText("That code didn't match. Check the time on your phone and try again.")).toBeInTheDocument()
    expect(screen.queryByText('2FA is enabled')).not.toBeInTheDocument()
  })

  it('reports 2FA as enabled after a correct code', async () => {
    vi.mocked(confirm2FA).mockResolvedValue(undefined)
    renderAccount()
    const input = await startSetup()
    await userEvent.type(input, '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Turn on 2FA' }))

    await waitFor(() => expect(screen.getByText('2FA is enabled')).toBeInTheDocument())
    expect(confirm2FA).toHaveBeenCalledWith('123456')
    expect(screen.getByRole('button', { name: /disable 2fa/i })).toBeInTheDocument()
  })
})
