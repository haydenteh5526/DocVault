// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Document } from '@/lib/api'
import { DocumentPreviewModal } from './DocumentPreviewModal'

afterEach(cleanup)

const fallback = JSON.stringify({
  overview: 'EXAMPLE ENERGY bill',
  key_topics: [],
  specifications: [],
  safety_warnings: [],
  quick_facts: [],
})

function show(overrides: Partial<Document>) {
  const doc = {
    id: 'd1',
    title: 'October bill',
    brand: null,
    model: null,
    document_type: null,
    raw_text: 'Total amount due: EUR 123.47',
    summary: fallback,
    file_size: 2048,
    image_url: null,
    processing_status: 'complete',
    created_at: '2026-11-11T10:00:00',
    ...overrides,
  } as Document
  return render(
    <MemoryRouter>
      <DocumentPreviewModal doc={doc} onClose={() => {}} />
    </MemoryRouter>,
  ).container
}

describe('DocumentPreviewModal', () => {
  it('quick preview shows the extracted text, not a placeholder summary', () => {
    const container = show({})
    expect(screen.getByText('Extracted text')).toBeInTheDocument()
    expect(screen.queryByText('Summary')).toBeNull()
    expect(container.textContent).not.toContain('{"')
    expect(screen.queryByText('Brand')).toBeNull()
    expect(screen.queryByText('Type')).toBeNull()
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText('Uploaded')).toBeInTheDocument()
  })

  it('quick preview shows a generated summary', () => {
    show({ summary: 'A short electricity bill.', brand: 'Example Energy', document_type: 'bill' })
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.queryByText('Extracted text')).toBeNull()
    expect(screen.getByText('Brand')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })
})
