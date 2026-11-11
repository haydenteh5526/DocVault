import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { ApiError, confirmBill, type BillConfirmation, type BillRevision } from './api'
import { confirmBillAndRefresh } from './billConfirm'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  confirmBill: vi.fn(),
}))

const field = { value: null, sources: [] }
const body: BillConfirmation = {
  amount_due: '125.00',
  due_date: '2026-11-23',
  billing_period_start: '2026-10-01',
  billing_period_end: '2026-10-31',
  reviewed: { amount_due: field, due_date: field, billing_period: field },
  base_revision: 0,
}

afterEach(() => vi.clearAllMocks())

describe('confirmBillAndRefresh', () => {
  it('refetches the document after a successful save', async () => {
    const queryClient = new QueryClient()
    const refetch = vi.spyOn(queryClient, 'refetchQueries')
    vi.mocked(confirmBill).mockResolvedValue({} as BillRevision)

    await expect(confirmBillAndRefresh(queryClient, 'doc-1', body)).resolves.toBeUndefined()

    expect(confirmBill).toHaveBeenCalledWith('doc-1', body)
    expect(refetch).toHaveBeenCalledOnce()
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['document', 'doc-1'] })
  })

  it('refetches the document before reporting a conflict', async () => {
    const queryClient = new QueryClient()
    let refetched = false
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      refetched = true
    })
    const error = new ApiError(409, 'changed', 'transcript_changed')
    vi.mocked(confirmBill).mockRejectedValue(error)

    let refetchedWhenRejected: boolean | undefined
    const outcome = await confirmBillAndRefresh(queryClient, 'doc-1', body).catch((reason: unknown) => {
      refetchedWhenRejected = refetched
      return reason
    })

    expect(outcome).toBe(error)
    expect(refetchedWhenRejected).toBe(true)
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['document', 'doc-1'] })
  })
})
