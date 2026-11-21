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
  'What does E21 mean on the dishwasher?',
  'How much notice do I give the landlord?',
  'Is the kettle still under warranty?',
  'When does the tenancy end?',
  'When is the electricity bill due?',
  'How much was the October bill?',
  'Split the gas bill by days at home',
  'Remind me two days before the bill is due',
]

it('has one headline, the lead, and no form fields', () => {
  open()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  const h1 = screen.getByRole('heading', { level: 1 })
  expect(h1).toHaveTextContent('Ask your documents anything.')
  expect(screen.getByText("Your personal AI document assistant. Upload photos or PDFs, ask in your own words, and get answers that cite their source line.")).toBeVisible()
  expect(document.querySelector('.hero-eyebrow')).toBeNull()
  expect(screen.queryByText('DocVault · personal AI document assistant')).toBeNull()
  expect(document.querySelector('input, textarea, select')).toBeNull()
})

it('puts the wordmark, Sign in and GitHub in the banner, and the one primary button plus the GitHub link in the hero', () => {
  open()
  const banner = within(screen.getByRole('banner'))
  expect(banner.getByRole('link', { name: 'DocVault' })).toHaveAttribute('href', '/')
  expect(banner.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  const github = banner.getByRole('link', { name: 'GitHub (opens in a new tab)' })
  expect(github).toHaveAttribute('href', 'https://github.com/haydenteh5526/DocVault')
  expect(github).toHaveAttribute('target', '_blank')
  expect(github).toHaveAttribute('rel', 'noopener noreferrer')
  for (const name of ['Sign in', 'GitHub (opens in a new tab)']) expect(banner.getByRole('link', { name })).toHaveClass('poster-nav-link')
  expect(banner.queryByRole('link', { name: /create an account|get started/i })).toBeNull()
  const hero = within(screen.getByRole('region', { name: 'Ask your documents anything.' }))
  expect(hero.getAllByRole('link').map(l => l.textContent)).toEqual(['Get started', 'Run it yourself on GitHub (opens in a new tab)'])
  expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register')
  const runIt = hero.getByRole('link', { name: 'Run it yourself on GitHub (opens in a new tab)' })
  expect(runIt).toHaveAttribute('href', expect.stringContaining('#quick-start'))
  expect(runIt).toHaveAttribute('target', '_blank')
  expect(document.body).not.toHaveTextContent('Create an account')
})

it('shows six aria-hidden floating tiles', () => {
  const { container } = open()
  const tiles = container.querySelector('.floating-tiles')!
  expect(tiles.getAttribute('aria-hidden')).toBe('true')
  expect(tiles.children).toHaveLength(6)
  expect(tiles.querySelector('svg[data-variant="head"]')).not.toBeNull()
})

it('colours the five icon tiles and gives every tile a depth', () => {
  const { container } = open()
  const tiles = [...container.querySelectorAll<HTMLElement>('.float-tile')]
  expect(tiles.map(t => t.style.getPropertyValue('--tile-color'))).toEqual(['', '#F472B6', '#8FD19B', '#F0A55B', '#7AA7FF', '#5EEAD4'])
  for (const tile of tiles) expect(tile.style.getPropertyValue('--rot')).toMatch(/^-?\d+deg$/)
  const marks = [...container.querySelectorAll<HTMLElement>('.float-mark')]
  for (const mark of marks) expect(Number(mark.style.getPropertyValue('--depth'))).toBeGreaterThan(0)
})

it('spreads the tiles in three mirrored pairs, as on t3.codes', () => {
  const { container } = open()
  const marks = [...container.querySelectorAll<HTMLElement>('.float-mark')].map(m => [
    m.style.getPropertyValue('--x'),
    m.style.getPropertyValue('--y'),
    m.style.getPropertyValue('--s'),
  ])
  expect(marks).toEqual([
    ['max(-300px, -19vw)', '20px', '64px'],
    ['min(300px, 19vw)', '20px', '64px'],
    ['max(-560px, -38vw)', '128px', '96px'],
    ['min(560px, 38vw)', '128px', '96px'],
    ['max(-440px, -30vw)', '370px', '80px'],
    ['min(440px, 30vw)', '370px', '80px'],
  ])
})

it('splits the headline into two lines that rise in turn', () => {
  const { container } = open()
  const lines = [...container.querySelectorAll<HTMLElement>('h1 .h1-line')]
  expect(lines.map(l => l.textContent)).toEqual(['Ask your documents', 'anything.'])
  expect(lines.map(l => l.style.getPropertyValue('--d'))).toEqual(['', '90ms'])
})

function pointer(fine: boolean, reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('pointer: fine') ? fine : query.includes('reduce') ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
}
function hover(fine: boolean, reduce: boolean) {
  pointer(fine, reduce)
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )
  const hero = container.querySelector<HTMLElement>('.landing-hero')!
  hero.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
  const field = container.querySelector<HTMLElement>('.floating-tiles')!
  return { hero, field }
}

