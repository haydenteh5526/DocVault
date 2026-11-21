import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, CheckCircle, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordRules, PASSWORD_RULES_MESSAGE, meetsPasswordRules } from '@/components/PasswordRules'
import { RecessedBadge } from '@/components/RecessedBadge'
import { SafeDoor } from '@/components/SafeDoor'
import type { VaultState } from '@/components/VaultDoor'
import { AuthError, resetPassword } from '@/lib/api'
import { useReducedMotion } from '@/lib/useReducedMotion'

/** How long the shake shows before the door settles again (the same as sign-in). */
const DOOR_ERROR_MS = 400

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const reducedMotion = useReducedMotion()

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'form' | 'done' | 'link-invalid'>(token ? 'form' : 'link-invalid')
  const [error, setError] = useState('')
  const [door, setDoor] = useState<VaultState>('closed')
  const shakeTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(shakeTimer.current), [])

  const resting = (value: string): VaultState => (value ? 'entering' : 'closed')

  function shake(message: string) {
    window.clearTimeout(shakeTimer.current)
    setError(message)
    setDoor('error')
    if (reducedMotion) { setDoor(resting(password)); return }
    shakeTimer.current = window.setTimeout(() => setDoor(resting(password)), DOOR_ERROR_MS)
  }

  function changePassword(value: string) {
    setPassword(value)
    if (door === 'closed' || door === 'entering') setDoor(resting(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!meetsPasswordRules(password)) {
      shake(PASSWORD_RULES_MESSAGE)
      return
    }
    window.clearTimeout(shakeTimer.current)
    setError('')
    setLoading(true)
    setDoor('unlocking')
    try {
      await resetPassword(token, password)
      setPhase('done')
    } catch (err) {
      if (err instanceof AuthError && err.status === 400) {
        setPhase('link-invalid')
      } else {
        shake(err instanceof Error ? err.message : 'Something went wrong')
      }
    } finally {
      setLoading(false)
    }
  }

  const status =
    phase === 'done' ? { label: 'UPDATED', led: 'unlocked' as const }
    : phase === 'link-invalid' ? { label: 'INVALID', led: 'invalid' as const }
    : door === 'unlocking' ? { label: 'UPDATING', led: 'verifying' as const }
    : undefined

  return (
    <SafeDoor
      state={phase === 'form' ? door : phase === 'done' ? 'unlocking' : 'closed'}
      progress={password.length}
      badge="key"
      status={status}
      announcement={phase === 'done' ? 'Password updated' : ''}
      topRight={<Link to="/login"><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</Link>}
    >
      {phase === 'link-invalid' ? (
        <div>
          <RecessedBadge tone="danger"><AlertCircle /></RecessedBadge>
          <h1 className="text-2xl font-bold tracking-tight">This reset link no longer works</h1>
          <p className="text-sm text-muted-foreground mt-2">
            It may have expired, been used already or been replaced by a newer link. Reset links work once, for 30 minutes.
          </p>
          <Button variant="outline" className="w-full h-10 mt-8" asChild>
            <Link to="/forgot-password">Request a new reset link</Link>
          </Button>
        </div>
      ) : phase === 'done' ? (
        <div>
          <RecessedBadge tone="success"><CheckCircle /></RecessedBadge>
          <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your new password is set, and every other session has been signed out.
          </p>
          <Button variant="outline" className="w-full h-10 mt-8" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Choose a strong password for your account.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="recovery-field" className="mb-1 block text-sm font-medium">New password</label>
              <div className="relative">
                <Input id="recovery-field"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => changePassword(e.target.value)}
                  placeholder="New password"
                  required
                  maxLength={128}
                  autoFocus
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <PasswordRules password={password} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-11 bg-primary border-0 text-primary-foreground" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Reset password'}
            </Button>
          </form>
        </>
      )}
    </SafeDoor>
  )
}
