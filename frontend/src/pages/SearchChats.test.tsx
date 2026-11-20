// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { listConversations, deleteConversation, renameConversation, togglePinConversation, type Conversation } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import SearchChats from './SearchChats'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    listConversations: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
    togglePinConversation: vi.fn(),
  }
})

const chat = (id: string, title: string, pinned = false) =>
  ({ id, title, is_pinned: pinned, created_at: '2026-11-11T10:00:00', updated_at: '2026-11-11T10:00:00' }) as Conversation

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/chats']}>
          <SearchChats />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: 'Conversation options for ' + title }))
}

beforeEach(() => {
  vi.mocked(listConversations).mockResolvedValue([chat('c1', 'When is my bill due'), chat('c2', 'Split the gas bill', true)])
  vi.mocked(togglePinConversation).mockResolvedValue(undefined as never)
  vi.mocked(renameConversation).mockResolvedValue(undefined as never)
  vi.mocked(deleteConversation).mockResolvedValue(undefined as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Recent chats', () => {
  it('is headed "Recent chats"', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Recent chats' })).toBeVisible()
  })

  it('pins a conversation', async () => {
    const user = userEvent.setup()
    renderPage()
    await openMenu(user, 'When is my bill due')
    await user.click(await screen.findByRole('menuitem', { name: 'Pin conversation' }))
    await waitFor(() => expect(togglePinConversation).toHaveBeenCalledWith('c1', true))
  })

  it('offers Unpin for a pinned conversation', async () => {
    const user = userEvent.setup()
    renderPage()
    await openMenu(user, 'Split the gas bill')
    await user.click(await screen.findByRole('menuitem', { name: 'Unpin' }))
    await waitFor(() => expect(togglePinConversation).toHaveBeenCalledWith('c2', false))
  })

  it('renames a conversation', async () => {
    const user = userEvent.setup()
    renderPage()
    await openMenu(user, 'When is my bill due')
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByRole('textbox', { name: 'Conversation title' })
    await user.clear(field)
    await user.type(field, 'Electricity due date{Enter}')
    await waitFor(() => expect(renameConversation).toHaveBeenCalledWith('c1', 'Electricity due date'))
  })

  it('deletes a conversation', async () => {
    const user = userEvent.setup()
    renderPage()
    await openMenu(user, 'When is my bill due')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith('c1'))
  })

  it('says so when an update fails', async () => {
    const user = userEvent.setup()
    vi.mocked(togglePinConversation).mockRejectedValue(new Error('offline'))
    renderPage()
    await openMenu(user, 'When is my bill due')
    await user.click(await screen.findByRole('menuitem', { name: 'Pin conversation' }))
    expect(await screen.findByText('Could not update the conversation.')).toBeVisible()
  })
})
