import { describe, it, expect } from 'vitest'
import { ASSISTANT_NAME, proposedByText } from './assistant'

describe('the assistant name', () => {
  it('is Pip, kept in one constant', () => {
    expect(ASSISTANT_NAME).toBe('Pip')
  })

  it('says who proposed a reminder', () => {
    expect(proposedByText('assistant')).toBe('Proposed by Pip')
    expect(proposedByText('routine')).toBe("Proposed by Pip's daily check")
    expect(proposedByText('owner')).toBe('Proposed by you')
  })

  it('treats a source it does not know as the owner', () => {
    expect(proposedByText('something-new')).toBe('Proposed by you')
    expect(proposedByText('')).toBe('Proposed by you')
  })
})
