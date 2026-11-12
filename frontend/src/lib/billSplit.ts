import { onlineManager, type QueryClient } from '@tanstack/react-query'
import type { BillSplit, Document, Housemate } from './api'
import { housematesKey } from './housemates'

/**
 * Reload the document and this account's housemates. Rejects if either reload fails,
 * so a caller can only say "the latest data is shown" when both really loaded.
 */
export async function refreshBillData(
  queryClient: QueryClient,
  documentId: string,
  accountId: string | null,
): Promise<void> {
  // While offline, refetchQueries resolves without fetching; that must not count as a reload.
  if (!onlineManager.isOnline()) throw new Error('You are offline, so the latest data could not be loaded.')
  const keys = [['document', documentId], housematesKey(accountId)]
  const loadsBefore = keys.map(key => queryClient.getQueryState(key)?.dataUpdateCount ?? 0)
  await Promise.all(keys.map(queryKey => queryClient.refetchQueries({ queryKey }, { throwOnError: true })))
  keys.forEach((key, index) => {
    const state = queryClient.getQueryState(key)
    if (!state || state.status !== 'success' || state.dataUpdateCount <= loadsBefore[index]) {
      throw new Error('The latest data could not be loaded.')
    }
  })
}

/** Put a split returned by a successful save into the cached document, so it survives a failed reload. */
export function storeSavedSplit(queryClient: QueryClient, documentId: string, split: BillSplit): void {
  queryClient.setQueryData<Document>(['document', documentId], doc => doc && { ...doc, bill_split: split })
}

export function storeHousemates(
  queryClient: QueryClient,
  accountId: string | null,
  update: (list: Housemate[]) => Housemate[],
): void {
  queryClient.setQueryData<Housemate[]>(housematesKey(accountId), list => update(list ?? []))
}
