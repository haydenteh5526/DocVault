import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RecessedBadge } from '@/components/RecessedBadge'
import { ResendVerification } from '@/components/ResendVerification'
import { SafeDoor } from '@/components/SafeDoor'
import { verifyEmail } from '@/lib/api'

type Outcome =
  | { kind: 'loading' }
  | { kind: 'verified' }
  | { kind: 'link'; message: string; expired: boolean }
  | { kind: 'failed'; message: string }

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [outcome, setOutcome] = useState<Outcome>(
    token ? { kind: 'loading' } : { kind: 'link', message: 'This link is missing its token.', expired: false },
  )
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!token) return
    let current = true
    verifyEmail(token)
      .then(result => {
        if (!current) return
        if (result.ok) setOutcome({ kind: 'verified' })
        else setOutcome({ kind: 'link', message: result.message, expired: /has expired/i.test(result.message) })
      })
      .catch(() => {
        if (current) setOutcome({ kind: 'failed', message: 'Server unavailable' })
      })
    return () => { current = false }
  }, [token])

  const door =
    outcome.kind === 'loading' ? { state: 'unlocking' as const, status: undefined }
    : outcome.kind === 'verified' ? { state: 'unlocking' as const, status: { label: 'VERIFIED', led: 'unlocked' as const } }
    : outcome.kind === 'link' ? { state: 'error' as const, status: { label: outcome.expired ? 'EXPIRED' : 'INVALID', led: 'invalid' as const } }
    : { state: 'error' as const, status: { label: 'OFFLINE', led: 'invalid' as const } }

  return (
    <SafeDoor state={door.state} status={door.status} announcement={outcome.kind === 'verified' ? 'Email verified' : ''}>
      {outcome.kind === 'loading' && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verifying your email</h1>
          <p className="text-sm text-muted-foreground mt-2">Checking your verification link…</p>
        </div>
      )}
      {outcome.kind === 'verified' && (
        <div>
          <RecessedBadge tone="success"><CheckCircle /></RecessedBadge>
          <h1 className="text-2xl font-bold tracking-tight">Email verified</h1>
          <p className="text-sm text-muted-foreground mt-2">Your account is active. You can sign in now.</p>
          <Button className="w-full h-11 mt-8 bg-primary border-0 text-primary-foreground" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      )}
      {outcome.kind === 'link' && (
        <div>
          <RecessedBadge tone="danger"><XCircle /></RecessedBadge>
          <h1 className="text-2xl font-bold tracking-tight">This link no longer works</h1>
          <p className="text-sm text-muted-foreground mt-2">{outcome.message}</p>
          <p className="text-sm text-muted-foreground mt-2">Enter the email you signed up with and we'll send a new link. Only the newest link works.</p>
          <div className="mt-6 space-y-3">
            <label htmlFor="verify-email" className="block text-sm font-medium">Email address</label>
            <Input id="verify-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-11" />
            <ResendVerification email={email.trim()} label="Send a new link" primary />
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Already verified? <Link to="/login" className="link-draw text-primary">Go to sign in</Link>
          </p>
        </div>
      )}
      {outcome.kind === 'failed' && (
        <div>
          <RecessedBadge tone="danger"><AlertCircle /></RecessedBadge>
          <h1 className="text-2xl font-bold tracking-tight">Verification failed</h1>
          <p className="text-sm text-muted-foreground mt-2">{outcome.message}</p>
          <p className="text-sm text-muted-foreground mt-2">Your link was not used. Try opening it again in a moment.</p>
        </div>
      )}
    </SafeDoor>
  )
}
