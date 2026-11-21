import { SafeDoor } from '@/components/SafeDoor'
import { RecessedBadge } from '@/components/RecessedBadge'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { forgotPassword } from '@/lib/api'
import { RESEND_COOLDOWN_S, useCooldown } from '@/lib/useCooldown'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [resendNote, setResendNote] = useState('')
  // The server allows a few reset requests a minute per address; the button waits a full minute between sends.
  const [remaining, startCooldown] = useCooldown(RESEND_COOLDOWN_S)

  async function send() {
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
      startCooldown()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setResendNote('')
    await send()
  }

  async function resend() {
    setResendNote('')
    if (await send()) setResendNote('Sent again. Only the newest link is needed.')
  }

  return (
    <SafeDoor
      state={loading && !sent ? 'unlocking' : 'closed'}
      status={sent ? { label: 'CHECK EMAIL', led: 'sent' } : loading ? { label: 'SENDING', led: 'verifying' } : undefined}
      badge="key"
      topRight={<Link to="/login"><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</Link>}
    >
        {sent ? (
          <div>
            <RecessedBadge tone="success"><CheckCircle /></RecessedBadge>
            <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground mt-2">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, we've sent a link to reset your password. The link expires in 30 minutes.
            </p>
            <Button variant="outline" className="w-full h-10 mt-8" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
            <div className="mt-4 flex items-center justify-center gap-4">
              <button type="button" className="safe-text-action" onClick={resend} disabled={loading || remaining > 0}>
                {remaining > 0 ? `Resend link in ${remaining}s` : 'Resend link'}
              </button>
              <span aria-hidden="true" className="text-xs text-muted-foreground">·</span>
              <button type="button" className="safe-text-action" onClick={() => { setSent(false); setResendNote(''); setError('') }}>
                Try a different email
              </button>
            </div>
            {(resendNote || error) && (
              <p role="status" className={`mt-3 text-center text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error || resendNote}</p>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Enter your email and we'll send you a link to reset it.
            </p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label htmlFor="recovery-field" className="block text-sm font-medium">Email address</label>
              <Input id="recovery-field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
                className="h-11"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-11 bg-primary border-0 text-primary-foreground" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={15} className="mr-2" /> Send reset link</>}
              </Button>
            </form>
          </>
        )}
    </SafeDoor>
  )
}
