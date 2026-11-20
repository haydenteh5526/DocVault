// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError, bulkDeleteDocuments, checkBillsNow, deleteDocument, getDocuments, getDocument, getWarranties, searchDocuments, renameDocument, type Document, type Warranty } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import Dashboard from './Dashboard'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getDocuments: vi.fn(), getDocument: vi.fn(async () => doc()), searchDocuments: vi.fn(async () => ({results:[]})), getCategories: vi.fn(async () => []), renameDocument: vi.fn(), deleteDocument: vi.fn(async () => undefined), bulkDeleteDocuments: vi.fn(async () => undefined), getWarranties: vi.fn(async () => []), checkBillsNow: vi.fn() }
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

function clientRender(client: QueryClient) {
  localStorage.setItem('docvault-analytics', 'hidden')
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/documents']}>
          <Dashboard />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('the status check on each visit (L2)', () => {
  it('does not fetch again when the page is opened again within a few seconds', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = clientRender(client)
    await screen.findAllByText('October electricity bill')
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1))
    first.unmount()
    clientRender(client)
    await screen.findAllByText('October electricity bill')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(getDocument).toHaveBeenCalledTimes(1)
  })
})

describe('an upload turning into a document in the list (R7)', () => {
  const review = {
    amount_due: { value: '123.47', sources: [] },
    due_date: { value: '2026-11-23', sources: [] },
    billing_period: { value: '2026-10-01/2026-10-31', sources: [] },
  }

  it('goes from "Reading the text" to "Needs confirming" and announces it, with no animation class', async () => {
    localStorage.setItem('docvault-view', 'list')
    vi.mocked(getDocuments).mockResolvedValueOnce({ documents: [doc({ processing_status: 'processing' })], total: 1 })
    vi.mocked(getDocument).mockResolvedValue(doc({ bill_review: review, confirmed_bill: null } as Partial<Document>))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = clientRender(client)
    expect(await screen.findByText('Reading the text')).toBeInTheDocument()

    vi.mocked(getDocuments).mockResolvedValue({ documents: [doc({ processing_status: 'complete' })], total: 1 })
    await client.invalidateQueries({ queryKey: ['documents'] })

    await waitFor(() => expect(screen.getAllByText('Needs confirming').length).toBeGreaterThan(0))
    expect(screen.queryByText('Reading the text')).not.toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('October electricity bill is ready to review.'))
    const row = screen.getAllByRole('listitem').find(item => item.textContent?.includes('October electricity bill'))!
    expect(row.className).not.toMatch(/animate-|row-ready|row-sweep/)
  })

  it('shows "Could not read this file" for a failed upload', async () => {
    vi.mocked(getDocuments).mockResolvedValue({ documents: [doc({ processing_status: 'failed' })], total: 1 })
    renderDashboard()
    expect((await screen.findAllByText('Could not read this file')).length).toBeGreaterThan(0)
  })
})

describe('every complete document is checked (L-A)', () => {
  it('checks a bill the categoriser typed as a manual', async () => {
    vi.mocked(getDocuments).mockResolvedValue({ documents: [
      doc({ id: 'typed-1', title: 'Misfiled bill', document_type: 'User Manual' }),
      doc({ id: 'plain-1', title: 'Lease', document_type: null }),
    ], total: 2 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    clientRender(client)
    await screen.findByText('Misfiled bill')
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2))
    expect(vi.mocked(getDocument).mock.calls.map(call => call[0]).sort()).toEqual(['plain-1', 'typed-1'])
  })
})

describe('the page head (plan 0R-4, R13)', () => {
  it('has the title and counts on the left and Ask and Upload on the right', async () => {
    renderDashboard()
    const heading = await screen.findByRole('heading', { level: 1, name: 'Documents' })
    expect(await screen.findByText('1 document · 0 folders')).toBeVisible()
    const head = heading.closest('header')!
    const buttons = Array.from(head.querySelectorAll('button')).map(button => button.textContent?.trim())
    expect(buttons).toEqual(['Ask', 'Upload'])
  })

  it('has no select for the document type any more', async () => {
    renderDashboard()
    await screen.findByText('October electricity bill')
    expect(screen.queryByRole('combobox', { name: 'Document type' })).not.toBeInTheDocument()
  })
})

