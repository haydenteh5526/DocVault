import { useState, useEffect, useRef, startTransition } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, Mail, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import './landing.css'
import { PasswordStrength } from '@/components/PasswordStrength'
import { PasswordRules } from '@/components/PasswordRules'
import { PinInput } from '@/components/PinInput'
import { ResendVerification } from '@/components/ResendVerification'
import { SafeDoor } from '@/components/SafeDoor'
import type { VaultState } from '@/components/VaultDoor'
import { useAuth } from '@/lib/auth'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { AuthError, getAuthProviders, loginUser, registerUser, verify2FA } from '@/lib/api'

/** The open phase: beat 1 (0-180 ms) the handle turns and the bolts pull out; beat 2 (180-700 ms) the door swings and the room scales forward. Any key or click skips it. */
const DOOR_OPEN_MS = 700
/** How long the shake shows before the door settles again. */
const DOOR_ERROR_MS = 400

export default function AuthPage({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const isRegister = mode === 'register'
  const [step, setStep] = useState<'email' | 'credentials' | '2fa'>('email')
  // Registration worked: the confirmation shows in the interior behind the open door.
  const [confirmed, setConfirmed] = useState(false)
  // The open door has finished (or was skipped) and is taken away.
  const [settled, setSettled] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  // The server refused sign-in because the email is not verified yet (403): offer a new link.
  const [unverified, setUnverified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  // Google sign-in is offered only when the server is configured for it.
  // While loading, or if the call fails, no Google button is drawn.
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [door, setDoor] = useState<VaultState>('closed')
  const [announcement, setAnnouncement] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const cancelWait = useRef<(() => void) | null>(null)
  // Bumped on every switch between /login and /register. A response that arrives after a switch
  // belongs to the other page, so it is ignored (L-pre-1).
  const requestId = useRef(0)

  // Leaving the page cancels any door timer or skip listener.
  useEffect(() => () => cancelWait.current?.(), [])

  // At most one door wait (the open door's timer and skip listeners, or a shake's timer) is live at a time.
  // Starting a new one, submitting again, switching page or leaving cancels the old one first.
  function cancelDoorWait() {
    cancelWait.current?.()
  }

  // Run the action once the door has been open for DOOR_OPEN_MS, at once on a key or click,
  // and at once under reduced motion.
  function afterDoorOpens(action: () => void) {
    cancelDoorWait()
    if (reducedMotion) { action(); return }
    let done = false
    const cleanup = () => {
      done = true
      window.clearTimeout(timer)
      window.removeEventListener('keydown', run)
      window.removeEventListener('pointerdown', run)
      if (cancelWait.current === cleanup) cancelWait.current = null
    }
    const run = () => {
      if (done) return
      // Its own cleanup, never whatever the ref holds now.
      cleanup()
      action()
    }
    const timer = window.setTimeout(run, DOOR_OPEN_MS)
    window.addEventListener('keydown', run)
    window.addEventListener('pointerdown', run)
    cancelWait.current = cleanup
  }

  // Shake after the server says no, then settle on `rest`.
  function shake(rest: VaultState) {
    cancelDoorWait()
    setDoor('error')
    if (reducedMotion) { setDoor(rest); return }
    const cleanup = () => {
      window.clearTimeout(timer)
      if (cancelWait.current === cleanup) cancelWait.current = null
    }
    const timer = window.setTimeout(() => { cleanup(); setDoor(rest) }, DOOR_ERROR_MS)
    cancelWait.current = cleanup
  }

  // The server accepted the sign-in: open the door, then store the session and go to the app.
  // The session is stored when the door finishes or is skipped, because App redirects /login
  // to /app as soon as a session exists.
  function enterApp(accessToken: string, refreshToken?: string | null) {
    setDoor('open')
    setAnnouncement('Signed in')
    afterDoorOpens(() => {
      // One transition, so the session and the move to /app commit together. React Router applies
      // navigation in a transition; a plain login() would render first, and App's /login guard would
      // redirect to /app without the state that tells the app shell to play its entrance.
      startTransition(() => {
        login(accessToken, refreshToken)
        navigate('/app', { state: { fromVault: true } })
      })
    })
  }

  function changePassword(value: string) {
    setPassword(value)
    if (door === 'closed' || door === 'entering') setDoor(value ? 'entering' : 'closed')
  }

  useEffect(() => {
    let active = true
    getAuthProviders()
      .then(providers => { if (active) setGoogleEnabled(providers.google) })
      .catch(() => { if (active) setGoogleEnabled(false) })
    return () => { active = false }
  }, [])

  // Reset state when switching between login/register. /login and /register share this component,
  // so a registration's open door, its timers and its loading state must not carry over.
  useEffect(() => {
    requestId.current += 1
    cancelWait.current?.()
    setLoading(false)
    setStep('email')
    setError('')
    setUnverified(false)
    setPassword('')
    setName('')
    setDoor('closed')
    setConfirmed(false)
    setSettled(false)
  }, [mode])

  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError('')
    setStep('credentials')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const id = requestId.current
    const current = () => id === requestId.current
    cancelDoorWait()
    setError('')
    setUnverified(false)
    setLoading(true)
    // The request starts now; the door only starts turning and learns nothing until the server answers.
    setDoor('unlocking')
    // While the door is opening the button stays disabled, so a second click cannot send a second request.
    let opening = false
    try {
      if (isRegister) {
        await registerUser(email, password, name || undefined)
        if (!current()) return
        opening = true
        setDoor('open')
        setConfirmed(true)
        afterDoorOpens(() => { setSettled(true); setLoading(false) })
      } else {
        const data = await loginUser(email, password, rememberMe)
        if (!current()) return
        if (data.requires_2fa) {
          setStep('2fa')
        } else if (data.access_token) {
          opening = true
          enterApp(data.access_token, data.refresh_token)
        }
      }
    } catch (err) {
      if (!current()) return
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setUnverified(err instanceof AuthError && err.status === 403)
      shake('closed')
    } finally {
      if (!opening && current()) setLoading(false)
    }
  }

  return (
    <SafeDoor
      state={door}
      progress={password.length}
      badge={step === '2fa' ? 'second-ring' : undefined}
      settled={settled}
      announcement={announcement}
      topRight={<Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create account'}</Link>}
      interior={confirmed ? (
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
            We sent a verification link to <span className="font-medium text-foreground">{email}</span>. Click the link to activate your account.
          </p>
          <div className="mt-8 space-y-3">
            <Button className="safe-primary w-full h-11" asChild>
              <Link to="/login">Go to sign in</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Didn't receive it? Check your spam folder.
            </p>
            <ResendVerification email={email} label="Resend email" justSent />
          </div>
        </div>
      ) : undefined}
    >
          {step === '2fa' ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.07] flex items-center justify-center mx-auto mb-5">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Two-factor authentication</h1>
              <p className="text-sm text-muted-foreground mt-2">Enter the 6-digit code from your authenticator app.</p>
              <form onSubmit={async (e) => {
                e.preventDefault()
                const id = requestId.current
                cancelDoorWait()
                // Back to VERIFYING at once, so a quick second code is never checked under a stale INVALID.
                setDoor('unlocking')
                setError('')
                setLoading(true)
                let opening = false
                try {
                  const data = await verify2FA(email, password, totpCode, rememberMe)
                  if (id !== requestId.current) return
                  opening = true
                  enterApp(data.access_token, data.refresh_token)
                } catch (err) {
                  if (id !== requestId.current) return
                  setError(err instanceof Error ? err.message : 'Invalid code')
                  shake('unlocking')
                } finally { if (!opening && id === requestId.current) setLoading(false) }
              }} className="mt-6 space-y-4">
                <PinInput value={totpCode} onChange={setTotpCode} autoFocus />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full h-11 bg-primary border-0 text-primary-foreground" disabled={loading || totpCode.length !== 6}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : 'Verify'}
                </Button>
              </form>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight">
                  {isRegister ? 'Create an account' : 'Welcome back'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {step === 'email'
                    ? 'Enter your email to get started'
                    : isRegister ? 'Set up your password' : 'Enter your password to sign in'
                  }
                </p>
              </div>

              {step === 'email' ? (
                <form onSubmit={handleEmailContinue} className="space-y-4">
                  <label htmlFor="auth-email" className="block text-sm font-medium">Email address</label>
                  <Input id="auth-email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required className="h-11" />
                  <Button type="submit" className="w-full h-11 bg-primary border-0 text-primary-foreground transition-all duration-200">
                    <Mail size={15} className="mr-2" /> Continue with Email
                  </Button>
                  {googleEnabled && (
                    <>
                      <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
                        <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">or</span></div>
                      </div>
                      <Button variant="outline" className="w-full h-11 transition-all duration-200 hover:bg-accent/50" type="button" onClick={() => { window.location.href = '/api/v1/auth/oauth/google' }}>
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Continue with Google
                      </Button>
                    </>
                  )}
                  {!isRegister && (
                    <p className="text-center text-xs text-muted-foreground">
                      <Link to="/forgot-password" className="link-draw text-primary">Forgot password?</Link>
                    </p>
                  )}
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/40">
                    <Mail size={14} className="text-muted-foreground" />
                    <span className="text-sm">{email}</span>
                    <button type="button" onClick={() => setStep('email')} className="ml-auto text-xs text-primary hover:underline">Change</button>
                  </div>

                  {isRegister && (
                    <label className="block text-sm font-medium">Full name<Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="mt-1 h-11" /></label>
                  )}

                  <div>
                    <label htmlFor="auth-password" className="mb-1 block text-sm font-medium">Password</label>
                    <div className="relative">
                      <Input id="auth-password" autoComplete={isRegister ? "new-password" : "current-password"} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => changePassword(e.target.value)} placeholder="Password" required minLength={8} maxLength={isRegister ? 128 : undefined} autoFocus className="h-11 pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {isRegister && (
                      <>
                        <div className="mt-2"><PasswordStrength password={password} /></div>
                        <PasswordRules password={password} />
                      </>
                    )}
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {unverified && <ResendVerification email={email} />}

                  {!isRegister && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-border/60 text-primary accent-primary focus:ring-primary/40 cursor-pointer"
                      />
                      Keep me signed in
                    </label>
                  )}

                  <Button type="submit" className="w-full h-11 bg-primary border-0 text-primary-foreground transition-all duration-200 disabled:opacity-70" disabled={loading}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : isRegister ? 'Create account' : 'Sign in'}
                  </Button>

                  {!isRegister && (
                    <p className="text-center text-xs text-muted-foreground">
                      <Link to="/forgot-password" className="link-draw text-primary">Forgot password?</Link>
                    </p>
                  )}
                </form>
              )}

              <p className="text-center text-[11px] text-muted-foreground mt-8">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </>
          )}
    </SafeDoor>
  )
}
