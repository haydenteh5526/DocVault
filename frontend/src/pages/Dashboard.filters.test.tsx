// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDocuments, getDocument, deleteDocument, toggleFavourite, type Document } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import { DocumentStatus, statusLabel } from '@/components/DocumentStatus'
import Dashboard from './Dashboard'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getDocuments: vi.fn(),
    getDocument: vi.fn(),
    getWarranties: vi.fn(async () => []),
    searchDocuments: vi.fn(async () => ({ results: [] })),
    getCategories: vi.fn(async () => []),
    deleteDocument: vi.fn(async () => undefined),
    toggleFavourite: vi.fn(async () => ({ is_favourite: true })),
  }
})

const review = {
  amount_due: { value: '123.47', sources: [] },
  due_date: { value: '2026-11-23', sources: [] },
  billing_period: { value: '2026-10-01/2026-10-31', sources: [] },
}
const confirmed = {
  id: 'rev-1', document_id: 'b2', revision_number: 1, amount_due: '98.10', due_date: '2026-12-01',
  billing_period_start: '2026-11-01', billing_period_end: '2026-11-30', evidence: review, created_at: '2026-11-11T10:00:00',
}
const pendingProposal = { id: 'p1', status: 'pending', inputs_changed: null }

function doc(id: string, title: string, type: string, extra: Record<string, unknown> = {}): Document {
  return {
    id, title, brand: null, model: null, document_type: type, category_id: null, raw_text: title, summary: null,
    file_size: 2048, image_url: null, processing_status: 'complete', tags: [], created_at: '2026-11-11T10:00:00',
    bill_review: null, bill_split: null, confirmed_bill: null, ...extra,
  } as unknown as Document
}

// The eight-document fixture: two bills (one needs confirming, one has a reminder awaiting approval), a lease, a manual, two warranty cards and two receipts.
const records = {
  b1: doc('b1', 'October electricity bill', 'bill', { bill_review: review }),
  b2: doc('b2', 'November gas bill', 'bill', { confirmed_bill: confirmed, bill_review: review, reminder_proposals: [pendingProposal] }),
  l1: doc('l1', 'Tenancy agreement 2026-27', 'lease'),
  m1: doc('m1', 'Washer-dryer manual', 'manual'),
  w1: doc('w1', 'Washer-dryer warranty card', 'warranty'),
  w2: doc('w2', 'Kettle warranty card', 'warranty'),
  r1: doc('r1', 'Kettle receipt', 'receipt'),
  r2: doc('r2', 'Groceries receipt', 'receipt'),
}
const eight = Object.values(records)

function mediaAt(width: number) {
  window.matchMedia = vi.fn((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return {
      matches: min ? width >= Number(min[1]) : false, media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      onchange: null, dispatchEvent: vi.fn(),
    }
  }) as unknown as typeof window.matchMedia
}

function renderDashboard() {
  localStorage.setItem('docvault-analytics', 'hidden')
  localStorage.setItem('docvault-view', 'list')
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/documents']}>
          <main><Dashboard /></main>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const rows = () => screen.getAllByRole('row').slice(1)
const trigger = (name: string) => screen.getByRole('button', { name: new RegExp('^Filter by ' + name) })

async function choose(user: ReturnType<typeof userEvent.setup>, facet: string, option: RegExp) {
  await user.click(trigger(facet))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: option }))
  await user.keyboard('{Escape}')
}

