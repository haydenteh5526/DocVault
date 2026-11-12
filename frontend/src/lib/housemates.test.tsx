// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './auth'
import { queryClient } from './queryClient'
import { getHousemates, type Housemate } from './api'
import { useHousemates } from './housemates'

vi.mock('./api')

function token(sub: string) {
  return `h.${btoa(JSON.stringify({ sub }))}.s`
}

const aoife: Housemate = { id: 'h1', label: 'Aoife', position: 1, created_at: '2026-11-12T10:00:00' }
const mocked = vi.mocked(getHousemates)

let seen: (Housemate[] | undefined)[] = []
let auth!: ReturnType<typeof useAuth>

function Probe({ enabled = true }: { enabled?: boolean }) {
  const current = useAuth()
  const query = useHousemates(enabled)
  useEffect(() => {
    auth = current
  })
  seen.push(query.data)
  return null
}

function mount(enabled = true) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><Probe enabled={enabled} /></AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  seen = []
  mocked.mockReset()
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  localStorage.clear()
})

describe('useHousemates', () => {
  it("loads the signed-in account's housemates under its own key", async () => {
    localStorage.setItem('token', token('a1'))
    mocked.mockResolvedValue([aoife])
    mount()
    await waitFor(() => expect(seen[seen.length - 1]).toEqual([aoife]))
    expect(queryClient.getQueryData(['housemates', 'a1'])).toEqual([aoife])
  })

  it("a second account never receives the first account's housemates", async () => {
    localStorage.setItem('token', token('a1'))
    mocked.mockResolvedValue([aoife])
    mount()
    await waitFor(() => expect(seen[seen.length - 1]).toEqual([aoife]))

    let resolve!: (list: Housemate[]) => void
    mocked.mockReturnValue(new Promise<Housemate[]>(r => { resolve = r }))
    seen = []
    act(() => auth.logout())
    act(() => auth.login(token('b1')))
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(data => data === undefined)).toBe(true)

    await act(async () => resolve([]))
    await waitFor(() => expect(seen[seen.length - 1]).toEqual([]))
    expect(JSON.stringify(seen)).not.toContain('Aoife')
    expect(queryClient.getQueryData(['housemates', 'a1'])).toBeUndefined()
  })

  it('the key alone separates accounts', async () => {
    queryClient.setQueryData(['housemates', 'a1'], [aoife])
    localStorage.setItem('token', token('b1'))
    mocked.mockReturnValue(new Promise<Housemate[]>(() => {}))
    mount()
    await waitFor(() => expect(mocked).toHaveBeenCalled())
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(data => data === undefined)).toBe(true)
  })

  it('does not fetch when signed out or disabled', async () => {
    mount()
    cleanup()
    localStorage.setItem('token', token('a1'))
    mount(false)
    await new Promise(r => setTimeout(r, 20))
    expect(mocked).not.toHaveBeenCalled()
  })
})
