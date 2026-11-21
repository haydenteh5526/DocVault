import { useEffect, useState } from 'react'

/**
 * A countdown in whole seconds. `start()` begins it; `remaining` is 0 when the action may run again.
 * Resend buttons use the server's own cooldown, so a click never lands on a silent no-op.
 * `runningAtStart` starts it on the first render, for a page shown right after something was sent.
 */
export function useCooldown(seconds: number, runningAtStart = false): [remaining: number, start: () => void] {
  const [now, setNow] = useState(() => Date.now())
  const [until, setUntil] = useState(() => (runningAtStart ? Date.now() + seconds * 1000 : 0))

  useEffect(() => {
    if (until <= Date.now()) return
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= until) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [until])

  function start() {
    const t = Date.now()
    setNow(t)
    setUntil(t + seconds * 1000)
  }

  return [Math.max(0, Math.ceil((until - now) / 1000)), start]
}

/** The server sends a new verification or reset link at most once a minute per account. */
export const RESEND_COOLDOWN_S = 60
