// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'

vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    listConversations: vi.fn(async () => []),
    getProfile: vi.fn(async () => ({ display_name: 'Test', email: 'test@example.com' })),
    getDocuments: vi.fn(async () => ({ documents: [], total: 0 })),
    getExpiringWarranties: vi.fn(async () => []),
  }
})

// The pages are not under test; each one just names itself.
vi.mock('../pages/AskAI', () => ({ default: () => <p>Ask page</p> }))
vi.mock('../pages/Dashboard', () => ({ default: () => <p>Documents page</p> }))
vi.mock('../pages/Upload', () => ({ default: () => <p>Upload page</p> }))
vi.mock('../pages/Search', () => ({ default: () => <p>Search page</p> }))
vi.mock('../pages/Warranties', () => ({ default: () => <p>Warranties page</p> }))
vi.mock('../pages/SearchChats', () => ({ default: () => <p>Chats page</p> }))
vi.mock('../pages/Profile', () => ({ default: () => <p>Profile page</p> }))
vi.mock('../pages/DocumentDetail', () => ({ default: () => <p>Document page</p> }))
vi.mock('../pages/Settings', () => ({ default: () => <p>Settings content</p> }))

const token = `h.${btoa(JSON.stringify({ sub: 'a1' }))}.s`

function mediaAt(width: number) {
  window.matchMedia = vi.fn((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }
  }) as unknown as typeof window.matchMedia
}

function renderShell(path = '/app/documents') {
  localStorage.setItem('token', token)
  localStorage.setItem('docvault-onboarding-done', '1')
  window.history.pushState({}, '', path)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App />
    </QueryClientProvider>,
  )
}

beforeEach(() => mediaAt(1366))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('AppShell navigation', () => {
  it('the sidebar links to search, warranties and settings', async () => {
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')

    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Search page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/search')

    await user.click(screen.getByRole('button', { name: 'Warranties' }))
    expect(await screen.findByText('Warranties page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/warranties')

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('opens Documents at the home route and exposes the skip link first', async () => {
    const user = userEvent.setup()
    renderShell('/app')
    await screen.findByText('Documents page')
    await user.tab()
    expect(screen.getByRole('link', {name: 'Skip to content'})).toHaveFocus()
    expect(screen.getByRole('button', {name: 'Documents'})).toHaveAttribute('aria-current','page')
  })

  it('puts the three labelled destinations in the phone tab bar', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell('/app/ask')
    await screen.findByText('Ask page')
    const nav = screen.getByRole('navigation', {name:'Main navigation'})
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['Documents','Ask','Upload'])
    await user.click(within(nav).getByRole('button', {name:'Upload'}))
    expect(await screen.findByText('Upload page')).toBeVisible()
    expect(screen.queryByRole('button', {name:'Open menu'})).not.toBeInTheDocument()
  })

  it('keeps secondary destinations reachable on a phone and closes the menu after navigation', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')
    await user.click(await screen.findByRole('button', {name:/Account/}))
    expect(screen.getByRole('button',{name:'Warranties'})).toBeVisible()
    await user.click(screen.getByRole('button',{name:'Search'}))
    expect(await screen.findByText('Search page')).toBeVisible()
    expect(screen.queryByRole('button',{name:'Warranties'})).not.toBeInTheDocument()
  })

  it('moves between pages with a view transition', async () => {
    const start = vi.fn((update: () => void) => {
      update()
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: vi.fn() }
    })
    ;(document as unknown as { startViewTransition: typeof start }).startViewTransition = start
    try {
      const user = userEvent.setup()
      renderShell('/app/documents')
      await screen.findByText('Documents page')
      const nav = screen.getByRole('navigation', { name: 'Main navigation' })
      expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['Documents', 'Ask', 'Upload'])
      await user.click(within(nav).getByRole('button', { name: 'Ask' }))
      expect(await screen.findByText('Ask page')).toBeVisible()
      expect(start).toHaveBeenCalled()
    } finally {
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
    }
  })
})
