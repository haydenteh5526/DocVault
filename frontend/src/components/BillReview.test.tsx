// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import type { BillReview } from '@/lib/api'
import { BillReviewPanel } from './BillReview'

afterEach(cleanup)

const review: BillReview = {
  amount_due: { value: '123.47', sources: [{ line: 2, text: 'Total amount due: EUR 123.47' }] },
  due_date: { value: '2026-11-23', sources: [{ line: 4, text: 'Payment due date: 23 November 2026' }] },
  billing_period: {
    value: '2026-10-01/2026-10-31',
    sources: [{ line: 3, text: 'Billing period: 1 October 2026 to 31 October 2026' }],
  },
}

function panel(props: Partial<Parameters<typeof BillReviewPanel>[0]> = {}) {
  return (
    <BillReviewPanel
      review={review}
      confirmed={null}
      onViewOriginal={() => {}}
      onConfirm={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  )
}

describe('BillReviewPanel', () => {
  it('shows candidates with their OCR evidence', () => {
    const { container } = render(panel({ confirmed: null }))
    const region = screen.getByRole('region', { name: 'Bill review' })
    expect(region).toHaveTextContent('€123.47')
    expect(region).toHaveTextContent('23 November 2026')
    expect(region).toHaveTextContent('1 October 2026 – 31 October 2026')
    expect(container.querySelectorAll('blockquote')).toHaveLength(3)
    expect(within(region).getByText('Not confirmed yet')).toBeInTheDocument()
  })

  it("shows 'Check the original bill' for an unresolved field", () => {
    render(panel({ review: { ...review, due_date: { ...review.due_date, value: null } } }))
    expect(screen.getByText('Check the original bill')).toBeInTheDocument()
  })
})
