import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
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

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Sign-in failed</h1>
        <p className="text-sm text-muted-foreground mt-2 text-center max-w-xs">
          {ERROR_MESSAGES[error] || 'Something went wrong during sign-in.'}
        </p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="mt-6 h-10 px-6 rounded-lg gradient-bg text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground mt-4">Completing sign-in…</p>
    </div>
  )
}
