/** The Vault-Page Monogram: a rounded frame around a page with a folded corner and a keyhole. Draws in currentColor. */
export function VaultMonogram({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <rect x="5" y="5" width="54" height="54" rx="14" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M20.5 15h19l9 9v21.5a4.5 4.5 0 0 1-4.5 4.5h-23.5a4.5 4.5 0 0 1-4.5-4.5v-26a4.5 4.5 0 0 1 4.5-4.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinejoin="round"
      />
      <path
        d="M39.5 15v6.5a2.5 2.5 0 0 0 2.5 2.5h6.5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M21.5 21.5v22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="32.5" cy="30.5" r="3.6" fill="currentColor" />
      <path d="M30.8 32.5h3.4l1.1 7h-5.6z" fill="currentColor" />
    </svg>
  )
}
