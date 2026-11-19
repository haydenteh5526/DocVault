import { QueryClient } from '@tanstack/react-query'
import { syncDocumentStatus } from './documentStatusSync'

/**
 * Shared React Query client. Defaults tuned for a document app:
 * - staleTime 30s so quick navigations don't refetch constantly
 * - one retry (the api layer already handles 401 refresh + redirect)
 * - no refetch on window focus (avoids surprising reloads mid-task)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// The Documents list keeps each document's status; refresh it when a document's own page changes it.
const stopStatusSync = syncDocumentStatus(queryClient)
if (import.meta.hot) import.meta.hot.dispose(stopStatusSync)
