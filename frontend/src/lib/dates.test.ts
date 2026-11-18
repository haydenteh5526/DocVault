import { describe, it, expect } from 'vitest'
import { formatTimestamp } from './dates'

describe('formatTimestamp', () => {
  it('shows a summer evening on the next day in Irish time', () => {
    expect(formatTimestamp('2026-06-30T23:30:00')).toBe('1 July 2026')
  })

  it('shows a winter evening on the same day, as Irish time equals UTC then', () => {
    expect(formatTimestamp('2026-11-17T23:30:00')).toBe('17 November 2026')
  })

  it('treats a value without an offset as UTC', () => {
    expect(formatTimestamp('2026-06-30T22:30:00')).toBe('30 June 2026')
    expect(formatTimestamp('2026-06-30T22:30:00Z')).toBe('30 June 2026')
  })

  it('respects an explicit offset', () => {
    expect(formatTimestamp('2026-06-30T23:30:00+00:00')).toBe('1 July 2026')
    expect(formatTimestamp('2026-07-01T00:30:00+01:00')).toBe('1 July 2026')
    expect(formatTimestamp('2026-06-30T23:30:00-05:00')).toBe('1 July 2026')
  })
})
