// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDocuments, getDocument, type Document } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import Dashboard from '@/pages/Dashboard'
import { statusFingerprint, syncDocumentStatus } from './documentStatusSync'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getDocuments: vi.fn(), getDocument: vi.fn(), searchDocuments: vi.fn(async () => ({ results: [] })), getCategories: vi.fn(async () => []) }
})

const evidence = {
  amount_due: { value: '123.47', sources: [] },
  due_date: { value: '2026-11-23', sources: [] },
  billing_period: { value: '2026-10-01/2026-10-31', sources: [] },
}

function bill(confirmed: boolean): Document {
  return {
    id: 'd1', title: 'October electricity bill', brand: null, model: null, document_type: null, category_id: null,
    raw_text: 'Electricity bill', summary: null, file_size: 10, image_url: null, processing_status: 'complete', tags: [],
    created_at: '2026-11-11T10:00:00', bill_review: evidence, bill_split: null, reminder_proposals: [],
    confirmed_bill: confirmed ? { id: 'r1', document_id: 'd1', revision_number: 1, amount_due: '123.47', due_date: '2026-11-23', billing_period_start: '2026-10-01', billing_period_end: '2026-10-31', evidence, created_at: '2026-11-11T10:00:00' } : null,
  } as unknown as Document
}

function visit(client: QueryClient) {
  localStorage.setItem('docvault-analytics', 'hidden')
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/documents']}><Dashboard /></MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(getDocuments).mockResolvedValue({ documents: [{ ...bill(false), bill_review: undefined, confirmed_bill: undefined } as unknown as Document], total: 1 })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('statusFingerprint', () => {
  it('changes when a bill is confirmed and not otherwise', () => {
    expect(statusFingerprint(bill(false))).not.toBe(statusFingerprint(bill(true)))
    expect(statusFingerprint(bill(true))).toBe(statusFingerprint({ ...bill(true), title: 'Renamed' }))
  })
})

describe('confirming a bill and going back to Documents (M-A)', () => {
  it('shows the new state at once, without waiting out the 30 s cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = syncDocumentStatus(client)
    try {
      vi.mocked(getDocument).mockResolvedValue(bill(false))
      const first = visit(client)
      await waitFor(() => expect(screen.getAllByText('Needs confirming').length).toBeGreaterThan(0))
      first.unmount()

      // The bill's page loads it, then the owner confirms it there.
      client.setQueryData(['document', 'd1'], bill(false))
      client.setQueryData(['document', 'd1'], bill(true))
      vi.mocked(getDocument).mockResolvedValue(bill(true))

      visit(client)
      await waitFor(() => expect(screen.getAllByText('Confirmed · revision 1').length).toBeGreaterThan(0))
      expect(screen.queryByText('Needs confirming')).not.toBeInTheDocument()
    } finally {
      stop()
    }
  })

  it('does not refetch every document just because one was opened', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = syncDocumentStatus(client)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    try {
      client.setQueryData(['document', 'd1'], bill(false))
      client.setQueryData(['document', 'd1'], { ...bill(false), title: 'Renamed' })
      expect(invalidate).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })
})

describe('the first paint after a confirm (L-2)', () => {
  it('writes the new record into the list status at once, before any reload resolves', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = syncDocumentStatus(client)
    try {
      client.setQueryData(['document', 'd1'], bill(false))
      client.setQueryData(['document-list-status', ['d1']], { d1: bill(false) })
      client.setQueryData(['document', 'd1'], bill(true))
      const listed = client.getQueryData<Record<string, Document>>(['document-list-status', ['d1']])
      expect(listed?.d1.confirmed_bill?.revision_number).toBe(1)
      expect(getDocument).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })

  it('leaves list entries that do not hold that document alone', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = syncDocumentStatus(client)
    try {
      client.setQueryData(['document', 'd1'], bill(false))
      client.setQueryData(['document-list-status', ['d2']], { d2: { ...bill(false), id: 'd2' } })
      client.setQueryData(['document', 'd1'], bill(true))
      expect(client.getQueryData<Record<string, Document>>(['document-list-status', ['d2']])).toEqual({ d2: { ...bill(false), id: 'd2' } })
    } finally {
      stop()
    }
  })
})
