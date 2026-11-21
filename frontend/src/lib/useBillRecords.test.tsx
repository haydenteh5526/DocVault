// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getDocument, type Document } from './api'
import { useBillRecords } from './useBillRecords'

vi.mock('./api', () => ({ getDocument: vi.fn() }))

const doc = (id: string) => ({ id, processing_status: 'complete' }) as unknown as Document

describe('useBillRecords', () => {
  it('keeps the records that loaded when one document fails', async () => {
    vi.mocked(getDocument).mockImplementation(async id => {
      if (id === 'b') throw new Error('Could not load document')
      return doc(id)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useBillRecords([doc('a'), doc('b'), doc('c')]), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(Object.keys(result.current.data!)).toEqual(['a', 'c'])
  })

  it('still reports an error when every document fails', async () => {
    vi.mocked(getDocument).mockRejectedValue(new Error('down'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useBillRecords([doc('a'), doc('b')]), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
