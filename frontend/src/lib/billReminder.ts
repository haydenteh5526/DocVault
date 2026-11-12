import type { QueryClient } from '@tanstack/react-query'
import type { Document, ReminderProposal } from './api'

/**
 * Put a proposal returned by a successful call into the cached document, so it survives a failed reload.
 * Replaces the proposal with the same id or adds it, keeping the list newest first.
 */
export function storeReminderProposal(queryClient: QueryClient, documentId: string, proposal: ReminderProposal): void {
  queryClient.setQueryData<Document>(['document', documentId], doc => {
    if (!doc) return doc
    const others = (doc.reminder_proposals ?? []).filter(item => item.id !== proposal.id)
    const reminder_proposals = [proposal, ...others].sort((a, b) => b.proposal_number - a.proposal_number)
    return { ...doc, reminder_proposals }
  })
}
