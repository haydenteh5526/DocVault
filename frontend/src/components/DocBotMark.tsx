import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
function subscribe(update: () => void) {
  const media = window.matchMedia?.(query)
  media?.addEventListener('change', update)
  return () => media?.removeEventListener('change', update)
}

type State = 'idle' | 'working' | 'needs-approval' | 'done'
const INK = '#14171F'

function Face({ state }: { state: State }) {
  if (state === 'working') {
    return (
      <>
        <g data-part="eyes-up" fill={INK}>
          <ellipse cx="27" cy="39.5" rx="2.7" ry="3.5" />
          <ellipse cx="41" cy="39.5" rx="2.7" ry="3.5" />
        </g>
        <path data-part="mouth-flat" d="M29 47.5h6" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </>
    )
  }
  if (state === 'needs-approval') {
    return (
      <>
        <g data-part="eyes-tall" fill={INK}>
          <ellipse cx="25" cy="40.5" rx="2.8" ry="4.2" />
          <ellipse cx="39" cy="40.5" rx="2.8" ry="4.2" />
        </g>
        <ellipse data-part="mouth-open" cx="32" cy="48.5" rx="2" ry="2.2" fill={INK} />
      </>
    )
  }
  if (state === 'done') {
    return (
      <>
        <path
          data-part="eyes-happy"
          d="M22 42c1.6-2.6 4.4-2.6 6 0M36 42c1.6-2.6 4.4-2.6 6 0"
          fill="none"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          data-part="smile-open"
          d="M27.5 46.5c2.2 3.2 6.8 3.2 9 0"
          fill={INK}
          stroke={INK}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </>
    )
  }
  return (
    <>
      <g data-part="eyes-open">
        <ellipse cx="25" cy="41" rx="2.7" ry="3.5" fill={INK} />
        <ellipse cx="39" cy="41" rx="2.7" ry="3.5" fill={INK} />
        <circle cx="25.9" cy="39.7" r=".9" fill="#FFFFFF" />
        <circle cx="39.9" cy="39.7" r=".9" fill="#FFFFFF" />
      </g>
      <path data-part="smile" d="M28.5 47c1.8 2.3 5.2 2.3 7 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  )
}

/** DocBot, a paper-and-folder figure. Decorative: the status is always written beside it. */
export function DocBotMark({
  variant = 'head',
  state = 'idle',
  size = 24,
}: {
  variant?: 'full' | 'head'
  state?: State
  size?: number
}) {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? true)
  const full = variant === 'full'
  const waving = full && state === 'done'
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-state={state}
      data-variant={variant}
      width={size}
      height={size}
      viewBox={full ? '-14 -2 92 86' : '0 0 64 64'}
      className="shrink-0"
    >
      <g className={!reduced && state === 'working' ? 'docbot-bob' : undefined}>
        {full && (
          <g data-part="limbs" fill="none" stroke={INK} strokeLinecap="round">
            <path d="M24 57v11M40 57v11" strokeWidth="2.4" />
            <path d="M19 69.5h7M38 69.5h7" strokeWidth="3.2" />
            <path d="M5.5 40c-5 2-7.5 6-8 11" strokeWidth="2.4" />
            <circle cx="-2.6" cy="52.5" r="2.4" fill={INK} stroke="none" />
            {waving ? (
              <>
                <path data-part="wave" d="M58.5 38c5-2 8-6 9-12" strokeWidth="2.4" />
                <circle cx="67.8" cy="24" r="2.6" fill={INK} stroke="none" />
              </>
            ) : (
              <>
                <path d="M58.5 40c5 2 7.5 6 8 11" strokeWidth="2.4" />
                <circle cx="66.6" cy="52.5" r="2.4" fill={INK} stroke="none" />
              </>
            )}
          </g>
        )}
        <g data-part="folder">
          <path
            d="M8 22h15l4 4h27a3 3 0 0 1 3 3v24a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V25a3 3 0 0 1 3-3z"
            fill="#E39A12"
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <g data-part="page">
            <g transform="rotate(-9 30 18)">
              <rect x="15" y="4" width="27" height="30" rx="2.5" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
              <path d="M20 11h17M20 16h17M20 21h12" stroke="#6E9BE0" strokeWidth="2" strokeLinecap="round" />
            </g>
            <g transform="rotate(7 42 17)">
              <rect x="33" y="9" width="18" height="16" rx="2" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
              <path d="M36 21l4-4 3 3 2-2 4 4" fill="none" stroke="#3FA37A" strokeWidth="1.8" strokeLinejoin="round" />
            </g>
          </g>
          <path
            d="M6 30h52a2 2 0 0 1 2 2.3l-3.3 21.3A4 4 0 0 1 52.8 57H11.2a4 4 0 0 1-3.9-3.4L4 32.3A2 2 0 0 1 6 30z"
            fill="#FFC23D"
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <ellipse cx="19.5" cy="47.5" rx="2.6" ry="1.4" fill="#FF8FA3" opacity=".75" />
          <ellipse cx="44.5" cy="47.5" rx="2.6" ry="1.4" fill="#FF8FA3" opacity=".75" />
        </g>
        <g data-part="face" className={reduced ? undefined : 'docbot-blink'}>
          <Face state={state} />
        </g>
        {state === 'needs-approval' && (
          <g data-part="badge">
            <circle cx="56" cy="14" r="6" fill="#FF8A3D" stroke={INK} strokeWidth="1.6" />
            <path d="M56 10.8v3.6" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="56" cy="16.9" r="1" fill="#FFFFFF" />
          </g>
        )}
      </g>
    </svg>
  )
}
