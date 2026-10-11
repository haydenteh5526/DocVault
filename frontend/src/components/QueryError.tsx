import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  message?: string
  onRetry?: () => void
}

/** Compact inline error state for a failed data query, with an optional retry. */
export function QueryError({ message = "Couldn't load this data.", onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground/80">{message}</p>
      <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border/60 text-sm font-medium hover:bg-accent/50 transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  )
}
