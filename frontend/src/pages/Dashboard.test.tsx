// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDocuments, getDocument, searchDocuments, renameDocument, type Document } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import Dashboard from './Dashboard'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getDocuments: vi.fn(), getDocument: vi.fn(async () => doc()), searchDocuments: vi.fn(async () => ({results:[]})), getCategories: vi.fn(async () => []), renameDocument: vi.fn() }
})

const fallbackSummary = JSON.stringify({
  overview: 'EXAMPLE ENERGY electricity bill for October 2026',
  key_topics: [],
  specifications: [],
  safety_warnings: [],
  quick_facts: [],
})

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'd1',
    title: 'October electricity bill',
    brand: null,
    model: null,
    document_type: 'bill',
    category_id: null,
    raw_text: 'EXAMPLE ENERGY',
    summary: fallbackSummary,
    file_size: 2048,
    image_url: null,
    processing_status: 'complete',
    tags: [],
    created_at: '2026-11-11T10:00:00',
    ...overrides,
  } as Document
}

function renderDashboard() {
  localStorage.setItem('docvault-analytics', 'hidden')
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/documents']}>
          <Dashboard />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(getDocuments).mockResolvedValue({ documents: [doc()], total: 1 })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('Dashboard rows', () => {
  it.each(['grid', 'list'])('a row shows no summary text in %s view', async view => {
    localStorage.setItem('docvault-view', view)
    const { container } = renderDashboard()
    await screen.findByText('October electricity bill')
    expect(container.textContent).not.toContain('{"')
    expect(container.textContent).not.toContain('overview')
    expect(container.textContent).not.toContain('EXAMPLE ENERGY electricity bill')
  })

  it('a grid card shows the type once', async () => {
    localStorage.setItem('docvault-view', 'grid')
    renderDashboard()
    await screen.findByText('October electricity bill')
    expect(screen.getAllByText('bill')).toHaveLength(1)
  })
})

describe('renaming a document', () => {
  it('shows the API message when the title is rejected', async () => {
    localStorage.setItem('docvault-view', 'grid')
    vi.mocked(renameDocument).mockRejectedValue(new Error('Title cannot be blank.'))
    renderDashboard()
    await userEvent.dblClick(await screen.findByText('October electricity bill'))
    const input = screen.getByDisplayValue('October electricity bill')
    await userEvent.clear(input)
    await userEvent.type(input, ' x ')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByText('Title cannot be blank.')).toBeInTheDocument())
    expect(screen.queryByText('Document renamed')).not.toBeInTheDocument()
  })

  it('says so when the new title is blank, without calling the API', async () => {
    localStorage.setItem('docvault-view', 'grid')
    renderDashboard()
    await userEvent.dblClick(await screen.findByText('October electricity bill'))
    const input = screen.getByDisplayValue('October electricity bill')
    await userEvent.clear(input)
    await userEvent.type(input, '   ')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByText('Title cannot be blank.')).toBeInTheDocument())
    expect(renameDocument).not.toHaveBeenCalled()
  })
})

describe('finding and reviewing household documents', () => {
  it('searches titles and retrieved text, marks matches and clears an empty result', async () => {
    const documents = Array.from({length:12}, (_, i) => doc({id:String(i), title:i === 1 ? 'October 2026.pdf' : 'Record ' + i, raw_text:null}))
    vi.mocked(getDocuments).mockResolvedValue({documents,total:12})
    vi.mocked(searchDocuments).mockImplementation(async q => ({results:q === 'october' ? [{document_id:'3',document_title:'Record 3',chunk_text:'Read in October',similarity:.95}] : []}))
    renderDashboard()
    const input = await screen.findByPlaceholderText("Search by name or by what's on the page")
    await userEvent.type(input, 'october')
    expect(await screen.findByText('2 documents match "october"')).toBeVisible()
    expect(screen.getByTitle('October 2026.pdf')).toBeVisible()
    await userEvent.clear(input)
    await userEvent.type(input,'zzzz')
    expect(await screen.findByText(/No documents match/)).toBeVisible()
    await userEvent.click(screen.getByRole('button',{name:'Clear search'}))
    expect(input).toHaveValue('')
  })

  it('identifies a bill to confirm using the detail record', async () => {
    vi.mocked(getDocument).mockResolvedValue(doc({bill_review:{amount_due:{value:'123.47',sources:[]},due_date:{value:null,sources:[]},billing_period:{value:null,sources:[]}}}))
    renderDashboard()
    expect(await screen.findByRole('heading',{name:'Needs attention'})).toBeVisible()
    expect(await screen.findByRole('link',{name:'Review and confirm'})).toHaveAttribute('href','/app/documents/d1')
  })
  it('offers an upload in an empty collection', async () => {
    vi.mocked(getDocuments).mockResolvedValue({documents:[],total:0})
    renderDashboard()
    expect(await screen.findByRole('button',{name:'Upload a bill'})).toBeVisible()
  })
})

describe('Dashboard search field', () => {
  it('keeps the spaces typed in a multi-word search, even after a pause', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText('October electricity bill')
    const field = screen.getByRole('textbox', { name: 'Search documents' })
    await user.type(field, 'when does ')
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(field).toHaveValue('when does ')
    await user.type(field, 'the tenancy end')
    expect(field).toHaveValue('when does the tenancy end')
    await waitFor(() => expect(searchDocuments).toHaveBeenCalledWith('when does the tenancy end'))
  })
})
