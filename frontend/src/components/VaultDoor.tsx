import { useReducedMotion } from '@/lib/useReducedMotion'
import './VaultDoor.css'

export type VaultState = 'closed' | 'entering' | 'error' | 'unlocking' | 'open'

const TICKS = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180)
const SPOKES = Array.from({ length: 8 }, (_, i) => (i * 45 * Math.PI) / 180)

function dialRotation(state: VaultState, progress: number): number {
  if (state === 'entering') return Math.min(Math.max(progress, 0), 30) * 12
  if (state === 'unlocking' || state === 'open') return 270
  return 0
}

/**
 * The combination dial ring in the safe's lock console. Decorative: it only reflects how many characters
 * were typed and what the server answered, never whether a password looks right. Motion is CSS only and
 * switches off under reduced motion (the `vault-still` class), so each state simply appears.
 */
export function VaultDoor({ state, progress = 0, badge }: { state: VaultState; progress?: number; badge?: 'key' | 'second-ring' }) {
  const still = useReducedMotion()
  return (
    <div className={`vault-door vault-${state}${still ? ' vault-still' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 170 170" focusable="false">
        <circle cx="85" cy="85" r="80" fill="#1C1C20" stroke="#3A3A40" strokeWidth="3" />
        <circle cx="85" cy="85" r="52" fill="#121214" stroke="#2A2A2E" strokeWidth="1.5" />
        <g data-part="dial" className="vault-dial" style={{ transform: `rotate(${dialRotation(state, progress)}deg)` }}>
          {TICKS.map(angle => (
            <line
              key={angle}
              x1={85 + Math.cos(angle) * 60}
              y1={85 + Math.sin(angle) * 60}
              x2={85 + Math.cos(angle) * 72}
              y2={85 + Math.sin(angle) * 72}
              stroke="#8C8C93"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
          {SPOKES.map(angle => (
            <line
              key={angle}
              x1={85 + Math.cos(angle) * 10}
              y1={85 + Math.sin(angle) * 10}
              x2={85 + Math.cos(angle) * 40}
              y2={85 + Math.sin(angle) * 40}
              stroke="#5A5A62"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
          <circle cx="85" cy="85" r="9" fill="#FFD83D" />
          <circle cx="85" cy="12" r="4.5" fill="#FFD83D" />
        </g>
        {badge === 'second-ring' && (
          <circle data-part="badge-second-ring" className="vault-second-ring" cx="85" cy="85" r="46" fill="none" stroke="#FFD83D" strokeWidth="1.5" strokeDasharray="6 5" />
        )}
        {badge === 'key' && (
          <g data-part="badge-key" fill="none" stroke="#FFD83D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="74" cy="85" r="7" />
            <path d="M81 85h20M94 85v7M100 85v5" />
          </g>
        )}
      </svg>
    </div>
  )
}
