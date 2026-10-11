import { describe, it, expect } from 'vitest'
import { daysUntil, warrantyState, relativeTime } from './format'

const NOW = new Date('2026-07-22T12:00:00Z').getTime()
const day = 24 * 60 * 60 * 1000

describe('daysUntil', () => {
  it('returns null for no date', () => {
    expect(daysUntil(null, NOW)).toBeNull()
  })
  it('returns positive days for a future date', () => {
    expect(daysUntil(new Date(NOW + 10 * day).toISOString(), NOW)).toBe(10)
  })
  it('returns negative days for a past date', () => {
    expect(daysUntil(new Date(NOW - 5 * day).toISOString(), NOW)).toBeLessThan(0)
  })
})

describe('warrantyState', () => {
  it('none when no expiry', () => {
    expect(warrantyState(null, NOW)).toBe('none')
  })
  it('expired when past', () => {
    expect(warrantyState(new Date(NOW - day).toISOString(), NOW)).toBe('expired')
  })
  it('expiring when within 30 days', () => {
    expect(warrantyState(new Date(NOW + 10 * day).toISOString(), NOW)).toBe('expiring')
  })
  it('active when more than 30 days out', () => {
    expect(warrantyState(new Date(NOW + 90 * day).toISOString(), NOW)).toBe('active')
  })
})

describe('relativeTime', () => {
  it('just now for < 1 min', () => {
    expect(relativeTime(new Date(NOW - 30 * 1000), NOW)).toBe('just now')
  })
  it('minutes ago', () => {
    expect(relativeTime(new Date(NOW - 5 * 60 * 1000), NOW)).toBe('5m ago')
  })
  it('hours ago', () => {
    expect(relativeTime(new Date(NOW - 3 * 60 * 60 * 1000), NOW)).toBe('3h ago')
  })
})
