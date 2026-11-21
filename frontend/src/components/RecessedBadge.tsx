import type { ReactNode } from 'react'

/** A dark, recessed status well machined into the faceplate, with a translucent tint and rim for its tone. */
export function RecessedBadge({ tone, children, className = '' }: { tone: 'success' | 'danger' | 'info'; children: ReactNode; className?: string }) {
  return (
    <div data-part="recessed-badge" className={`safe-badge safe-badge-${tone} ${className}`} aria-hidden="true">
      {children}
    </div>
  )
}
