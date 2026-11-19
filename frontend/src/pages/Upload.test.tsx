// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { uploadDocument, type Document } from '@/lib/api'
import UploadPage from './Upload'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, uploadDocument: vi.fn() }
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderUpload(queryClient = new QueryClient()) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/upload']}>
        <Where />
        <Routes>
          <Route path="/app/upload" element={<UploadPage />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

async function uploadOneFile(container: HTMLElement) {
  vi.mocked(uploadDocument).mockResolvedValue({ id: 'doc-1' } as Document)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, new File(['x'], 'bill.pdf', { type: 'application/pdf' }))
  await userEvent.click(screen.getByRole('button', { name: /^Upload/ }))
  await screen.findByText('Upload Complete!')
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('UploadPage', () => {
  it('view documents opens the documents list', async () => {
    const { container } = renderUpload()
    await uploadOneFile(container)
    await userEvent.click(screen.getByRole('button', { name: /View Documents/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/app/documents')
  })

  it('a finished upload refreshes the cached list', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['documents'], { documents: [], total: 0 }, { updatedAt: Date.now() })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { container } = renderUpload(queryClient)
    expect(queryClient.getQueryState(['documents'])?.isInvalidated).toBe(false)

    await uploadOneFile(container)

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents'] }))
    expect(queryClient.getQueryState(['documents'])?.isInvalidated).toBe(true)
  })
})

it('keeps the file available to retry after a failed upload', async () => {
  vi.mocked(uploadDocument).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({id:'doc-1'} as Document)
  const {container} = renderUpload()
  await userEvent.upload(container.querySelector('input[type=file]')!,new File(['x'],'bill.pdf',{type:'application/pdf'}))
  await userEvent.click(screen.getByRole('button',{name:'Upload'}))
  expect(await screen.findByText('Could not read this file')).toBeVisible()
  await userEvent.click(screen.getByRole('button',{name:'Try again'}))
  expect(await screen.findByRole('heading',{name:'Upload Complete!'})).toBeVisible()
})
