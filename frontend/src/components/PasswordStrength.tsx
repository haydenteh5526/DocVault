export function PasswordStrength({ password }: { password: string }) {
  const strength = getStrength(password)
  if (!password) return null

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i <= strength.score
              ? strength.score <= 1 ? 'bg-red-500' : strength.score <= 2 ? 'bg-yellow-500' : strength.score <= 3 ? 'bg-blue-500' : 'bg-green-500'
              : 'bg-muted'
          }`} />
        ))}
      </div>
      <p className={`text-[11px] transition-colors duration-200 ${
        strength.score <= 1 ? 'text-red-500' : strength.score <= 2 ? 'text-yellow-600' : strength.score <= 3 ? 'text-blue-600' : 'text-green-600'
      }`}>
        {strength.label}
      </p>
    </div>
  )
}

function getStrength(password: string): { score: number; label: string } {
  if (password.length < 6) return { score: 0, label: 'Too short' }

  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { score: 1, label: 'Weak — add numbers or symbols' }
  if (score <= 2) return { score: 2, label: 'Fair — try adding more characters' }
  if (score <= 3) return { score: 3, label: 'Good' }
  return { score: 4, label: 'Strong' }
}
