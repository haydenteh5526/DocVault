import { describe, it, expect } from 'vitest'
import { ASSISTANT_NAME, proposedByText } from './assistant'

describe('the assistant name', () => {
  it('is DocBot, kept in one constant', () => {
    expect(ASSISTANT_NAME).toBe('DocBot')
  })

  it('says who proposed a reminder', () => {
    expect(proposedByText('assistant')).toBe('Proposed by DocBot')
    expect(proposedByText('routine')).toBe("Proposed by DocBot's daily check")
    expect(proposedByText('owner')).toBe('Proposed by you')
  })

  it('treats a source it does not know as the owner', () => {
    expect(proposedByText('something-new')).toBe('Proposed by you')
    expect(proposedByText('')).toBe('Proposed by you')
  })
})
