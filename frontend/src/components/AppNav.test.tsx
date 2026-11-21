// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'
import { getDocument, getDocuments, listConversations, type Conversation, type Document } from '../lib/api'

vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    listConversations: vi.fn(async () => []),
    getDocument: vi.fn(),
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
  it('the sidebar links to search and warranties, and Settings opens from the account menu', async () => {
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')

    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Search page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/search')

    await user.click(screen.getByRole('button', { name: 'Warranties' }))
    expect(await screen.findByText('Warranties page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/warranties')

    await user.click(screen.getByRole('button', { name: /Account/ }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('on desktop, lists Settings in the account menu and opens the dialog from it', async () => {
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Account/ }))
    for (const name of ['Profile', 'Settings', 'Theme', 'Log out']) expect(screen.getByRole('button', { name })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('opens DocBot at the home route and exposes the skip link first', async () => {
    const user = userEvent.setup()
    renderShell('/app')
    await screen.findByText('Ask page')
    await user.tab()
    expect(screen.getByRole('link', {name: 'Skip to content'})).toHaveFocus()
    expect(screen.getByRole('button', {name: 'DocBot, Ready'})).toHaveAttribute('aria-current','page')
  })

  it('puts the three labelled destinations in the phone tab bar', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell('/app/ask')
    await screen.findByText('Ask page')
    const nav = screen.getByRole('navigation', {name:'Main navigation'})
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['DocBot','Documents','Upload'])
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
      expect(within(nav).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['DocBot, Ready', 'Documents', 'Upload'])
      await user.click(within(nav).getByRole('button', { name: 'DocBot, Ready' }))
      expect(await screen.findByText('Ask page')).toBeVisible()
      expect(start).toHaveBeenCalled()
      expect(window.location.pathname).toBe('/app')
      const presence = within(nav).getByRole('button', { name: 'DocBot, Ready' })
      expect(presence).toBeVisible()
      expect(presence).not.toHaveAccessibleDescription(/\S/)
    } finally {
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
    }
  })
})

describe('the phone account menu (L5, M2)', () => {
  it('closes when the page changes within the same section', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell('/app/documents/d1')
    await screen.findByText('Document page')
    await user.click(await screen.findByRole('button', { name: /Account/ }))
    expect(screen.getByRole('button', { name: 'Warranties' })).toBeVisible()
    act(() => {
      window.history.pushState({}, '', '/app/documents')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await screen.findByText('Documents page')
    expect(screen.queryByRole('button', { name: 'Warranties' })).not.toBeInTheDocument()
  })

  it('stays closed when history returns to the page it was opened on (L-B)', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell('/app/documents')
    await screen.findByText('Documents page')
    await user.click(await screen.findByRole('button', { name: /Account/ }))
    expect(screen.getByRole('button', { name: 'Warranties' })).toBeVisible()
    const goTo = (path: string) => act(() => {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    goTo('/app/ask')
    await screen.findByText('Ask page')
    goTo('/app/documents')
    await screen.findByText('Documents page')
    expect(screen.queryByRole('button', { name: 'Warranties' })).not.toBeInTheDocument()
  })

  it('closes when the logo opens a page', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')
    await user.click(await screen.findByRole('button', { name: /Account/ }))
    expect(screen.getByRole('button', { name: 'Warranties' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'DocVault' }))
    expect(screen.queryByRole('button', { name: 'Warranties' })).not.toBeInTheDocument()
  })

  it('closes when you click outside it', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')
    await user.click(await screen.findByRole('button', { name: /Account/ }))
    expect(screen.getByRole('button', { name: 'Warranties' })).toBeVisible()
    await user.click(screen.getByText('Documents page'))
    expect(screen.queryByRole('button', { name: 'Warranties' })).not.toBeInTheDocument()
  })

  it('does not remount the navigation when moving between sections', async () => {
    const user = userEvent.setup()
    renderShell('/app/documents')
    await screen.findByText('Documents page')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    await user.click(within(nav).getByRole('button', { name: 'DocBot, Ready' }))
    await screen.findByText('Ask page')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(nav)
  })
})

describe('a rail without chats (plan 0R-4, R13)', () => {
  const chats = [{ id: 'c1', title: 'When is my bill due', is_pinned: false, created_at: '2026-11-11T10:00:00', updated_at: '2026-11-11T10:00:00' }] as Conversation[]

  it('shows no Recent chats and no conversation menus, even when conversations exist', async () => {
    vi.mocked(listConversations).mockResolvedValue(chats)
    renderShell()
    await screen.findByText('Documents page')
    expect(screen.queryByText('Recent chats')).not.toBeInTheDocument()
    expect(screen.queryByText('When is my bill due')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Conversation options/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search chats' })).not.toBeInTheDocument()
  })

  it('keeps Search and Warranties in a plain group on the desktop rail', async () => {
    const { container } = renderShell()
    await screen.findByText('Documents page')
    expect(container.querySelector('aside details')).toBeNull()
    for (const name of ['Search', 'Warranties']) expect(screen.getByRole('button', { name })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
    expect(await screen.findByText('Ready')).toBeVisible()
  })

  it('offers Search and Warranties, but not Search chats, from the phone account menu', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    renderShell()
    await screen.findByText('Documents page')
    await user.click(await screen.findByRole('button', { name: /Account/ }))
    expect(screen.getByRole('button', { name: 'Search' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Warranties' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Search chats' })).not.toBeInTheDocument()
  })
})
it('does not open every completed bill when visiting Profile', async () => {
  vi.mocked(getDocuments).mockResolvedValueOnce({documents:[{id:'bill',processing_status:'complete'} as Document],total:1})
  renderShell('/app/profile')
  await screen.findByText('Profile page')
  expect(getDocument).not.toHaveBeenCalled()
})
