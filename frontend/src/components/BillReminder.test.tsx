// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ApiError,
  type BillRevision,
  type BillSplit,
  type ReminderDetails,
  type ReminderProposal,
} from '@/lib/api'
import { BillReminderPanel } from './BillReminder'

afterEach(cleanup)

type Props = ComponentProps<typeof BillReminderPanel>

function revision(number: number, amount: string): BillRevision {
  return {
    id: `rev-${number}`,
    document_id: 'doc-1',
    revision_number: number,
    amount_due: amount,
    due_date: '2026-11-23',
    billing_period_start: '2026-10-01',
    billing_period_end: '2026-10-31',
    evidence: {
      amount_due: { value: amount, sources: [] },
      due_date: { value: '2026-11-23', sources: [] },
      billing_period: { value: '2026-10-01/2026-10-31', sources: [] },
    },
    created_at: '2026-11-11T10:00:00',
  }
}

const confirmed = revision(1, '123.47')
const confirmed2 = revision(2, '126.50')

const split: BillSplit = {
  bill_revision: 1,
  rule: 'equal',
  total: '123.47',
  remainder_cents: 3,
  shares: [
    { housemate_id: 'h1', label: 'Aoife', amount: '30.87' },
    { housemate_id: 'h2', label: 'Ben', amount: '30.87' },
    { housemate_id: 'h3', label: 'Chidi', amount: '30.87' },
    { housemate_id: 'h4', label: 'Dara', amount: '30.86' },
  ],
  id: 'split-1',
  document_id: 'doc-1',
  split_number: 1,
  stale: false,
  created_at: '2026-11-12T10:00:00',
}

const details: ReminderDetails = {
  bill_revision: 1,
  amount_due: '123.47',
  due_date: '2026-11-23',
  billing_period_start: '2026-10-01',
  billing_period_end: '2026-10-31',
  days_before_due: 2,
  remind_on: '2026-11-21',
  split: { split_number: 1, total: '123.47', shares: split.shares },
}

const pending: ReminderProposal = {
  id: 'p1',
  document_id: 'doc-1',
  proposal_number: 1,
  action: 'bill_reminder',
  source: 'owner',
  status: 'pending',
  inputs_changed: null,
  details,
  reminder: null,
  history: [{ sequence: 1, event: 'proposed', detail: {}, created_at: '2026-11-12T10:00:00' }],
  created_at: '2026-11-12T10:00:00',
  decided_at: null,
}

const saved: ReminderProposal = {
  ...pending,
  status: 'saved',
  reminder: { id: 'r1', proposal_id: 'p1', remind_on: '2026-11-21', created_at: '2026-11-12T10:05:00' },
  history: [
    ...pending.history,
    { sequence: 2, event: 'approved', detail: {}, created_at: '2026-11-12T10:05:00' },
    { sequence: 3, event: 'saved', detail: {}, created_at: '2026-11-12T10:05:00' },
  ],
  decided_at: '2026-11-12T10:05:00',
}

const conflict = (code: string) => new ApiError(409, 'changed', code)

const NO_DAYS = 'How many days before the due date should the reminder be?'
const BAD_DAYS = 'Enter a whole number from 0 to 60.'
const SAVED_VIEW = 'Saved · reminder for 21 November 2026'

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    title: 'October electricity bill',
    confirmed,
    split,
    proposals: [],
    today: '2026-11-12',
    onPropose: vi.fn(async () => pending),
    onApprove: vi.fn(async () => saved),
    onCancel: vi.fn(async () => ({ ...pending, status: 'cancelled' as const })),
    onRefresh: vi.fn(async () => {}),
    ...overrides,
  }
  const view = render(<BillReminderPanel {...props} />)
  const rerender = (changes: Partial<Props>) => view.rerender(<BillReminderPanel {...props} {...changes} />)
  const region = () => screen.getByRole('region', { name: 'Reminder' })
  const user = userEvent.setup()
  const click = (name: string) => user.click(within(region()).getByRole('button', { name }))
  const days = async (value: string) => {
    const input = within(region()).getByLabelText('Days before the due date')
    await user.clear(input)
    if (value) await user.type(input, value)
  }
  const text = (value: string) => within(region()).getByText(value)
  const absent = (value: string) => expect(within(region()).queryByText(value)).not.toBeInTheDocument()
  return { props, rerender, region, user, click, days, text, absent }
}

