import { useId } from 'react'

/**
 * The DocVault mark: an obsidian rounded tile (the vault) with a metallic top rim, holding one folded-corner
 * page in a white-to-silver gradient with a dark keyhole. Fixed colours, so it reads the same on light and dark
 * surfaces. Matches public/favicon.svg; the gradient ids are unique per instance so several marks can share a page.
 */
export function VaultMonogram({ size = 28 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const id = (name: string) => `dv-${name}-${uid}`
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <defs>
        <linearGradient id={id('tile')} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#141417" />
          <stop offset="1" stopColor="#09090B" />
        </linearGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="0.18" stopColor="#52525B" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#2A2A2E" />
          <stop offset="1" stopColor="#1C1C1F" />
        </linearGradient>
        <linearGradient id={id('page')} x1="0" y1="9" x2="0" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#D4D4D8" />
          <stop offset="1" stopColor="#A1A1AA" />
        </linearGradient>
        <linearGradient id={id('flap')} x1="37" y1="20" x2="48" y2="9" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A1A1AA" />
          <stop offset="1" stopColor="#F4F4F5" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="63" height="63" rx="14" fill={`url(#${id('tile')})`} stroke={`url(#${id('rim')})`} strokeWidth="1" />
      <path d="M18.5 9H35V18.5A3.5 3.5 0 0 0 38.5 22H50V50.5A4.5 4.5 0 0 1 45.5 55H18.5A4.5 4.5 0 0 1 14 50.5V13.5A4.5 4.5 0 0 1 18.5 9Z" fill={`url(#${id('page')})`} />
      <path d="M37 9L48 20H40.5A3.5 3.5 0 0 1 37 16.5Z" fill={`url(#${id('flap')})`} />
      <path d="M14.9 50.5V13.5A3.6 3.6 0 0 1 18.5 9.9H34.1" fill="none" stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M49.1 22.9V50.5A3.6 3.6 0 0 1 45.5 54.1H18.5" fill="none" stroke="#71717A" strokeOpacity="0.7" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="32" cy="28.5" r="5.5" fill="#09090B" />
      <path d="M29.3 31.5H34.7L36.4 43H27.6Z" fill="#09090B" />
    </svg>
  )
}
