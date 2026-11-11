import type { QueryClient } from '@tanstack/react-query'
import { confirmBill, type BillConfirmation } from './api'

/**
 * Save a bill confirmation, then refetch the document whatever the outcome, so
 * the caller sees the result or the error only once fresh data is in the cache.
 */
export async function confirmBillAndRefresh(
  queryClient: QueryClient,
  documentId: string,
  body: BillConfirmation,
): Promise<void> {
  try {
    await confirmBill(documentId, body)
  } finally {
    await queryClient.refetchQueries({ queryKey: ['document', documentId] })
  }
}
