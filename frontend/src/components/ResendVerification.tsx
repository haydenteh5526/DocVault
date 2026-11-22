import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { resendVerification } from '@/lib/api'
import { useLinkCooldown } from '@/lib/useCooldown'

/**
 * Asks for a new verification link for `email`, then waits out the server's cooldown before allowing another.
 * The countdown is shared per email address across this tab (registration starts it too), so the button is never
 * enabled while the server would drop the request. The server's reply is shown as given.
 */
export function ResendVerification({ email, label = 'Resend verification email', primary = false }: {
  email: string
  label?: string
  /** Draw a full-width button, for a page where resending is the main action. */
  primary?: boolean
}) {
  const [remaining, markSent] = useLinkCooldown('verify', email)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  async function resend() {
    setSending(true)
    setMessage('')
    try {
      const res = await resendVerification(email)
      setMessage(res.message)
      markSent()
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