describe("Pip's check", () => {
  const nothing = { proposed: [], skipped: [], warranties_ending: [] }
  const proposed = (n: number) => ({
    ...nothing,
    proposed: Array.from({ length: n }, (_, i) => ({
      document_id: 'd' + i, title: 'Bill ' + i, proposal_number: 1, remind_on: '2026-11-20',
    })),
  })
  const live = () => document.querySelector('p[aria-live="polite"]')
  const checkNow = async () => userEvent.click(await screen.findByRole('button', { name: 'Check now' }))

  it('says one reminder was proposed, in a toast and the live region, and refreshes the lists', async () => {
    vi.mocked(checkBillsNow).mockResolvedValue(proposed(1))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    clientRender(client)

    await checkNow()

    const message = 'Pip checked your bills: 1 reminder proposed.'
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0)
    expect(live()).toHaveTextContent(message)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['document-list-status'] })
    // A bill page opened earlier is cached for 30 s and would still say "No reminder yet".
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['document'] })
  })

  it('counts several proposals', async () => {
    vi.mocked(checkBillsNow).mockResolvedValue(proposed(2))
    renderDashboard()

    await checkNow()

    await waitFor(() => expect(live()).toHaveTextContent('Pip checked your bills: 2 reminders proposed.'))
  })

  it('says when there is nothing new', async () => {
    vi.mocked(checkBillsNow).mockResolvedValue(nothing)
    renderDashboard()

    await checkNow()

    await waitFor(() => expect(live()).toHaveTextContent('Pip checked your bills: nothing new.'))
  })

  it("shows the server's message when the daily check is switched off", async () => {
    vi.mocked(checkBillsNow).mockRejectedValue(
      new ApiError(409, "Pip's daily check is switched off in Settings.", 'routines_off'),
    )
    renderDashboard()

    await checkNow()

    await waitFor(() => expect(live()).toHaveTextContent("Pip's daily check is switched off in Settings."))
  })

  it('says so when the check failed for another reason', async () => {
    vi.mocked(checkBillsNow).mockRejectedValue(new ApiError(500, 'Server error'))
    renderDashboard()

    await checkNow()

    await waitFor(() => expect(live()).toHaveTextContent('Pip could not check your bills. Try again.'))
  })

  it('says so, without "try again", when the hourly limit is reached', async () => {
    vi.mocked(checkBillsNow).mockRejectedValue(new ApiError(429, 'Too many requests.', 'RATE_LIMITED'))
    renderDashboard()

    await checkNow()

    await waitFor(() => expect(live()).toHaveTextContent('Pip has checked several times this hour. Try again later.'))
  })

  it('announces an identical result again: the region is emptied while the next check runs', async () => {
    vi.mocked(checkBillsNow).mockResolvedValueOnce(nothing)
    renderDashboard()
    await checkNow()
    await waitFor(() => expect(live()).toHaveTextContent('Pip checked your bills: nothing new.'))

    let finish!: () => void
    vi.mocked(checkBillsNow).mockReturnValueOnce(new Promise(resolve => { finish = () => resolve(nothing) }))
    await checkNow()
    // A screen reader only speaks a live region whose text changes, so the old text must go first.
    expect(live()).toHaveTextContent(/^$/)
    finish()
    await waitFor(() => expect(live()).toHaveTextContent('Pip checked your bills: nothing new.'))
  })

  it('runs once however often it is pressed while it is working', async () => {
    let finish!: () => void
    vi.mocked(checkBillsNow).mockReturnValue(new Promise(resolve => { finish = () => resolve(nothing) }))
    renderDashboard()

    const button = await screen.findByRole('button', { name: 'Check now' })
    await userEvent.click(button)
    await userEvent.click(button)

    expect(checkBillsNow).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    finish()
    await waitFor(() => expect(button).toBeEnabled())
  })
})

describe('a warranty row follows its document', () => {
  const warrantiesRefreshed = (invalidate: ReturnType<typeof vi.spyOn>) =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['warranties'] })

  it('is refreshed after a delete, once the delay for Undo has passed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    clientRender(client)
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for October electricity bill' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('d1'), { timeout: 8000 })

    await waitFor(() => warrantiesRefreshed(invalidate))
  }, 15_000)

  it('is not refreshed when the delete is undone, because nothing was deleted', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    clientRender(client)
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for October electricity bill' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['warranties'] })
  })

  it('is refreshed after a bulk delete', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    clientRender(client)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select October electricity bill' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }))

    await waitFor(() => expect(bulkDeleteDocuments).toHaveBeenCalledWith(['d1']))

    await waitFor(() => warrantiesRefreshed(invalidate))
  })

  it('is refreshed after a rename', async () => {
    localStorage.setItem('docvault-view', 'grid')
    vi.mocked(renameDocument).mockResolvedValue(doc({ title: 'Renamed' }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    clientRender(client)
    await userEvent.dblClick(await screen.findByText('October electricity bill'))
    const input = screen.getByDisplayValue('October electricity bill')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(renameDocument).toHaveBeenCalledWith('d1', 'Renamed'))

    await waitFor(() => warrantiesRefreshed(invalidate))
  })
})

