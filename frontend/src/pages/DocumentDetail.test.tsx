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
    period_days: 31,
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

describe('DocumentDetail facts', () => {
  const fallbackSummary = JSON.stringify({
    overview: 'EXAMPLE ENERGY electricity bill',
    key_topics: [],
    specifications: [],
    safety_warnings: [],
    quick_facts: [],
  })

  it('shows no empty AI fields for a bill with the fallback summary', async () => {
    vi.mocked(getDocument).mockResolvedValue({
      ...bill('x', '123.47'),
      document_type: null,
      summary: fallbackSummary,
      file_size: 2048,
    } as Document)
    renderPage('/app/documents/x')
    const keyInfo = (await screen.findByText('Key Information')).closest('[class*="p-6"]') as HTMLElement

    expect(screen.queryByText('AI Summary')).toBeNull()
    expect(within(keyInfo).queryByText('—')).toBeNull()
    expect(within(keyInfo).queryByText('Brand')).toBeNull()
    expect(within(keyInfo).queryByText('Model')).toBeNull()
    expect(within(keyInfo).queryByText('Type')).toBeNull()
    expect(within(keyInfo).getByText('File size')).toBeInTheDocument()
    expect(within(keyInfo).getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bill review' })).toHaveTextContent('123.47')
  })

  it('shows the fields that have a value, and a real summary', async () => {
    vi.mocked(getDocument).mockResolvedValue({
      ...bill('x', '123.47'),
      brand: 'Example Energy',
      model: 'EE-1',
      document_type: 'bill',
      summary: JSON.stringify({ overview: 'A bill', key_topics: ['Billing'], specifications: [], safety_warnings: [], quick_facts: [] }),
      file_size: 2048,
    } as Document)
    renderPage('/app/documents/x')
    const keyInfo = (await screen.findByText('Key Information')).closest('[class*="p-6"]') as HTMLElement

    expect(screen.getByText('AI Summary')).toBeInTheDocument()
    expect(within(keyInfo).getByText('Brand')).toBeInTheDocument()
    expect(within(keyInfo).getByText('Example Energy')).toBeInTheDocument()
    expect(within(keyInfo).getByText('Model')).toBeInTheDocument()
    expect(within(keyInfo).getByText('Type')).toBeInTheDocument()
  })

  it('describes processing without promising brand and model detection', async () => {
    vi.mocked(getDocument).mockResolvedValue({ ...bill('x', '123.47'), processing_status: 'processing' } as Document)
    renderPage('/app/documents/x')
    expect(await screen.findByText('Extracting the text and indexing it for search.')).toBeInTheDocument()
    expect(screen.queryByText(/detecting brand/)).toBeNull()
  })
})

describe('DocumentDetail original beside the bill', () => {
  const original = () => screen.queryByRole('complementary', { name: 'Original bill' })
  function matchWidth(wide: boolean) {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: wide && query.includes('1200px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
  }
  afterEach(() => vi.unstubAllGlobals())

  it('shows the original page beside the bill panels at 1200 px and wider', async () => {
    matchWidth(true)
    vi.mocked(getDocument).mockResolvedValue({ ...bill('x', '123.47'), image_url: 'http://example.test/bill.png' })
    renderPage('/app/documents/x')
    const aside = await screen.findByRole('complementary', { name: 'Original bill' })
    expect(within(aside).getByRole('img')).toHaveAttribute('src', 'http://example.test/bill.png')
    expect(screen.getByRole('region', { name: 'Bill review' })).toBeInTheDocument()
  })

  it('does not show it on narrower screens, where "View original bill" opens the preview', async () => {
    matchWidth(false)
    vi.mocked(getDocument).mockResolvedValue({ ...bill('x', '123.47'), image_url: 'http://example.test/bill.png' })
    renderPage('/app/documents/x')
    await screen.findByRole('region', { name: 'Bill review' })
    expect(original()).toBeNull()
  })

  it('does not show it for a document that is not a bill', async () => {
    matchWidth(true)
    vi.mocked(getDocument).mockResolvedValue({
      ...bill('x', '123.47'), confirmed_bill: null, document_type: 'manual', image_url: 'http://example.test/m.png',
    })
    renderPage('/app/documents/x')
    await screen.findByRole('heading', { name: 'Bill x' })
    expect(original()).toBeNull()
  })
})

describe('DocumentDetail page head', () => {
  it('names the icon-only delete button for a screen reader', async () => {
    vi.mocked(getDocument).mockResolvedValue(bill('x', '123.47') as Document)
    renderPage('/app/documents/x')
    expect(await screen.findByRole('button', { name: 'Delete document' })).toBeInTheDocument()
  })
})
