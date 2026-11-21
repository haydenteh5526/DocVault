import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/Wordmark'
import { VaultDoor, type VaultState } from '@/components/VaultDoor'
import { useReducedMotion } from '@/lib/useReducedMotion'
import './SafeDoor.css'

const STATUS: Record<VaultState, { label: string; led: string }> = {
  closed: { label: 'LOCKED', led: 'locked' },
  entering: { label: 'LOCKED', led: 'locked' },
  unlocking: { label: 'VERIFYING', led: 'verifying' },
  error: { label: 'INVALID', led: 'invalid' },
  open: { label: 'UNLOCKED', led: 'unlocked' },
}

/** Status light. The text label always sits next to it, and invalid and unlocked carry a shape (× and ✓), so colour is never the only cue. */
function StatusLed({ led }: { led: string }) {
  return (
    <svg data-part="status-led" data-led={led} className={`safe-led safe-led-${led}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" className="safe-led-body" />
      {led === 'invalid' && <path data-part="led-cross" d="M5.5 5.5l5 5M10.5 5.5l-5 5" className="safe-led-mark" />}
      {led === 'unlocked' && <path data-part="led-tick" d="M5 8.4l2.1 2.1L11 6" className="safe-led-mark" />}
    </svg>
  )
}

/**
 * The front face of a matte-black electronic safe. The page is the door: hinges on the left, locking bolts on
 * the right, the brand and a link in the top bezel, and the children in a recessed lock console in the middle.
 * `interior` is shown behind the door once it is open, and `settled` takes the door away entirely.
 * The door is decorative; opening it never changes what the form says or does, only how it looks.
 */
export function SafeDoor({
  state,
  progress = 0,
  badge,
  topRight,
  interior,
  settled = false,
  announcement = '',
  children,
}: {
  state: VaultState
  progress?: number
  badge?: 'key' | 'second-ring'
  topRight?: ReactNode
  interior?: ReactNode
  settled?: boolean
  /** Read out politely. It lives outside the door face, which is hidden from assistive technology once open. */
  announcement?: string
  children: ReactNode
}) {
  const still = useReducedMotion()
  const { label, led } = STATUS[state]
  const open = state === 'open'
  return (
    <div className={`safe-stage safe-${state}${still ? ' safe-still' : ''}${settled ? ' safe-settled' : ''}`}>
      <p role="status" className="sr-only">{announcement}</p>
      <div className="safe-glow" aria-hidden="true" />
      {interior && <div className="safe-interior">{interior}</div>}
      <div className="safe-door" aria-hidden={open ? true : undefined} inert={open ? true : undefined}>
        <span data-part="hinge" className="safe-hinge safe-hinge-top" aria-hidden="true" />
        <span data-part="hinge" className="safe-hinge safe-hinge-bottom" aria-hidden="true" />
        <span data-part="bolt" className="safe-bolt safe-bolt-1" aria-hidden="true" />
        <span data-part="bolt" className="safe-bolt safe-bolt-2" aria-hidden="true" />
        <span data-part="bolt" className="safe-bolt safe-bolt-3" aria-hidden="true" />
        <header className="safe-bezel">
          <Link to="/" className="safe-brand"><Wordmark /></Link>
          {topRight && <div className="safe-bezel-link">{topRight}</div>}
        </header>
        <main id="account-form" tabIndex={-1} className="safe-main">
          <div className="safe-console">
            <div className="safe-status">
              <StatusLed led={led} />
              <span data-part="status-label" className="safe-status-label">{label}</span>
            </div>
            <VaultDoor state={state} progress={progress} badge={badge} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
