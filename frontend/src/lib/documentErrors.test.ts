// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { detailMessage, renameDocument, resetPassword } from './api'

function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('renameDocument', () => {
  it('throws the API message when the title is blank', async () => {
    vi.stubGlobal('fetch', reply(422, {
      detail: [{ type: 'value_error', loc: ['body', 'title'], msg: 'Value error, Title cannot be blank.', input: '  ' }],
    }))
    await expect(renameDocument('d1', '  ')).rejects.toThrow('Title cannot be blank.')
  })

  it('returns the updated document on success', async () => {
    vi.stubGlobal('fetch', reply(200, { id: 'd1', title: 'October bill' }))
    await expect(renameDocument('d1', 'October bill')).resolves.toMatchObject({ title: 'October bill' })
  })
})

describe('detailMessage', () => {
  it('drops the "Value error, " prefix that the server adds to its own messages', () => {
    expect(detailMessage([{ msg: 'Value error, Use at least 8 characters.' }], 'x')).toBe('Use at least 8 characters.')
  })
})

describe('resetPassword', () => {
  it('shows the password rules message instead of an object', async () => {
    vi.stubGlobal('fetch', reply(422, {
      detail: [{ type: 'value_error', loc: ['body', 'new_password'], msg: 'Value error, Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.' }],
    }))
    await expect(resetPassword('t', 'weak')).rejects.toThrow(
      'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.',
    )
  })

  it('keeps a string detail', async () => {
    vi.stubGlobal('fetch', reply(400, { detail: 'Invalid or expired reset link' }))
    await expect(resetPassword('t', 'Pass123456!')).rejects.toThrow('Invalid or expired reset link')
  })
})
