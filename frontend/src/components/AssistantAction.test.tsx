// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AssistantAction, ReminderProposal } from '@/lib/api'
import { AssistantActionCard } from './AssistantAction'

afterEach(cleanup)

const META: AssistantAction['meta'] = { selector: 'rules', model: null, fallback_reason: null }
const DOC = 'doc-1'

const SHARES = [
  { housemate_id: 'h1', label: 'Aoife', amount: '30.87' },
  { housemate_id: 'h2', label: 'Ben', amount: '30.87' },
  { housemate_id: 'h3', label: 'Chidi', amount: '30.87' },
  { housemate_id: 'h4', label: 'Dara', amount: '30.86' },
]

function action(overrides: Partial<AssistantAction> & Pick<AssistantAction, 'kind'>): AssistantAction {
  return {
    meta: META,
    document_id: DOC,
    document_title: 'October electricity bill',
    ...overrides,
  }
}

function facts(overrides: Partial<NonNullable<AssistantAction['facts']>> = {}): NonNullable<AssistantAction['facts']> {
  return {
    confirmed: true,
    revision: 1,
    amount_due: '123.47',
    due_date: '2026-11-23',
    billing_period_start: '2026-10-01',
    billing_period_end: '2026-10-31',
    evidence: {
      amount_due: { value: '123.47', sources: [{ line: 4, text: 'Total amount due: EUR 123.47' }] },
      due_date: { value: '2026-11-23', sources: [{ line: 5, text: 'Payment due date: 23 November 2026' }] },
      billing_period: { value: '2026-10-01/2026-10-31', sources: [{ line: 3, text: 'Billing period: 1 October 2026 to 31 October 2026' }] },
    },
    ...overrides,
  }
}

function proposal(split: boolean): ReminderProposal {
  return {
    id: 'p1',
    document_id: DOC,
    proposal_number: 1,
    action: 'bill_reminder',
    source: 'assistant',
    status: 'pending',
    inputs_changed: null,
    details: {
      bill_revision: 1,
      amount_due: '123.47',
      due_date: '2026-11-23',
      billing_period_start: '2026-10-01',
      billing_period_end: '2026-10-31',
      days_before_due: 2,
      remind_on: '2026-11-21',
      split: split ? { split_number: 1, total: '123.47', shares: SHARES } : null,
    },
    reminder: null,
    history: [],
    created_at: '2026-11-17T10:00:00',
    decided_at: null,
  }
}

