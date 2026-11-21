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

const BOLTS = [1, 2, 3] as const
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const

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

/** The latch handle beside the dial. It turns a quarter-turn as the door unlocks. */
function Handle() {
  return (
    <svg data-part="handle" className="safe-handle" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="34" fill="#141416" stroke="#4A4A50" strokeWidth="3" />
      <circle cx="60" cy="60" r="27" fill="none" stroke="#000" strokeWidth="2" opacity=".6" />
      <g className="safe-handle-lever">
        <rect x="56" y="51" width="58" height="18" rx="9" fill="#9A9AA2" stroke="#2A2A2E" strokeWidth="2" />
        <rect x="60" y="53" width="50" height="5" rx="2.5" fill="#D4D4DA" opacity=".7" />
        <circle cx="60" cy="60" r="17" fill="#8C8C93" stroke="#2A2A2E" strokeWidth="2" />
        <circle cx="60" cy="60" r="7" fill="#3A3A40" />
      </g>
    </svg>
  )
}

/**
 * A heavy safe. The page is a steel frame with the door slab set inside it: barrel hinges bridge the gap on
 * the left, three bolts sit in sockets in the right of the frame, and the children live on a lock faceplate
 * bolted to the slab (screws, an LCD status bar, the dial and a handle).
 *
 * On `open` the handle turns, the bolts pull out of their sockets and the slab swings round its hinges,
 * showing the lit interior and anything passed as `interior`. `settled` takes the slab away.
 * All of it is decorative: the form inside never changes because of the door.
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
  /** Read out politely. It lives outside the door slab, which is hidden from assistive technology once open. */
  announcement?: string
  children: ReactNode
}) {
  const still = useReducedMotion()
  const { label, led } = STATUS[state]
  const open = state === 'open'
  return (
    <div className={`safe-stage safe-${state}${still ? ' safe-still' : ''}${settled ? ' safe-settled' : ''}`}>
      <p role="status" className="sr-only">{announcement}</p>
      {/* Everything that moves when you step inside. The stage clips it, so the scale never scrolls the page. */}
      <div className="safe-world">
      <div className="safe-frame" aria-hidden="true">
        {BOLTS.map(n => <span key={n} data-part="socket" className={`safe-socket safe-socket-${n}`} />)}
      </div>
      <div className="safe-chamber" aria-hidden="true" />
      {interior && <div className="safe-interior">{interior}</div>}
      <span data-part="hinge" className="safe-hinge safe-hinge-top" aria-hidden="true" />
      <span data-part="hinge" className="safe-hinge safe-hinge-bottom" aria-hidden="true" />
      <div className="safe-door" aria-hidden={open ? true : undefined} inert={open ? true : undefined}>
        {CORNERS.map(c => <span key={c} data-part="rivet" className={`safe-rivet safe-rivet-${c}`} aria-hidden="true" />)}
        {BOLTS.map(n => <span key={n} className={`safe-bolt-housing safe-bolt-housing-${n}`} aria-hidden="true" />)}
        {BOLTS.map(n => <span key={n} data-part="bolt" className={`safe-bolt safe-bolt-${n}`} aria-hidden="true" />)}
        <header className="safe-bezel">
          <Link to="/" className="safe-brand"><Wordmark /></Link>
          {topRight && <div className="safe-bezel-link">{topRight}</div>}
        </header>
        <main id="account-form" tabIndex={-1} className="safe-main">
          <div className="safe-console">
            {CORNERS.map(c => <span key={c} data-part="screw" className={`safe-screw safe-screw-${c}`} aria-hidden="true" />)}
            <div data-part="lcd" className="safe-lcd">
              <StatusLed led={led} />
              <span data-part="status-label" className="safe-status-label">{label}</span>
            </div>
            <div data-part="hardware-bay" className="safe-hardware">
              <VaultDoor state={state} progress={progress} badge={badge} />
              <Handle />
            </div>
            {children}
          </div>
        </main>
      </div>
      </div>
    </div>
  )
}
