import { describe, it, expect } from 'vitest'
import { isGeneratedSummary } from './summary'

const empty = {
  overview: 'EXAMPLE ENERGY electricity bill',
  key_topics: [],
  specifications: [],
  safety_warnings: [],
  quick_facts: [],
}

describe('isGeneratedSummary', () => {
  it('rejects the no-key fallback JSON', () => {
    expect(isGeneratedSummary(JSON.stringify(empty))).toBe(false)
  })

  it('rejects empty values', () => {
    expect(isGeneratedSummary('')).toBe(false)
    expect(isGeneratedSummary(null)).toBe(false)
    expect(isGeneratedSummary(undefined)).toBe(false)
  })

  it('accepts JSON with one key topic', () => {
    expect(isGeneratedSummary(JSON.stringify({ ...empty, key_topics: ['Billing'] }))).toBe(true)
  })

  it('accepts JSON with only one non-empty list', () => {
    expect(isGeneratedSummary(JSON.stringify({ ...empty, quick_facts: [{ label: 'a', value: 'b' }] }))).toBe(true)
    expect(isGeneratedSummary(JSON.stringify({ ...empty, safety_warnings: ['Hot'] }))).toBe(true)
    expect(isGeneratedSummary(JSON.stringify({ ...empty, specifications: [{ label: 'a', value: 'b' }] }))).toBe(true)
  })

  it('accepts plain text', () => {
    expect(isGeneratedSummary('A short electricity bill.')).toBe(true)
  })

  it('accepts JSON that does not have the fallback shape', () => {
    expect(isGeneratedSummary(JSON.stringify({ overview: 'Only an overview' }))).toBe(true)
  })
})
