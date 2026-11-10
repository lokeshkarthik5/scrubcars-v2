import { afterEach, describe, expect, test } from 'bun:test'
import { apiClient, requestHeadersFor, setActiveVendorId } from './client'

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
