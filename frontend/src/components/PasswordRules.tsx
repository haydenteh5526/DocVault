/** The password rules, exactly as the server's `check_password_rules` enforces them for a new password. */
export const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: '8 to 128 characters', test: p => p.length >= 8 && p.length <= 128 },
  { label: 'One uppercase letter', test: p => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: p => /[a-z]/.test(p) },
  { label: 'One number', test: p => /[0-9]/.test(p) },
  { label: 'One special character', test: p => /[^A-Za-z0-9]/.test(p) },
]

/** The server's message when a new password breaks a rule. */
export const PASSWORD_RULES_MESSAGE =
  'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.'

export function meetsPasswordRules(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password))
}

/** A compact live checklist under a new-password field. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-0.5 text-[11px]" aria-label="Password rules">
      {PASSWORD_RULES.map(rule => <PasswordReq key={rule.label} met={rule.test(password)}>{rule.label}</PasswordReq>)}
    </ul>
  )
}

function PasswordReq({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 transition-all duration-300 ${met ? 'text-success' : 'text-muted-foreground'}`}>
      <span data-part="rule-marker" data-met={met} className={`inline-flex shrink-0 items-center justify-center w-3.5 h-3.5 rounded-full transition-colors duration-300 ${met ? 'bg-success' : 'rule-unmet'}`}>
        {met && <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      {children}
    </li>
  )
}
