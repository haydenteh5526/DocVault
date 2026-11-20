import { useQuery } from '@tanstack/react-query'
import { getDocument, type Document } from './api'

export function useBillRecords(allDocs: Document[]) {
  const completeIds = allDocs.filter((d) => d.processing_status === 'complete').map((d) => d.id)
  return useQuery({
    queryKey: ['document-list-status', completeIds],
    enabled: completeIds.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const records: Record<string, Document> = {}
      for (let start = 0; start < completeIds.length; start += 6) {
        if (signal.aborted) break
        const batch = await Promise.all(
          completeIds.slice(start, start + 6).map(async (id) => [id, await getDocument(id)] as const),
        )
        for (const [id, record] of batch) if (record.id) records[id] = record
      }
      return records
    },
  })
}
