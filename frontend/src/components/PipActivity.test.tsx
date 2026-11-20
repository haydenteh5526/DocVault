// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PipActivity } from './PipActivity'
import type { usePipActivity } from '@/lib/usePipActivity'
import type { Document, ReminderProposal } from '@/lib/api'

afterEach(cleanup)
const empty: ReturnType<typeof usePipActivity> = {
  pending: [], upcoming: [], warranties: [], people: [], householdBill: undefined, status: 'All caught up',
}
it('omits groups without records', () => {
  render(<MemoryRouter><PipActivity activity={empty}/></MemoryRouter>)
  expect(screen.queryByRole('heading')).toBeNull()
})
it('shows the exact pending details and routes both actions to the bill', () => {
  const doc = {id:'october',title:'October electricity bill'} as Document
  const proposal = {id:'p1', details:{bill_revision:2,amount_due:'123.47',due_date:'2026-11-23',remind_on:'2026-11-21',
    split:{split_number:3,total:'123.47',shares:[{housemate_id:'a',label:'Aoife',amount:'30.87'}]}}} as ReminderProposal
  render(<MemoryRouter><PipActivity activity={{...empty,pending:[{doc,proposal}]}}/></MemoryRouter>)
  const card = within(screen.getByRole('article'))
  expect(card.getByText(/Remind on/)).toHaveTextContent('21 November 2026')
  expect(card.getByText(/€123.47/)).toHaveTextContent('23 November 2026')
  expect(card.getByText(/Revision 2/)).toHaveTextContent('Split 3')
  expect(card.getByText(/Aoife/)).toHaveTextContent('€30.87')
  expect(card.getByRole('link',{name:'Open bill to see its status'})).toHaveAttribute('href','/app/documents/october')
  expect(card.getByRole('link',{name:'Review in bill'})).toHaveAttribute('href','/app/documents/october#bill-reminder-heading')
  expect(card.queryByRole('button')).toBeNull()
})
