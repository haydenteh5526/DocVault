// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'

vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return {
    ...actual,
    listConversations: vi.fn(async () => []),
    getProfile: vi.fn(async () => ({ display_name: 'Test', email: 'test@example.com' })),
    getDocuments: vi.fn(async () => ({ documents: [], total: 0 })),
    getExpiringWarranties: vi.fn(async () => []),
  }
})

// The pages are not under test; each one just names itself.
vi.mock('./pages/AskAI', () => ({ default: () => <p>Ask page</p> }))
vi.mock('./pages/Dashboard', () => ({ default: () => <p>Documents page</p> }))
vi.mock('./pages/Upload', () => ({ default: () => <p>Upload page</p> }))
vi.mock('./pages/Search', () => ({ default: () => <p>Search page</p> }))
vi.mock('./pages/Warranties', () => ({ default: () => <p>Warranties page</p> }))
vi.mock('./pages/SearchChats', () => ({ default: () => <p>Chats page</p> }))
vi.mock('./pages/Profile', () => ({ default: () => <p>Profile page</p> }))
vi.mock('./pages/DocumentDetail', () => ({ default: () => <p>Document page</p> }))
vi.mock('./pages/Settings', () => ({ default: () => <p>Settings content</p> }))

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

const aside = (container: HTMLElement) => container.querySelector('aside') as HTMLElement
const backdrop = (container: HTMLElement) => container.querySelector('div.fixed.inset-0.z-40')

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

  it('on a phone the sidebar starts off-screen', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    const { container } = renderShell()
    await screen.findByText('Documents page')

    expect(aside(container)).toHaveClass('-translate-x-full')
    expect(backdrop(container)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(aside(container)).not.toHaveClass('-translate-x-full')
    expect(backdrop(container)).not.toBeNull()

    await user.click(backdrop(container) as Element)
    expect(aside(container)).toHaveClass('-translate-x-full')
    expect(backdrop(container)).toBeNull()
  })

  it('a navigation button closes the phone sidebar', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    const { container } = renderShell()
    await screen.findByText('Documents page')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(aside(container)).toHaveClass('-translate-x-full'))
  })

  it('the phone sidebar closes when the logo opens a page', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    const { container } = renderShell()
    await screen.findByText('Documents page')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(aside(container)).not.toHaveClass('-translate-x-full')

    await user.click(screen.getByRole('button', { name: 'DocVault' }))
    await waitFor(() => expect(aside(container)).toHaveClass('-translate-x-full'))
    expect(backdrop(container)).toBeNull()
  })

  it('the logo closes the phone sidebar on the Ask page', async () => {
    mediaAt(390)
    const user = userEvent.setup()
    const { container } = renderShell('/app')
    await screen.findByText('Ask page')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(aside(container)).not.toHaveClass('-translate-x-full')

    await user.click(screen.getByRole('button', { name: 'DocVault' }))
    await waitFor(() => expect(aside(container)).toHaveClass('-translate-x-full'))
    expect(backdrop(container)).toBeNull()
  })

  it('on a desktop the sidebar is in place', async () => {
    const { container } = renderShell()
    await screen.findByText('Documents page')
    expect(aside(container)).toHaveClass('lg:translate-x-0')
  })
})
