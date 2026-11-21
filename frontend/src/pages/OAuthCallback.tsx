import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
  // Read the fragment once, when the page is first created: it is cleared straight after, so a second
  // effect run (React StrictMode in development) would otherwise find nothing and replace the real error.
  // Fragment looks like: #access_token=...&refresh_token=...  OR  #error=...
  const [fragment] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    return { accessToken: params.get('access_token'), refreshToken: params.get('refresh_token'), error: params.get('error') }
  })
  const error = fragment.accessToken ? null : fragment.error || 'unknown'

  useEffect(() => {
    // Clear the fragment so tokens don't linger in the address bar / history
    window.history.replaceState(null, '', window.location.pathname)
    if (fragment.accessToken) {
      login(fragment.accessToken, fragment.refreshToken)
      navigate('/app', { replace: true })
    }
  }, [fragment, login, navigate])

  return (
    <SafeDoor
      state={error ? 'error' : 'unlocking'}
      status={error ? { label: 'FAILED', led: 'invalid' } : { label: 'SIGNING IN', led: 'verifying' }}
    >
      {error ? (
        <div>
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
