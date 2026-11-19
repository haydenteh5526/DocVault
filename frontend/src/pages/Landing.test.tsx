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
    expect(text).toContain('warranty dates found for you')
  })

  it('describes Ask as it works today and the warranty copy as the extractor reads it', () => {
    const text = pageText()
    for (const phrase of ['get real answers', 'instant, sourced answer', 'RAG (Retrieval-Augmented Generation) to answer']) {
      expect(text).not.toContain(phrase)
    }
    expect(text).toContain('Ask in your own words')
    expect(text).toContain('Ask your documents')
    expect(text).toContain('How does asking a question work?')
    expect(text).toContain('2 year warranty')
    expect(text).toContain('Expires 12 June 2028')
  })

  it('says what runs locally', () => {
    const text = pageText()
    expect(text).toContain(
      'Text is read with Tesseract OCR and searched with the nomic-embed-text model on Ollama, all on your own computer. Answers written by a language model need a provider key, which this build does not set.',
    )
    expect(text).toContain('Ollama')
    expect(text).toContain('Local embeddings')
  })
})

it('introduces the knowledge base with linked actions and inspectable source lines', () => {
  pageText()
  expect(screen.getAllByRole('heading', {level:1})).toHaveLength(1)
  expect(screen.getByRole('heading', {name:'Everything you keep, ready to answer.'})).toBeVisible()
  expect(screen.getAllByRole('link',{name:'Create an account'})[0]).toHaveAttribute('href','/register')
  expect(screen.getAllByRole('link',{name:'Sign in'})[0]).toHaveAttribute('href','/login')
  for (const line of ['When is the electricity bill due?', 'Total amount due: EUR 123.47', 'Payment due date: 23 November 2026', '23 Nov']) {
    expect(screen.getByText(line,{exact:true})).toBeVisible()
  }
  expect(screen.getByRole('img',{name:'A search across three documents'})).toBeVisible()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

  it('shows the footer line and both margin tags', () => {
    pageText()
    expect(screen.getByText('A final-year project at TUS Athlone. It runs on your own computer, and the examples on this page are synthetic.')).toBeVisible()
    expect(screen.getByText('€123.47', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText('23 Nov', { selector: 'strong' })).toBeVisible()
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
