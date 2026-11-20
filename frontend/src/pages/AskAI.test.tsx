// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createConversation, getConversation, sendMessage, type ConversationDetail } from '@/lib/api'
import { AuthProvider } from '@/lib/auth'
import AskAI from './AskAI'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getConversation: vi.fn(), createConversation: vi.fn(), sendMessage: vi.fn() }
})

// jsdom has no scrollIntoView, which the chat calls after every message.
Element.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const DRAFT = 'Subject: Question about October electricity bill\n\nHello, I have a question about the amount due.'

function conversation(id: string): ConversationDetail {
  return {
    id,
    title: `Conversation ${id}`,
    messages: [
      { role: 'user', content: 'Draft a question about the amount due.', sources: null, action: null },
      {
        role: 'assistant',
        content: 'Here is a draft.',
        sources: null,
        action: {
          kind: 'enquiry_draft',
          meta: { selector: 'rules', model: null, fallback_reason: null },
          document_id: 'doc-1',
          document_title: 'October electricity bill',
          draft: DRAFT,
          topic: 'the amount due',
          evidence: [],
        },
      },
    ],
  } as unknown as ConversationDetail
}

describe('AskAI result cards', () => {
  it('does not carry a draft edit into another conversation that holds an identical draft', async () => {
    const user = userEvent.setup()
    vi.mocked(getConversation).mockImplementation(async id => conversation(id))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider><MemoryRouter initialEntries={['/app/ask/a']}>
          <Link to="/app/ask/b">Open B</Link>
          <Routes>
            <Route path="/app/ask/:conversationId" element={<AskAI />} />
          </Routes>
        </MemoryRouter></AuthProvider>
      </QueryClientProvider>,
    )

    const box = await screen.findByLabelText('Draft to edit')
    await user.clear(box)
    await user.type(box, 'EDITED IN CONVERSATION A')
    expect(box).toHaveValue('EDITED IN CONVERSATION A')

    await user.click(screen.getByRole('link', { name: 'Open B' }))
    await vi.waitFor(() => expect(getConversation).toHaveBeenCalledWith('b'))
    expect(await screen.findByLabelText('Draft to edit')).toHaveValue(DRAFT)
  })
})

describe('AskAI page header (plan 0R-4, R13)', () => {
  it('links to Recent chats', async () => {
    vi.mocked(getConversation).mockImplementation(async id => conversation(id))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider><MemoryRouter initialEntries={['/app/ask']}>
          <Routes>
            <Route path="/app/ask" element={<AskAI />} />
          </Routes>
        </MemoryRouter></AuthProvider>
      </QueryClientProvider>,
    )
    const link = await screen.findByRole('link', { name: 'Recent chats' })
    expect(link).toHaveAttribute('href', '/app/chats')
    expect(link).toHaveClass('min-h-11')
  })
})

describe('a reminder proposal made on Ask (L-1)', () => {
  it('refreshes the Documents status as well as the bill, so Documents is not stale for 30 s', async () => {
    const user = userEvent.setup()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    vi.mocked(createConversation).mockResolvedValue({ id: 'c9', title: '', is_pinned: false, created_at: '2026-11-20T10:00:00', updated_at: '2026-11-20T10:00:00' })
    vi.mocked(sendMessage).mockResolvedValue({
      user_message: {},
      assistant_message: {
        id: 'm2', conversation_id: 'c9', role: 'assistant', content: 'I have proposed a reminder.', sources: null,
        action: { kind: 'reminder_proposal', document_id: 'doc-1', document_title: 'October electricity bill', proposal: null },
        created_at: '2026-11-20T10:00:01',
      },
    } as never)
    render(
      <QueryClientProvider client={client}>
        <AuthProvider><MemoryRouter initialEntries={['/app/ask']}>
          <Routes>
            <Route path="/app/ask" element={<AskAI />} />
            <Route path="/app/ask/:conversationId" element={<AskAI />} />
          </Routes>
        </MemoryRouter></AuthProvider>
      </QueryClientProvider>,
    )
    await user.type(await screen.findByPlaceholderText('Message Pip'), 'Remind me before the bill is due{Enter}')
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['document', 'doc-1'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['document-list-status'] })
  })
})
it('keeps the home thread after a temporary failure and waits for history before sending', async () => {
  const user = userEvent.setup()
  const token = 'h.' + btoa(JSON.stringify({sub:'owner-a'})) + '.s'
  localStorage.setItem('token',token)
  sessionStorage.setItem('pip-thread:owner-a','saved-thread')
  let finish!: (data: ConversationDetail) => void
  vi.mocked(getConversation)
    .mockRejectedValueOnce(new Error('Temporary outage'))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  try {
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
      <AuthProvider><MemoryRouter initialEntries={['/app']}><AskAI home/></MemoryRouter></AuthProvider>
    </QueryClientProvider>)
    await screen.findByRole('alert')
    expect(sessionStorage.getItem('pip-thread:owner-a')).toBe('saved-thread')
    expect(screen.getByPlaceholderText('Message Pip')).toBeDisabled()
    await user.click(screen.getByRole('button',{name:'Try again'}))
    expect(screen.getByPlaceholderText('Message Pip')).toBeDisabled()
    expect(sendMessage).not.toHaveBeenCalled()
    finish(conversation('saved-thread'))
    await screen.findByLabelText('Draft to edit')
    expect(screen.getByPlaceholderText('Message Pip')).toBeEnabled()
  } finally {
    localStorage.removeItem('token')
    sessionStorage.removeItem('pip-thread:owner-a')
  }
})
