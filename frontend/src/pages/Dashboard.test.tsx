// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDocuments, renameDocument, type Document } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import Dashboard from './Dashboard'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getDocuments: vi.fn(), getCategories: vi.fn(async () => []), renameDocument: vi.fn() }
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
