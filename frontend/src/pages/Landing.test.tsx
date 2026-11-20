// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Landing from './Landing'

afterEach(cleanup)
function open() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )
}
it('has one stable headline, one lead and no form fields', () => {
  open()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Everything you keep, ready to answer.',
  )
  expect(
    screen.getByText(
      'Ask your bills, leases and manuals in your own words. Every answer shows the line it came from.',
    ),
  ).toBeVisible()
  expect(document.querySelector('input, textarea, select')).toBeNull()
})
it('keeps the wordmark and both account actions in the banner and both actions in the hero', () => {
  open()
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'DocVault' })).toHaveAttribute(
    'href',
    '/',
  )
  for (const area of [
    screen.getByRole('banner'),
    screen.getByRole('region', { name: 'Everything you keep, ready to answer.' }),
  ]) {
    expect(within(area).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
    expect(within(area).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  }
})
it('gives four static previews accessible descriptions and separate registration links', () => {
  open()
  const panels = within(screen.getByRole('region', { name: 'Explore DocVault' })).getAllByRole('article')
  expect(panels.map((p) => within(p).getByRole('heading').textContent)).toEqual([
    'Ask',
    'Check',
    'Pip',
    'Daily check',
  ])
  for (const panel of panels) {
    const picture = within(panel).getByRole('img')
    expect(picture.tagName).toBe('FIGURE')
    expect(picture.getAttribute('aria-label')).toBeTruthy()
    expect(picture.querySelector('a,button,input')).toBeNull()
    expect(within(panel).getByRole('link')).toHaveAttribute('href', '/register')
  }
  expect(within(panels[1]).getByText(/Payment due date/).tagName).toBe('MARK')
  expect(panels[3]).toHaveTextContent('07:30 · Preview')
})
it('uses synthetic evidence, marks scheduling as a preview and links to local setup', () => {
  const { container } = open()
  for (const name of [
    'Samsung',
    'WW90T',
    'Groq',
    'Gemini',
    'Mistral',
    'Llama',
    'auto-creates',
    'cloud document vault',
  ])
    expect(container).not.toHaveTextContent(name)
  expect(container).toHaveTextContent('EUR 123.47')
  expect(container).toHaveTextContent('runs on your own computer')
  expect(screen.getByText(/Preview · Pip checks/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'Run it yourself' })).toHaveAttribute(
    'href',
    expect.stringContaining('#quick-start'),
  )
})
