import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { ApiError, confirmBill, type BillConfirmation, type BillRevision, type Document } from './api'
import { ReloadFailedError, confirmBillAndRefresh } from './billConfirm'

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

function revision(n: number): BillRevision {
  return { id: `rev-${n}`, document_id: 'doc-1', revision_number: n } as BillRevision
}

/** A client whose cached document can really be refetched. */
function clientWithDocument(load: () => Promise<Document>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryDefaults(['document', 'doc-1'], { queryFn: load })
  queryClient.setQueryData(['document', 'doc-1'], { id: 'doc-1', confirmed_bill: null } as Document)
  return queryClient
}

afterEach(() => {
  vi.clearAllMocks()
  onlineManager.setOnline(true)
})

describe('confirmBillAndRefresh', () => {
  it('stores the saved revision and reloads the document after a successful save', async () => {
    const load = vi.fn(async () => ({ id: 'doc-1', confirmed_bill: revision(2) }) as Document)
    const queryClient = clientWithDocument(load)
    const refetch = vi.spyOn(queryClient, 'refetchQueries')
    vi.mocked(confirmBill).mockResolvedValue(revision(2))

    await expect(confirmBillAndRefresh(queryClient, 'doc-1', body)).resolves.toEqual(revision(2))

    expect(confirmBill).toHaveBeenCalledWith('doc-1', body)
    expect(refetch).toHaveBeenCalledOnce()
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['document', 'doc-1'] }, { throwOnError: true })
    expect(load).toHaveBeenCalledOnce()
  })

  it('a saved confirmation survives a failed reload', async () => {
    const queryClient = clientWithDocument(async () => { throw new Error('down') })
    vi.mocked(confirmBill).mockResolvedValue(revision(2))

    const outcome = await confirmBillAndRefresh(queryClient, 'doc-1', body).catch((reason: unknown) => reason)

    expect(outcome).toBeInstanceOf(ReloadFailedError)
    expect((outcome as ReloadFailedError).revision.revision_number).toBe(2)
    expect(queryClient.getQueryData<Document>(['document', 'doc-1'])?.confirmed_bill?.revision_number).toBe(2)
  })

  it('a reload that fetched nothing is not a reload', async () => {
    const queryClient = clientWithDocument(async () => ({ id: 'doc-1' }) as Document)
    vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined)
    vi.mocked(confirmBill).mockResolvedValue(revision(2))

    await expect(confirmBillAndRefresh(queryClient, 'doc-1', body)).rejects.toBeInstanceOf(ReloadFailedError)
  })

  it('being offline counts as a failed reload, but the save is kept', async () => {
    const queryClient = clientWithDocument(async () => ({ id: 'doc-1' }) as Document)
    onlineManager.setOnline(false)
    vi.mocked(confirmBill).mockResolvedValue(revision(2))

    await expect(confirmBillAndRefresh(queryClient, 'doc-1', body)).rejects.toBeInstanceOf(ReloadFailedError)
    expect(queryClient.getQueryData<Document>(['document', 'doc-1'])?.confirmed_bill?.revision_number).toBe(2)
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
