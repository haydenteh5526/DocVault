import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
function subscribe(update: () => void) {
  const media = window.matchMedia?.(query)
  media?.addEventListener('change', update)
  return () => media?.removeEventListener('change', update)
}
export function DocBotMark({
  state = 'idle',
  size = 38,
}: {
  state?: 'idle' | 'working' | 'needs-you' | 'done'
  size?: number
}) {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? true)
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="shrink-0"
    >
      <path fill="#FFD83D" d="M10 4h19l11 11v24c0 3-2 5-5 5H11c-3 0-5-2-5-5V9c0-3 1-5 4-5Z" />
      <path fill="#D9AE00" d="M29 4v8c0 2 1 3 3 3h8Z" />
      <g fill="#14171F" className={reduced ? undefined : 'docbot-blink'}>
        {state === 'done' ? (
          <path
            d="M13 26q3-7 6 0m6 0q3-7 6 0"
            fill="none"
            stroke="#14171F"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ) : (
          <g transform={state === 'working' ? 'translate(2 -3)' : undefined}>
            {[16, 29].map((x) => (
              <ellipse key={x} cx={x} cy="25" rx="2.8" ry={state === 'needs-you' ? 5 : 3.8} />
            ))}
          </g>
        )}
      </g>
      {state === 'needs-you' && <circle cx="22.5" cy="34" r="1.7" fill="#14171F" />}
    </svg>
  )
}
