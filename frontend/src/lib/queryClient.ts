import { QueryClient } from '@tanstack/react-query'

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
