import { describe, it, expect } from 'vitest'
import type { Document } from './api'
import { queryClient } from './queryClient'

const record = (confirmed: boolean) =>
  ({ id: 'x', title: 'Bill', confirmed_bill: confirmed ? { revision_number: 1 } : null, bill_split: null, reminder_proposals: [] }) as unknown as Document

describe('the shared query client (N-1)', () => {
  it('marks the Documents status stale when a document changes what the list shows', () => {
    queryClient.setQueryData(['document-list-status', ['x']], { x: record(false) })
    queryClient.setQueryData(['document', 'x'], record(false))
    expect(queryClient.getQueryState(['document-list-status', ['x']])?.isInvalidated).toBe(false)
    queryClient.setQueryData(['document', 'x'], record(true))
    expect(queryClient.getQueryState(['document-list-status', ['x']])?.isInvalidated).toBe(true)
  })
})
