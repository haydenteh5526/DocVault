import type { Document } from '@/lib/api'
import { StatusTag } from './StatusTag'
export function attentionReason(detail?: Document): string | null {
  if (detail?.reminder_proposals?.some(p => p.status === 'pending' && !p.inputs_changed)) return 'Reminder awaiting approval'
  if (detail?.bill_split?.stale) return 'Split out of date'
  if (detail?.bill_review && !detail.confirmed_bill) return 'Needs confirming'
  return null
}

type Tone = 'neutral' | 'attention' | 'danger'

function statusOf(doc: Document, detail?: Document): { label: string; tone: Tone } {
  if (doc.processing_status === 'failed') return { label: 'Could not read this file', tone: 'danger' }
  if (doc.processing_status && doc.processing_status !== 'complete') return { label: 'Reading the text', tone: 'neutral' }
  if (!detail) return { label: 'Checking status', tone: 'neutral' }
  const reason = attentionReason(detail)
  if (reason) return { label: reason, tone: 'attention' }
  return { label: detail.confirmed_bill ? 'Confirmed · revision ' + detail.confirmed_bill.revision_number : 'Ready', tone: 'neutral' }
}

/** The text DocumentStatus shows, so the list and its filters cannot drift apart. */
export function statusLabel(doc: Document, detail?: Document): string {
  return statusOf(doc, detail).label
}

export function DocumentStatus({ doc, detail }: {doc: Document; detail?: Document}) {
  const { label, tone } = statusOf(doc, detail)
  return <StatusTag tone={tone}>{label}</StatusTag>
}
