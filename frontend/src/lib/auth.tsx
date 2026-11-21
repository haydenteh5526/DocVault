import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { queryClient } from './queryClient'

/** The account id is the access token's `sub` claim. Returns null for a missing or malformed token. */
export function accountIdFromToken(token: string | null): string | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const sub = (JSON.parse(atob(padded)) as { sub?: unknown } | null)?.sub
    return typeof sub === 'string' && sub !== '' ? sub : null
  } catch {
    return null
  }
}

interface AuthContextType {
  token: string | null
  login: (token: string, refreshToken?: string | null) => void
  logout: () => void
  isAuthenticated: boolean
  accountId: string | null
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))

  const tokenRef = useRef(token)

  useEffect(() => {
    tokenRef.current = token
    if (token) localStorage.setItem('token', token)
    else localStorage.removeItem('token')
  }, [token])

  // Another tab signed in, signed out or switched account: follow it. The event
  // only fires in the other tabs, so this tab's own writes never loop back.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== 'token') return
      const next = event.newValue
      const previous = tokenRef.current
      if (next === previous) return
      // Cached data belongs to the previous account. A refreshed token keeps the same account.
      if (next === null || accountIdFromToken(previous) !== accountIdFromToken(next)) queryClient.clear()
      tokenRef.current = next
      setToken(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function login(accessToken: string, refreshToken?: string | null) {
    // Cached data belongs to the previous account; drop all of it before the new token is used.
    queryClient.clear()
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
    // Stored now, not only by the effect after the next render: a sign-in may run in a transition that
    // holds the render while the app loads, and the session must already be saved when the URL changes.
    localStorage.setItem('token', accessToken)
    // And compare storage events against it from now on, so another tab signing out in the meantime is followed.
    tokenRef.current = accessToken
    setToken(accessToken)
  }

  function logout() {
    queryClient.clear()
    localStorage.removeItem('refresh_token')
    setToken(null)
  }

  return (
    <AuthContext.Provider value={{
      token,
      login,
      logout,
      isAuthenticated: !!token,
      accountId: accountIdFromToken(token),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
