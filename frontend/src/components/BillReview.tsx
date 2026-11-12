import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, type BillConfirmation, type BillField, type BillReview, type BillRevision } from '@/lib/api'

const AMOUNT_PATTERN = /^[0-9]{1,7}\.[0-9]{2}$/

const CONFLICT_MESSAGES: Record<string, string> = {
  transcript_changed:
    'The bill text changed while you were reviewing. Nothing was saved. The values below come from the updated text.',
  revision_changed:
    'Another confirmation was saved while you were reviewing. Nothing was saved. The latest confirmed values are shown below.',
  no_bill_review: 'This document no longer produces a bill review. Nothing was saved.',
}
const DEFAULT_CONFLICT_MESSAGE =
  'This bill changed while you were reviewing. Nothing was saved. The latest version is shown below.'

interface Draft {
  amount: string
  dueDate: string
  start: string
  end: string
}

/** What the owner reviewed when editing started; the save is bound to it. */
interface Session {
  review: BillReview
  baseRevision: number
  step: 'edit' | 'compare'
}

export function BillReviewPanel({ review, confirmed, processing = false, onViewOriginal, onConfirm }: {
  review: BillReview | null
  confirmed: BillRevision | null
  processing?: boolean
  onViewOriginal: () => void
  onConfirm: (body: BillConfirmation) => Promise<void>
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [draft, setDraft] = useState<Draft>({ amount: '', dueDate: '', start: '', end: '' })
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function startSession() {
    if (!review) return
    const [start = '', end = ''] = review.billing_period.value?.split('/') ?? []
    setDraft(confirmed
      ? {
          amount: confirmed.amount_due,
          dueDate: confirmed.due_date,
          start: confirmed.billing_period_start,
          end: confirmed.billing_period_end,
        }
      : { amount: review.amount_due.value ?? '', dueDate: review.due_date.value ?? '', start, end })
    setSession({ review: structuredClone(review), baseRevision: confirmed?.revision_number ?? 0, step: 'edit' })
    setValidationError(null)
    setSaveError(null)
    setConflict(null)
  }

  function checkValues() {
    if (!session) return
    let error: string | null = null
    if (!AMOUNT_PATTERN.test(draft.amount)) error = 'Enter the amount as euros and cents, for example 123.47.'
    else if (!draft.dueDate || !draft.start || !draft.end) error = 'Enter every date.'
    else if (draft.end < draft.start) error = 'The billing period must end on or after it starts.'
    setValidationError(error)
    if (!error) setSession({ ...session, step: 'compare' })
  }

  async function confirmAndSave() {
    if (!session) return
    setSaving(true)
    setSaveError(null)
    try {
      await onConfirm({
        amount_due: draft.amount,
        due_date: draft.dueDate,
        billing_period_start: draft.start,
        billing_period_end: draft.end,
        reviewed: session.review,
        base_revision: session.baseRevision,
      })
      setSession(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The document was refetched before this rejection, so the props are fresh.
        setSession(null)
        setConflict((error.code && CONFLICT_MESSAGES[error.code]) || DEFAULT_CONFLICT_MESSAGE)
      } else {
        setSaveError('Could not save. Try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  let status: ReactNode = null
  let body: ReactNode
  if (session?.step === 'edit') {
    body = (
      <EditView
        review={session.review}
        draft={draft}
        onChange={changes => setDraft({ ...draft, ...changes })}
        error={validationError}
        onCheck={checkValues}
        onCancel={() => setSession(null)}
      />
    )
  } else if (session?.step === 'compare') {
    body = (
      <CompareView
        review={session.review}
        draft={draft}
        saving={saving}
        error={saveError}
        onConfirm={confirmAndSave}
        onBack={() => setSession({ ...session, step: 'edit' })}
      />
    )
  } else if (confirmed) {
    status = `Confirmed · revision ${confirmed.revision_number} · ${formatCreatedAt(confirmed.created_at)}`
    body = <ConfirmedView review={review} confirmed={confirmed} processing={processing} onEdit={startSession} />
  } else if (review) {
    status = 'Not confirmed yet'
    body = (
      <>
        <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <BillReviewField label="Amount due" value={review.amount_due.value} sources={review.amount_due.sources}
            display={formatAmount} />
          <BillReviewField label="Due date" value={review.due_date.value} sources={review.due_date.sources}
            display={formatBillDate} />
          <BillReviewField label="Billing period" value={review.billing_period.value}
            sources={review.billing_period.sources} display={formatPeriod} />
        </dl>
        <div>
          <Button size="sm" onClick={startSession}>Review and confirm</Button>
        </div>
      </>
    )
  } else {
    return null
  }

  return (
    <section aria-labelledby="bill-review-heading" className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="bill-review-heading" className="font-semibold">Bill review</h3>
        <Button variant="outline" size="sm" onClick={onViewOriginal}>View original bill</Button>
      </div>
      {conflict && (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{conflict}</p>
      )}
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {body}
    </section>
  )
}

function ConfirmedView({ review, confirmed, processing, onEdit }: {
  review: BillReview | null
  confirmed: BillRevision
  processing: boolean
  onEdit: () => void
}) {
  const evidence = confirmed.evidence
  const period = `${confirmed.billing_period_start}/${confirmed.billing_period_end}`
  const unchanged = review !== null && JSON.stringify(review) === JSON.stringify(evidence)
  return (
    <>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <BillReviewField label="Amount due" value={confirmed.amount_due} sources={evidence.amount_due.sources}
          display={formatAmount} note={correctedFrom(confirmed.amount_due, evidence.amount_due, formatAmount)} />
        <BillReviewField label="Due date" value={confirmed.due_date} sources={evidence.due_date.sources}
          display={formatBillDate} note={correctedFrom(confirmed.due_date, evidence.due_date, formatBillDate)} />
        <BillReviewField label="Billing period" value={period} sources={evidence.billing_period.sources}
          display={formatPeriod} note={correctedFrom(period, evidence.billing_period, formatPeriod)} />
      </dl>
      {review === null ? (
        <p className="text-sm text-muted-foreground">
          {processing
            ? 'This document is being reprocessed. These are the values and evidence you confirmed.'
            : 'The current transcript no longer produces bill candidates. These are the values and evidence you confirmed.'}
        </p>
      ) : (
        <>
          {!unchanged && <p className="text-sm text-muted-foreground">The transcript has changed since this was confirmed.</p>}
          <div>
            <Button size="sm" variant="outline" onClick={onEdit}>Edit confirmed values</Button>
          </div>
        </>
      )}
    </>
  )
}

function EditView({ review, draft, onChange, error, onCheck, onCancel }: {
  review: BillReview
  draft: Draft
  onChange: (changes: Partial<Draft>) => void
  error: string | null
  onCheck: () => void
  onCancel: () => void
}) {
  const id = useId()
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor={`${id}-amount`} className="text-sm text-muted-foreground">Amount due (€)</label>
          <Input id={`${id}-amount`} type="text" inputMode="decimal" value={draft.amount}
            onChange={event => onChange({ amount: event.target.value })} />
          <Evidence sources={review.amount_due.sources} />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-due`} className="text-sm text-muted-foreground">Due date</label>
          <Input id={`${id}-due`} type="date" value={draft.dueDate}
            onChange={event => onChange({ dueDate: event.target.value })} />
          <Evidence sources={review.due_date.sources} />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-start`} className="text-sm text-muted-foreground">Billing period start</label>
          <Input id={`${id}-start`} type="date" value={draft.start}
            onChange={event => onChange({ start: event.target.value })} />
          <label htmlFor={`${id}-end`} className="text-sm text-muted-foreground">Billing period end</label>
          <Input id={`${id}-end`} type="date" value={draft.end}
            onChange={event => onChange({ end: event.target.value })} />
          <Evidence sources={review.billing_period.sources} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onCheck}>Check values</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </>
  )
}

function CompareView({ review, draft, saving, error, onConfirm, onBack }: {
  review: BillReview
  draft: Draft
  saving: boolean
  error: string | null
  onConfirm: () => void
  onBack: () => void
}) {
  const period = `${draft.start}/${draft.end}`
  return (
    <>
      <h4 className="font-medium">Confirm these values</h4>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <CompareField label="Amount due" value={draft.amount} candidate={review.amount_due.value} display={formatAmount} />
        <CompareField label="Due date" value={draft.dueDate} candidate={review.due_date.value} display={formatBillDate} />
        <CompareField label="Billing period" value={period} candidate={review.billing_period.value} display={formatPeriod} />
      </dl>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={saving}>Confirm and save</Button>
        <Button size="sm" variant="outline" onClick={onBack} disabled={saving}>Back</Button>
      </div>
    </>
  )
}

function CompareField({ label, value, candidate, display }: {
  label: string; value: string; candidate: string | null; display: (value: string) => string
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{display(value)}</dd>
      {candidate === null
        ? <dd className="mt-1 text-sm text-muted-foreground">OCR could not read this</dd>
        : candidate !== value && <dd className="mt-1 text-sm text-muted-foreground">OCR read: {display(candidate)}</dd>}
    </div>
  )
}

function correctedFrom(value: string, field: BillField, display: (value: string) => string): string | null {
  return field.value !== null && field.value !== value ? `Corrected from ${display(field.value)}` : null
}

function formatAmount(value: string) {
  return '€' + value
}

function formatPeriod(value: string) {
  return value.split('/').map(formatBillDate).join(' – ')
}

function formatBillDate(value: string) {
  return new Date(value + 'T00:00:00Z').toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function formatCreatedAt(value: string) {
  // The API sends UTC timestamps without an offset.
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z'
  return new Date(utc).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function Evidence({ sources }: { sources: BillField['sources'] }) {
  return (
    <div className="space-y-2 text-sm">
      {sources.length === 0 && <p>No labelled OCR line found.</p>}
      {sources.map(source => (
        <blockquote key={source.line} className="border-l-2 border-border pl-3">
          <span className="text-xs text-muted-foreground">OCR line {source.line}</span>
          <p>{source.text}</p>
        </blockquote>
      ))}
    </div>
  )
}

function BillReviewField({ label, value, sources, display, note }: {
  label: string
  value: string | null
  sources: BillField['sources']
  display: (value: string) => string
  note?: string | null
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value ? display(value) : 'Check the original bill'}</dd>
      {note && <dd className="mt-1 text-sm text-muted-foreground">{note}</dd>}
      <dd className="mt-2">
        <Evidence sources={sources} />
      </dd>
    </div>
  )
}
