// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import {
  ApiError,
  getDocument,
  getHousemates,
  previewBillSplit,
  removeHousemate,
  saveBillSplit,
  type BillSplit,
  type BillSplitPreview,
  type Document,
  type Housemate,
} from '@/lib/api'
import DocumentDetail from './DocumentDetail'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getDocument: vi.fn(),
    getHousemates: vi.fn(),
    previewBillSplit: vi.fn(),
    saveBillSplit: vi.fn(),
    addHousemate: vi.fn(),
    removeHousemate: vi.fn(),
    getTags: vi.fn(async () => []),
    findSimilarDocuments: vi.fn(async () => []),
    listConversations: vi.fn(async () => []),
    getConversation: vi.fn(async () => ({ messages: [] })),
  }
})

const token = `h.${btoa(JSON.stringify({ sub: 'a1' }))}.s`

function person(id: string, label: string, position: number): Housemate {
  return { id, label, position, created_at: '2026-11-12T10:00:00' }
}
const four = [person('h1', 'Aoife', 1), person('h2', 'Ben', 2), person('h3', 'Chidi', 3), person('h4', 'Dara', 4)]

function bill(id: string, amount: string): Document {
  const evidence = {
    amount_due: { value: amount, sources: [] },
    due_date: { value: '2026-11-23', sources: [] },
    billing_period: { value: '2026-10-01/2026-10-31', sources: [] },
  }
  return {
    id,
    title: `Bill ${id}`,
    brand: null,
    model: null,
    document_type: 'bill',
    category_id: null,
    raw_text: 'Electricity bill',
    summary: null,
    file_size: null,
    image_url: null,
    processing_status: 'complete',
    tags: [],
    created_at: '2026-11-11T10:00:00',
    bill_review: null,
    bill_split: null,
    confirmed_bill: {
      id: `rev-${id}`,
      document_id: id,
      revision_number: 1,
      amount_due: amount,
      due_date: '2026-11-23',
      billing_period_start: '2026-10-01',
      billing_period_end: '2026-10-31',
      evidence,
      created_at: '2026-11-11T10:00:00',
    },
  } as Document
}

function previewFor(total: string): BillSplitPreview {
  return {
    bill_revision: 1,
    rule: 'equal',
    total,
    remainder_cents: 0,
    shares: four.map(h => ({ housemate_id: h.id, label: h.label, amount: '30.87' })),
  }
}

function savedFor(documentId: string, total: string): BillSplit {
  return {
    ...previewFor(total),
    id: `split-${documentId}`,
    document_id: documentId,
    split_number: 1,
    stale: false,
    created_at: '2026-11-12T10:00:00',
  }
}

function renderPage(startAt: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  localStorage.setItem('token', token)
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[startAt]}>
          <Link to="/app/documents/x">go to x</Link>
          <Link to="/app/documents/y">go to y</Link>
          <Routes>
            <Route path="/app/documents/:id" element={<DocumentDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

const region = () => screen.getByRole('region', { name: 'Bill split' })
const click = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(region()).getByRole('button', { name }))

