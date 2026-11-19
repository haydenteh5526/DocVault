import type { Document } from '@/lib/api'
import { StatusTag } from './StatusTag'
export function attentionReason(detail?: Document): string | null {
  if (detail?.reminder_proposals?.some(p => p.status === 'pending' && !p.inputs_changed)) return 'Reminder awaiting approval'
  if (detail?.bill_split?.stale) return 'Split out of date'
  if (detail?.bill_review && !detail.confirmed_bill) return 'Needs confirming'
  return null
}

export function DocumentStatus({ doc, detail }: {doc: Document; detail?: Document}) {
  if (doc.processing_status === 'failed') return <StatusTag tone="danger">Could not read this file</StatusTag>
  if (doc.processing_status && doc.processing_status !== 'complete') return <StatusTag tone="neutral">Reading the text</StatusTag>
  if (!detail) return <StatusTag tone="neutral">Checking status</StatusTag>
  const reason = attentionReason(detail)
  if (reason) return <StatusTag tone="attention">{reason}</StatusTag>
  return <StatusTag tone="neutral">{detail.confirmed_bill ? 'Confirmed · revision ' + detail.confirmed_bill.revision_number : 'Ready'}</StatusTag>
}
