// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { uploadDocument, type Document } from '@/lib/api'
import { ToastProvider } from '@/components/Toast'
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
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/upload']}>
          <Where />
          <Routes>
            <Route path="/app/upload" element={<UploadPage />} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

async function uploadOneFile(container: HTMLElement, file = new File(['x'], 'bill.pdf', { type: 'application/pdf' })) {
  vi.mocked(uploadDocument).mockResolvedValue({ id: 'doc-1' } as Document)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, file)
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

describe('queue dedupe', () => {
  const pdf = (name: string, body = 'x', lastModified = 1000) => new File([body], name, { type: 'application/pdf', lastModified })
  const four = () => ['a', 'b', 'c', 'd'].map(n => pdf(n + '.pdf'))
  const input = (c: HTMLElement) => c.querySelector('input[type=file]') as HTMLInputElement

  it('choosing the same four files twice queues four and says so', async () => {
    const { container } = renderUpload()
    await userEvent.upload(input(container), four())
    await userEvent.upload(input(container), four())
    expect(screen.getByRole('heading', { name: 'Files (4)' })).toBeVisible()
    expect(screen.getByText('4 files are already in the queue.')).toBeVisible()
  })

  it('names the file when one repeat is skipped', async () => {
    const { container } = renderUpload()
    await userEvent.upload(input(container), pdf('bill.pdf'))
    await userEvent.upload(input(container), pdf('bill.pdf'))
    expect(screen.getByRole('heading', { name: 'Files (1)' })).toBeVisible()
    expect(screen.getByText('bill.pdf is already in the queue.')).toBeVisible()
  })

  it('queues a file once when a selection repeats it', async () => {
    const { container } = renderUpload()
    await userEvent.upload(input(container), [pdf('bill.pdf'), pdf('bill.pdf'), pdf('other.pdf')])
    expect(screen.getByRole('heading', { name: 'Files (2)' })).toBeVisible()
    expect(screen.getByText('bill.pdf is already in the queue.')).toBeVisible()
  })

  it('still queues a file with the same name but a different size', async () => {
    const { container } = renderUpload()
    await userEvent.upload(input(container), pdf('bill.pdf', 'x'))
    await userEvent.upload(input(container), pdf('bill.pdf', 'xy'))
    expect(screen.getByRole('heading', { name: 'Files (2)' })).toBeVisible()
    expect(screen.queryByText(/already in the queue/)).toBeNull()
  })

  it('allows the same file again after Upload More', async () => {
    const { container } = renderUpload()
    await uploadOneFile(container, pdf('bill.pdf'))
    await userEvent.click(screen.getByRole('button', { name: 'Upload More' }))
    await userEvent.upload(input(container), pdf('bill.pdf'))
    expect(screen.getByRole('heading', { name: 'Files (1)' })).toBeVisible()
    expect(screen.queryByText(/already in the queue/)).toBeNull()
  })

  it('uploads each of the four files once', async () => {
    vi.mocked(uploadDocument).mockResolvedValue({ id: 'doc-1' } as Document)
    const { container } = renderUpload()
    await userEvent.upload(input(container), four())
    await userEvent.upload(input(container), four())
    await userEvent.click(screen.getByRole('button', { name: 'Upload All (4)' }))
    await screen.findByText('Upload Complete!')
    expect(uploadDocument).toHaveBeenCalledTimes(4)
  })
})
