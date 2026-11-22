import { useEffect, useState } from 'react'

/** The server sends a new verification or reset link at most once a minute per account. */
export const RESEND_COOLDOWN_S = 60

type LinkKind = 'verify' | 'reset'

const PREFIX = 'docvault.linkSent.'
const keyFor = (kind: LinkKind, email: string) => `${PREFIX}${kind}:${email.trim().toLowerCase()}`

function readUntil(kind: LinkKind, email: string): number {
  if (!email.trim()) return 0
  try {
    return Number(sessionStorage.getItem(keyFor(kind, email))) || 0
  } catch {
    return 0
  }
}

/**
 * Record that a link of `kind` was just sent to `email`. Every page in this tab then waits out the
 * same 60 seconds for that address, so a resend button never offers a click the server would drop.
 */
export function noteLinkSent(kind: LinkKind, email: string) {
  if (!email.trim()) return
  try {
    sessionStorage.setItem(keyFor(kind, email), String(Date.now() + RESEND_COOLDOWN_S * 1000))
  } catch {
    // Storage unavailable (private mode): the countdown simply does not carry across pages.
  }
}

/**
 * Seconds left before another link of `kind` may be sent to `email`, shared by every page in this tab,
 * and a function that records a send now.
 */
export function useLinkCooldown(kind: LinkKind, email: string): [remaining: number, markSent: () => void] {
  const [now, setNow] = useState(() => Date.now())
  const until = readUntil(kind, email)

  useEffect(() => {
    if (until <= Date.now()) return
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= until) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [until])

  function markSent() {
    noteLinkSent(kind, email)
    setNow(Date.now())
  }

  // `now` can lag a deadline set elsewhere by one tick, so never show more than the full cooldown.
  return [Math.min(RESEND_COOLDOWN_S, Math.max(0, Math.ceil((until - now) / 1000))), markSent]
}
