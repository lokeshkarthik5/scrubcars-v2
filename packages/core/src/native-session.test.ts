import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiClient, ApiError, setBearerAuth, setUnauthorizedHandler } from './api/client'
import { createNativeSession, type RefreshTokenStorage } from './native-session'

type Call = { url: string; init: RequestInit }
let calls: Call[]
let answers: Array<Response | Error>
const realFetch = globalThis.fetch

const session = (n: number) => ({
  success: true,
  data: {
    user: { id: 'u1' },
    vendor: null,
    vendors: [],
    accessToken: `access-${n}`,
    refreshToken: `refresh-${n}`,
  },
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const failure = (status: number, code: string) => json({ success: false, message: code, code }, status)

function memoryStorage(initial: string | null = null): RefreshTokenStorage & { value: string | null } {
  return {
    value: initial,
    async get() {
      return this.value
    },
    async set(token) {
      this.value = token
    },
    async clear() {
      this.value = null
    },
  }
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body))
const headersOf = (call: Call) => call.init.headers as Record<string, string>
const pathOf = (call: Call) => new URL(call.url).pathname.replace('/api/v1', '')

beforeEach(() => {
  calls = []
  answers = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    const next = answers.shift()
    if (!next) throw new Error(`unexpected request to ${url}`)
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  setBearerAuth(null)
  setUnauthorizedHandler(null)
})

describe('the websites, with no native session installed', () => {
  test('requests go with cookies and no Authorization header', async () => {
    answers = [json({ success: true, data: 1 })]
    await apiClient('/x')
    expect(calls[0].init.credentials).toBe('include')
    expect(headersOf(calls[0]).Authorization).toBeUndefined()
  })

  test('a 401 refreshes through the cookie route, then retries', async () => {
    answers = [failure(401, 'UNAUTHORIZED'), json({ success: true, data: {} }), json({ success: true, data: 2 })]
    expect(await apiClient<number>('/x')).toBe(2)
    expect(pathOf(calls[1])).toBe('/auth/refresh')
    expect(calls[1].init.credentials).toBe('include')
    expect(calls[2].init.credentials).toBe('include')
  })
})

describe('sending the code', () => {
  test('an existing account logs in', async () => {
    const native = createNativeSession('customer', memoryStorage())
    answers = [json({ success: true, data: { expiresInSeconds: 180 } })]
    expect(await native.sendCode('9000000001')).toEqual({ purpose: 'login', expiresInSeconds: 180 })
    expect(bodyOf(calls[0])).toEqual({ phone: '9000000001', purpose: 'login', audience: 'customer' })
  })

  test('no account moves to the sign-up of that app', async () => {
    const native = createNativeSession('vendor', memoryStorage())
    answers = [failure(403, 'NOT_A_VENDOR'), json({ success: true, data: { expiresInSeconds: 180 } })]
    expect((await native.sendCode('9000000001')).purpose).toBe('vendor_onboard')
  })

  test('any other refusal reaches the person as it is', async () => {
    const native = createNativeSession('customer', memoryStorage())
    answers = [failure(429, 'OTP_SEND_LIMIT')]
    await expect(native.sendCode('9000000001')).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(1)
  })
})

describe('signing in', () => {
  test('sends this app as the audience, keeps the refresh token in storage and the access token in memory', async () => {
    const storage = memoryStorage()
    const native = createNativeSession('vendor', storage)
    native.install()
    answers = [json(session(1))]
    const result = await native.signIn({ phone: '9000000001', otp: '123456', purpose: 'login' })

    expect(pathOf(calls[0])).toBe('/auth/native/otp/verify')
    expect(bodyOf(calls[0]).audience).toBe('vendor')
    expect(storage.value).toBe('refresh-1')
    expect(native.getAccessToken()).toBe('access-1')
    // What the screens get carries no token.
    expect(JSON.stringify(result)).not.toContain('refresh-1')
    expect(JSON.stringify(result)).not.toContain('access-1')
  })

  test('a wrong code throws the server’s refusal and stores nothing', async () => {
    const storage = memoryStorage()
    const native = createNativeSession('customer', storage)
    native.install()
    answers = [failure(400, 'INVALID_OTP')]
    const err = await native.signIn({ phone: '9000000001', otp: '000000', purpose: 'login' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('INVALID_OTP')
    expect(storage.value).toBeNull()
    expect(native.getAccessToken()).toBeNull()
  })

  test('requests then carry the access token and no cookies', async () => {
    const native = createNativeSession('customer', memoryStorage())
    native.install()
    answers = [json(session(1)), json({ success: true, data: 1 })]
    await native.signIn({ phone: '9000000001', otp: '123456', purpose: 'login' })
    await apiClient('/x')
    expect(headersOf(calls[1]).Authorization).toBe('Bearer access-1')
    expect(calls[1].init.credentials).toBe('omit')
    expect(calls[1].url).not.toContain('access-1')
  })
})

describe('opening the app again', () => {
  test('no stored token is signed out, without a request', async () => {
    const native = createNativeSession('customer', memoryStorage())
    expect((await native.refresh()).status).toBe('signed-out')
    expect(calls).toHaveLength(0)
  })

  test('a stored token gets a new pair, and the new refresh token replaces the old', async () => {
    const storage = memoryStorage('refresh-1')
    const native = createNativeSession('customer', storage)
    answers = [json(session(2))]
    expect((await native.refresh()).status).toBe('signed-in')
    expect(bodyOf(calls[0])).toEqual({ refreshToken: 'refresh-1', audience: 'customer' })
    expect(storage.value).toBe('refresh-2')
    expect(native.getAccessToken()).toBe('access-2')
  })

  test('the server refusing the token signs out and forgets it', async () => {
    const storage = memoryStorage('refresh-1')
    const native = createNativeSession('customer', storage)
    answers = [failure(401, 'INVALID_REFRESH_TOKEN')]
    expect((await native.refresh()).status).toBe('signed-out')
    expect(storage.value).toBeNull()
  })

  test('no signal or a server error keeps the token', async () => {
    const storage = memoryStorage('refresh-1')
    const native = createNativeSession('customer', storage)
    answers = [new TypeError('Network request failed'), failure(503, 'DOWN')]
    expect((await native.refresh()).status).toBe('unreachable')
    expect((await native.refresh()).status).toBe('unreachable')
    expect(storage.value).toBe('refresh-1')
  })

  test('refreshes never run side by side: the token dies on first use', async () => {
    const storage = memoryStorage('refresh-1')
    const native = createNativeSession('customer', storage)
    answers = [json(session(2))]
    const [a, b] = await Promise.all([native.refresh(), native.refresh()])
    expect(a.status).toBe('signed-in')
    expect(b.status).toBe('signed-in')
    expect(calls).toHaveLength(1)
  })
})

describe('an access token running out', () => {
  test('refreshes once and retries with the new token', async () => {
    const native = createNativeSession('customer', memoryStorage('refresh-1'))
    native.install()
    answers = [failure(401, 'INVALID_TOKEN'), json(session(2)), json({ success: true, data: 7 })]
    expect(await apiClient<number>('/x')).toBe(7)
    expect(pathOf(calls[1])).toBe('/auth/native/refresh')
    expect(headersOf(calls[2]).Authorization).toBe('Bearer access-2')
  })

  test('a dead refresh token ends in the signed-out handler', async () => {
    const native = createNativeSession('customer', memoryStorage('refresh-1'))
    native.install()
    let signedOut = 0
    setUnauthorizedHandler(() => {
      signedOut += 1
    })
    answers = [failure(401, 'INVALID_TOKEN'), failure(401, 'INVALID_REFRESH_TOKEN')]
    await expect(apiClient('/x')).rejects.toBeInstanceOf(ApiError)
    expect(signedOut).toBe(1)
    expect(await native.hasRefreshToken()).toBe(false)
  })

  test('no signal during the refresh leaves the app able to tell it is still signed in', async () => {
    const native = createNativeSession('customer', memoryStorage('refresh-1'))
    native.install()
    answers = [failure(401, 'INVALID_TOKEN'), new TypeError('Network request failed')]
    await expect(apiClient('/x')).rejects.toBeInstanceOf(ApiError)
    expect(await native.hasRefreshToken()).toBe(true)
  })
})

describe('signing out', () => {
  test('forgets the tokens and tells the server which one to end', async () => {
    const storage = memoryStorage('refresh-1')
    const native = createNativeSession('customer', storage)
    answers = [json({ success: true })]
    await native.signOut()
    expect(storage.value).toBeNull()
    expect(native.getAccessToken()).toBeNull()
    expect(pathOf(calls[0])).toBe('/auth/native/logout')
    expect(bodyOf(calls[0])).toEqual({ refreshToken: 'refresh-1' })
  })

  test('still signs out with no signal', async () => {
    const storage = memoryStorage('refresh-1')
    const native = createNativeSession('customer', storage)
    answers = [new TypeError('Network request failed')]
    await native.signOut()
    expect(storage.value).toBeNull()
  })
})
