import type { QueryClient } from '@tanstack/react-query'
import type { Document } from './api'

/** What the Documents list shows about a bill: confirmed revision, split state, reminder proposals. */
export function statusFingerprint(doc: Partial<Document>): string {
  return JSON.stringify([
    doc.confirmed_bill?.revision_number ?? null,
    doc.bill_split ? [doc.bill_split.split_number, doc.bill_split.stale] : null,
    (doc.reminder_proposals ?? []).map(p => [p.id, p.status, p.inputs_changed]),
  ])
}

/**
 * The Documents list keeps each document's status for 30 s. Whenever a document's own page
 * changes what the list would show (a confirmed bill, a saved or stale split, a reminder
 * proposal), mark that status stale so the next visit to Documents fetches it again.
 * A change that does not touch the status (a rename, a tag) does nothing.
 * Returns the function that stops listening.
 */
export function syncDocumentStatus(client: QueryClient): () => void {
  const seen = new Map<string, string>()
  return client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey
    if (event.type !== 'updated' || key[0] !== 'document' || typeof key[1] !== 'string') return
    const data = event.query.state.data as Document | undefined
    if (!data || typeof data !== 'object') return
    const next = statusFingerprint(data)
    const previous = seen.get(key[1])
    seen.set(key[1], next)
    if (previous !== undefined && previous !== next) void client.invalidateQueries({ queryKey: ['document-list-status'] })
  })
}
