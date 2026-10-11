import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Layers, Loader2, CheckCircle, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrength } from '@/components/PasswordStrength'
import { resetPassword } from '@/lib/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setError('')
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 relative bg-background">
      <Link to="/login" className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
        <ArrowLeft size={15} /> Back to sign in
      </Link>

      <div className="w-full max-w-sm mx-auto animate-fade-in">
        <div className="flex items-center gap-2 mb-8">
          <Layers size={22} className="text-primary" />
          <span className="text-lg font-semibold gradient-text tracking-tight">DocVault</span>
        </div>

        {!token ? (
          <div className="animate-scale-in">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Invalid reset link</h1>
            <p className="text-sm text-muted-foreground mt-2">
              This link is missing its token. Request a new password reset link.
            </p>
            <Button variant="outline" className="w-full h-10 mt-8" asChild>
              <Link to="/forgot-password">Request new link</Link>
            </Button>
          </div>
        ) : done ? (
          <div className="animate-scale-in">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Password reset</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Your password has been updated. Redirecting you to sign in…
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Choose a strong password for your account.
            </p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password"
                    required
                    minLength={8}
                    autoFocus
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="mt-2"><PasswordStrength password={password} /></div>
              </div>
              {error && <p className="text-sm text-destructive animate-fade-in">{error}</p>}
              <Button type="submit" className="w-full h-11 gradient-bg border-0 text-white shadow-md shadow-primary/20" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Reset password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
