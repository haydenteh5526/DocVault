import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
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

  useEffect(() => {
    if (token) localStorage.setItem('token', token)
    else localStorage.removeItem('token')
  }, [token])

  function login(accessToken: string, refreshToken?: string | null) {
    // Cached data belongs to the previous account; drop all of it before the new token is used.
    queryClient.clear()
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
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