beforeEach(() => {
  vi.mocked(getHousemates).mockResolvedValue(four)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

async function splitAndSave(user: ReturnType<typeof userEvent.setup>) {
  await click(user, 'Split this bill')
  await waitFor(() => expect(within(region()).getAllByRole('checkbox')).toHaveLength(4))
  await click(user, 'Calculate shares')
  await click(user, 'Save split')
}

describe('DocumentDetail bill split', () => {
  it('shows the saved split, not "Document not found", when the reload after a save fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getDocument).mockResolvedValueOnce(bill('x', '123.47'))
    vi.mocked(previewBillSplit).mockResolvedValue(previewFor('123.47'))
    vi.mocked(saveBillSplit).mockResolvedValue(savedFor('x', '123.47'))
    renderPage('/app/documents/x')
    await screen.findByRole('region', { name: 'Bill split' })

    vi.mocked(getDocument).mockRejectedValue(new Error('down'))
    await splitAndSave(user)

    await waitFor(() =>
      expect(within(region()).getByRole('status')).toHaveTextContent(
        'The split was saved. The rest of this page could not be refreshed and may be out of date.',
      ),
    )
    expect(region()).toHaveTextContent('Saved · split 1')
    expect(screen.queryByText('Document not found')).toBeNull()
  })

  it('keeps the selection and offers Load latest when a 409 is followed by a failed reload', async () => {
    const user = userEvent.setup()
    vi.mocked(getDocument).mockResolvedValueOnce(bill('x', '123.47'))
    vi.mocked(previewBillSplit).mockResolvedValue(previewFor('123.47'))
    vi.mocked(saveBillSplit).mockRejectedValue(new ApiError(409, 'changed', 'revision_changed'))
    renderPage('/app/documents/x')
    await screen.findByRole('region', { name: 'Bill split' })

    vi.mocked(getDocument).mockRejectedValue(new Error('down'))
    await splitAndSave(user)

    await waitFor(() =>
      expect(within(region()).getByRole('alert')).toHaveTextContent(
        'The latest version could not be loaded, so your selection has been kept.',
      ),
    )
    expect(within(region()).getByRole('button', { name: 'Load latest' })).toBeInTheDocument()
    expect(within(region()).getByRole('button', { name: 'Save split' })).toBeDisabled()
    expect(screen.queryByText('Document not found')).toBeNull()
  })

  it('finding 6: removing a name another tab already removed drops it without an error', async () => {
    const user = userEvent.setup()
    vi.mocked(getDocument).mockResolvedValue(bill('x', '123.47'))
    vi.mocked(removeHousemate).mockRejectedValue(new ApiError(404, 'Not found'))
    renderPage('/app/documents/x')
    await screen.findByRole('region', { name: 'Bill split' })
    await click(user, 'Split this bill')
    await waitFor(() => expect(within(region()).getAllByRole('checkbox')).toHaveLength(4))
    await click(user, 'Remove Ben')
    await waitFor(() => expect(within(region()).queryByRole('checkbox', { name: 'Ben' })).toBeNull())
    expect(within(region()).queryByRole('alert')).toBeNull()
    expect(removeHousemate).toHaveBeenCalledTimes(1)
  })

  it('other remove failures still show the error and keep the name', async () => {
    const user = userEvent.setup()
    vi.mocked(getDocument).mockResolvedValue(bill('x', '123.47'))
    vi.mocked(removeHousemate).mockRejectedValue(new ApiError(500, 'Server error'))
    renderPage('/app/documents/x')
    await screen.findByRole('region', { name: 'Bill split' })
    await click(user, 'Split this bill')
    await waitFor(() => expect(within(region()).getAllByRole('checkbox')).toHaveLength(4))
    await click(user, 'Remove Ben')
    await waitFor(() =>
      expect(within(region()).getByRole('alert')).toHaveTextContent('Could not remove that name. Try again.'),
    )
    expect(within(region()).getByRole('checkbox', { name: 'Ben' })).toBeInTheDocument()
  })

  it('still shows "Document not found" when the document cannot be loaded at all', async () => {
    vi.mocked(getDocument).mockRejectedValue(new Error('missing'))
    renderPage('/app/documents/x')
    expect(await screen.findByText('Document not found')).toBeInTheDocument()
  })

  it("does not show one bill's saved split on another bill", async () => {
    const user = userEvent.setup()
    vi.mocked(getDocument).mockImplementation(async id => (id === 'x' ? bill('x', '123.47') : bill('y', '80.00')))
    vi.mocked(previewBillSplit).mockResolvedValue(previewFor('123.47'))
    vi.mocked(saveBillSplit).mockResolvedValue(savedFor('x', '123.47'))
    renderPage('/app/documents/y')
    await screen.findByRole('region', { name: 'Bill split' })
    expect(region()).toHaveTextContent('Not split yet')

    await user.click(screen.getByRole('link', { name: 'go to x' }))
    await waitFor(() => expect(getDocument).toHaveBeenCalledWith('x'))
    await waitFor(() => expect(region()).toHaveTextContent('Not split yet'))
    await splitAndSave(user)
    await waitFor(() => expect(region()).toHaveTextContent('Saved · split 1'))

    await user.click(screen.getByRole('link', { name: 'go to y' }))
    await waitFor(() => expect(region()).toHaveTextContent('Not split yet'))
    expect(region()).not.toHaveTextContent('€123.47')
  })
})
