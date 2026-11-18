// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { detailMessage, renameDocument } from './api'

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
