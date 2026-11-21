import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { resendVerification } from '@/lib/api'
import { RESEND_COOLDOWN_S, useCooldown } from '@/lib/useCooldown'

/**
 * Asks for a new verification link for `email`, then waits out the server's cooldown before allowing another.
 * The server's reply is the same whatever the account's state, and it is shown as given.
 */
export function ResendVerification({ email, label = 'Resend verification email', justSent = false, primary = false }: {
  email: string
  label?: string
  /** Draw a full-width button, for a page where resending is the main action. */
  primary?: boolean
  /** A link went out a moment ago (registration), so the server's cooldown is already running. */
  justSent?: boolean
}) {
  const [remaining, startCooldown] = useCooldown(RESEND_COOLDOWN_S, justSent)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  async function resend() {
    setSending(true)
    setMessage('')
    try {
      const res = await resendVerification(email)
      setMessage(res.message)
      startCooldown()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-1.5 text-center">
      {primary ? (
        <Button type="button" className="safe-primary w-full h-11" onClick={resend} disabled={sending || remaining > 0 || !email}>
          {remaining > 0 ? `${label} in ${remaining}s` : label}
        </Button>
      ) : (
        <button type="button" onClick={resend} disabled={sending || remaining > 0 || !email} className="safe-text-action">
          {remaining > 0 ? `${label} in ${remaining}s` : label}
        </button>
      )}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
