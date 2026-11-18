import { onlineManager, type QueryClient } from '@tanstack/react-query'
import { confirmBill, type BillConfirmation, type BillRevision, type Document } from './api'

/** The confirmation was saved, but the document could not be reloaded afterwards. */
export class ReloadFailedError extends Error {
  readonly revision: BillRevision

  constructor(revision: BillRevision) {
    super('The confirmation was saved, but the latest version could not be loaded.')
    this.name = 'ReloadFailedError'
    this.revision = revision
  }
}

/** Put a revision returned by a successful save into the cached document, so it survives a failed reload. */
export function storeConfirmedRevision(queryClient: QueryClient, documentId: string, revision: BillRevision): void {
  queryClient.setQueryData<Document>(['document', documentId], doc => doc && { ...doc, confirmed_bill: revision })
}

/**
 * Refetch the document and reject unless it really loaded. While offline,
 * refetchQueries resolves without fetching; that must not count as a reload.
 */
export async function reloadDocument(queryClient: QueryClient, documentId: string): Promise<void> {
  const queryKey = ['document', documentId]
  if (!onlineManager.isOnline()) throw new Error('You are offline, so the latest data could not be loaded.')
  const loadsBefore = queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0
  await queryClient.refetchQueries({ queryKey }, { throwOnError: true })
  const state = queryClient.getQueryState(queryKey)
  if (!state || state.status !== 'success' || state.dataUpdateCount <= loadsBefore) {
    throw new Error('The latest data could not be loaded.')
  }
}

/**
 * Save a bill confirmation, then reload the document, so the caller sees the
 * result or the error only once fresh data is in the cache.
 *
 * - A rejected save still refetches the document before the error is rethrown
 *   (the 409 conflict path relies on that).
 * - A saved confirmation is written into the cache before the reload. If the
 *   reload fails, a ReloadFailedError carries the saved revision.
 */
export async function confirmBillAndRefresh(
  queryClient: QueryClient,
  documentId: string,
  body: BillConfirmation,
): Promise<BillRevision> {
  let revision: BillRevision
  try {
    revision = await confirmBill(documentId, body)
  } catch (error) {
    await queryClient.refetchQueries({ queryKey: ['document', documentId] })
    throw error
  }
  storeConfirmedRevision(queryClient, documentId, revision)
  try {
    await reloadDocument(queryClient, documentId)
  } catch {
    throw new ReloadFailedError(revision)
  }
  return revision
}
