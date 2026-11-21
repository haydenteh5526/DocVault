import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecessedBadge } from '@/components/RecessedBadge'
import { SafeDoor } from '@/components/SafeDoor'
import { useAuth } from '@/lib/auth'

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Sign-in session expired. Please try again.',
  token_exchange_failed: "Couldn't complete sign-in with Google.",
  userinfo_failed: "Couldn't read your Google profile.",
  email_unverified: 'Your Google email is not verified.',
}

/**
 * Landing route for the Google OAuth redirect. The backend appends the tokens
 * (or an error) to the URL fragment; we read them here, persist the session,
 * and forward the user into the app.
 */
export default function OAuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fragment looks like: #access_token=...&refresh_token=...  OR  #error=...
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const err = params.get('error')

    // Clear the fragment so tokens don't linger in the address bar / history
    window.history.replaceState(null, '', window.location.pathname)

    if (accessToken) {
      login(accessToken, refreshToken)
      navigate('/app', { replace: true })
    } else {
      setError(err || 'unknown')
    }
  }, [login, navigate])

  return (
    <SafeDoor
      state={error ? 'error' : 'unlocking'}
      status={error ? undefined : { label: 'SIGNING IN', led: 'verifying' }}
    >
      {error ? (
        <div>
          <RecessedBadge tone="danger"><AlertCircle /></RecessedBadge>
          <h1 className="text-2xl font-bold tracking-tight">Sign-in failed</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {ERROR_MESSAGES[error] || 'Something went wrong during sign-in.'}
          </p>
          <Button variant="outline" className="w-full h-10 mt-8" asChild>
            <Link to="/login" replace>Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Completing sign-in</h1>
          <p className="text-sm text-muted-foreground mt-2">Finishing your Google sign-in…</p>
        </div>
      )}
    </SafeDoor>
  )
}
