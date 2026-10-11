import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); setMessage('Invalid verification link.'); return }

    fetch(`/api/v1/auth/verify?token=${token}`)
      .then(async res => {
        const data = await res.json()
        if (res.ok) { setStatus('success'); setMessage(data.message) }
        else { setStatus('error'); setMessage(data.detail || 'Verification failed') }
      })
      .catch(() => { setStatus('error'); setMessage('Server unavailable') })
  }, [params])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center animate-scale-in max-w-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
            <p className="mt-4 text-sm text-muted-foreground">Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">Email verified!</h1>
            <p className="text-sm text-muted-foreground mt-2">{message}</p>
            <Button className="mt-6 gradient-bg border-0 text-white" asChild>
              <Link to="/login">Sign in to your account</Link>
            </Button>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
              <XCircle className="h-7 w-7 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold">Verification failed</h1>
            <p className="text-sm text-muted-foreground mt-2">{message}</p>
            <Button variant="outline" className="mt-6" asChild>
              <Link to="/register">Try again</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
