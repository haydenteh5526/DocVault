import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8')

type Listener = (event: Record<string, unknown>) => void

// Runs public/sw.js against a stub worker scope and records the order of cache and network calls.
function loadWorker(options: { cached?: unknown; network?: 'ok' | 'fails'; cacheNames?: string[] } = {}) {
  const listeners: Record<string, Listener> = {}
  const calls: string[] = []
  const networkResponse = { ok: true, clone: () => ({ copy: true }) }
  const cache = { put: vi.fn(async () => { calls.push('cache.put') }), addAll: vi.fn(async () => undefined) }
  const caches = {
    match: vi.fn(async () => { calls.push('caches.match'); return options.cached }),
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => options.cacheNames ?? []),
    delete: vi.fn(async () => true),
  }
  const fetchStub = vi.fn(async () => {
    calls.push('fetch')
    if (options.network === 'fails') throw new TypeError('offline')
    return networkResponse
  })
  const self = {
    addEventListener: (name: string, listener: Listener) => { listeners[name] = listener },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  }
  new Function('self', 'caches', 'fetch', source)(self, caches, fetchStub)

  async function request(init: { url: string; mode?: string; method?: string }) {
    const waits: Promise<unknown>[] = []
    let responded: Promise<unknown> | undefined
    listeners.fetch({
      request: { method: init.method ?? 'GET', mode: init.mode ?? 'no-cors', url: init.url },
      respondWith: (value: Promise<unknown>) => { responded = value },
      waitUntil: (value: Promise<unknown>) => { waits.push(value) },
    })
    const result = responded ? await responded : undefined
    await Promise.all(waits)
    return { intercepted: responded !== undefined, result }
  }

  return { listeners, calls, caches, cache, networkResponse, request }
}

describe('service worker', () => {
  it('asks the network before the cache for a page navigation, and stores the response', async () => {
    const worker = loadWorker({ cached: { stale: true } })
    const { result } = await worker.request({ url: 'https://docvault.test/app/documents', mode: 'navigate' })
    expect(result).toBe(worker.networkResponse)
    expect(worker.calls[0]).toBe('fetch')
    expect(worker.cache.put).toHaveBeenCalledTimes(1)
  })

  it('treats / and /index.html as pages even when the request is not a navigation', async () => {
    for (const url of ['https://docvault.test/', 'https://docvault.test/index.html']) {
      const worker = loadWorker({ cached: { stale: true } })
      const { result } = await worker.request({ url })
      expect(result).toBe(worker.networkResponse)
      expect(worker.calls[0]).toBe('fetch')
    }
  })

  it('serves the cached copy of a page when the network fails', async () => {
    const cached = { offline: true }
    const worker = loadWorker({ cached, network: 'fails' })
    const { result } = await worker.request({ url: 'https://docvault.test/', mode: 'navigate' })
    expect(result).toBe(cached)
    expect(worker.cache.put).not.toHaveBeenCalled()
  })

  it('serves a cached static file from the cache without asking the network', async () => {
    const cached = { asset: true }
    const worker = loadWorker({ cached })
    const { result } = await worker.request({ url: 'https://docvault.test/assets/index-abc123.js' })
    expect(result).toBe(cached)
    expect(worker.calls).toEqual(['caches.match'])
  })

  it('leaves /api/ requests and non-GET requests alone', async () => {
    const worker = loadWorker({ cached: { stale: true } })
    expect((await worker.request({ url: 'https://docvault.test/api/documents' })).intercepted).toBe(false)
    expect((await worker.request({ url: 'https://docvault.test/', method: 'POST', mode: 'navigate' })).intercepted).toBe(false)
    expect(worker.calls).toEqual([])
  })

  it('deletes the old docvault-v2 cache on activate and keeps the current one', async () => {
    const worker = loadWorker({ cacheNames: ['docvault-v2', 'docvault-v3'] })
    const waits: Promise<unknown>[] = []
    worker.listeners.activate({ waitUntil: (value: Promise<unknown>) => { waits.push(value) } })
    await Promise.all(waits)
    expect(worker.caches.delete).toHaveBeenCalledWith('docvault-v2')
    expect(worker.caches.delete).not.toHaveBeenCalledWith('docvault-v3')
  })
})
