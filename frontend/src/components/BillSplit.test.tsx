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
  type BillSplitPreview,
  type Housemate,
} from '@/lib/api'
import { BillSplitPanel } from './BillSplit'

afterEach(cleanup)

type Props = ComponentProps<typeof BillSplitPanel>

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

function person(id: string, label: string, position: number): Housemate {
  return { id, label, position, created_at: '2026-11-12T10:00:00' }
}
const four = [person('h1', 'Aoife', 1), person('h2', 'Ben', 2), person('h3', 'Chidi', 3), person('h4', 'Dara', 4)]

const preview: BillSplitPreview = {
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
}
const saved: BillSplit = {
  ...preview,
  id: 'split-1',
  document_id: 'doc-1',
  split_number: 1,
  stale: false,
  created_at: '2026-11-12T10:00:00',
}

const conflict = (code: string) => new ApiError(409, 'changed', code)

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    confirmed,
    split: null,
    housemates: four,
    housematesFailed: false,
    onAddHousemate: vi.fn(async () => {}),
    onRemoveHousemate: vi.fn(async () => {}),
    onPreview: vi.fn(async () => preview),
    onSave: vi.fn(async () => saved),
    onRefresh: vi.fn(async () => {}),
    ...overrides,
  }
  const view = render(<BillSplitPanel {...props} />)
  const rerender = (changes: Partial<Props>) => view.rerender(<BillSplitPanel {...props} {...changes} />)
  const region = () => screen.getByRole('region', { name: 'Bill split' })
  const user = userEvent.setup()
  const click = (name: string) => user.click(within(region()).getByRole('button', { name }))
  return { props, rerender, region, user, click }
}

const THREE_SHARE_PREVIEW: BillSplitPreview = {
  ...preview,
  remainder_cents: 1,
  shares: [
    { housemate_id: 'h1', label: 'Aoife', amount: '41.16' },
    { housemate_id: 'h2', label: 'Ben', amount: '41.16' },
    { housemate_id: 'h3', label: 'Chidi', amount: '41.15' },
  ],
}

