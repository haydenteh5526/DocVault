// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { deleteDocument, getDocument, type Document } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
import DocumentDetail from './DocumentDetail'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getDocument: vi.fn(),
    deleteDocument: vi.fn(async () => undefined),
    getHousemates: vi.fn(async () => []),
    getTags: vi.fn(async () => []),
    findSimilarDocuments: vi.fn(async () => []),
    listConversations: vi.fn(async () => []),
    getConversation: vi.fn(async () => ({ messages: [] })),
  }
})

const token = `h.${btoa(JSON.stringify({ sub: 'a1' }))}.s`

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('deleting a document (L7)', () => {
  it('refreshes the documents list straight away, so the deleted one does not linger', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(getDocument).mockResolvedValue({
      id: 'd1', title: 'Old receipt', brand: null, model: null, document_type: null, category_id: null,
      raw_text: 'text', summary: null, file_size: null, image_url: null, processing_status: 'complete', tags: [],
      created_at: '2026-11-11T10:00:00', bill_review: null, bill_split: null, confirmed_bill: null,
    } as Document)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['documents'], [{ id: 'd1', title: 'Old receipt' }])
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    localStorage.setItem('token', token)
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/app/documents/d1']}>
              <Routes>
                <Route path="/app/documents/:id" element={<DocumentDetail />} />
                <Route path="*" element={<p>Documents list</p>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findAllByText('Old receipt')
    const remove = document.querySelector('button svg.lucide-trash-2')!.closest('button') as HTMLButtonElement
    await userEvent.click(remove)
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['document-list-status'] })
    expect(await screen.findByText('Documents list')).toBeInTheDocument()
  })
})
