// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getConversation, type ConversationDetail } from '@/lib/api'
import AskAI from './AskAI'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getConversation: vi.fn() }
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
        <MemoryRouter initialEntries={['/app/ask/a']}>
          <Link to="/app/ask/b">Open B</Link>
          <Routes>
            <Route path="/app/ask/:conversationId" element={<AskAI />} />
          </Routes>
        </MemoryRouter>
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
