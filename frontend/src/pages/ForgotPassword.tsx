import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Layers, Loader2, Mail, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { forgotPassword } from '@/lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
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

        {sent ? (
          <div className="animate-scale-in">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground mt-2">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, we've sent a link to reset your password. The link expires in 30 minutes.
            </p>
            <Button variant="outline" className="w-full h-10 mt-8" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Enter your email and we'll send you a link to reset it.
            </p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
                className="h-11"
              />
              {error && <p className="text-sm text-destructive animate-fade-in">{error}</p>}
              <Button type="submit" className="w-full h-11 gradient-bg border-0 text-white shadow-md shadow-primary/20" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={15} className="mr-2" /> Send reset link</>}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
