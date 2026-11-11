// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, type BillReview, type BillRevision } from '@/lib/api'
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

const changedReview: BillReview = {
  ...review,
  amount_due: { value: '130.00', sources: [{ line: 2, text: 'Total amount due: EUR 130.00' }] },
}

function confirmedRevision(revision: number, amount: string, evidence: BillReview = review): BillRevision {
  return {
    id: `rev-${revision}`,
    document_id: 'doc-1',
    revision_number: revision,
    amount_due: amount,
    due_date: '2026-11-23',
    billing_period_start: '2026-10-01',
    billing_period_end: '2026-10-31',
    evidence,
    created_at: '2026-11-11T10:00:00',
  }
}

const TRANSCRIPT_CHANGED_NOTICE = 'The transcript has changed since this was confirmed.'
const NO_CANDIDATES_NOTICE =
  'The current transcript no longer produces bill candidates. These are the values and evidence you confirmed.'

const region = () => screen.getByRole('region', { name: 'Bill review' })
const button = (name: string) => screen.getByRole('button', { name })

async function replace(label: string, value: string) {
  const input = screen.getByLabelText(label)
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
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
    const bill = region()
    expect(bill).toHaveTextContent('€123.47')
    expect(bill).toHaveTextContent('23 November 2026')
    expect(bill).toHaveTextContent('1 October 2026 – 31 October 2026')
    expect(container.querySelectorAll('blockquote')).toHaveLength(3)
    expect(within(bill).getByText('Not confirmed yet')).toBeInTheDocument()
  })

  it("shows 'Check the original bill' for an unresolved field", () => {
    render(panel({ review: { ...review, due_date: { ...review.due_date, value: null } } }))
    expect(screen.getByText('Check the original bill')).toBeInTheDocument()
  })

  it('a correction is saved only after explicit confirmation', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(panel({ onConfirm }))
    await userEvent.click(button('Review and confirm'))
    expect(screen.getByLabelText('Amount due (€)')).toHaveValue('123.47')
    await replace('Amount due (€)', '125.00')
    await userEvent.click(button('Check values'))

    expect(screen.getByRole('heading', { name: 'Confirm these values' })).toBeInTheDocument()
    expect(region()).toHaveTextContent('€125.00')
    expect(screen.getByText('OCR read: €123.47')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(button('Confirm and save'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledWith({
      amount_due: '125.00',
      due_date: '2026-11-23',
      billing_period_start: '2026-10-01',
      billing_period_end: '2026-10-31',
      reviewed: review,
      base_revision: 0,
    })
  })

  it('the save carries the evidence and revision captured when editing started', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(panel({ confirmed: confirmedRevision(1, '125.00'), onConfirm }))
    await userEvent.click(button('Edit confirmed values'))
    rerender(panel({ review: changedReview, confirmed: confirmedRevision(2, '126.50', changedReview), onConfirm }))

    expect(region()).toHaveTextContent('Total amount due: EUR 123.47')
    expect(region()).not.toHaveTextContent('Total amount due: EUR 130.00')

    await userEvent.click(button('Check values'))
    await userEvent.click(button('Confirm and save'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ reviewed: review, base_revision: 1 })
  })

  it('an unreadable date must be decided by the owner', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(panel({ review: { ...review, due_date: { ...review.due_date, value: null } }, onConfirm }))
    await userEvent.click(button('Review and confirm'))
    expect(screen.getByLabelText('Due date')).toHaveValue('')

    await userEvent.click(button('Check values'))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter every date.')
    expect(onConfirm).not.toHaveBeenCalled()

    setDate('Due date', '2026-11-24')
    await userEvent.click(button('Check values'))
    expect(screen.getByRole('heading', { name: 'Confirm these values' })).toBeInTheDocument()
    expect(screen.getByText('OCR could not read this')).toBeInTheDocument()
  })

  it('malformed amounts and reversed periods are rejected', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(panel({ onConfirm }))
    await userEvent.click(button('Review and confirm'))

    await replace('Amount due (€)', '123.4')
    await userEvent.click(button('Check values'))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the amount as euros and cents, for example 123.47.')

    await replace('Amount due (€)', '123.47')
    setDate('Billing period end', '2026-09-30')
    await userEvent.click(button('Check values'))
    expect(screen.getByRole('alert')).toHaveTextContent('The billing period must end on or after it starts.')
    expect(screen.queryByRole('heading', { name: 'Confirm these values' })).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('a confirmed revision reopens with its saved evidence', () => {
    const confirmed = confirmedRevision(2, '125.00')
    const { container, rerender } = render(panel({ confirmed }))
    expect(region()).toHaveTextContent('Confirmed · revision 2')
    expect(region()).toHaveTextContent('€125.00')
    expect(screen.getByText('Corrected from €123.47')).toBeInTheDocument()
    expect(container.querySelectorAll('blockquote')).toHaveLength(3)
    expect(region()).not.toHaveTextContent(TRANSCRIPT_CHANGED_NOTICE)
    expect(region()).not.toHaveTextContent(NO_CANDIDATES_NOTICE)

    rerender(panel({ review: changedReview, confirmed }))
    expect(region()).toHaveTextContent(TRANSCRIPT_CHANGED_NOTICE)
    const quotes = Array.from(container.querySelectorAll('blockquote')).map(quote => quote.textContent).join(' ')
    expect(quotes).toContain('Total amount due: EUR 123.47')
    expect(quotes).not.toContain('Total amount due: EUR 130.00')
  })

  it('a confirmed revision reopens when the transcript has no candidates', () => {
    const { container } = render(panel({ review: null, confirmed: confirmedRevision(2, '125.00') }))
    expect(region()).toHaveTextContent('Confirmed · revision 2')
    expect(region()).toHaveTextContent('€125.00')
    const quotes = Array.from(container.querySelectorAll('blockquote')).map(quote => quote.textContent)
    expect(quotes).toHaveLength(3)
    expect(quotes.join(' ')).toContain('Total amount due: EUR 123.47')
    expect(quotes.join(' ')).toContain('Payment due date: 23 November 2026')
    expect(quotes.join(' ')).toContain('Billing period: 1 October 2026 to 31 October 2026')
    expect(region()).toHaveTextContent(NO_CANDIDATES_NOTICE)
    expect(screen.queryByRole('button', { name: 'Edit confirmed values' })).not.toBeInTheDocument()
  })

  it('a changed transcript reloads the candidates and explains', async () => {
    let rerender: (ui: ReactNode) => void = () => {}
    const onConfirm = vi.fn(async () => {
      rerender(panel({ review: changedReview, onConfirm }))
      throw new ApiError(409, 'changed', 'transcript_changed')
    })
    ;({ rerender } = render(panel({ onConfirm })))
    await userEvent.click(button('Review and confirm'))
    await userEvent.click(button('Check values'))
    await userEvent.click(button('Confirm and save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The bill text changed while you were reviewing. Nothing was saved. The values below come from the updated text.',
    )
    expect(region()).toHaveTextContent('€130.00')
    expect(button('Review and confirm')).toBeInTheDocument()
    expect(screen.queryByLabelText('Amount due (€)')).not.toBeInTheDocument()
  })

  it('another saved confirmation reloads the confirmed bill and explains', async () => {
    let rerender: (ui: ReactNode) => void = () => {}
    const onConfirm = vi.fn(async () => {
      rerender(panel({ confirmed: confirmedRevision(1, '126.50'), onConfirm }))
      throw new ApiError(409, 'changed', 'revision_changed')
    })
    ;({ rerender } = render(panel({ onConfirm })))
    await userEvent.click(button('Review and confirm'))
    await userEvent.click(button('Check values'))
    await userEvent.click(button('Confirm and save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another confirmation was saved while you were reviewing. Nothing was saved. The latest confirmed values are shown below.',
    )
    expect(region()).toHaveTextContent('Confirmed · revision 1')
    expect(region()).toHaveTextContent('€126.50')
  })

  it('other save errors keep the draft', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network'))
    render(panel({ onConfirm }))
    await userEvent.click(button('Review and confirm'))
    await replace('Amount due (€)', '125.00')
    await userEvent.click(button('Check values'))
    await userEvent.click(button('Confirm and save'))

    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Confirm these values' })).toBeInTheDocument()
    expect(region()).toHaveTextContent('€125.00')
  })

  it('cancel leaves nothing saved', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(panel({ onConfirm }))
    await userEvent.click(button('Review and confirm'))
    await replace('Amount due (€)', '999.99')
    await userEvent.click(button('Cancel'))

    expect(region()).toHaveTextContent('€123.47')
    expect(region()).not.toHaveTextContent('999.99')
    expect(button('Review and confirm')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
