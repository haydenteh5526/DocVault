// @vitest-environment jsdom
import { it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup, screen, within, fireEvent } from '@testing-library/react'
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

it('puts the wordmark, Sign in and GitHub in the banner, and the one primary button plus the GitHub link in the hero', () => {
  open()
  const banner = within(screen.getByRole('banner'))
  expect(banner.getByRole('link', { name: 'DocVault' })).toHaveAttribute('href', '/')
  expect(banner.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(banner.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/haydenteh5526/DocVault')
  expect(banner.queryByRole('link', { name: /create an account|get started/i })).toBeNull()
  const hero = within(screen.getByRole('region', { name: 'Your documents, answered and kept on track.' }))
  expect(hero.getAllByRole('link').map(l => l.textContent)).toEqual(['Get started', 'Run it yourself on GitHub'])
  expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register')
  expect(hero.getByRole('link', { name: 'Run it yourself on GitHub' })).toHaveAttribute(
    'href',
    expect.stringContaining('#quick-start'),
  )
  expect(document.body).not.toHaveTextContent('Create an account')
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
    "DocBot's home: the side menu with DocBot's status, a question about lease notice answered with 28 days in writing from line 14 of the tenancy agreement, and a question about the kettle answered with under warranty until 14 March 2027 from the receipt.",
  )
  expect(picture).toHaveTextContent('Tenancy agreement · line 14')
  expect(picture).toHaveTextContent('Kettle receipt · 2-year warranty')
  expect(picture).not.toHaveTextContent('Requires approval')
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
  expect(screen.getAllByText('Requires approval')).toHaveLength(1)
  expect(screen.getByText('Electricity bill · 2 days before due')).toBeVisible()
  expect(document.body).not.toHaveTextContent(/proposal 2/i)
  expect(screen.getByText('$ git clone https://github.com/haydenteh5526/DocVault')).toBeVisible()
  expect(screen.getByText('✓ api, worker, db, ollama ready')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Read the setup' })).toHaveAttribute('href', expect.stringContaining('#quick-start'))
})

it('lets the keyboard reach the scrolling setup card and the question group', () => {
  open()
  const card = screen.getByRole('region', { name: 'Setup commands' })
  expect(card.getAttribute('tabindex')).toBe('0')
  expect(screen.getByRole('group', { name: 'Questions DocBot can answer' }).getAttribute('tabindex')).toBe('0')
})

it('keeps the stats, the closing line and the one-line footer', () => {
  const { container } = open()
  const stats = container.querySelector('.docbot-stats')!
  expect(stats).toHaveTextContent('0')
  expect(stats).toHaveTextContent('Line 17')
  expect(stats).toHaveTextContent('€0')
  const footer = within(screen.getByRole('contentinfo'))
  expect(footer.getByText('© 2026 DocVault · final-year project')).toBeVisible()
  for (const name of ['GitHub', 'Architecture', 'Evaluation']) expect(footer.getByRole('link', { name })).toBeVisible()
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

it('shows the approval card once, beside its highlighted source line', () => {
  open()
  const section = screen.getByRole('heading', { level: 2, name: /^One button to approve/ }).closest('section')!
  const figure = within(section).getByRole('img')
  expect(figure).toHaveAccessibleName(expect.stringContaining('Electricity bill, 2 days before due, a reminder on 21 November for €123.47 split 4 ways'))
  expect(figure).toHaveTextContent('Amount due €123.47 · by 23 Nov 2026')
  expect(figure.querySelector('.source-line .line-no')).toHaveTextContent('17')
  expect(figure.querySelector('.approval-card')).not.toBeNull()
  const meet = document.querySelector('#meet-docbot')!
  expect(meet.querySelector('.approval-card')).toBeNull()
  expect(meet).toHaveTextContent('Waiting for your approval')
})

it('marks the sticky header as scrolled only after the page scrolls past 16 px', () => {
  open()
  const banner = screen.getByRole('banner')
  expect(banner).toHaveAttribute('data-scrolled', 'false')
  for (const [y, state] of [[16, 'false'], [17, 'true'], [400, 'true'], [0, 'false']] as const) {
    vi.stubGlobal('scrollY', y)
    fireEvent.scroll(window)
    expect(banner).toHaveAttribute('data-scrolled', state)
  }
})