describe('BillSplitPanel', () => {
  it('asks for a confirmed bill first', () => {
    const { region } = setup({ confirmed: null })
    expect(region()).toHaveTextContent('Confirm the bill above before splitting it.')
    expect(within(region()).queryByRole('button')).toBeNull()
  })

  it('the four-person acceptance split is saved only after the shares are reviewed', async () => {
    const { props, region, click } = setup()
    expect(region()).toHaveTextContent('Not split yet')
    await click('Split this bill')
    expect(region()).toHaveTextContent('Splitting €123.47 from revision 1')
    expect(within(region()).getAllByRole('checkbox')).toHaveLength(4)
    for (const box of within(region()).getAllByRole('checkbox')) expect(box).toBeChecked()
    expect(region()).toHaveTextContent(
      'Rule: equal split. Everyone pays the same. Leftover cents go one each to the first people in the order shown.',
    )

    await click('Calculate shares')
    expect(props.onPreview).toHaveBeenCalledTimes(1)
    expect(props.onPreview).toHaveBeenCalledWith({
      bill_revision: 1, rule: 'equal', housemate_ids: ['h1', 'h2', 'h3', 'h4'],
    })
    expect(props.onRefresh).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm this split')).toBeInTheDocument()
    const items = within(region()).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringMatching(/Aoife.*€30\.87/),
      expect.stringMatching(/Ben.*€30\.87/),
      expect.stringMatching(/Chidi.*€30\.87/),
      expect.stringMatching(/Dara.*€30\.86/),
    ])
    expect(region()).toHaveTextContent('3 leftover cents went one each to the first 3 people in this order.')
    expect(region()).toHaveTextContent('Contributions total €123.47, the confirmed amount.')
    expect(props.onSave).not.toHaveBeenCalled()

    await click('Save split')
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith({
      bill_revision: 1, rule: 'equal', housemate_ids: ['h1', 'h2', 'h3', 'h4'],
      base_split: 0, reviewed: preview.shares,
    })
  })

  it('only ticked people are sent, in list order', async () => {
    const { props, region, user, click } = setup()
    await click('Split this bill')
    await user.click(within(region()).getByRole('checkbox', { name: 'Ben' }))
    await click('Calculate shares')
    expect(props.onPreview).toHaveBeenCalledWith(expect.objectContaining({ housemate_ids: ['h1', 'h3', 'h4'] }))
  })

  it('fewer than two people cannot be split', async () => {
    const empty = setup({ housemates: [] })
    await empty.click('Split this bill')
    expect(empty.region()).toHaveTextContent('Add the people who share this bill.')
    await empty.click('Calculate shares')
    expect(within(empty.region()).getByRole('alert')).toHaveTextContent('Choose at least two people.')
    expect(empty.props.onPreview).not.toHaveBeenCalled()
    cleanup()

    const some = setup()
    await some.click('Split this bill')
    for (const name of ['Ben', 'Chidi', 'Dara']) {
      await some.user.click(within(some.region()).getByRole('checkbox', { name }))
    }
    await some.click('Calculate shares')
    expect(within(some.region()).getByRole('alert')).toHaveTextContent('Choose at least two people.')
    expect(some.props.onPreview).not.toHaveBeenCalled()
  })

  it('waits for the housemates to load and offers a retry when they fail', async () => {
    const loading = setup({ housemates: undefined })
    await loading.click('Split this bill')
    expect(loading.region()).toHaveTextContent('Loading your housemates…')
    expect(within(loading.region()).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(loading.region()).getByRole('button', { name: 'Calculate shares' })).toBeDisabled()
    cleanup()

    const failed = setup({ housemates: undefined, housematesFailed: true })
    await failed.click('Split this bill')
    expect(failed.region()).toHaveTextContent('Your housemates could not be loaded.')
    await failed.click('Load latest')
    expect(failed.props.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('adds and removes housemates', async () => {
    const { props, region, rerender, user, click } = setup()
    await click('Split this bill')
    await user.type(within(region()).getByLabelText('Add a housemate'), 'Eoin')
    await click('Add')
    expect(props.onAddHousemate).toHaveBeenCalledWith('Eoin')
    expect(within(region()).getByLabelText('Add a housemate')).toHaveValue('')

    rerender({ housemates: [...four, person('h5', 'Eoin', 5)] })
    expect(within(region()).getByRole('checkbox', { name: 'Eoin' })).toBeChecked()

    await click('Remove Ben')
    expect(props.onRemoveHousemate).toHaveBeenCalledWith('h2')
  })

  it('blank, long and duplicate names are explained', async () => {
    const { props, region, user, click } = setup()
    await click('Split this bill')
    const input = () => within(region()).getByLabelText('Add a housemate')

    await user.type(input(), '   ')
    await click('Add')
    expect(within(region()).getByRole('alert')).toHaveTextContent('Enter a name.')
    await user.clear(input())
    await user.type(input(), 'x'.repeat(41))
    await click('Add')
    expect(within(region()).getByRole('alert')).toHaveTextContent('Use 40 characters or fewer.')
    expect(props.onAddHousemate).not.toHaveBeenCalled()

    await user.clear(input())
    await user.type(input(), 'ß'.repeat(40))
    await click('Add')
    expect(props.onAddHousemate).toHaveBeenCalledWith('ß'.repeat(40))

    vi.mocked(props.onAddHousemate).mockRejectedValueOnce(conflict('duplicate_label'))
    await user.type(input(), 'Aoife')
    await click('Add')
    expect(await within(region()).findByRole('alert')).toHaveTextContent('That name is already in your list.')

    vi.mocked(props.onAddHousemate).mockRejectedValueOnce(conflict('too_many_housemates'))
    await user.clear(input())
    await user.type(input(), 'Zed')
    await click('Add')
    expect(await within(region()).findByRole('alert')).toHaveTextContent('You can save up to 12 housemates.')
  })

  it('exact division and a single leftover cent are worded correctly', async () => {
    const exact = setup({ onPreview: vi.fn(async () => ({ ...preview, remainder_cents: 0 })) })
    await exact.click('Split this bill')
    await exact.click('Calculate shares')
    expect(exact.region()).toHaveTextContent('The total divides exactly.')
    cleanup()

    const one = setup({ onPreview: vi.fn(async () => ({ ...preview, remainder_cents: 1 })) })
    await one.click('Split this bill')
    await one.click('Calculate shares')
    expect(one.region()).toHaveTextContent('1 leftover cent went to the first person in this order.')
  })

  it('a saved split reopens with its order, rule and total', () => {
    const { region } = setup({ split: saved })
    expect(region()).toHaveTextContent('Saved · split 1 · 12 November 2026')
    expect(region()).toHaveTextContent('Equal split of €123.47 from revision 1')
    expect(within(region()).getAllByRole('listitem')).toHaveLength(4)
    expect(region()).toHaveTextContent('3 leftover cents went one each to the first 3 people in this order.')
    expect(region()).toHaveTextContent('Contributions total €123.47.')
    expect(within(region()).getByRole('button', { name: 'Split again' })).toBeInTheDocument()
    expect(region()).not.toHaveTextContent('was not recalculated')
  })

  it('a split from an older revision is shown as stale and not recalculated', () => {
    const { region } = setup({ confirmed: confirmed2, split: { ...saved, stale: true } })
    expect(region()).toHaveTextContent(
      'The confirmed bill is now revision 2 (€126.50). This split uses revision 1 and was not recalculated.',
    )
    expect(within(region()).getAllByRole('listitem')[0]).toHaveTextContent('€30.87')
    expect(region()).toHaveTextContent('Contributions total €123.47.')
  })

  it('the save carries the revision and split captured when splitting started', async () => {
    const { props, region, rerender, click } = setup({ split: saved })
    await click('Split again')
    rerender({ confirmed: confirmed2, split: { ...saved, split_number: 2 } })
    expect(region()).toHaveTextContent('Splitting €123.47 from revision 1')
    await click('Calculate shares')
    expect(props.onPreview).toHaveBeenCalledWith(expect.objectContaining({ bill_revision: 1 }))
    await click('Save split')
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ bill_revision: 1, base_split: 1 }))
  })

  it('splitting again starts from the people in the saved split', async () => {
    const twoOnly: BillSplit = {
      ...saved,
      shares: [saved.shares[0], saved.shares[2]],
    }
    const { region, click } = setup({ split: twoOnly })
    await click('Split again')
    const ticked = (name: string) => within(region()).getByRole('checkbox', { name })
    expect(ticked('Aoife')).toBeChecked()
    expect(ticked('Chidi')).toBeChecked()
    expect(ticked('Ben')).not.toBeChecked()
    expect(ticked('Dara')).not.toBeChecked()
  })

  it('a successful save shows the returned split and then refreshes', async () => {
    const { props, region, click } = setup()
    await click('Split this bill')
    await click('Calculate shares')
    await click('Save split')
    expect(region()).toHaveTextContent('Saved · split 1')
    expect(within(region()).getAllByRole('listitem')).toHaveLength(4)
    expect(region()).toHaveTextContent('Contributions total €123.47.')
    expect(props.onRefresh).toHaveBeenCalledTimes(1)
    expect(within(region()).queryByRole('status')).toBeNull()
  })

  it('a successful save is shown even when the refresh fails', async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error('down'))
    const { props, region, click } = setup({ onRefresh })
    await click('Split this bill')
    await click('Calculate shares')
    await click('Save split')
    expect(region()).toHaveTextContent('Saved · split 1')
    expect(region()).not.toHaveTextContent('Not split yet')
    expect(within(region()).getAllByRole('listitem')).toHaveLength(4)
    expect(within(region()).getByRole('status')).toHaveTextContent(
      'The split was saved. The rest of this page could not be refreshed and may be out of date.',
    )
    expect(props.onSave).toHaveBeenCalledTimes(1)

    onRefresh.mockResolvedValue(undefined)
    await click('Refresh')
    expect(within(region()).queryByRole('status')).toBeNull()
    expect(region()).toHaveTextContent('Saved · split 1')
  })

  it('a conflict with a successful reload shows the fresh data and explains', async () => {
    const onSave = vi.fn().mockRejectedValue(conflict('split_changed'))
    const holder: { rerender?: (changes: Partial<Props>) => void } = {}
    const onRefresh = vi.fn(async () => holder.rerender?.({ split: saved }))
    const s = setup({ onSave, onRefresh })
    holder.rerender = s.rerender
    await s.click('Split this bill')
    await s.click('Calculate shares')
    await s.click('Save split')
    expect(within(s.region()).getByRole('alert')).toHaveTextContent(
      'Another split was saved while you were reviewing. Nothing was saved. The latest version is shown here.',
    )
    expect(s.region()).toHaveTextContent('Saved · split 1')
    expect(screen.queryByText('Confirm this split')).toBeNull()
  })

  it('a changed bill revision reloads and explains', async () => {
    const onSave = vi.fn().mockRejectedValue(conflict('revision_changed'))
    const holder: { rerender?: (changes: Partial<Props>) => void } = {}
    const onRefresh = vi.fn(async () => holder.rerender?.({ confirmed: confirmed2 }))
    const s = setup({ onSave, onRefresh })
    holder.rerender = s.rerender
    await s.click('Split this bill')
    await s.click('Calculate shares')
    await s.click('Save split')
    expect(within(s.region()).getByRole('alert')).toHaveTextContent(
      'The confirmed bill changed while you were splitting it.',
    )
    expect(s.region()).toHaveTextContent('Not split yet')
    expect(within(s.region()).getByRole('button', { name: 'Split this bill' })).toBeInTheDocument()
  })

  async function reachBlockedReview(extra: Partial<Props> = {}) {
    const onPreview = vi.fn(async () => THREE_SHARE_PREVIEW)
    const onSave = vi.fn().mockRejectedValueOnce(conflict('revision_changed')).mockResolvedValue(saved)
    const onRefresh = vi.fn().mockRejectedValue(new Error('down'))
    const s = setup({ onPreview, onSave, onRefresh, ...extra })
    await s.click('Split this bill')
    await s.user.click(within(s.region()).getByRole('checkbox', { name: 'Dara' }))
    await s.click('Calculate shares')
    await s.click('Save split')
    return { ...s, onPreview, onSave, onRefresh }
  }

  const BLOCKED_ALERT =
    'The confirmed bill changed while you were splitting it. Nothing was saved. ' +
    'The latest version could not be loaded, so your selection has been kept.'

  it('a conflict with a failed reload keeps the draft and blocks saving', async () => {
    const { region } = await reachBlockedReview()
    expect(within(region()).getByRole('alert')).toHaveTextContent(BLOCKED_ALERT)
    expect(screen.getByText('Confirm this split')).toBeInTheDocument()
    expect(within(region()).getAllByRole('listitem')).toHaveLength(3)
    expect(within(region()).getByRole('button', { name: 'Save split' })).toBeDisabled()
    expect(within(region()).getByRole('button', { name: 'Load latest' })).toBeInTheDocument()
    expect(region()).not.toHaveTextContent('The latest version is shown here.')
  })

  it('load latest can be retried, then the owner recalculates before saving again', async () => {
    const { props, region, rerender, click, onPreview, onSave, onRefresh } = await reachBlockedReview()
    void props
    await click('Load latest')
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'The latest version still could not be loaded. Try again.',
    )
    expect(within(region()).getByRole('alert').textContent).toMatch(/Nothing was saved\./)
    expect(within(region()).getByRole('button', { name: 'Save split' })).toBeDisabled()

    onRefresh.mockImplementation(async () => rerender({ confirmed: confirmed2 }))
    await click('Load latest')
    expect(region()).toHaveTextContent('Splitting €126.50 from revision 2')
    const ticked = (name: string) => within(region()).getByRole('checkbox', { name })
    expect(ticked('Aoife')).toBeChecked()
    expect(ticked('Ben')).toBeChecked()
    expect(ticked('Chidi')).toBeChecked()
    expect(ticked('Dara')).not.toBeChecked()
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'The latest version is loaded and your selection has been kept. Calculate the shares again.',
    )
    expect(within(region()).queryByRole('button', { name: 'Save split' })).toBeNull()

    await click('Calculate shares')
    expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ bill_revision: 2 }))
    await click('Save split')
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ bill_revision: 2 }))
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('a reloaded roster drops people who were removed', async () => {
    const { region, rerender, click, onRefresh } = await reachBlockedReview()
    onRefresh.mockImplementation(async () =>
      rerender({ confirmed: confirmed2, housemates: [four[0], four[2], four[3]] }),
    )
    await click('Load latest')
    expect(within(region()).queryByRole('checkbox', { name: 'Ben' })).toBeNull()
    expect(within(region()).getByRole('checkbox', { name: 'Aoife' })).toBeChecked()
    expect(within(region()).getByRole('checkbox', { name: 'Chidi' })).toBeChecked()
  })

  it('a preview conflict follows the same two paths', async () => {
    const holder: { rerender?: (changes: Partial<Props>) => void } = {}
    const resolved = setup({
      onPreview: vi.fn().mockRejectedValue(conflict('unknown_housemate')),
      onRefresh: vi.fn(async () => holder.rerender?.({})),
    })
    holder.rerender = resolved.rerender
    await resolved.click('Split this bill')
    await resolved.click('Calculate shares')
    expect(within(resolved.region()).getByRole('alert')).toHaveTextContent(
      'Someone you selected is no longer in your list. Nothing was saved. The latest version is shown here.',
    )
    expect(resolved.region()).toHaveTextContent('Not split yet')
    cleanup()

    const failed = setup({
      onPreview: vi.fn().mockRejectedValue(conflict('unknown_housemate')),
      onRefresh: vi.fn().mockRejectedValue(new Error('down')),
    })
    await failed.click('Split this bill')
    await failed.user.click(within(failed.region()).getByRole('checkbox', { name: 'Ben' }))
    await failed.click('Calculate shares')
    expect(within(failed.region()).getByRole('checkbox', { name: 'Aoife' })).toBeChecked()
    expect(within(failed.region()).getByRole('checkbox', { name: 'Ben' })).not.toBeChecked()
    expect(within(failed.region()).getByRole('button', { name: 'Calculate shares' })).toBeDisabled()
    expect(within(failed.region()).getByRole('button', { name: 'Load latest' })).toBeInTheDocument()
  })

  it('a conflict without a reason code uses the general wording', async () => {
    const s = setup({ onSave: vi.fn().mockRejectedValue(new ApiError(409, 'changed')) })
    await s.click('Split this bill')
    await s.click('Calculate shares')
    await s.click('Save split')
    expect(within(s.region()).getByRole('alert')).toHaveTextContent(
      /^This bill changed while you were splitting it\./,
    )
  })

  it('other errors keep the selection and do not reload', async () => {
    const calc = setup({ onPreview: vi.fn().mockRejectedValue(new Error('network')) })
    await calc.click('Split this bill')
    await calc.click('Calculate shares')
    expect(within(calc.region()).getByRole('alert')).toHaveTextContent('Could not calculate the shares. Try again.')
    expect(within(calc.region()).getAllByRole('checkbox')).toHaveLength(4)
    expect(calc.props.onRefresh).not.toHaveBeenCalled()
    cleanup()

    const save = setup({ onSave: vi.fn().mockRejectedValue(new Error('network')) })
    await save.click('Split this bill')
    await save.click('Calculate shares')
    await save.click('Save split')
    expect(within(save.region()).getByRole('alert')).toHaveTextContent('Could not save. Try again.')
    expect(save.region()).toHaveTextContent('€30.87')
    expect(save.props.onRefresh).not.toHaveBeenCalled()
  })

  it('disables Save split while the save is pending', async () => {
    const onSave = vi.fn(() => new Promise<BillSplit>(() => {}))
    const { region, click } = setup({ onSave })
    await click('Split this bill')
    await click('Calculate shares')
    await click('Save split')
    expect(within(region()).getByRole('button', { name: 'Save split' })).toBeDisabled()
    await userEvent.setup().click(within(region()).getByRole('button', { name: 'Save split' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('cancel leaves nothing saved', async () => {
    const { props, region, click } = setup()
    await click('Split this bill')
    await click('Cancel')
    expect(region()).toHaveTextContent('Not split yet')
    expect(props.onPreview).not.toHaveBeenCalled()
    expect(props.onSave).not.toHaveBeenCalled()
  })
})
