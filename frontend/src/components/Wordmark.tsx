import { FileText } from 'lucide-react'
export function Wordmark() {
  return <span role="img" aria-label="DocVault" className="inline-flex shrink-0 items-center gap-2.5 text-xl font-semibold tracking-tight">
    <span className="inline-grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><FileText size={20} strokeWidth={1.75} aria-hidden="true" /></span>
    DocVault
  </span>
}
