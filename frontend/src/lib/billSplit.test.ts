import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { BillSplit, Document, Housemate } from './api'
import { refreshBillData, storeHousemates, storeSavedSplit } from './billSplit'

const aoife: Housemate = { id: 'h1', label: 'Aoife', position: 1, created_at: '2026-11-12T10:00:00' }
const eoin: Housemate = { id: 'h5', label: 'Eoin', position: 5, created_at: '2026-11-12T10:00:00' }

const split: BillSplit = {
  id: 's1',
  document_id: 'doc-1',
  split_number: 1,
  stale: false,
  created_at: '2026-11-12T10:00:00',
  bill_revision: 1,
  rule: 'equal',
  total: '123.47',
  remainder_cents: 3,
  shares: [{ housemate_id: 'h1', label: 'Aoife', amount: '30.87' }],
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } } })
}

async function seeded() {
  const qc = makeClient()
  const doc = vi.fn(async () => ({ id: 'doc-1', title: 'Bill' }) as Document)
  const a1 = vi.fn(async () => [aoife])
  const b1 = vi.fn(async () => [] as Housemate[])
  await qc.prefetchQuery({ queryKey: ['document', 'doc-1'], queryFn: doc })
  await qc.prefetchQuery({ queryKey: ['housemates', 'a1'], queryFn: a1 })
  await qc.prefetchQuery({ queryKey: ['housemates', 'b1'], queryFn: b1 })
  return { qc, doc, a1, b1 }
}

describe('refreshBillData', () => {
  it('resolves when the document and the housemates both reload', async () => {
    const { qc, doc, a1 } = await seeded()
    await expect(refreshBillData(qc, 'doc-1', 'a1')).resolves.toBeUndefined()
    expect(doc).toHaveBeenCalledTimes(2)
    expect(a1).toHaveBeenCalledTimes(2)
  })

  it('rejects when the document cannot be reloaded', async () => {
    const { qc, doc } = await seeded()
    doc.mockRejectedValue(new Error('down'))
    await expect(refreshBillData(qc, 'doc-1', 'a1')).rejects.toThrow()
  })

  it('rejects when the housemates cannot be reloaded', async () => {
    const { qc, doc, a1 } = await seeded()
    a1.mockRejectedValue(new Error('down'))
    await expect(refreshBillData(qc, 'doc-1', 'a1')).rejects.toThrow()
    expect(doc).toHaveBeenCalledTimes(2)
  })

  it('reloads the housemates of the given account only', async () => {
    const { qc, a1, b1 } = await seeded()
    await refreshBillData(qc, 'doc-1', 'a1')
    expect(a1).toHaveBeenCalledTimes(2)
    expect(b1).toHaveBeenCalledTimes(1)
  })
})

describe('storeSavedSplit', () => {
  it('stores a saved split in the cached document', () => {
    const qc = makeClient()
    qc.setQueryData(['document', 'doc-1'], { id: 'doc-1', title: 'Bill', bill_split: null })
    storeSavedSplit(qc, 'doc-1', split)
    expect(qc.getQueryData<Document>(['document', 'doc-1'])).toEqual({ id: 'doc-1', title: 'Bill', bill_split: split })
  })

  it('creates nothing when no document is cached', () => {
    const qc = makeClient()
    storeSavedSplit(qc, 'doc-1', split)
    expect(qc.getQueryData(['document', 'doc-1'])).toBeUndefined()
  })
})

describe('storeHousemates', () => {
  it("stores an added and a removed housemate under the account's key", () => {
    const qc = makeClient()
    qc.setQueryData(['housemates', 'a1'], [aoife])
    qc.setQueryData(['housemates', 'b1'], [])
    storeHousemates(qc, 'a1', list => [...list, eoin])
    expect(qc.getQueryData(['housemates', 'a1'])).toEqual([aoife, eoin])
    storeHousemates(qc, 'a1', list => list.filter(h => h.id !== 'h1'))
    expect(qc.getQueryData(['housemates', 'a1'])).toEqual([eoin])
    expect(qc.getQueryData(['housemates', 'b1'])).toEqual([])
  })
})
