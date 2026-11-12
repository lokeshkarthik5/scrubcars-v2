import { afterEach, describe, expect, test } from 'bun:test'
import { ApiError, apiClient, READ_TIMEOUT_STATUS, requestHeadersFor, setActiveVendorId } from './client'

/** Every request the client sends, with the headers it sent them with. */
function recordFetch() {
  const sent: Array<{ url: string; method: string; headers: Record<string, string> }> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
    })
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return { sent, restore: () => (globalThis.fetch = original) }
}

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
  setActiveVendorId(null)
})

describe('Content-Type goes only with a body', () => {
  test('a GET carries none, so the browser sends it without a preflight', async () => {
    const fetch = recordFetch()
    restore = fetch.restore
    await apiClient('/vendors/abc', { auth: false })
    expect(fetch.sent).toHaveLength(1)
    expect(fetch.sent[0].method).toBe('GET')
    expect(Object.keys(fetch.sent[0].headers).map((h) => h.toLowerCase())).not.toContain(
      'content-type'
    )
  })

  test('a POST with a JSON body says so', async () => {
    const fetch = recordFetch()
    restore = fetch.restore
    await apiClient('/bookings', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(fetch.sent[0].headers['Content-Type']).toBe('application/json')
  })

  test('a POST with no body carries none either', () => {
    expect(requestHeadersFor(undefined)).toEqual({})
    expect(requestHeadersFor(null)).toEqual({})
  })

  test("a caller's own headers win, and the tenant still rides along", () => {
    setActiveVendorId('v-1')
    expect(requestHeadersFor('{}', { 'Content-Type': 'text/plain' })).toEqual({
      'Content-Type': 'text/plain',
      'X-Vendor-Id': 'v-1',
    })
    expect(requestHeadersFor(undefined)).toEqual({ 'X-Vendor-Id': 'v-1' })
  })
})

describe('a read that never answers', () => {
  test('is given up as a 504 the query retries; a write is never timed out', async () => {
    const original = globalThis.fetch
    const signals: Array<AbortSignal | undefined> = []
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined)
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }) as typeof fetch
    restore = () => (globalThis.fetch = original)
    const realSetTimeout = globalThis.setTimeout
    // Run the 12-second timer at once.
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout
    try {
      const error = (await apiClient('/vendors', { auth: false }).catch((e: unknown) => e)) as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.status).toBe(READ_TIMEOUT_STATUS)
      expect(error.code).toBe('READ_TIMEOUT')

      void apiClient('/bookings', { auth: false, method: 'POST', body: '{}' })
      expect(signals[1]).toBeUndefined()
    } finally {
      globalThis.setTimeout = realSetTimeout
    }
  })
})
