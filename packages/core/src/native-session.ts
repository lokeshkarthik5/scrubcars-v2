import { ApiError, apiClient, setBearerAuth } from './api/client'
import type { ApiAuthUser, ApiAuthVendor } from './api/types'

/**
 * The session of a native app. The refresh token lives in the phone's secure
 * storage, handed in by the app so this file needs no native module. The access
 * token stays in memory only: it lasts 15 minutes, and a launch gets a new one.
 * Neither is ever logged or put in a URL.
 *
 * The server rotates the refresh token on every use and the old one dies at
 * once, so refreshes never run side by side here. A response lost on the way
 * back signs the person out; they sign in again with a code.
 */
export interface RefreshTokenStorage {
  get(): Promise<string | null>
  set(token: string): Promise<void>
  clear(): Promise<void>
}

export type NativeAudience = 'customer' | 'vendor'

export interface NativeSessionData {
  user: ApiAuthUser
  vendor: ApiAuthVendor | null
  vendors: ApiAuthVendor[]
}

interface NativeTokens extends NativeSessionData {
  accessToken: string
  refreshToken: string
}

export interface NativeSignInInput {
  phone: string
  otp: string
  purpose: 'login' | 'register' | 'vendor_onboard'
  name?: string
  visitId?: string
}

export type NativeOtpPurpose = NativeSignInInput['purpose']

/** How long a server call made while signing out is given. */
export const SERVER_SIGN_OUT_TIMEOUT_MS = 3000

// The refusals that mean "no account of that kind yet", as the websites' sign-in.
const SIGN_UP_CODES = new Set(['USER_NOT_FOUND', 'NOT_A_VENDOR'])

/**
 * - `signed-in`: a new access token is in memory.
 * - `signed-out`: no refresh token, or the server refused it (and it is gone).
 * - `unreachable`: no answer, or a server error. The refresh token is kept, so
 *   a phone with no signal is not signed out.
 */
export type RestoreResult =
  | { status: 'signed-in'; session: NativeSessionData }
  | { status: 'signed-out' }
  | { status: 'unreachable' }

export function createNativeSession(audience: NativeAudience, storage: RefreshTokenStorage) {
  let accessToken: string | null = null
  let running: Promise<RestoreResult> | null = null

  async function adopt(tokens: NativeTokens): Promise<NativeSessionData> {
    // Saved before anything uses it: the server has already killed the old one.
    await storage.set(tokens.refreshToken)
    accessToken = tokens.accessToken
    const { user, vendor, vendors } = tokens
    return { user, vendor, vendors }
  }

  async function runRefresh(): Promise<RestoreResult> {
    const refreshToken = await storage.get()
    if (!refreshToken) {
      accessToken = null
      return { status: 'signed-out' }
    }
    try {
      const tokens = await apiClient<NativeTokens>('/auth/native/refresh', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ refreshToken, audience }),
      })
      return { status: 'signed-in', session: await adopt(tokens) }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        accessToken = null
        await storage.clear()
        return { status: 'signed-out' }
      }
      return { status: 'unreachable' }
    }
  }

  function refresh(): Promise<RestoreResult> {
    running ??= runRefresh().finally(() => {
      running = null
    })
    return running
  }

  return {
    audience,
    getAccessToken: () => accessToken,
    /** On launch, and whenever an access token has run out. */
    refresh,
    /**
     * For the app's setUnauthorizedHandler: apiClient reports a 401 it could not
     * refresh, which is also what no signal looks like. Still true means the
     * person is signed in and only needs to try again.
     */
    hasRefreshToken: async () => Boolean(await storage.get()),

    /** Sends the code, moving to a sign-up when the number has no account yet. */
    async sendCode(phone: string): Promise<{ purpose: NativeOtpPurpose; expiresInSeconds: number }> {
      const send = async (purpose: NativeOtpPurpose) => {
        const sent = await apiClient<{ expiresInSeconds: number }>('/auth/otp/send', {
          method: 'POST',
          auth: false,
          body: JSON.stringify({ phone, purpose, audience }),
        })
        return { purpose, expiresInSeconds: sent.expiresInSeconds }
      }
      try {
        return await send('login')
      } catch (err) {
        if (!(err instanceof ApiError) || !SIGN_UP_CODES.has(err.code ?? '')) throw err
        return send(audience === 'vendor' ? 'vendor_onboard' : 'register')
      }
    },

    /** Throws ApiError for a wrong or expired code, as the websites' sign-in does. */
    async signIn(input: NativeSignInInput): Promise<NativeSessionData> {
      const tokens = await apiClient<NativeTokens>('/auth/native/otp/verify', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ ...input, audience }),
      })
      return adopt(tokens)
    },

    /**
     * Signed out on this phone whatever the server says. The server is told afterwards, if it
     * can be, and nothing waits for it: a bad signal must not hold anyone on a spinner.
     */
    async signOut(): Promise<void> {
      const refreshToken = await storage.get()
      accessToken = null
      await storage.clear()
      if (!refreshToken) return
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), SERVER_SIGN_OUT_TIMEOUT_MS)
      void apiClient('/auth/native/logout', {
        method: 'POST',
        auth: false,
        signal: abort.signal,
        body: JSON.stringify({ refreshToken }),
      })
        .catch(() => undefined)
        .finally(() => clearTimeout(timer))
    },

    /** Makes apiClient sign every request with this session. Call once, at startup. */
    install() {
      setBearerAuth({
        getAccessToken: () => accessToken,
        refresh: async () => (await refresh()).status === 'signed-in',
      })
    },
  }
}

export type NativeSession = ReturnType<typeof createNativeSession>
