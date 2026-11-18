// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getWarranties } from '@/lib/api'
import Warranties from './Warranties'

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, getWarranties: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function renderWarranties() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Warranties />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Warranties', () => {
  it('shows an expiry date as a calendar date in Irish format', async () => {
    // A browser set to US English: a page that leaves the locale to the browser would read "June 12, 2028".
    const toLocaleDateString = Date.prototype.toLocaleDateString
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, locale, options) {
      return toLocaleDateString.call(this, locale ?? 'en-US', options)
    })
    vi.mocked(getWarranties).mockResolvedValue([
      {
        id: 'w1',
        document_id: 'd1',
        document_title: 'Washer-dryer warranty card',
        purchase_date: '2026-06-12',
        expiry_date: '2028-06-12',
        notes: null,
      },
    ])
    renderWarranties()

    expect(await screen.findByText('Expires 12 June 2028')).toBeInTheDocument()
  })
})
