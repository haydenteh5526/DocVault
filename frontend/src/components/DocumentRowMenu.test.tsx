// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { Document } from '@/lib/api'
import { ToastProvider } from './Toast'
import { DocumentRowMenu } from './DocumentRowMenu'

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

function respond(status: number, body: unknown) {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'd1',
    title: 'synthetic-broadband-bill',
    brand: null,
    model: null,
    document_type: 'Bill',
    raw_text: 'LINKLINE BROADBAND',
    summary: null,
    file_size: 2048,
    image_url: null,
    processing_status: 'complete',
    created_at: '2026-11-22T10:00:00',
    ...overrides,
  } as Document
}

function show(document: Document) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <DocumentRowMenu doc={document} onPreview={() => {}} onRename={() => {}} onToggleFavourite={() => {}} onDelete={() => {}} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { invalidate }
}

async function openMenu(title: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Actions for ' + title }))
}

describe('DocumentRowMenu', () => {
  it('reads a completed document again, confirms and refreshes what shows it', async () => {
    respond(200, doc({ title: 'Linkline Broadband bill' }))
    const { invalidate } = show(doc())
    await openMenu('synthetic-broadband-bill')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Read details again' }))
    expect(await screen.findByText('Details updated.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/documents\/d1\/refresh-details$/)
    expect(init?.method).toBe('POST')
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['documents']),
      JSON.stringify(['document', 'd1']),
      JSON.stringify(['document-list-status']),
      JSON.stringify(['warranties']),
    ]))
  })

  it('says so when reading again fails', async () => {
    respond(409, { detail: { code: 'not_ready', message: 'This document is still being read.' } })
    show(doc())
    await openMenu('synthetic-broadband-bill')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Read details again' }))
    expect(await screen.findByText('Could not read the details again. Try again.')).toBeInTheDocument()
  })

  it('offers it only once a document has been read', async () => {
    show(doc({ processing_status: 'processing' }))
    await openMenu('synthetic-broadband-bill')
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Read details again' })).toBeNull()
  })
})
