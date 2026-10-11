import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('handles conditional classes', () => {
    const shouldHide = false
    expect(cn('base', shouldHide && 'hidden', 'shown')).toBe('base shown')
  })

  it('dedupes conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('ignores falsy values', () => {
    expect(cn('a', null, undefined, '', 'b')).toBe('a b')
  })
})
