import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Document, ReminderDetails, ReminderProposal } from './api'
import { storeReminderProposal } from './billReminder'

const details: ReminderDetails = {
  bill_revision: 1,
  amount_due: '123.47',
  due_date: '2026-11-23',
  billing_period_start: '2026-10-01',
  billing_period_end: '2026-10-31',
  days_before_due: 2,
  remind_on: '2026-11-21',
  split: null,
}

function proposal(number: number, status: ReminderProposal['status'] = 'pending'): ReminderProposal {
  return {
    id: `p${number}`,
    document_id: 'doc-1',
    proposal_number: number,
    action: 'bill_reminder',
    source: 'owner',
    status,
    inputs_changed: null,
    details,
    reminder: null,
    history: [],
    created_at: '2026-11-12T10:00:00',
    decided_at: null,
  }
}

function makeClient(doc?: Partial<Document>) {
  const qc = new QueryClient()
  if (doc) qc.setQueryData(['document', 'doc-1'], { id: 'doc-1', title: 'Bill', ...doc })
  return qc
}

describe('storeReminderProposal', () => {
  it('adds a new proposal at the front', () => {
    const qc = makeClient({ reminder_proposals: [proposal(1)] })
    storeReminderProposal(qc, 'doc-1', proposal(2))
    const doc = qc.getQueryData<Document>(['document', 'doc-1'])
    expect(doc?.reminder_proposals?.map(p => p.proposal_number)).toEqual([2, 1])
    expect(doc?.title).toBe('Bill')
    expect(doc?.id).toBe('doc-1')
  })

  it('replaces a proposal that changed status', () => {
    const qc = makeClient({ reminder_proposals: [proposal(1)] })
    storeReminderProposal(qc, 'doc-1', proposal(1, 'saved'))
    const list = qc.getQueryData<Document>(['document', 'doc-1'])?.reminder_proposals
    expect(list).toHaveLength(1)
    expect(list?.[0].status).toBe('saved')
  })

  it('does nothing without a cached document', () => {
    const qc = makeClient()
    storeReminderProposal(qc, 'doc-1', proposal(1))
    expect(qc.getQueryData(['document', 'doc-1'])).toBeUndefined()
  })

  it('starts the list when the document has none', () => {
    const qc = makeClient()
    qc.setQueryData(['document', 'doc-1'], { id: 'doc-1', title: 'Bill' })
    storeReminderProposal(qc, 'doc-1', proposal(1))
    expect(qc.getQueryData<Document>(['document', 'doc-1'])?.reminder_proposals?.map(p => p.id)).toEqual(['p1'])
  })
})
