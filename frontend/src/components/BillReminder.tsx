import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ApiError,
  type BillRevision,
  type BillSplit,
  type ReminderDetails,
  type ReminderProposal,
  type ReminderProposalRequest,
} from '@/lib/api'
import { formatBillDate } from '@/components/BillReview'

const MAX_DAYS = 60

const WHAT_HAPPENED: Record<string, string> = {
  revision_changed: 'The confirmed bill changed while you were setting the reminder.',
  split_changed: 'The saved split changed while you were setting the reminder.',
  proposal_changed: 'Another proposal was made while you were setting the reminder.',
  proposal_pending: 'A proposal is already waiting for your decision.',
  no_confirmed_bill: 'This bill has no confirmed values.',
  proposal_stale: 'The bill or its split changed after this was proposed.',
  proposal_cancelled: 'This proposal was cancelled.',
  details_mismatch: 'The proposal no longer matches what you reviewed.',
  already_saved: 'This reminder was already saved.',
}
const DEFAULT_WHAT_HAPPENED = 'This reminder changed while you were reviewing it.'

const REASON: Record<string, string> = {
  revision_changed: 'The confirmed bill changed after it was proposed.',
  split_changed: 'The saved split changed after it was proposed.',
}

type Action = 'propose' | 'approve' | 'cancel'

/** A 409 whose reload failed: the view is kept but nothing can be saved until the latest data loads. */
interface Blocked {
  what: string
  nothing: string
  recapture: boolean
}

/** The proposal returned by the last successful call, kept until the page data has caught up with it. */
interface Local {
  proposal: ReminderProposal
  seen: ReminderProposal[]
  refreshed: boolean
}

