// @vitest-environment jsdom
import { it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Landing from './Landing'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}
function open(reduce = false) {
  motion(reduce)
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )
}
const questions = [
  'When is the electricity bill due?',
  'How much notice do I give the landlord?',
  'What does E21 mean on the dishwasher?',
  'Is the kettle still under warranty?',
  'Split the gas bill by days at home',
  'How much was the October bill?',
  'When does the tenancy end?',
  'Remind me two days before the bill is due',
]

it('has one headline, the lead, and no form fields', () => {
  open()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your documents, answered and kept on track.')
  expect(
    screen.getByText(
      'Ask your bills, leases and manuals in your own words. DocBot shows the line every answer came from and asks before it saves anything.',
    ),
  ).toBeVisible()
  expect(document.querySelector('input, textarea, select')).toBeNull()
})

it('puts the wordmark and both account actions in the banner, and one primary button plus the GitHub link in the hero', () => {
  open()
  const banner = within(screen.getByRole('banner'))
  expect(banner.getByRole('link', { name: 'DocVault' })).toHaveAttribute('href', '/')
  expect(banner.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(banner.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
  const hero = within(screen.getByRole('region', { name: 'Your documents, answered and kept on track.' }))
  expect(hero.getAllByRole('link').map(l => l.textContent)).toEqual(['Create an account', 'Run it yourself on GitHub'])
  expect(hero.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
  expect(hero.getByRole('link', { name: 'Run it yourself on GitHub' })).toHaveAttribute(
    'href',
    expect.stringContaining('#quick-start'),
  )
})

it('shows six aria-hidden floating tiles', () => {
  const { container } = open()
  const tiles = container.querySelector('.floating-tiles')!
  expect(tiles.getAttribute('aria-hidden')).toBe('true')
  expect(tiles.children).toHaveLength(6)
  expect(tiles.querySelector('svg[data-variant="head"]')).not.toBeNull()
})

it('describes the product picture in words', () => {
  open()
  const picture = screen.getByRole('img', { name: /^DocBot's home:/ })
  expect(picture.tagName).toBe('FIGURE')
  expect(picture).toHaveAccessibleName(
    "DocBot's home: the side menu with DocBot's status, a question about the electricity bill answered with 23 November 2026 from line 17, and a reminder that requires approval.",
  )
  expect(picture.querySelector('a, button, input')).toBeNull()
})

it('lists the eight questions once for screen readers and hides the moving copies', () => {
  const { container } = open()
  const lists = container.querySelectorAll('.sr-only ul')
  expect(lists).toHaveLength(1)
  expect([...lists[0].querySelectorAll('li')].map(li => li.textContent)).toEqual(questions)
  const rows = container.querySelectorAll('.question-row')
  expect(rows).toHaveLength(2)
  for (const row of rows) expect(row.getAttribute('aria-hidden')).toBe('true')
  expect(rows[0].textContent).toContain(questions[0])
  expect(rows[1].textContent).toContain(questions[7])
})

it('has the five document cards with their captions', () => {
  open()
  const section = screen.getByRole('heading', { level: 2, name: 'Bring your own documents' }).closest('section')!
  expect(within(section).getByText('Photos or PDFs. DocVault reads them on your computer.')).toBeVisible()
  const cards = within(section).getAllByRole('listitem')
  expect(cards.map(c => c.textContent)).toEqual([
    'Billsamount · due date',
    'Leasesnotice · rent day',
    'Manualsfault codes',
    'Warrantiesend dates',
    'Receiptsproof of purchase',
  ])
})

it('has the five section headings and the DocBot section anchor', () => {
  const { container } = open()
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
    'Meet DocBot, who keeps your paperwork moving.',
    'Bring your own documents',
    'One button to approve. Nothing saves without it.',
    "If you'd rather run it yourself, you can.",
    'Your paperwork deserves better than a drawer.',
  ])
  expect(container.querySelector('#meet-docbot')).not.toBeNull()
  expect(screen.getAllByText('Requires approval').length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('$ git clone https://github.com/haydenteh5526/DocVault')).toBeVisible()
  expect(screen.getByText('✓ api, worker, db, ollama ready')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Read the setup' })).toHaveAttribute('href', expect.stringContaining('#quick-start'))
})

it('keeps the stats, the closing line and the one-line footer', () => {
  const { container } = open()
  const stats = container.querySelector('.docbot-stats')!
  expect(stats).toHaveTextContent('0')
  expect(stats).toHaveTextContent('Line 17')
  expect(stats).toHaveTextContent('€0')
  const footer = within(screen.getByRole('contentinfo'))
  expect(footer.getByText('© 2026 DocVault · final-year project')).toBeVisible()
  for (const name of ['GitHub', 'Privacy', 'Evaluation']) expect(footer.getByRole('link', { name })).toBeVisible()
})

it('has no testimonials and keeps the earlier banned claims out', () => {
  const { container } = open()
  for (const name of ['Samsung', 'WW90T', 'Groq', 'Gemini', 'Mistral', 'Llama', 'auto-creates', 'cloud document vault', 'testimonial'])
    expect(container).not.toHaveTextContent(name)
  expect(container).toHaveTextContent('€123.47')
})

it('drifts and scrolls only when motion is allowed', () => {
  const moving = open(false).container
  expect(moving.querySelector('.docbot-drift')).not.toBeNull()
  expect(moving.querySelector('.marquee-track')).not.toBeNull()
  cleanup()
  const still = open(true).container
  expect(still.querySelector('.docbot-drift')).toBeNull()
  expect(still.querySelector('.marquee-track')).toBeNull()
  expect(still.querySelector('.docbot-blink')).toBeNull()
})
