import type { QueryClient } from '@tanstack/react-query'
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
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ['document', documentId] }, { throwOnError: true }),
    queryClient.refetchQueries({ queryKey: housematesKey(accountId) }, { throwOnError: true }),
  ])
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