export function BillReminderPanel({
  title, confirmed, split, proposals, today, onPropose, onApprove, onCancel, onRefresh,
}: {
  title: string
  confirmed: BillRevision | null
  split: BillSplit | null
  proposals: ReminderProposal[]
  today: string
  onPropose: (body: ReminderProposalRequest) => Promise<ReminderProposal>
  onApprove: (proposal: ReminderProposal) => Promise<ReminderProposal>
  onCancel: (proposal: ReminderProposal) => Promise<ReminderProposal>
  onRefresh: () => Promise<void>
}) {
  const daysId = useId()
  const [local, setLocal] = useState<Local | null>(null)
  const [days, setDays] = useState('')
  const [openForm, setOpenForm] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [busy, setBusy] = useState<Action | 'refresh' | null>(null)
  // Focus follows the owner to the heading of each new view instead of dropping to the page.
  const [focusRequest, setFocusRequest] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const proposalsRef = useRef(proposals)
  proposalsRef.current = proposals
  useEffect(() => {
    if (focusRequest > 0) (stepHeadingRef.current ?? headingRef.current)?.focus()
  }, [focusRequest])
  const moveFocus = () => setFocusRequest(n => n + 1)

  // Once the page has reloaded and its data has changed, the kept copy is no longer needed.
  if (local && local.refreshed && proposals !== local.seen) setLocal(null)

  // The kept copy stands in for the proposal with its number, or goes ahead of the list if it is newer.
  let list = proposals
  if (local) {
    const index = proposals.findIndex(item => item.proposal_number === local.proposal.proposal_number)
    if (index >= 0) list = proposals.map((item, i) => (i === index ? local.proposal : item))
    else if (!proposals[0] || local.proposal.proposal_number > proposals[0].proposal_number) {
      list = [local.proposal, ...proposals]
    }
  }
  const current: ReminderProposal | undefined = list[0]

  // After "Load latest" succeeds the props are fresh: show the view that fits them.
  if (blocked?.recapture) {
    setBlocked(null)
    setLocal(null)
    setOpenForm(false)
    setMessage(`${blocked.what} ${blocked.nothing} The latest version is shown here.`)
    moveFocus()
  }

  async function reload(): Promise<boolean> {
    try {
      await onRefresh()
      setLocal(l => l && { ...l, refreshed: true })
      return true
    } catch {
      return false
    }
  }

  async function handleConflict(error: ApiError, nothing: string) {
    const what = (error.code && WHAT_HAPPENED[error.code]) || DEFAULT_WHAT_HAPPENED
    if (await reload()) {
      setLocal(null)
      setBlocked(null)
      setOpenForm(false)
      setMessage(`${what} ${nothing} The latest version is shown here.`)
      moveFocus()
    } else {
      setBlocked({ what, nothing, recapture: false })
      setMessage(`${what} ${nothing} The latest version could not be loaded.`)
    }
  }

  /** The call's result and the reload's result are separate outcomes. */
  async function run(
    action: Action,
    call: () => Promise<ReminderProposal>,
    nothing: string,
    otherError: string,
  ) {
    setBusy(action)
    let result: ReminderProposal
    try {
      result = await call()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await handleConflict(error, nothing)
      else {
        setMessage(otherError)
        moveFocus()
      }
      setBusy(null)
      return
    }
    setLocal({ proposal: result, seen: proposalsRef.current, refreshed: false })
    setMessage(null)
    setBlocked(null)
    setOpenForm(false)
    setRefreshFailed(false)
    if (action === 'propose') setDays('')
    moveFocus()
    if (!(await reload())) setRefreshFailed(true)
    setBusy(null)
  }

  function propose(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || busy || blocked) return
    const value = days.trim()
    if (!value) return setMessage('How many days before the due date should the reminder be?')
    if (!/^\d+$/.test(value) || Number(value) > MAX_DAYS) return setMessage('Enter a whole number from 0 to 60.')
    const body: ReminderProposalRequest = {
      action: 'bill_reminder',
      days_before_due: Number(value),
      bill_revision: confirmed.revision_number,
      bill_split: split && !split.stale ? split.split_number : 0,
      base_proposal: current?.proposal_number ?? 0,
    }
    void run('propose', () => onPropose(body), 'No reminder was saved.', 'Could not propose the reminder. Try again.')
  }

  function approve(proposal: ReminderProposal) {
    if (busy || blocked) return
    void run(
      'approve',
      () => onApprove(proposal),
      'No reminder was saved.',
      'Could not confirm that the reminder was saved. Try again: approving again cannot save it twice.',
    )
  }

  function cancel(proposal: ReminderProposal) {
    if (busy || blocked) return
    void run('cancel', () => onCancel(proposal), 'Nothing was changed.', 'Could not cancel the proposal. Try again.')
  }

  async function loadLatest() {
    setBusy('refresh')
    if (await reload()) {
      if (blocked) setBlocked({ ...blocked, recapture: true })
    } else if (blocked) {
      setMessage(`${blocked.what} ${blocked.nothing} The latest version still could not be loaded. Try again.`)
    }
    setBusy(null)
  }

  async function refreshSavedView() {
    setBusy('refresh')
    setRefreshFailed(!(await reload()))
    setBusy(null)
  }

  const disabled = busy !== null || blocked !== null
  const showRefreshNotice = refreshFailed && current !== undefined
  const showForm =
    confirmed !== null && (openForm || !current || current.status === 'cancelled' || current.status === 'stale')

  let body: ReactNode
  if (!confirmed) {
    body = <p className="text-sm text-muted-foreground">Confirm the bill above before proposing a reminder.</p>
  } else if (showForm) {
    let status: string | null = null
    if (!current) status = 'No reminder yet'
    else if (current.status === 'cancelled') status = `Proposal ${current.proposal_number} was cancelled. No reminder was saved.`
    else if (current.status === 'stale') {
      status =
        `Proposal ${current.proposal_number} is out of date and was not saved. ` +
        (REASON[current.inputs_changed ?? ''] ?? '')
    }
    const usableSplit = split && !split.stale ? split : null
    body = (
      <form className="space-y-4" onSubmit={propose} noValidate>
        <h4 ref={stepHeadingRef} tabIndex={-1} className="font-medium">Propose a reminder</h4>
        {status && <p className="text-sm text-muted-foreground">{status.trim()}</p>}
        <p className="font-medium">
          {`Reminder for €${confirmed.amount_due}, due ${formatBillDate(confirmed.due_date)} (revision ${confirmed.revision_number})`}
        </p>
        <p className="text-sm text-muted-foreground">
          {usableSplit
            ? `Split ${usableSplit.split_number} will be included.`
            : split
              ? `The saved split uses revision ${split.bill_revision} and will not be included.`
              : 'No split is saved for this bill, so none will be included.'}
        </p>
        <div className="space-y-2">
          <label htmlFor={daysId} className="text-sm text-muted-foreground">Days before the due date</label>
          <Input
            id={daysId}
            inputMode="numeric"
            value={days}
            onChange={event => setDays(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={disabled}>Propose reminder</Button>
          {openForm && current && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setOpenForm(false)
                setMessage(null)
                moveFocus()
              }}
            >
              Back
            </Button>
          )}
          {blocked && (
            <Button type="button" size="sm" variant="outline" onClick={loadLatest} disabled={busy === 'refresh'}>
              Load latest
            </Button>
          )}
        </div>
      </form>
    )
  } else if (current && current.status === 'pending') {
    body = (
      <>
        <h4 ref={stepHeadingRef} tabIndex={-1} className="font-medium">Approve this reminder</h4>
        <p className="text-sm text-muted-foreground">{`Proposal ${current.proposal_number} · not saved yet`}</p>
        <Details proposal={current} title={title} today={today} />
        <p className="text-sm">Nothing is sent to anyone. The reminder is saved in your account only.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => approve(current)} disabled={disabled}>Approve and save</Button>
          <Button size="sm" variant="outline" onClick={() => cancel(current)} disabled={disabled}>
            Cancel proposal
          </Button>
          {blocked && <Button size="sm" variant="outline" onClick={loadLatest} disabled={busy === 'refresh'}>Load latest</Button>}
        </div>
      </>
    )
  } else if (current) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          {`Saved · reminder for ${formatBillDate(current.reminder?.remind_on ?? current.details.remind_on)}`}
        </p>
        {current.inputs_changed && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {`${REASON[current.inputs_changed] ?? ''} This reminder still shows the values it was saved with.`.trim()}
          </p>
        )}
        <Details proposal={current} title={title} today={today} />
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => {
              setOpenForm(true)
              setMessage(null)
              moveFocus()
            }}
          >
            Propose a different reminder
          </Button>
        </div>
      </>
    )
  }

  return (
    <section aria-labelledby="bill-reminder-heading" className="rounded-xl border bg-card p-6 space-y-4">
      <h3 id="bill-reminder-heading" ref={headingRef} tabIndex={-1} className="font-semibold">Reminder</h3>
      {message && (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{message}</p>
      )}
      {body}
      {list.length > 0 && <History proposals={list} />}
      {/* Always on the page, so screen readers announce the notice when its text appears. */}
      <p role="status" className={showRefreshNotice ? 'text-sm' : 'sr-only'}>
        {showRefreshNotice &&
          'Your change was saved. The rest of this page could not be refreshed and may be out of date.'}
      </p>
      {showRefreshNotice && (
        <div>
          <Button size="sm" variant="outline" onClick={refreshSavedView} disabled={busy === 'refresh'}>Refresh</Button>
        </div>
      )}
    </section>
  )
}

