// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth, accountIdFromToken } from './auth'
import { queryClient } from './queryClient'

afterEach(() => {
  cleanup()
  queryClient.clear()
  localStorage.clear()
})

function token(sub: string) {
  return `h.${btoa(JSON.stringify({ sub }))}.s`
}

describe('accountIdFromToken', () => {
  it('reads the account id from the token', () => {
    expect(accountIdFromToken(token('a1'))).toBe('a1')
    expect(accountIdFromToken(null)).toBeNull()
    expect(accountIdFromToken('')).toBeNull()
    expect(accountIdFromToken('not-a-token')).toBeNull()
    expect(accountIdFromToken(`h.${btoa('not json')}.s`)).toBeNull()
    expect(accountIdFromToken(`h.${btoa(JSON.stringify({ name: 'x' }))}.s`)).toBeNull()
  })
})

describe('AuthProvider', () => {
  it('signing in and signing out drop every cached query', () => {
    let auth!: ReturnType<typeof useAuth>
    function Probe() {
      auth = useAuth()
      return null
    }
    localStorage.setItem('token', token('a1'))
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>,
    )
    expect(auth.accountId).toBe('a1')

    const seed = () => {
      queryClient.setQueryData(['document', 'd1'], { id: 'd1' })
      queryClient.setQueryData(['housemates', 'a1'], [{ id: 'h1', label: 'Aoife' }])
    }
    seed()
    act(() => auth.logout())
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)

    seed()
    act(() => auth.login(token('b1')))
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(auth.accountId).toBe('b1')
  })

  describe('changes made in another tab', () => {
    let auth!: ReturnType<typeof useAuth>
    function Probe() {
      auth = useAuth()
      return null
    }
    function mount(initialToken: string | null) {
      if (initialToken) localStorage.setItem('token', initialToken)
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider><Probe /></AuthProvider>
        </QueryClientProvider>,
      )
    }
    function otherTab(key: string, newValue: string | null) {
      act(() => { window.dispatchEvent(new StorageEvent('storage', { key, newValue })) })
    }

    it('a token removed in another tab signs this tab out', () => {
      mount(token('a1'))
      expect(auth.isAuthenticated).toBe(true)
      queryClient.setQueryData(['document', 'd1'], { id: 'd1' })

      otherTab('token', null)

      expect(auth.isAuthenticated).toBe(false)
      expect(auth.token).toBeNull()
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    })

    it('a token set in another tab signs this tab in', () => {
      mount(null)
      expect(auth.isAuthenticated).toBe(false)

      otherTab('token', token('b1'))

      expect(auth.isAuthenticated).toBe(true)
      expect(auth.accountId).toBe('b1')
    })

    it('a different account in another tab drops the cached data', () => {
      mount(token('a1'))
      queryClient.setQueryData(['document', 'd1'], { id: 'd1' })

      otherTab('token', token('b1'))

      expect(auth.accountId).toBe('b1')
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    })

    it('a refreshed token for the same account keeps the cache', () => {
      mount(token('a1'))
      queryClient.setQueryData(['document', 'd1'], { id: 'd1' })

      otherTab('token', token('a1') + 'x')

      expect(auth.accountId).toBe('a1')
      expect(queryClient.getQueryData(['document', 'd1'])).toEqual({ id: 'd1' })
    })

    it('ignores other keys', () => {
      mount(token('a1'))
      otherTab('theme', 'dark')
      expect(auth.isAuthenticated).toBe(true)
    })
  })
})
