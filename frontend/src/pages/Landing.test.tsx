// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