beforeEach(() => {
  mediaAt(1024)
  vi.mocked(getDocuments).mockResolvedValue({ documents: eight, total: 8 })
  vi.mocked(getDocument).mockImplementation(async id => records[id as keyof typeof records])
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('the Documents worklist', () => {
  it('puts Needs attention above the toolbar', async () => {
    renderDashboard()
    const attention = await screen.findByRole('heading', { name: 'Needs attention' })
    const search = screen.getByRole('textbox', { name: 'Search documents' })
    expect(attention.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has exactly one "Upload" button in main, and it is the primary one', async () => {
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    const uploads = within(screen.getByRole('main')).getAllByRole('button', { name: 'Upload' })
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toHaveClass('bg-primary')
    const ask = within(screen.getByRole('main')).getByRole('button', { name: 'Ask' })
    expect(ask).not.toHaveClass('bg-primary')
  })

  it('narrows to the documents with one status and reports how many are selected', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(8))
    expect(rows()).toHaveLength(8)
    await choose(user, 'status', /Needs confirming/)
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]).getByRole('link')).toHaveTextContent('October electricity bill')
    expect(screen.getByRole('button', { name: /^Filter by status, 1 selected$/ })).toBeInTheDocument()
  })

  it('narrows by type', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await choose(user, 'type', /^Bill/)
    expect(rows()).toHaveLength(2)
  })

  it('combines the two facets with AND, offers counts, and hides options with none', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(8))
    await choose(user, 'type', /^Bill/)
    await choose(user, 'status', /Reminder awaiting approval/)
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]).getByRole('link')).toHaveTextContent('November gas bill')

    await user.click(trigger('status'))
    const needs = await screen.findByRole('menuitemcheckbox', { name: /Needs confirming/ })
    expect(needs).toHaveTextContent('1')
    expect(screen.queryByRole('menuitemcheckbox', { name: /Split out of date/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitemcheckbox', { name: /Checking status/ })).not.toBeInTheDocument()
  })

  it('combines options inside one facet with OR', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await choose(user, 'type', /^Lease/)
    await choose(user, 'type', /^Manual/)
    expect(rows()).toHaveLength(2)
  })

  it('"Clear filter" restores all eight', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await choose(user, 'type', /^Receipt/)
    expect(rows()).toHaveLength(2)
    await user.click(trigger('type'))
    await user.click(await screen.findByRole('menuitem', { name: 'Clear filter' }))
    await user.keyboard('{Escape}')
    expect(rows()).toHaveLength(8)
  })

  it('"Clear search" in the empty state also clears both facets', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await choose(user, 'type', /^Lease/)
    await choose(user, 'type', /^Manual/)
    await user.type(screen.getByRole('textbox', { name: 'Search documents' }), 'zzzz')
    await user.click(await screen.findByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(rows()).toHaveLength(8))
    expect(trigger('type')).toHaveAccessibleName('Filter by type')
  })

  it('gives each row one link, its full title', async () => {
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    for (const row of rows()) {
      const link = within(row).getByRole('link')
      expect(within(row).getAllByRole('link')).toHaveLength(1)
      expect(link).toHaveAttribute('title', link.textContent!)
    }
  })

  it('stacks a row under 768 px: title link, type and date, status and a menu', async () => {
    mediaAt(390)
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const item = screen.getAllByRole('listitem').find(entry => entry.textContent?.includes('Kettle receipt'))!
    expect(within(item).getAllByRole('link')).toHaveLength(1)
    expect(item).toHaveTextContent('receipt · 11 Nov 2026')
    expect(within(item).getByRole('button', { name: 'Actions for Kettle receipt' })).toBeInTheDocument()
  })
})

describe('the row menu', () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(await screen.findByRole('button', { name: 'Actions for ' + title }))
  }

  it('lists Open, Preview, Rename, Star and Delete, in that order', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await openMenu(user, 'Kettle receipt')
    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(['Open', 'Preview', 'Rename', 'Star', 'Delete'])
  })

  it('offers "Remove star" for a starred document and toggles it', async () => {
    const user = userEvent.setup()
    vi.mocked(getDocuments).mockResolvedValue({ documents: [{ ...records.r1, is_favourite: true } as Document], total: 1 })
    renderDashboard()
    await openMenu(user, 'Kettle receipt')
    await user.click(await screen.findByRole('menuitem', { name: 'Remove star' }))
    await waitFor(() => expect(toggleFavourite).toHaveBeenCalledWith('r1'))
  })

  it('removes the row on Delete and offers Undo, as it did before', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole('link', { name: 'Kettle receipt' })
    await openMenu(user, 'Kettle receipt')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Kettle receipt')).not.toBeInTheDocument())
    expect(rows()).toHaveLength(7)
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Kettle receipt')).toBeInTheDocument()
    expect(deleteDocument).not.toHaveBeenCalled()
  })

  it('renames in place from the menu, with the cursor in the field', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await openMenu(user, 'Kettle receipt')
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const field = await screen.findByRole('textbox', { name: 'Document title' })
    expect(field).toHaveValue('Kettle receipt')
    await waitFor(() => expect(field).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Document title' })).not.toBeInTheDocument()
  })

  it('gives focus back to the menu button after Preview, so the keyboard keeps its place', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await openMenu(user, 'Kettle receipt')
    await user.click(await screen.findByRole('menuitem', { name: 'Preview' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Kettle receipt' })).toHaveFocus())
  })
})

describe('statusLabel', () => {
  const states: [string, Document, Document | undefined][] = [
    ['failed', doc('x', 'x', 'bill', { processing_status: 'failed' }), undefined],
    ['reading', doc('x', 'x', 'bill', { processing_status: 'processing' }), undefined],
    ['checking', doc('x', 'x', 'bill'), undefined],
    ['reminder', doc('x', 'x', 'bill'), records.b2],
    ['split out of date', doc('x', 'x', 'bill'), doc('x', 'x', 'bill', { bill_split: { stale: true } })],
    ['needs confirming', doc('x', 'x', 'bill'), records.b1],
    ['confirmed', doc('x', 'x', 'bill'), doc('x', 'x', 'bill', { confirmed_bill: { ...confirmed, revision_number: 3 } })],
    ['ready', doc('x', 'x', 'lease'), records.l1],
  ]

  it.each(states)('matches what DocumentStatus shows: %s', (_name, document, detail) => {
    const { container } = render(<DocumentStatus doc={document} detail={detail} />)
    expect(container.textContent).toBe(statusLabel(document, detail))
    cleanup()
  })

  it('names the states', () => {
    expect(statusLabel(states[3][1], states[3][2])).toBe('Reminder awaiting approval')
    expect(statusLabel(states[6][1], states[6][2])).toBe('Confirmed · revision 3')
    expect(statusLabel(states[2][1], states[2][2])).toBe('Checking status')
  })
})
