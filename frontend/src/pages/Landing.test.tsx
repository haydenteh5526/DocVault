// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import Landing from './Landing'

afterEach(cleanup)

function pageText() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  ).container.textContent ?? ''
}

describe('Landing', () => {
  it('describes only what the local build does', () => {
    const text = pageText()
    for (const word of ['Samsung', 'WW90T', 'Groq', 'Gemini', 'Mistral', 'Llama']) {
      expect(text).not.toContain(word)
    }
    expect(text).toContain('EUR 123.47')
  })

  it('makes no claim the local build cannot keep', () => {
    const text = pageText().toLowerCase()
    for (const phrase of ['bosch', 'model number', 'auto-creates', 'cloud document vault']) {
      expect(text).not.toContain(phrase)
    }
    expect(text).toContain('runs on your own computer')
  })

  it('describes Ask as it works today, without the claims the build cannot keep', () => {
    const text = pageText()
    for (const phrase of ['get real answers', 'instant, sourced answer', 'RAG (Retrieval-Augmented Generation) to answer']) {
      expect(text).not.toContain(phrase)
    }
    expect(text).toContain('Ask in your own words')
  })
})

it('introduces the knowledge base with one lead, linked actions and no form controls', () => {
  pageText()
  expect(screen.getAllByRole('heading', {level:1})).toHaveLength(1)
  expect(screen.getByRole('heading', {name:'Everything you keep, ready to answer.'})).toBeVisible()
  expect(screen.getAllByRole('link',{name:'Create an account'})[0]).toHaveAttribute('href','/register')
  expect(screen.getAllByRole('link',{name:'Sign in'})[0]).toHaveAttribute('href','/login')
  const lead = 'Ask in your own words. Every answer comes with the line it came from, and nothing is saved until you approve it.'
  expect(screen.getAllByText(lead)).toHaveLength(1)
  expect(document.querySelector('input, textarea, select')).toBeNull()
})

describe('the product preview (plan 0R-4, R12)', () => {
  it('is one picture whose name gives the question, the answer and the source line', () => {
    pageText()
    const figure = screen.getByRole('img', { name: /When is my electricity bill due\?/ })
    const name = figure.getAttribute('aria-label') ?? ''
    expect(name).toContain('23 November 2026')
    expect(name).toContain('October electricity bill')
    expect(name).toContain('line 17')
    expect(figure.tagName).toBe('FIGURE')
  })

  it('shows the question, the answer, the source and the highlighted line', () => {
    pageText()
    expect(screen.getByText('When is my electricity bill due?', { exact: true })).toBeVisible()
    expect(screen.getByText('October electricity bill · line 17', { exact: true })).toBeVisible()
    expect(screen.getByText('Open bill', { exact: true })).toBeVisible()
    expect(screen.getByText('Total amount due: EUR 123.47', { exact: true })).toBeVisible()
    const tie = document.querySelector('.hero-preview .source-tie') as HTMLElement
    expect(tie).toHaveTextContent('Due date')
    expect(within(tie).getByRole('blockquote')).toHaveTextContent('Payment due date: 23 November 2026')
    expect(within(tie).getByText('OCR line 17')).toBeVisible()
  })

  it('has a chip that cannot be focused, and no working controls', () => {
    pageText()
    const chip = screen.getByText('Open bill', { exact: true })
    expect(chip.tagName).toBe('SPAN')
    expect(chip).not.toHaveAttribute('tabindex')
    expect(document.querySelector('.hero-preview button, .hero-preview a')).toBeNull()
  })

  it('sits under the lead inside the hero', () => {
    pageText()
    const hero = screen.getByRole('region', { name: 'Everything you keep, ready to answer.' })
    expect(within(hero).getByRole('img', { name: /23 November 2026/ })).toBeInTheDocument()
  })
})

