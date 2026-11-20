// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ApiError,
  addHousemate,
  confirm2FA,
  getHouseholdPreferences,
  getHousemates,
  removeHousemate,
  saveHouseholdPreferences,
  setup2FA,
  type HouseholdPreferences,
  type Housemate,
} from '@/lib/api'
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
    getHouseholdPreferences: vi.fn(),
    saveHouseholdPreferences: vi.fn(),
    getHousemates: vi.fn(),
    addHousemate: vi.fn(),
    removeHousemate: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ logout: vi.fn(), accountId: 'a1' }) }))

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

const defaults: HouseholdPreferences = {
  reminder_days_before_due: 3,
  default_split_rule: 'equal',
  routines_enabled: true,
  saved: false,
}
const aoife: Housemate = { id: 'h1', label: 'Aoife', position: 1, created_at: '2026-11-12T10:00:00' }
const ben: Housemate = { id: 'h2', label: 'Ben', position: 2, created_at: '2026-11-12T10:00:00' }

function renderHousehold() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <Settings initialTab="household" />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { client, invalidate }
}

const days = () => screen.findByRole('spinbutton', { name: 'Remind me before a bill is due' })

describe('household settings', () => {
  beforeEach(() => {
    vi.mocked(getHouseholdPreferences).mockResolvedValue(defaults)
    vi.mocked(getHousemates).mockResolvedValue([aoife])
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the defaults and the housemates before anything is saved', async () => {
    renderHousehold()

    expect(await screen.findByRole('heading', { level: 2, name: 'Household' })).toBeInTheDocument()
    expect(await days()).toHaveValue(3)
    expect(screen.getByRole('radio', { name: 'Equally' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'By days at home' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Let DocBot check my bills each morning' })).toBeChecked()
    expect(screen.getByText(
      'DocBot proposes a reminder for bills due in the next two weeks. Nothing is saved until you approve it.',
    )).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'People you live with' })).toBeInTheDocument()
    expect(await screen.findByText('Aoife')).toBeInTheDocument()
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('shows what was saved', async () => {
    vi.mocked(getHouseholdPreferences).mockResolvedValue({
      reminder_days_before_due: 7, default_split_rule: 'days_home', routines_enabled: false, saved: true,
    })
    renderHousehold()

    expect(await days()).toHaveValue(7)
    expect(screen.getByRole('radio', { name: 'By days at home' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Let DocBot check my bills each morning' })).not.toBeChecked()
  })

  it('saves the chosen values, says so and refreshes the saved preferences', async () => {
    vi.mocked(saveHouseholdPreferences).mockResolvedValue({
      reminder_days_before_due: 5, default_split_rule: 'days_home', routines_enabled: false, saved: true,
    })
    const { invalidate } = renderHousehold()
    const input = await days()

    await userEvent.clear(input)
    await userEvent.type(input, '5')
    await userEvent.click(screen.getByRole('radio', { name: 'By days at home' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Let DocBot check my bills each morning' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(saveHouseholdPreferences).toHaveBeenCalledWith({
      reminder_days_before_due: 5, default_split_rule: 'days_home', routines_enabled: false,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['household-preferences', 'a1'] })
  })

  it('shows the days message when the server refuses the number', async () => {
    vi.mocked(saveHouseholdPreferences).mockRejectedValue(new ApiError(422, 'Unprocessable'))
    renderHousehold()
    const input = await days()

    await userEvent.clear(input)
    await userEvent.type(input, '99')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number of days from 0 to 60.')
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('does not send an empty or fractional number of days', async () => {
    renderHousehold()
    const input = await days()

    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number of days from 0 to 60.')

    await userEvent.type(input, '2.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number of days from 0 to 60.')
    expect(saveHouseholdPreferences).not.toHaveBeenCalled()
  })

  it('says when saving failed for another reason', async () => {
    vi.mocked(saveHouseholdPreferences).mockRejectedValue(new ApiError(500, 'Server error'))
    renderHousehold()
    await days()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Try again.')
  })

  it('adds a housemate', async () => {
    vi.mocked(addHousemate).mockResolvedValue(ben)
    renderHousehold()
    await screen.findByText('Aoife')

    await userEvent.type(screen.getByLabelText('Add a housemate'), 'Ben')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(addHousemate).toHaveBeenCalledWith('Ben')
    expect(await screen.findByText('Ben')).toBeInTheDocument()
  })

  it('gives the same messages as the bill split when a name cannot be added', async () => {
    vi.mocked(addHousemate).mockRejectedValue(new ApiError(409, 'duplicate', 'duplicate_label'))
    renderHousehold()
    await screen.findByText('Aoife')
    const field = screen.getByLabelText('Add a housemate')

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.')

    await userEvent.type(field, 'Aoife')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('That name is already in your list.')).toBeInTheDocument()

    vi.mocked(addHousemate).mockRejectedValue(new ApiError(409, 'full', 'too_many_housemates'))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('You can save up to 12 housemates.')).toBeInTheDocument()

    await userEvent.clear(field)
    await userEvent.type(field, 'x'.repeat(41))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use 40 characters or fewer.')
  })

  it('removes a housemate', async () => {
    vi.mocked(getHousemates).mockResolvedValue([aoife, ben])
    vi.mocked(removeHousemate).mockResolvedValue(undefined)
    renderHousehold()
    await screen.findByText('Ben')

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ben' }))

    expect(removeHousemate).toHaveBeenCalledWith('h2')
    await waitFor(() => expect(screen.queryByText('Ben')).not.toBeInTheDocument())
    expect(screen.getByText('Aoife')).toBeInTheDocument()
  })

  it('says when a housemate could not be removed', async () => {
    vi.mocked(removeHousemate).mockRejectedValue(new ApiError(500, 'Server error'))
    renderHousehold()
    await screen.findByText('Aoife')

    await userEvent.click(screen.getByRole('button', { name: 'Remove Aoife' }))

    expect(await screen.findByText('Could not remove that name. Try again.')).toBeInTheDocument()
    expect(screen.getByText('Aoife')).toBeInTheDocument()
  })

  it('says when the preferences could not be loaded', async () => {
    vi.mocked(getHouseholdPreferences).mockRejectedValue(new ApiError(500, 'Server error'))
    renderHousehold()

    expect(await screen.findByText('Could not load your household settings.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