describe('AssistantActionCard', () => {
  it('shows confirmed facts with their evidence', async () => {
    const onOpenDocument = vi.fn()
    render(<AssistantActionCard action={action({ kind: 'bill_facts', facts: facts() })} onOpenDocument={onOpenDocument} />)
    const region = screen.getByRole('region', { name: 'Bill facts' })
    expect(within(region).getByText('Confirmed · revision 1')).toBeInTheDocument()
    expect(within(region).getByText('€123.47')).toBeInTheDocument()
    expect(within(region).getByText('23 November 2026')).toBeInTheDocument()
    expect(within(region).getByText('1 October 2026 – 31 October 2026')).toBeInTheDocument()
    expect(region.querySelectorAll('blockquote')).toHaveLength(3)
    await userEvent.setup().click(within(region).getByRole('button', { name: 'Open bill' }))
    expect(onOpenDocument).toHaveBeenCalledWith(DOC)
  })

  it('labels unconfirmed and unreadable facts', () => {
    const f = facts({
      confirmed: false,
      revision: null,
      due_date: null,
      evidence: {
        amount_due: { value: '123.47', sources: [] },
        due_date: { value: null, sources: [] },
        billing_period: { value: null, sources: [] },
      },
    })
    render(<AssistantActionCard action={action({ kind: 'bill_facts', facts: f })} onOpenDocument={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Bill facts' })
    expect(within(region).getByText('Not confirmed')).toBeInTheDocument()
    expect(within(region).getAllByText('Not readable').length).toBeGreaterThanOrEqual(1)
    expect(within(region).queryByText(/Confirmed ·/)).not.toBeInTheDocument()
  })

  it('shows the split preview in order as not saved', async () => {
    const onOpenDocument = vi.fn()
    const preview = { bill_revision: 1, rule: 'equal', total: '123.47', remainder_cents: 3, shares: SHARES }
    render(<AssistantActionCard action={action({ kind: 'split_preview', preview })} onOpenDocument={onOpenDocument} />)
    const region = screen.getByRole('region', { name: 'Split preview' })
    expect(within(region).getByText('Equal split of €123.47 from revision 1')).toBeInTheDocument()
    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('€30.87'),
      expect.stringContaining('€30.87'),
      expect.stringContaining('€30.87'),
      expect.stringContaining('€30.86'),
    ])
    expect(items[0]).toHaveTextContent('Aoife')
    expect(items[3]).toHaveTextContent('Dara')
    expect(within(region).getByText('Not saved')).toBeInTheDocument()
    await userEvent.setup().click(within(region).getByRole('button', { name: 'Open bill to save this split' }))
    expect(onOpenDocument).toHaveBeenCalledWith(DOC)
  })

  it('shows the pending proposal and where to approve it', () => {
    const { rerender } = render(
      <AssistantActionCard action={action({ kind: 'reminder_proposal', proposal: proposal(true) })} onOpenDocument={vi.fn()} />,
    )
    const region = screen.getByRole('region', { name: 'Reminder proposal' })
    expect(within(region).getByText('Proposal 1 · not saved yet')).toBeInTheDocument()
    expect(within(region).getByText('Remind on 21 November 2026')).toBeInTheDocument()
    expect(within(region).getByText('€123.47 due 23 November 2026 (revision 1)')).toBeInTheDocument()
    expect(within(region).getByText('Split 1, total €123.47')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Open bill to approve or cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve and save|^approve$/i })).not.toBeInTheDocument()

    rerender(<AssistantActionCard action={action({ kind: 'reminder_proposal', proposal: proposal(false) })} onOpenDocument={vi.fn()} />)
    expect(screen.getByText('No split is included.')).toBeInTheDocument()
  })

  it('the enquiry draft can be edited and copied', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(
      <AssistantActionCard
        action={action({
          kind: 'enquiry_draft',
          draft: 'Subject: Question about October electricity bill\n\nHello,',
          topic: 'the standing charge',
          evidence: [{ line: 6, text: 'Standing charge: EUR 18.20' }],
        })}
        onOpenDocument={vi.fn()}
      />,
    )
    const region = screen.getByRole('region', { name: 'Enquiry draft' })
    const box = within(region).getByLabelText('Draft to edit')
    expect(box).toHaveValue('Subject: Question about October electricity bill\n\nHello,')
    expect(within(region).getByText('Nothing is sent from DocVault.')).toBeInTheDocument()
    expect(region.querySelectorAll('blockquote')).toHaveLength(1)

    await user.type(box, ' Thanks')
    await user.click(within(region).getByRole('button', { name: 'Copy draft' }))
    expect(writeText).toHaveBeenCalledWith('Subject: Question about October electricity bill\n\nHello, Thanks')
    expect(await within(region).findByText('Copied')).toBeInTheDocument()
  })

  it('tells the owner when copying fails', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(
      <AssistantActionCard action={action({ kind: 'enquiry_draft', draft: 'Hello', topic: 'x', evidence: [] })} onOpenDocument={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Copy draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy. Select the text and copy it.')
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
  })

  it('offers the bill from a notice that names one', async () => {
    const onOpenDocument = vi.fn()
    const { container, rerender } = render(
      <AssistantActionCard action={action({ kind: 'notice', reason: 'proposal_pending' })} onOpenDocument={onOpenDocument} />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open bill' }))
    expect(onOpenDocument).toHaveBeenCalledWith(DOC)

    rerender(<AssistantActionCard action={action({ kind: 'notice', reason: 'no_bills', document_id: null })} onOpenDocument={onOpenDocument} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says when the language model was not used', () => {
    const line = 'Handled without the language model.'
    const make = (meta: AssistantAction['meta']) => action({ kind: 'notice', reason: 'changed', meta })
    const { rerender } = render(
      <AssistantActionCard action={make({ selector: 'rules', model: null, fallback_reason: 'timeout' })} onOpenDocument={vi.fn()} />,
    )
    expect(screen.getByText(line)).toBeInTheDocument()

    rerender(<AssistantActionCard action={make({ selector: 'rules', model: null, fallback_reason: null })} onOpenDocument={vi.fn()} />)
    expect(screen.queryByText(line)).not.toBeInTheDocument()

    rerender(<AssistantActionCard action={make({ selector: 'model', model: 'm', fallback_reason: null })} onOpenDocument={vi.fn()} />)
    expect(screen.queryByText(line)).not.toBeInTheDocument()
  })

  it.each(['answer', 'question', 'declined'] as const)('renders nothing for a %s', kind => {
    const { container } = render(<AssistantActionCard action={action({ kind })} onOpenDocument={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