function daysWording(details: ReminderDetails) {
  const days = details.days_before_due
  if (days === 0) return '(on the due date)'
  if (days === 1) return '(1 day before the due date)'
  return `(${days} days before the due date)`
}

function Details({ proposal, title, today }: { proposal: ReminderProposal; title: string; today: string }) {
  const { details } = proposal
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Bill</dt>
      <dd>{title}</dd>
      <dt className="text-muted-foreground">Amount due</dt>
      <dd>{`€${details.amount_due} (revision ${details.bill_revision})`}</dd>
      <dt className="text-muted-foreground">Due date</dt>
      <dd>{formatBillDate(details.due_date)}</dd>
      <dt className="text-muted-foreground">Remind on</dt>
      <dd className="space-x-2">
        <span>{formatBillDate(details.remind_on)}</span>
        <span>{daysWording(details)}</span>
        {details.remind_on < today && <span>This date has already passed.</span>}
      </dd>
      <dt className="text-muted-foreground">Split</dt>
      <dd>
        {details.split ? (
          <>
            <p>{`Split ${details.split.split_number}, total €${details.split.total}`}</p>
            <ol className="list-decimal space-y-1 pl-6">
              {details.split.shares.map(share => (
                <li key={share.housemate_id}>
                  <span className="inline-flex w-full max-w-xs justify-between gap-4">
                    <span>{share.label}</span>
                    <span className="font-semibold">{`€${share.amount}`}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          'No split is included.'
        )}
      </dd>
    </dl>
  )
}

function eventText(proposal: ReminderProposal, event: ReminderProposal['history'][number]) {
  const date = formatCreatedAt(event.created_at)
  switch (event.event) {
    case 'proposed':
      return `${proposal.source === 'assistant' ? 'Proposed by the assistant' : 'Proposed by you'} · ${date} · remind on ${formatBillDate(proposal.details.remind_on)}`
    case 'approved':
      return `Approved · ${date}`
    case 'saved':
      return `Saved · ${date}`
    case 'cancelled':
      return `Cancelled · ${date}`
    case 'stale':
      return `Found out of date · ${date}`
  }
}

function History({ proposals }: { proposals: ReminderProposal[] }) {
  const headingId = useId()
  return (
    <div role="group" aria-labelledby={headingId} className="space-y-3">
      <h4 id={headingId} className="font-medium">History</h4>
      {proposals.map(proposal => (
        <div key={proposal.id} className="space-y-1">
          <p className="text-sm font-medium">{`Proposal ${proposal.proposal_number}`}</p>
          <ol className="list-decimal space-y-1 pl-6 text-sm text-muted-foreground">
            {[...proposal.history]
              .sort((a, b) => a.sequence - b.sequence)
              .map(event => (
                <li key={event.sequence}>{eventText(proposal, event)}</li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

function formatCreatedAt(value: string) {
  // The API sends UTC timestamps without an offset.
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z'
  return new Date(utc).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}