describe('BillReminderPanel', () => {
  it('asks for a confirmed bill first', () => {
    const { region, text } = setup({ confirmed: null })
    text('Confirm the bill above before proposing a reminder.')
    expect(within(region()).queryAllByRole('button')).toHaveLength(0)
  })

  it('asks how many days when none is given', async () => {
    const { props, region, click, text } = setup()
    text('No reminder yet')
    text('Reminder for €123.47, due 23 November 2026 (revision 1)')
    text('Split 1 will be included.')
    expect(within(region()).getByLabelText('Days before the due date')).toHaveValue('')
    await click('Propose reminder')
    expect(within(region()).getByRole('alert')).toHaveTextContent(NO_DAYS)
    expect(props.onPropose).not.toHaveBeenCalled()
  })

  it('rejects days that are not a whole number from 0 to 60', async () => {
    const { props, region, click, days } = setup()
    for (const value of ['-1', '61', '2.5', 'two']) {
      await days(value)
      await click('Propose reminder')
      expect(within(region()).getByRole('alert')).toHaveTextContent(BAD_DAYS)
    }
    expect(props.onPropose).not.toHaveBeenCalled()
    await days('0')
    await click('Propose reminder')
    expect(props.onPropose).toHaveBeenLastCalledWith(expect.objectContaining({ days_before_due: 0 }))
  })

  it('sends 60 days', async () => {
    const { props, click, days } = setup()
    await days('60')
    await click('Propose reminder')
    expect(props.onPropose).toHaveBeenCalledWith(expect.objectContaining({ days_before_due: 60 }))
  })

  it('proposes with the revision, split and proposal numbers on screen', async () => {
    const first = setup()
    await first.days('2')
    await first.click('Propose reminder')
    expect(first.props.onPropose).toHaveBeenCalledTimes(1)
    expect(first.props.onPropose).toHaveBeenCalledWith({
      action: 'bill_reminder', days_before_due: 2, bill_revision: 1, bill_split: 1, base_proposal: 0,
    })
    cleanup()

    const none = setup({ split: null })
    none.text('No split is saved for this bill, so none will be included.')
    await none.days('2')
    await none.click('Propose reminder')
    expect(none.props.onPropose).toHaveBeenCalledWith(expect.objectContaining({ bill_split: 0 }))
    cleanup()

    const stale = setup({ split: { ...split, stale: true, bill_revision: 1 }, confirmed: confirmed2 })
    stale.text('The saved split uses revision 1 and will not be included.')
    await stale.days('2')
    await stale.click('Propose reminder')
    expect(stale.props.onPropose).toHaveBeenCalledWith(
      expect.objectContaining({ bill_revision: 2, bill_split: 0 }),
    )
    cleanup()

    const later = setup({ proposals: [{ ...pending, status: 'cancelled' }] })
    await later.days('2')
    await later.click('Propose reminder')
    expect(later.props.onPropose).toHaveBeenCalledWith(expect.objectContaining({ base_proposal: 1 }))
  })

  it('the reminder is saved only after the exact proposal is approved', async () => {
    const { props, region, click, days, text, absent } = setup()
    await days('2')
    await click('Propose reminder')
    text('Approve this reminder')
    text('Proposal 1 · not saved yet')
    text('October electricity bill')
    text('€123.47 (revision 1)')
    text('23 November 2026')
    text('21 November 2026')
    text('(2 days before the due date)')
    text('Split 1, total €123.47')
    const items = within(region().querySelector('dl') as HTMLElement).getAllByRole('listitem')
    expect(items.map(item => item.textContent)).toEqual(['Aoife€30.87', 'Ben€30.87', 'Chidi€30.87', 'Dara€30.86'])
    text('Nothing is sent to anyone. The reminder is saved in your account only.')
    expect(props.onApprove).not.toHaveBeenCalled()
    await click('Approve and save')
    expect(props.onApprove).toHaveBeenCalledTimes(1)
    expect(props.onApprove).toHaveBeenCalledWith(pending)
    text(SAVED_VIEW)
    text('Propose a different reminder')
    expect(within(region()).queryByRole('button', { name: 'Approve and save' })).not.toBeInTheDocument()
    absent('Approve this reminder')
  })

  it('words the reminder date for one day and for the due date', () => {
    const one = setup({ proposals: [{ ...pending, details: { ...details, days_before_due: 1 } }] })
    one.text('(1 day before the due date)')
    cleanup()
    const zero = setup({
      proposals: [{ ...pending, details: { ...details, days_before_due: 0, remind_on: '2026-11-23' } }],
    })
    zero.text('(on the due date)')
  })

  it('a proposal without a split says so', () => {
    const { region, text } = setup({ proposals: [{ ...pending, details: { ...details, split: null } }] })
    text('No split is included.')
    expect(within(region().querySelector('dl') as HTMLElement).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('labels a reminder date that has passed', () => {
    const late = setup({ proposals: [pending], today: '2026-12-18' })
    late.text('This date has already passed.')
    cleanup()
    const early = setup({ proposals: [pending], today: '2026-11-21' })
    early.absent('This date has already passed.')
  })

  it('cancelling leaves nothing saved', async () => {
    const { props, click, text } = setup({ proposals: [pending] })
    await click('Cancel proposal')
    expect(props.onCancel).toHaveBeenCalledWith(pending)
    text('Proposal 1 was cancelled. No reminder was saved.')
    expect(screen.getByLabelText('Days before the due date')).toBeInTheDocument()
    expect(props.onApprove).not.toHaveBeenCalled()
  })

  it('an out-of-date proposal cannot be approved', () => {
    const revisionStale = setup({
      proposals: [{ ...pending, status: 'stale', inputs_changed: 'revision_changed' }],
    })
    revisionStale.text(
      'Proposal 1 is out of date and was not saved. The confirmed bill changed after it was proposed.',
    )
    expect(screen.getByLabelText('Days before the due date')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve and save' })).not.toBeInTheDocument()
    cleanup()
    const splitStale = setup({ proposals: [{ ...pending, status: 'stale', inputs_changed: 'split_changed' }] })
    splitStale.text('Proposal 1 is out of date and was not saved. The saved split changed after it was proposed.')
  })

  it('a saved reminder keeps its values when the bill changes', () => {
    const { text } = setup({
      confirmed: confirmed2,
      proposals: [{ ...saved, inputs_changed: 'revision_changed' }],
    })
    text(SAVED_VIEW)
    text('€123.47 (revision 1)')
    text(
      'The confirmed bill changed after it was proposed. This reminder still shows the values it was saved with.',
    )
  })

  it('a saved reminder reopens with its history', () => {
    const { region, text } = setup({ proposals: [saved] })
    const history = within(region()).getByRole('group', { name: 'History' })
    text('Proposal 1')
    expect(within(history).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Proposed by you · 12 November 2026 · remind on 21 November 2026',
      'Approved · 12 November 2026',
      'Saved · 12 November 2026',
    ])
    cleanup()
    const assistant = setup({ proposals: [{ ...saved, source: 'assistant' }] })
    expect(assistant.region()).toHaveTextContent('Proposed by the assistant · 12 November 2026')
    cleanup()
    const stale = setup({
      proposals: [
        {
          ...pending,
          status: 'stale',
          inputs_changed: 'revision_changed',
          history: [...pending.history, { sequence: 2, event: 'stale', detail: {}, created_at: '2026-11-13T09:00:00' }],
        },
      ],
    })
    expect(stale.region()).toHaveTextContent('Found out of date · 13 November 2026')
  })

  it('a different reminder can be proposed after one is saved', async () => {
    const { props, region, click, days, text } = setup({ proposals: [saved] })
    await click('Propose a different reminder')
    expect(within(region()).getByRole('button', { name: 'Back' })).toBeInTheDocument()
    await days('5')
    await click('Propose reminder')
    expect(props.onPropose).toHaveBeenCalledWith(expect.objectContaining({ days_before_due: 5, base_proposal: 1 }))
    cleanup()

    const back = setup({ proposals: [saved] })
    await back.click('Propose a different reminder')
    await back.click('Back')
    back.text(SAVED_VIEW)
    expect(back.props.onPropose).not.toHaveBeenCalled()
    expect(text).toBeDefined()
  })

  it('a successful approval is shown even when the refresh fails', async () => {
    const { props, rerender, region, click, text } = setup({
      proposals: [pending],
      onRefresh: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    await click('Approve and save')
    text(SAVED_VIEW)
    expect(within(region()).getByRole('status')).toHaveTextContent(
      'Your change was saved. The rest of this page could not be refreshed and may be out of date.',
    )
    vi.mocked(props.onRefresh).mockImplementation(async () => rerender({ proposals: [saved] }))
    await click('Refresh')
    expect(within(region()).getByRole('status')).toHaveTextContent('')
    text(SAVED_VIEW)
  })

  it('a refused approval reloads and explains', async () => {
    const { props, rerender, region, click, text } = setup({
      proposals: [pending],
      onApprove: vi.fn(async () => {
        throw conflict('proposal_stale')
      }),
    })
    vi.mocked(props.onRefresh).mockImplementation(async () =>
      rerender({ proposals: [{ ...pending, status: 'stale', inputs_changed: 'revision_changed' }] }),
    )
    await click('Approve and save')
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'The bill or its split changed after this was proposed. No reminder was saved. The latest version is shown here.',
    )
    expect(screen.getByLabelText('Days before the due date')).toBeInTheDocument()
    expect(within(region()).queryByRole('button', { name: 'Approve and save' })).not.toBeInTheDocument()
    expect(text).toBeDefined()
  })

  it('a refused proposal with a failed reload keeps the days and blocks saving', async () => {
    const { props, rerender, region, click, days } = setup({
      onPropose: vi.fn(async () => {
        throw conflict('revision_changed')
      }),
      onRefresh: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    await days('2')
    await click('Propose reminder')
    const alert = () => within(region()).getByRole('alert')
    expect(alert()).toHaveTextContent(
      'The confirmed bill changed while you were setting the reminder. No reminder was saved. The latest version could not be loaded.',
    )
    expect(screen.getByLabelText('Days before the due date')).toHaveValue('2')
    expect(within(region()).getByRole('button', { name: 'Propose reminder' })).toBeDisabled()
    expect(within(region()).getByRole('button', { name: 'Load latest' })).toBeInTheDocument()
    expect(alert()).not.toHaveTextContent('The latest version is shown here.')

    await click('Load latest')
    expect(alert()).toHaveTextContent('The latest version still could not be loaded. Try again.')

    vi.mocked(props.onRefresh).mockImplementation(async () => rerender({ confirmed: confirmed2 }))
    vi.mocked(props.onPropose).mockResolvedValue(pending)
    await click('Load latest')
    expect(alert()).toHaveTextContent('The latest version is shown here.')
    expect(screen.getByLabelText('Days before the due date')).toHaveValue('2')
    expect(region()).toHaveTextContent('(revision 2)')
    await click('Propose reminder')
    expect(props.onPropose).toHaveBeenLastCalledWith(expect.objectContaining({ bill_revision: 2 }))
  })

  it('a refused cancellation says nothing was changed', async () => {
    const { props, rerender, region, click } = setup({
      proposals: [pending],
      onCancel: vi.fn(async () => {
        throw conflict('already_saved')
      }),
    })
    vi.mocked(props.onRefresh).mockImplementation(async () => rerender({ proposals: [saved] }))
    await click('Cancel proposal')
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'This reminder was already saved. Nothing was changed. The latest version is shown here.',
    )
    expect(within(region()).getByText(SAVED_VIEW)).toBeInTheDocument()
  })

  it('a conflict without a reason code uses the general wording', async () => {
    const { region, click } = setup({
      proposals: [pending],
      onApprove: vi.fn(async () => {
        throw new ApiError(409, 'changed')
      }),
    })
    await click('Approve and save')
    expect(within(region()).getByRole('alert').textContent).toMatch(
      /^This reminder changed while you were reviewing it\./,
    )
  })

  it('an unanswered approval can be repeated', async () => {
    const { props, region, click, text } = setup({
      proposals: [pending],
      onApprove: vi
        .fn<Props['onApprove']>()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(saved),
    })
    await click('Approve and save')
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'Could not confirm that the reminder was saved. Try again: approving again cannot save it twice.',
    )
    expect(within(region()).getByRole('button', { name: 'Approve and save' })).toBeEnabled()
    expect(within(region()).getByRole('button', { name: 'Cancel proposal' })).toBeEnabled()
    expect(props.onRefresh).not.toHaveBeenCalled()
    await click('Approve and save')
    text(SAVED_VIEW)
    expect(props.onApprove).toHaveBeenCalledTimes(2)
  })

  it('other errors keep the view and do not reload', async () => {
    const proposing = setup({
      onPropose: vi.fn(async () => {
        throw new Error('network')
      }),
    })
    await proposing.days('2')
    await proposing.click('Propose reminder')
    proposing.text('Could not propose the reminder. Try again.')
    expect(screen.getByLabelText('Days before the due date')).toHaveValue('2')
    expect(proposing.props.onRefresh).not.toHaveBeenCalled()
    cleanup()

    const cancelling = setup({
      proposals: [pending],
      onCancel: vi.fn(async () => {
        throw new Error('network')
      }),
    })
    await cancelling.click('Cancel proposal')
    cancelling.text('Could not cancel the proposal. Try again.')
    expect(cancelling.props.onRefresh).not.toHaveBeenCalled()
  })

  it('disables both buttons while an approval is pending', async () => {
    const { props, region, user } = setup({ proposals: [pending], onApprove: vi.fn(() => new Promise<ReminderProposal>(() => {})) })
    const approve = within(region()).getByRole('button', { name: 'Approve and save' })
    await user.click(approve)
    await user.click(approve)
    expect(approve).toBeDisabled()
    expect(within(region()).getByRole('button', { name: 'Cancel proposal' })).toBeDisabled()
    expect(props.onApprove).toHaveBeenCalledTimes(1)
  })
})