describe('the sections after the hero (plan 0R-4, R12)', () => {
  it('lists three steps in order', () => {
    pageText()
    expect(screen.getByRole('heading', { level: 2, name: 'Three steps, and you decide.' })).toBeVisible()
    const steps = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(steps).toEqual(['Upload', 'Ask', 'Check and approve'])
    const list = screen.getByRole('list', { name: 'Three steps, and you decide.' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    for (const line of [
      'A bill, a lease, a manual or a receipt.',
      'In your own words. Every answer shows the line it came from.',
      'See the source line. Nothing is saved without you.',
    ]) expect(within(list).getByText(line)).toBeVisible()
  })

  it('keeps the decision band and the closing call to action', () => {
    pageText()
    expect(screen.getByRole('heading', { level: 2, name: 'It proposes. You decide.' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Start with one document.' })).toBeVisible()
  })

  it('no longer shows the search sample or the privacy section', () => {
    const text = pageText()
    for (const gone of ['Find anything by what it says', 'Your documents stay on your computer', 'How does asking a question work?']) {
      expect(text).not.toContain(gone)
    }
  })

  it('moves the privacy point to one footer line', () => {
    pageText()
    expect(screen.getByText('DocVault runs on your own computer. Each account sees only its own documents.', { exact: true })).toBeVisible()
  })
})

describe('account buttons and the page surfaces (plan 0R-2)', () => {
  it('has no buttons in the hero', () => {
    pageText()
    const hero = screen.getByRole('region', { name: 'Everything you keep, ready to answer.' })
    expect(within(hero).queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument()
    expect(within(hero).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('keeps both account links in the header', () => {
    pageText()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(within(header).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
  })

  it('ends with one closing call to action', () => {
    pageText()
    const closing = screen.getByRole('region', { name: 'Start with one document.' })
    expect(within(closing).getByText('Upload a bill, a lease or a manual and ask about it in your own words.')).toBeVisible()
    expect(within(closing).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
    expect(within(closing).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Create an account' })).toHaveLength(2)
  })

  it('shows the project footer line', () => {
    pageText()
    expect(screen.getByText('A final-year project at TUS Athlone. It runs on your own computer, and the examples on this page are synthetic.')).toBeVisible()
  })

  it('hides nothing inline when motion is off', () => {
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>)
    expect(document.documentElement).not.toHaveClass('motion-ok')
    for (const element of container.querySelectorAll<HTMLElement>('*')) {
      expect(element.style.opacity).not.toBe('0')
      expect(element.style.visibility).not.toBe('hidden')
    }
  })
})

describe('yellow is an accent (plan 0R-2)', () => {
  const css = readFileSync('src/pages/landing.css', 'utf8')

  it('uses #FFD83D only for the margin tags and never as a surface', () => {
    const lines = css.split(/\r?\n/).filter(line => /ffd83d/i.test(line))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('.source-value')
    expect(lines[0]).toMatch(/color:#ffd83d/i)
    expect(css).not.toMatch(/--field|background:\s*var\(--field\)/)
  })

  it('has no perforation edge between bands', () => {
    expect(css).not.toMatch(/dashed|perforat/i)
  })

  it('sets the split band on the muted token with hairlines', () => {
    expect(css).toMatch(/\.decision-section\s*\{[^}]*background:var\(--muted\)[^}]*border-block:1px solid var\(--border\)/)
  })

  it('only animates under motion-ok', () => {
    const outside = css.split('/* ---- Motion')[0]
    expect(outside).not.toMatch(/animation:/)
  })
})

describe('sizing and the header at 360 px (N1, N7)', () => {
  it('merges the header button classes so h-9 px-3 win', () => {
    pageText()
    const header = screen.getByRole('banner')
    for (const name of ['Sign in', 'Create an account']) {
      const link = within(header).getByRole('link', { name })
      expect(link).toHaveClass('h-9', 'px-3', 'text-sm')
      expect(link).not.toHaveClass('h-10')
      expect(link).not.toHaveClass('px-4')
    }
  })

  it('names the brand link DocVault, so the wordmark text can hide on a phone', () => {
    pageText()
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'DocVault' })).toHaveAttribute('href', '/')
  })

  it('merges the closing button classes so px-6 and text-base win', () => {
    pageText()
    const closing = screen.getByRole('region', { name: 'Start with one document.' })
    const link = within(closing).getByRole('link', { name: 'Create an account' })
    expect(link).toHaveClass('px-6', 'text-base')
    expect(link).not.toHaveClass('px-8')
    expect(link).not.toHaveClass('text-sm')
  })
})