it('moves the tiles with a fine pointer and settles them when it leaves', () => {
  const { hero, field } = hover(true, false)
  fireEvent.pointerMove(hero, { clientX: 1000, clientY: 0 })
  expect(field.style.getPropertyValue('--px')).toBe('18.0px')
  expect(field.style.getPropertyValue('--py')).toBe('-14.0px')
  fireEvent.pointerLeave(hero)
  expect(field.style.getPropertyValue('--px')).toBe('0px')
  expect(field.style.getPropertyValue('--py')).toBe('0px')
})

it('ignores touch and pen input even with a fine pointer', () => {
  for (const pointerType of ['touch', 'pen']) {
    const { hero, field } = hover(true, false)
    fireEvent.pointerMove(hero, { clientX: 1000, clientY: 0, pointerType })
    expect(field.style.getPropertyValue('--px')).toBe('')
    cleanup()
  }
})

it('keeps the tiles still for touch and under reduced motion', () => {
  for (const [fine, reduce] of [[false, false], [true, true]] as const) {
    const { hero, field } = hover(fine, reduce)
    fireEvent.pointerMove(hero, { clientX: 1000, clientY: 0 })
    expect(field.style.getPropertyValue('--px')).toBe('')
    expect(field.style.getPropertyValue('--py')).toBe('')
    cleanup()
  }
})

it('describes the product picture in words', () => {
  open()
  const picture = screen.getByRole('img', { name: /^DocBot's home:/ })
  expect(picture.tagName).toBe('FIGURE')
  expect(picture).toHaveAccessibleName(
    "DocBot's home: two questions answered from your own documents. How much notice to give the landlord: 28 days in writing, from line 14 of the tenancy agreement. Whether the kettle is still under warranty: yes, until 14 March 2027, from the kettle receipt.",
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
  const section = screen.getByRole('heading', { level: 2, name: 'Works with the paperwork you already have' }).closest('section')!
  expect(within(section).getByText('Photos or PDFs. DocVault reads them on your computer.')).toBeVisible()
  const cards = within(section).getAllByRole('listitem')
  expect(cards.map(c => c.textContent)).toEqual([
    'Leasesnotice · rent day',
    'Manualsfault codes',
    'Warrantiesend dates',
    'Receiptsproof of purchase',
    'Billsamount · due date',
  ])
})

it('has the five section headings and the DocBot section anchor', () => {
  const { container } = open()
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
    "Meet DocBot, who reads your paperwork so you don't have to.",
    'Works with the paperwork you already have',
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
  expect(stats).toHaveTextContent('Line 14')
  expect(stats).not.toHaveTextContent('Line 17')
  expect(stats).toHaveTextContent('€0')
  const footer = within(screen.getByRole('contentinfo'))
  expect(footer.getByText('© 2026 DocVault · by Hayden · final-year project')).toBeVisible()
  expect(footer.getByText('© 2026 DocVault · by Hayden · final-year project').querySelector('svg')).not.toBeNull()
  for (const name of ['GitHub', 'Architecture', 'Evaluation']) {
    const link = footer.getByRole('link', { name: `${name} (opens in a new tab)` })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
})

it('has no testimonials and keeps the earlier banned claims out', () => {
  const { container } = open()
  for (const name of ['Samsung', 'WW90T', 'Groq', 'Gemini', 'Mistral', 'Llama', 'auto-creates', 'cloud document vault', 'testimonial'])
    expect(container).not.toHaveTextContent(name)
  expect(container).toHaveTextContent('€123.47')
})

it('scrolls only when motion is allowed, and the tiles no longer drift', () => {
  const moving = open(false).container
  expect(moving.querySelector('.marquee-track')).not.toBeNull()
  expect(moving.querySelector('.docbot-drift')).toBeNull()
  cleanup()
  const still = open(true).container
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
  expect(meet).not.toHaveTextContent('Waiting for your approval')
  expect(meet).toHaveTextContent('Dishwasher manual · line 22')
  expect(meet).toHaveTextContent("I couldn't find this in your documents.")
  expect(meet).not.toHaveTextContent('No matching source line')
  const miss = within(meet as HTMLElement).getByText("I couldn't find this in your documents.").parentElement!
  expect(miss.querySelector('small')).toBeNull()
  expect(meet).toHaveTextContent("Ask about anything you've uploaded. DocBot answers from your own files, shows where the answer is, and tells you when it isn't there.")
  expect(within(meet as HTMLElement).getByRole('img')).toHaveAccessibleName(
    "DocBot answers that E21 on the dishwasher means the water temperature is too low, from line 22 of the dishwasher manual, then says it couldn't find when the car insurance renews in your documents.",
  )
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

it('introduces the assistant before any document type', () => {
  open()
  const hero = screen.getByRole('region', { name: 'Ask your documents anything.' })
  expect(hero).toHaveTextContent('personal AI document assistant')
  for (const word of ['bill', 'lease', 'manual', 'warranty', 'receipt']) expect(hero.textContent!.toLowerCase()).not.toContain(word)
})
