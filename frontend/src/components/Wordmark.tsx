import { VaultMonogram } from './VaultMonogram'

export function Wordmark({ collapse = false }: { collapse?: boolean }) {
  return (
    <span
      role="img"
      aria-label="DocVault"
      style={{ fontFamily: 'var(--font-display)', color: 'var(--brand-ink)' }}
      className="inline-flex shrink-0 items-center gap-2.5 text-xl font-bold tracking-tight"
    >
      <VaultMonogram size={28} />
      <span className={collapse ? 'max-[399px]:hidden' : undefined}>DocVault</span>
    </span>
  )
}
