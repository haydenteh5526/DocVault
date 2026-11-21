import { useReducedMotion } from '@/lib/useReducedMotion'
import './VaultDoor.css'

export type VaultState = 'closed' | 'entering' | 'error' | 'unlocking' | 'open'

const SPOKES = Array.from({ length: 8 }, (_, i) => (i * 45 * Math.PI) / 180)

function dialRotation(state: VaultState, progress: number): number {
  if (state === 'entering') return Math.min(Math.max(progress, 0), 30) * 12
  if (state === 'unlocking' || state === 'open') return 270
  return 0
}

/**
 * A round vault door for the account pages. Decorative: it only reflects how many characters were typed
 * and what the server answered, never whether a password looks right. Motion is CSS only and switches
 * off under reduced motion (the `vault-still` class), so each state simply appears.
 */
export function VaultDoor({ state, progress = 0, badge }: { state: VaultState; progress?: number; badge?: 'key' | 'second-ring' }) {
  const still = useReducedMotion()
  return (
    <div className={`vault-door vault-${state}${still ? ' vault-still' : ''}`} aria-hidden="true">
      <div className="vault-glow" />
      <svg className="vault-face" viewBox="0 0 170 170" focusable="false">
        <circle cx="85" cy="85" r="80" fill="#26262B" stroke="#3A3A40" strokeWidth="3" />
        <circle cx="85" cy="85" r="64" fill="#1C1C20" />
        <rect data-part="hinge" x="4" y="63" width="14" height="44" rx="3" fill="#3A3A40" />
        <rect data-part="bolt-left" className="vault-bolt vault-bolt-left" x="24" y="80" width="14" height="10" rx="2" fill="#8C8C93" />
        <rect data-part="bolt-right" className="vault-bolt vault-bolt-right" x="132" y="80" width="14" height="10" rx="2" fill="#8C8C93" />
        <g data-part="dial" className="vault-dial" style={{ transform: `rotate(${dialRotation(state, progress)}deg)` }}>
          <circle cx="85" cy="85" r="30" fill="#26262B" stroke="#3A3A40" strokeWidth="2" />
          {SPOKES.map(angle => (
            <line
              key={angle}
              x1={85 + Math.cos(angle) * 10}
              y1={85 + Math.sin(angle) * 10}
              x2={85 + Math.cos(angle) * 26}
              y2={85 + Math.sin(angle) * 26}
              stroke="#8C8C93"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
          <circle cx="85" cy="85" r="8" fill="#FFD83D" />
          <circle cx="85" cy="59" r="3.5" fill="#FFD83D" />
        </g>
        {badge === 'second-ring' && (
          <circle data-part="badge-second-ring" className="vault-second-ring" cx="85" cy="85" r="39" fill="none" stroke="#FFD83D" strokeWidth="1.5" strokeDasharray="6 5" />
        )}
        {badge === 'key' && (
          <g data-part="badge-key" fill="none" stroke="#FFD83D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="73" cy="130" r="5" />
            <path d="M78 130h16M89 130v5M94 130v4" />
          </g>
        )}
      </svg>
    </div>
  )
}
