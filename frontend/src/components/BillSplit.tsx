import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ApiError,
  type BillRevision,
  type BillSplit,
  type BillSplitPreview,
  type BillSplitRequest,
  type BillSplitSave,
  type Housemate,
} from '@/lib/api'

const MAX_LABEL_LENGTH = 40

const WHAT_HAPPENED: Record<string, string> = {
  revision_changed: 'The confirmed bill changed while you were splitting it.',
  split_changed: 'Another split was saved while you were reviewing.',
  unknown_housemate: 'Someone you selected is no longer in your list.',
  shares_changed: 'The shares no longer match what you reviewed.',
  no_confirmed_bill: 'This bill has no confirmed values.',
}
const DEFAULT_WHAT_HAPPENED = 'This bill changed while you were splitting it.'

/** What the owner is splitting; fixed when splitting starts, so the save is bound to it. */
interface Session {
  revision: number
  amount: string
  baseSplit: number
  step: 'people' | 'review'
  preview: BillSplitPreview | null
  ticked: string[]
  known: string[]
}

/** A 409 whose reload failed: the draft is kept but cannot be saved until the latest data loads. */
interface Blocked {
  what: string
  recapture: boolean
}

export function BillSplitPanel({
  confirmed, split, housemates, housematesFailed,
  onAddHousemate, onRemoveHousemate, onPreview, onSave, onRefresh,
}: {
  confirmed: BillRevision | null
  split: BillSplit | null
  housemates: Housemate[] | undefined
  housematesFailed: boolean
  onAddHousemate: (label: string) => Promise<void>
  onRemoveHousemate: (id: string) => Promise<void>
  onPreview: (body: BillSplitRequest) => Promise<BillSplitPreview>
  onSave: (body: BillSplitSave) => Promise<BillSplit>
  onRefresh: () => Promise<void>
}) {
  const nameId = useId()
  const [session, setSession] = useState<Session | null>(null)
  const [savedLocal, setSavedLocal] = useState<BillSplit | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [nameMessage, setNameMessage] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'save' | 'refresh' | 'add' | null>(null)
  const [removing, setRemoving] = useState<string[]>([])
  // Focus follows the owner to the heading of each new step instead of dropping to the page.
  const [focusRequest, setFocusRequest] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const peopleHeadingRef = useRef<HTMLParagraphElement>(null)
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusRequest > 0) (reviewHeadingRef.current ?? peopleHeadingRef.current ?? headingRef.current)?.focus()
  }, [focusRequest])
  const moveFocus = () => setFocusRequest(n => n + 1)

  const displayed = savedLocal && (!split || savedLocal.split_number > split.split_number) ? savedLocal : split

  // After "Load latest" succeeds the props are fresh: re-base the kept session on them.
  if (blocked?.recapture) {
    setBlocked(null)
    if (!confirmed || !session) {
      setSession(null)
      setMessage(`${blocked.what} Nothing was saved. The latest version is shown here.`)
    } else {
      const ids = housemates?.map(h => h.id) ?? []
      setSession({
        revision: confirmed.revision_number,
        amount: confirmed.amount_due,
        baseSplit: displayed?.split_number ?? 0,
        step: 'people',
        preview: null,
        ticked: session.ticked.filter(id => ids.includes(id)),
        known: ids,
      })
      setMessage(
        `${blocked.what} Nothing was saved. The latest version is loaded and your selection has been kept. ` +
          'Calculate the shares again.',
      )
    }
  } else if (session?.step === 'people' && !blocked && housemates) {
    // Someone added since the session started is ticked.
    const added = housemates.filter(h => !session.known.includes(h.id)).map(h => h.id)
    if (added.length > 0) {
      setSession({ ...session, known: [...session.known, ...added], ticked: [...session.ticked, ...added] })
    }
  }

  function startSession() {
    if (!confirmed) return
    const ids = housemates?.map(h => h.id) ?? []
    const previous = displayed?.shares.map(share => share.housemate_id)
    setSession({
      revision: confirmed.revision_number,
      amount: confirmed.amount_due,
      baseSplit: displayed?.split_number ?? 0,
      step: 'people',
      preview: null,
      ticked: previous ? ids.filter(id => previous.includes(id)) : ids,
      known: ids,
    })
    setBlocked(null)
    setMessage(null)
    setNameMessage(null)
    setRefreshFailed(false)
    moveFocus()
  }

  function cancel() {
    setSession(null)
    setBlocked(null)
    setMessage(null)
    setNameMessage(null)
    moveFocus()
  }

  const tickedIds = session && housemates
    ? housemates.filter(h => session.ticked.includes(h.id)).map(h => h.id)
    : []

  function toggle(id: string) {
    if (!session) return
    const ticked = session.ticked.includes(id) ? session.ticked.filter(t => t !== id) : [...session.ticked, id]
    setSession({ ...session, ticked })
  }

  async function addName(event: FormEvent) {
    event.preventDefault()
    const label = newName.trim()
    if (!label) return setNameMessage('Enter a name.')
    if ([...label].length > MAX_LABEL_LENGTH) return setNameMessage('Use 40 characters or fewer.')
    setBusy('add')
    setNameMessage(null)
    try {
      await onAddHousemate(label)
      setNewName('')
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined
      setNameMessage(
        code === 'duplicate_label' ? 'That name is already in your list.'
          : code === 'too_many_housemates' ? 'You can save up to 12 housemates.'
            : 'Could not add that name. Try again.',
      )
    } finally {
      setBusy(null)
    }
  }

  async function removeName(id: string) {
    if (removing.includes(id)) return
    setRemoving(ids => [...ids, id])
    setNameMessage(null)
    try {
      await onRemoveHousemate(id)
    } catch {
      setNameMessage('Could not remove that name. Try again.')
    } finally {
      setRemoving(ids => ids.filter(other => other !== id))
    }
  }

  /** A 409 ends or blocks the session depending on whether the latest data could be loaded. */
  async function handleConflict(error: ApiError) {
    const what = (error.code && WHAT_HAPPENED[error.code]) || DEFAULT_WHAT_HAPPENED
    try {
      await onRefresh()
      setSession(null)
      setBlocked(null)
      setMessage(`${what} Nothing was saved. The latest version is shown here.`)
      moveFocus()
    } catch {
      setBlocked({ what, recapture: false })
      setMessage(
        `${what} Nothing was saved. The latest version could not be loaded, so your selection has been kept.`,
      )
    }
  }

  async function calculate() {
    if (!session) return
    if (tickedIds.length < 2) return setMessage('Choose at least two people.')
    setBusy('preview')
    setMessage(null)
    try {
      const result = await onPreview({ bill_revision: session.revision, rule: 'equal', housemate_ids: tickedIds })
      setSession({ ...session, step: 'review', preview: result })
      moveFocus()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await handleConflict(error)
      else setMessage('Could not calculate the shares. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!session?.preview) return
    setBusy('save')
    setMessage(null)
    let result: BillSplit
    try {
      result = await onSave({
        bill_revision: session.revision,
        rule: 'equal',
        // The people the owner reviewed, in that order, not whatever is ticked now.
        housemate_ids: session.preview.shares.map(share => share.housemate_id),
        base_split: session.baseSplit,
        reviewed: session.preview.shares,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await handleConflict(error)
      else setMessage('Could not save. Try again.')
      setBusy(null)
      return
    }
    setSavedLocal(result)
    setSession(null)
    setRefreshFailed(false)
    moveFocus()
    try {
      await onRefresh()
    } catch {
      setRefreshFailed(true)
    } finally {
      setBusy(null)
    }
  }

  async function loadLatest() {
    setBusy('refresh')
    try {
      await onRefresh()
      if (blocked) setBlocked({ ...blocked, recapture: true })
    } catch {
      if (blocked) {
        setMessage(`${blocked.what} Nothing was saved. The latest version still could not be loaded. Try again.`)
      }
    } finally {
      setBusy(null)
    }
  }

  async function refreshSavedView() {
    setBusy('refresh')
    try {
      await onRefresh()
      setRefreshFailed(false)
    } catch {
      setRefreshFailed(true)
    } finally {
      setBusy(null)
    }
  }

  let body: ReactNode
  if (session?.step === 'review' && session.preview) {
    body = (
      <>
        <h4 ref={reviewHeadingRef} tabIndex={-1} className="font-medium">Confirm this split</h4>
        <SharesView
          heading={`Equal split of €${session.preview.total} from revision ${session.preview.bill_revision}`}
          shares={session.preview.shares}
          remainder={session.preview.remainder_cents}
          totalLine={`Contributions total €${session.preview.total}, the confirmed amount.`}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy === 'save' || blocked !== null}>Save split</Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === 'save'}
            onClick={() => {
              setSession({ ...session, step: 'people', preview: null })
              moveFocus()
            }}
          >
            Back
          </Button>
          {blocked && <Button size="sm" variant="outline" onClick={loadLatest} disabled={busy === 'refresh'}>Load latest</Button>}
        </div>
      </>
    )
  } else if (session) {
    body = (
      <>
        <p ref={peopleHeadingRef} tabIndex={-1} className="font-medium">
          Splitting €{session.amount} from revision {session.revision}
        </p>
        <div role="group" aria-label="People sharing this bill" className="space-y-2">
          {housemates === undefined && !housematesFailed && (
            <p className="text-sm text-muted-foreground">Loading your housemates…</p>
          )}
          {housematesFailed && (
            <p className="text-sm text-muted-foreground">Your housemates could not be loaded.</p>
          )}
          {housemates?.length === 0 && (
            <p className="text-sm text-muted-foreground">Add the people who share this bill.</p>
          )}
          {housemates?.map(h => (
            <div key={h.id} className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={session.ticked.includes(h.id)}
                  onChange={() => toggle(h.id)}
                />
                {h.label}
              </label>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${h.label}`}
                disabled={removing.includes(h.id)}
                onClick={() => removeName(h.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <label htmlFor={nameId} className="text-sm text-muted-foreground">Add a housemate</label>
          <form className="flex gap-2" onSubmit={addName}>
            <Input id={nameId} value={newName} onChange={event => setNewName(event.target.value)} />
            <Button type="submit" size="sm" variant="outline" disabled={busy === 'add'}>Add</Button>
          </form>
          {nameMessage && <p role="alert" className="text-sm text-destructive">{nameMessage}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          Rule: equal split. Everyone pays the same. Leftover cents go one each to the first people in the order shown.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={calculate}
            disabled={housemates === undefined || busy === 'preview' || blocked !== null}
          >
            Calculate shares
          </Button>
          <Button size="sm" variant="outline" onClick={cancel}>Cancel</Button>
          {(housematesFailed || blocked) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy === 'refresh'}
              onClick={blocked ? loadLatest : () => { void onRefresh().catch(() => {}) }}
            >
              Load latest
            </Button>
          )}
        </div>
      </>
    )
  } else if (!confirmed) {
    body = <p className="text-sm text-muted-foreground">Confirm the bill above before splitting it.</p>
  } else if (displayed) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Saved · split {displayed.split_number} · {formatCreatedAt(displayed.created_at)}
        </p>
        {displayed.stale && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            The confirmed bill is now revision {confirmed.revision_number} (€{confirmed.amount_due}). This split uses
            revision {displayed.bill_revision} and was not recalculated.
          </p>
        )}
        <SharesView
          heading={`Equal split of €${displayed.total} from revision ${displayed.bill_revision}`}
          shares={displayed.shares}
          remainder={displayed.remainder_cents}
          totalLine={`Contributions total €${displayed.total}.`}
        />
        {refreshFailed && (
          <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
            <span>The split was saved. The rest of this page could not be refreshed and may be out of date.</span>
            <Button size="sm" variant="outline" onClick={refreshSavedView} disabled={busy === 'refresh'}>Refresh</Button>
          </div>
        )}
        <div>
          <Button size="sm" variant="outline" onClick={startSession}>Split again</Button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">Not split yet</p>
        <div>
          <Button size="sm" onClick={startSession}>Split this bill</Button>
        </div>
      </>
    )
  }

  return (
    <section aria-labelledby="bill-split-heading" className="rounded-xl border bg-card p-6 space-y-4">
      <h3 id="bill-split-heading" ref={headingRef} tabIndex={-1} className="font-semibold">Bill split</h3>
      {message && (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{message}</p>
      )}
      {body}
    </section>
  )
}

function remainderSentence(cents: number) {
  if (cents === 0) return 'The total divides exactly.'
  if (cents === 1) return '1 leftover cent went to the first person in this order.'
  return `${cents} leftover cents went one each to the first ${cents} people in this order.`
}

function SharesView({ heading, shares, remainder, totalLine }: {
  heading: string
  shares: { housemate_id: string; label: string; amount: string }[]
  remainder: number
  totalLine: string
}) {
  return (
    <>
      <p className="font-medium">{heading}</p>
      <ol className="list-decimal space-y-1 pl-6 text-sm">
        {shares.map(share => (
          <li key={share.housemate_id}>
            <span className="inline-flex w-full max-w-xs justify-between gap-4">
              <span>{share.label}</span>
              <span className="font-semibold">€{share.amount}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">{remainderSentence(remainder)}</p>
      <p className="text-sm">{totalLine}</p>
    </>
  )
}

function formatCreatedAt(value: string) {
  // The API sends UTC timestamps without an offset.
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z'
  return new Date(utc).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}
