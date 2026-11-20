// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { detailMessage, forgotPassword, loginUser, renameDocument, resetPassword, verify2FA } from './api'

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

  it('explains a rate limit, which the server sends as an object', () => {
    expect(detailMessage({ code: 'RATE_LIMITED', message: 'Too many requests.' }, 'x'))
      .toBe('Too many attempts. Wait a minute, then try again.')
  })

  it('shows the message of any other object detail that has one', () => {
    expect(detailMessage({ code: 'LOCKED', message: 'This account is locked.' }, 'x')).toBe('This account is locked.')
  })

  it('falls back when an object detail has no usable message', () => {
    expect(detailMessage({ code: 'LOCKED' }, 'Login failed')).toBe('Login failed')
    expect(detailMessage({ message: 42 }, 'Login failed')).toBe('Login failed')
    expect(detailMessage(null, 'Login failed')).toBe('Login failed')
  })
})

describe('the other sign-in calls use it too', () => {
  const limited = { detail: { code: 'RATE_LIMITED', message: 'Too many requests.' } }

  it.each([
    ['loginUser', () => loginUser('a@example.test', 'pw')],
    ['verify2FA', () => verify2FA('a@example.test', 'pw', '123456')],
    ['forgotPassword', () => forgotPassword('a@example.test')],
  ])('%s explains a rate limit and never shows an object', async (_name, call) => {
    vi.stubGlobal('fetch', reply(429, limited))
    await expect(call()).rejects.toThrow('Too many attempts. Wait a minute, then try again.')
  })

  it.each([
    ['loginUser', () => loginUser('a@example.test', 'pw'), 'Invalid email or password'],
    ['verify2FA', () => verify2FA('a@example.test', 'pw', '123456'), 'Invalid code'],
    ['forgotPassword', () => forgotPassword('a@example.test'), 'Request failed'],
  ])('%s keeps a string detail, and falls back when the body is not JSON', async (_name, call, fallback) => {
    vi.stubGlobal('fetch', reply(401, { detail: 'Invalid email or password' }))
    await expect(call()).rejects.toThrow('Invalid email or password')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })))
    await expect(call()).rejects.toThrow(fallback === 'Invalid email or password' ? 'Login failed' : fallback)
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
