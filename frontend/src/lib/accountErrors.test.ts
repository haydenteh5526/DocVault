// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { registerUser, verifyEmail } from './api'

function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('registerUser errors', () => {
  it('shows the first validation message when detail is a list', async () => {
    vi.stubGlobal('fetch', reply(422, {
      detail: [{ type: 'value_error', loc: ['body', 'email'], msg: 'value is not a valid email address', input: 'a@example.test' }],
    }))
    await expect(registerUser('a@example.test', 'pw')).rejects.toThrow('value is not a valid email address')
  })

  it('falls back to a plain message when the list has no usable msg', async () => {
    vi.stubGlobal('fetch', reply(422, { detail: [{ loc: ['body'] }] }))
    await expect(registerUser('a@example.test', 'pw')).rejects.toThrow('Check your email address and password.')
    vi.stubGlobal('fetch', reply(422, { detail: [] }))
    await expect(registerUser('a@example.test', 'pw')).rejects.toThrow('Check your email address and password.')
  })

  it('keeps string detail messages as they are', async () => {
    vi.stubGlobal('fetch', reply(400, { detail: 'Email already registered' }))
    await expect(registerUser('a@b.com', 'pw')).rejects.toThrow('Email already registered')
  })
})

describe('verifyEmail', () => {
  it('calls the endpoint once per token however many times it is asked', async () => {
    const fetchMock = reply(200, { message: 'Email verified' })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([verifyEmail('tok-once'), verifyEmail('tok-once')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(a.ok).toBe(true)
  })

  it('does not remember a failed network call, so a retry can run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    await expect(verifyEmail('tok-net')).rejects.toThrow()
    const ok = reply(200, { message: 'Email verified' })
    vi.stubGlobal('fetch', ok)
    await expect(verifyEmail('tok-net')).resolves.toMatchObject({ ok: true })
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
