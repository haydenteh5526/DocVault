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
import { proposedByText } from '@/lib/assistant'
import { formatTimestamp } from '@/lib/dates'

const MAX_DAYS = 60

const WHAT_HAPPENED: Record<string, string> = {
  revision_changed: 'The confirmed bill changed while you were setting the reminder.',
  split_changed: 'The saved split changed while you were setting the reminder.',
  proposal_changed: 'The proposals for this bill changed while you were setting the reminder.',
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
  // It is also dropped when other page data now says something different about that proposal.
  if (local && proposals !== local.seen) {
    const same = proposals.find(item => item.proposal_number === local.proposal.proposal_number)
    const disagrees = same ? same.status !== local.proposal.status : proposals[0]?.proposal_number > local.proposal.proposal_number
    if (local.refreshed || disagrees) setLocal(null)
  }

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
  // The newest saved reminder is the bill's current one and stays on screen whatever happened to later proposals.
  const currentReminder = list.find(item => item.status === 'saved')

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
      setRefreshFailed(false)
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
    // The note about an earlier failed refresh is about that earlier change, not the one starting now.
    setRefreshFailed(false)
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
      setRefreshFailed(false)
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
  const undecided = current !== undefined && (current.status === 'cancelled' || current.status === 'stale')
  const showForm = confirmed !== null && (openForm || !current || (undecided && !currentReminder))

  let body: ReactNode
  if (!confirmed) {
    body = <p className="text-sm text-muted-foreground">Confirm the bill above before proposing a reminder.</p>
  } else if (showForm) {
    const status = statusLine(current, currentReminder !== undefined)
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
    if (currentReminder) {
      body = (
        <>
          {body}
          <SavedBlock proposal={currentReminder} title={title} today={today} />
        </>
      )
    }
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
        {currentReminder && <SavedBlock proposal={currentReminder} title={title} today={today} stays />}
      </>
    )
  } else if (current) {
    const shown = current.status === 'saved' ? current : currentReminder
    body = (
      <>
        {undecided && <p className="text-sm text-muted-foreground">{statusLine(current, true)}</p>}
        {shown && (
          <>
            <SavedLines proposal={shown} title={title} today={today} />
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
        )}
      </>
    )
  }

  return (
    <section aria-labelledby="bill-reminder-heading" className="min-w-0 rounded-lg border bg-card p-4 sm:p-5 space-y-4">
      <h3 id="bill-reminder-heading" ref={headingRef} tabIndex={-1} className="font-semibold">Reminder</h3>
      {message && (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{message}</p>
      )}
      {body}
      {list.length > 0 && <History proposals={list} currentId={currentReminder?.id} />}
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

function statusLine(current: ReminderProposal | undefined, hasSaved: boolean): string | null {
  if (!current) return 'No reminder yet'
  const unchanged = 'Your saved reminder is unchanged.'
  if (current.status === 'cancelled') {
    return `Proposal ${current.proposal_number} was cancelled. ${hasSaved ? unchanged : 'No reminder was saved.'}`
  }
  if (current.status === 'stale') {
    const reason = REASON[current.inputs_changed ?? ''] ?? ''
    return `Proposal ${current.proposal_number} is out of date and was not saved. ${reason}${hasSaved ? ` ${unchanged}` : ''}`.trim()
  }
  return null
}

/** The saved reminder's line, its notice and its details. */
function SavedLines({ proposal, title, today }: { proposal: ReminderProposal; title: string; today: string }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {`Saved · reminder for ${formatBillDate(proposal.reminder?.remind_on ?? proposal.details.remind_on)}`}
      </p>
      {proposal.inputs_changed && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {`${REASON[proposal.inputs_changed] ?? ''} This reminder still shows the values it was saved with.`.trim()}
        </p>
      )}
      <Details proposal={proposal} title={title} today={today} />
    </>
  )
}

/** The saved reminder kept in view under a pending proposal or the form. It has no buttons. */
function SavedBlock({
  proposal, title, today, stays = false,
}: { proposal: ReminderProposal; title: string; today: string; stays?: boolean }) {
  const headingId = useId()
  return (
    <div role="group" aria-labelledby={headingId} className="space-y-3 rounded-md border p-4">
      <h4 id={headingId} className="font-medium">Current saved reminder</h4>
      <SavedLines proposal={proposal} title={title} today={today} />
      {stays && <p className="text-sm text-muted-foreground">It stays in place until you approve a different one.</p>}
    </div>
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
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] [&>dd]:mb-2 [&>dd]:break-words [&>dd]:tabular-nums sm:[&>dd]:mb-0">
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
                    <span>{share.label}{share.days_home != null && `, ${share.days_home} days at home`}</span>
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
  const date = formatTimestamp(event.created_at)
  switch (event.event) {
    case 'proposed':
      return `${proposedByText(proposal.source)} · ${date} · remind on ${formatBillDate(proposal.details.remind_on)}`
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

function History({ proposals, currentId }: { proposals: ReminderProposal[]; currentId?: string }) {
  const headingId = useId()
  return (
    <div role="group" aria-labelledby={headingId} className="space-y-3">
      <h4 id={headingId} className="font-medium">History</h4>
      {proposals.map(proposal => (
        <div key={proposal.id} className="space-y-1">
          <p className="text-sm font-medium">
            {`Proposal ${proposal.proposal_number}${proposal.id === currentId ? ' · current reminder' : ''}`}
          </p>
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

