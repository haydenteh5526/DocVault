import { useQuery } from '@tanstack/react-query'
import { getDocument, type Document } from './api'

export function useBillRecords(allDocs: Document[], enabled = true) {
  const completeIds = allDocs.filter((d) => d.processing_status === 'complete').map((d) => d.id)
  return useQuery({
    queryKey: ['document-list-status', completeIds],
    enabled: enabled && completeIds.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const records: Record<string, Document> = {}
      let failed = 0
      for (let start = 0; start < completeIds.length; start += 6) {
        if (signal.aborted) break
        const batch = await Promise.allSettled(
          completeIds.slice(start, start + 6).map(async (id) => [id, await getDocument(id)] as const),
        )
        for (const result of batch) {
          if (result.status === 'fulfilled') {
            const [id, record] = result.value
            if (record.id) records[id] = record
          } else {
            failed += 1
          }
        }
      }
      if (failed > 0 && failed === completeIds.length) throw new Error('Could not load any bill')
      return records
    },
  })
}
