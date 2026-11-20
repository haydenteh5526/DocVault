import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { formatBillDate } from '@/components/BillReview'
import { SourceQuote, SourceTie } from '@/components/SourceTie'
import type { AssistantAction, BillField } from '@/lib/api'

interface Props {
  action: AssistantAction
  onOpenDocument: (documentId: string) => void
}

/** The result card under an assistant message. Nothing here saves or approves anything. */
export function AssistantActionCard({ action, onOpenDocument }: Props) {
  const body = cardBody(action, onOpenDocument)
  if (!body) return null
  const withoutModel = action.meta.selector === 'rules' && !!action.meta.fallback_reason
  return (
    <div className="mt-2.5 space-y-1.5">
      {body}
      {withoutModel && <p className="text-[11px] text-muted-foreground">Handled without the language model.</p>}
    </div>
  )
}

function cardBody(action: AssistantAction, onOpenDocument: (id: string) => void): ReactNode {
  const documentId = action.document_id ?? null
  const open = (label: string) =>
    documentId ? (
      <Button type="button" variant="outline" size="sm" onClick={() => onOpenDocument(documentId)}>
        {label}
      </Button>
    ) : null

  switch (action.kind) {
    case 'bill_facts':
      return action.facts ? <FactsCard action={action} facts={action.facts} openButton={open('Open bill')} /> : null
    case 'split_preview': {
      const preview = action.preview
      if (!preview) return null
      return (
        <Card label="Split preview">
          <p className="font-medium">{`Equal split of €${preview.total} from revision ${preview.bill_revision}`}</p>
          <ol className="list-decimal pl-5">
            {preview.shares.map(share => (
              <li key={share.housemate_id}>
                {share.label} <span>{`€${share.amount}`}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground">Not saved</p>
          {open('Open bill to save this split')}
        </Card>
      )
    }
    case 'reminder_proposal': {
      const proposal = action.proposal
      if (!proposal) return null
      const { details } = proposal
      return (
        <Card label="Reminder proposal">
          <p className="font-medium">{`Proposal ${proposal.proposal_number} · not saved when proposed`}</p>
          <p>{`Remind on ${formatBillDate(details.remind_on)}`}</p>
          <p>{`€${details.amount_due} due ${formatBillDate(details.due_date)} (revision ${details.bill_revision})`}</p>
          <p>{details.split ? `Split ${details.split.split_number}, total €${details.split.total}` : 'No split is included.'}</p>
          {open('Open bill to see its status')}
        </Card>
      )
    }
    case 'enquiry_draft':
      // Keyed by its text so a card reused for another conversation's draft starts from that draft, not the old edit.
      return <DraftCard key={action.draft ?? ''} draft={action.draft ?? ''} evidence={action.evidence ?? []} />
    case 'notice':
      return documentId ? <div>{open('Open bill')}</div> : null
    default:
      return null
  }
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section role="region" aria-label={label} className="mt-2 rounded-lg border border-border bg-card p-3 text-sm space-y-2">
      {children}
    </section>
  )
}

function Quotes({ lines }: { lines: { line: number; text: string }[] }) {
  return (
    <>
      {lines.map(source => <SourceQuote key={`${source.line}:${source.text}`} source={source} />)}
    </>
  )
}

function FactsCard({ action, facts, openButton }: { action: AssistantAction; facts: NonNullable<AssistantAction['facts']>; openButton: ReactNode }) {
  const evidence = facts.evidence
  const sources = (field: BillField | undefined) => field?.sources ?? []
  const period =
    facts.billing_period_start && facts.billing_period_end
      ? `${formatBillDate(facts.billing_period_start)} – ${formatBillDate(facts.billing_period_end)}`
      : null
  const rows: { label: string; value: string | null; lines: BillField['sources'] }[] = [
    { label: 'Amount due', value: facts.amount_due !== null ? `€${facts.amount_due}` : null, lines: sources(evidence?.amount_due) },
    { label: 'Due date', value: facts.due_date ? formatBillDate(facts.due_date) : null, lines: sources(evidence?.due_date) },
    { label: 'Billing period', value: period, lines: sources(evidence?.billing_period) },
  ]
  return (
    <Card label="Bill facts">
      {action.document_title && <p className="text-xs text-muted-foreground">{action.document_title}</p>}
      <p className="font-medium">{facts.confirmed ? `Confirmed · revision ${facts.revision}` : 'Not confirmed'}</p>
      <div className="space-y-3">
        {rows.map(row => (
          <SourceTie key={row.label} documentTitle={action.document_title} label={row.label} value={row.value ?? 'Not readable'} sources={row.lines} />
        ))}
      </div>
      {openButton}
    </Card>
  )
}

function DraftCard({ draft, evidence }: { draft: string; evidence: { line: number; text: string }[] }) {
  const id = useId()
  const [text, setText] = useState(draft)
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <Card label="Enquiry draft">
      <label htmlFor={id} className="block text-xs text-muted-foreground">Draft to edit</label>
      <textarea
        id={id}
        value={text}
        onChange={e => {
          setText(e.target.value)
          setState('idle')
        }}
        rows={10}
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {state === 'copied' ? 'Copied' : 'Copy draft'}
        </Button>
        <span className="text-xs text-muted-foreground">Nothing is sent from DocVault.</span>
      </div>
      {state === 'failed' && <p role="alert" className="text-xs text-destructive">Could not copy. Select the text and copy it.</p>}
      <Quotes lines={evidence} />
    </Card>
  )
}
