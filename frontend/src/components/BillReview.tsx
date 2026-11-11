import { Button } from '@/components/ui/button'
import type { BillConfirmation, BillField, BillReview, BillRevision } from '@/lib/api'

export function BillReviewPanel({ review, onViewOriginal }: {
  review: BillReview | null
  confirmed: BillRevision | null
  onViewOriginal: () => void
  onConfirm: (body: BillConfirmation) => Promise<void>
}) {
  if (!review) return null
  return (
    <section aria-labelledby="bill-review-heading" className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="bill-review-heading" className="font-semibold">Bill review</h3>
        <Button variant="outline" size="sm" onClick={onViewOriginal}>View original bill</Button>
      </div>
      <p className="text-sm text-muted-foreground">Not confirmed yet</p>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <BillReviewField label="Amount due" field={review.amount_due}
          display={value => '€' + value} />
        <BillReviewField label="Due date" field={review.due_date} display={formatBillDate} />
        <BillReviewField label="Billing period" field={review.billing_period}
          display={value => value.split('/').map(formatBillDate).join(' – ')} />
      </dl>
    </section>
  )
}

function formatBillDate(value: string) {
  return new Date(value + 'T00:00:00Z').toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function BillReviewField({ label, field, display }: {
  label: string; field: BillField; display: (value: string) => string
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{field.value ? display(field.value) : 'Check the original bill'}</dd>
      <dd className="mt-2 space-y-2 text-sm">
        {field.sources.length === 0 && <p>No labelled OCR line found.</p>}
        {field.sources.map(source => (
          <blockquote key={source.line} className="border-l-2 border-border pl-3">
            <span className="text-xs text-muted-foreground">OCR line {source.line}</span>
            <p>{source.text}</p>
          </blockquote>
        ))}
      </dd>
    </div>
  )
}
