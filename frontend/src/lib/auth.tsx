import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface AuthContextType {
  token: string | null
  login: (token: string, refreshToken?: string | null) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))

  useEffect(() => {
    if (token) localStorage.setItem('token', token)
    else localStorage.removeItem('token')
  }, [token])

  function login(accessToken: string, refreshToken?: string | null) {
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
    setToken(accessToken)
  }

  function logout() {
    localStorage.removeItem('refresh_token')
    setToken(null)
  }

  return (
    <AuthContext.Provider value={{
      token,
      login,
      logout,
      isAuthenticated: !!token,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