describe('warranties in Needs attention', () => {
  function warranty(id: string, title: string, expiry: string | null): Warranty {
    return { id: 'w-' + id, document_id: 'wd-' + id, document_title: title, purchase_date: null, expiry_date: expiry, notes: null }
  }

  beforeEach(() => {
    // Earlier tests leave their own implementations behind; start from a plain document and no warranties.
    vi.mocked(getDocument).mockResolvedValue(doc())
    vi.mocked(getWarranties).mockResolvedValue([])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('lists the two warranties ending soonest within 30 days, after the bill rows, and leaves the rest out', async () => {
    vi.mocked(getDocument).mockResolvedValue(doc({ bill_review: { amount_due: { value: '123.47', sources: [] }, due_date: { value: null, sources: [] }, billing_period: { value: null, sources: [] } } }))
    vi.mocked(getWarranties).mockResolvedValue([
      warranty('kettle', 'Kettle', '2026-12-01'),
      warranty('fridge', 'Fridge', '2026-11-12'),
      warranty('washer', 'Washing machine', '2026-11-25'),
      warranty('toaster', 'Old toaster', '2026-11-09'),
      warranty('sofa', 'New sofa', '2026-12-11'),
      warranty('none', 'No date', null),
    ])
    renderDashboard()

    const section = (await screen.findByRole('heading', { name: 'Needs attention' })).closest('section')!
    expect(await within(section).findByText('Fridge')).toBeVisible()
    expect(within(section).getByText('Warranty ends 12 November 2026')).toBeVisible()
    expect(within(section).getByText('Washing machine')).toBeVisible()
    expect(within(section).getByText('Warranty ends 25 November 2026')).toBeVisible()
    for (const left of ['Kettle', 'Old toaster', 'New sofa', 'No date']) {
      expect(within(section).queryByText(left)).not.toBeInTheDocument()
    }
    const rows = within(section).getAllByRole('listitem').map(row => row.textContent ?? '')
    expect(rows[0]).toContain('October electricity bill')
    expect(rows.slice(1).map(row => row.slice(0, 5))).toEqual(['Fridg', 'Washi'])
    expect(within(section).getAllByRole('link', { name: 'Open' }).map(link => link.getAttribute('href'))).toEqual([
      '/app/documents/wd-fridge', '/app/documents/wd-washer',
    ])
  })

  it('counts a warranty that ends today and one that ends in 30 days', async () => {
    vi.mocked(getWarranties).mockResolvedValue([
      warranty('later', 'Fridge', '2026-12-10'),
      warranty('today', 'Kettle', '2026-11-10'),
    ])
    renderDashboard()

    expect(await screen.findByText('Warranty ends 10 November 2026')).toBeVisible()
    expect(screen.getByText('Warranty ends 10 December 2026')).toBeVisible()
  })

  it('does not say nothing needs attention when only a warranty does', async () => {
    vi.mocked(getWarranties).mockResolvedValue([warranty('kettle', 'Kettle', '2026-11-20')])
    renderDashboard()

    expect(await screen.findByText('Kettle')).toBeVisible()
    expect(screen.queryByText('Nothing needs your attention.')).not.toBeInTheDocument()
  })

  it('does not offer warranty rows as Status filter options', async () => {
    vi.mocked(getWarranties).mockResolvedValue([warranty('kettle', 'Kettle', '2026-11-20')])
    renderDashboard()
    await screen.findByText('Warranty ends 20 November 2026')

    await userEvent.click(screen.getByRole('button', { name: /^Filter by status/ }))

    const options = screen.getAllByRole('menuitemcheckbox').map(option => option.textContent ?? '')
    expect(options.length).toBeGreaterThan(0)
    expect(options.some(option => /warrant/i.test(option))).toBe(false)
  })

  it('leaves the bill rows alone when the warranties cannot be loaded', async () => {
    vi.mocked(getWarranties).mockRejectedValue(new Error('network'))
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeVisible()
    expect(await screen.findByText('Nothing needs your attention.')).toBeVisible()
  })
})
