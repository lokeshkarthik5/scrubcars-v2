import type { ApiErrorResponse, ApiSuccessResponse } from './types'

/** The API every request goes to; also where usage events are sent (analytics.ts). */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:8080/api/v1'

/**
 * The company every vendor-scoped request acts on. Attached here, in the one
 * place that builds request headers, so no individual API module has to know
 * about tenancy — and so a company switch cannot leave one module pointing at
 * the previous company.
 */
let activeVendorId: string | null = null

export function setActiveVendorId(vendorId: string | null) {
  activeVendorId = vendorId
}

/**
 * Set on every response to a request that resolved through a platform grant
 * rather than a seat. The portal renders a persistent support-session banner
 * from it — see `subscribeToSupportSession`.
 */
const SUPPORT_SESSION_HEADER = 'x-detlio-support-session'

let isSupportSession = false
const supportSessionListeners = new Set<(active: boolean) => void>()

export function subscribeToSupportSession(
  listener: (active: boolean) => void
) {
  supportSessionListeners.add(listener)
  listener(isSupportSession)
  return () => {
    supportSessionListeners.delete(listener)
  }
}

/**
 * Latches on, and stays on until the session ends.
 *
 * Only tenant-resolved endpoints carry the header, so clearing the flag whenever
 * a response arrives without it made the banner blink off every time an
 * unrelated request (`/auth/me`, reviews) happened to land last. The flag is a
 * property of the session, not of the most recent response — so it is cleared
 * by `clearSupportSession` on logout, and by nothing else.
 */
function noteSupportSession(response: Response) {
  if (isSupportSession) return
  if (response.headers.get(SUPPORT_SESSION_HEADER) !== 'true') return

  isSupportSession = true
  supportSessionListeners.forEach((listener) => listener(true))
}

export function clearSupportSession() {
  if (!isSupportSession) return
  isSupportSession = false
  supportSessionListeners.forEach((listener) => listener(false))
}

let unauthorizedHandler: (() => void | Promise<void>) | null = null
let handlingUnauthorized = false
let refreshPromise: Promise<boolean> | null = null

export function setUnauthorizedHandler(
  handler: (() => void | Promise<void>) | null
) {
  unauthorizedHandler = handler
}

async function triggerUnauthorizedLogout() {
  if (handlingUnauthorized || !unauthorizedHandler) return
  handlingUnauthorized = true
  try {
    await unauthorizedHandler()
  } finally {
    handlingUnauthorized = false
  }
}

/**
 * How a native app signs its requests (native-session.ts). A website never sets
 * this, and without it every request goes out with cookies, as it always has.
 */
export interface BearerAuth {
  getAccessToken(): string | null
  refresh(): Promise<boolean>
}

let bearerAuth: BearerAuth | null = null

export function setBearerAuth(auth: BearerAuth | null) {
  bearerAuth = auth
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /** Seconds until the same request can succeed, when the server says. */
    public retryAfterSeconds?: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
  auth?: boolean
  /**
   * Inherited from RequestInit, named here because it matters: true lets a
   * request outlive the page (sent from pagehide). The 401 refresh and its
   * retry are sent the same way.
   */
  keepalive?: boolean
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ApiErrorResponse | null
  return new ApiError(
    response.status,
    body?.message ?? response.statusText,
    body?.code,
    typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined
  )
}

/**
 * How long a read may take before it is given up and asked again. A request
 * caught on a stuck server connection used to hang until the server's own
 * 60-second limit, with the screen on "Finding garages…" all that time; now
 * it fails as a 504 and the query's retry asks again at once. Reads only: a
 * write given up on might still land, and must never be sent twice.
 */
export const READ_TIMEOUT_MS = 12_000

/** Thrown when a read ran past READ_TIMEOUT_MS: a 5xx, so queries retry it. */
export const READ_TIMEOUT_STATUS = 504

function isRead(init: RequestInit): boolean {
  return (init.method ?? 'GET').toUpperCase() === 'GET' && (init.body === undefined || init.body === null)
}

async function send(url: string, init: RequestInit, headers: Record<string, string>) {
  const auth: RequestInit = bearerAuth
    ? (() => {
        const token = bearerAuth.getAccessToken()
        return {
          headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
          credentials: 'omit' as const,
        }
      })()
    : { headers, credentials: 'include' as const }

  // A write, or a read whose caller manages its own cancelling, goes as it is.
  if (!isRead(init) || init.signal || init.keepalive) {
    return fetch(url, { ...init, ...auth })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, ...auth, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(READ_TIMEOUT_STATUS, 'The server took too long to answer', 'READ_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function tryRefreshCookies(keepalive = false): Promise<boolean> {
  if (bearerAuth) return bearerAuth.refresh()
  if (refreshPromise) return refreshPromise

  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    // A request sent as the page goes away (keepalive) must be able to
    // finish its refresh too, or the retry after a 401 is lost.
    ...(keepalive ? { keepalive: true } : {}),
  })
    .then((r) => r.ok)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

/**
 * The headers a request goes out with. `Content-Type` only when there is a
 * body to describe: on a GET it is not one of the CORS-safelisted values,
 * so every read paid a preflight round trip before the request itself (the
 * garage page's ten reads, twice over). The tenant header still makes a
 * vendor app's reads preflight, which is the price of carrying the company.
 */
export function requestHeadersFor(
  body: RequestInit['body'],
  headers?: Record<string, string>
): Record<string, string> {
  return {
    ...(body !== undefined && body !== null ? { 'Content-Type': 'application/json' } : {}),
    ...(activeVendorId ? { 'X-Vendor-Id': activeVendorId } : {}),
    ...headers,
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { params, headers, auth = true, ...rest } = options

  const url = new URL(
    `${API_BASE_URL}${endpoint}`,
    // React Native has a `window`, but no location on it.
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'http://localhost:3000'
  )
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
  }

  const requestHeaders = requestHeadersFor(rest.body, headers as Record<string, string> | undefined)

  let response = await send(url.toString(), rest, requestHeaders)

  noteSupportSession(response)

  if (response.status === 401 && auth) {
    const refreshed = await tryRefreshCookies(Boolean(rest.keepalive))
    if (refreshed) {
      response = await send(url.toString(), rest, requestHeaders)
      noteSupportSession(response)
    }
  }

  if (!response.ok) {
    const error = await parseError(response)
    if (auth && error.status === 401) {
      await triggerUnauthorizedLogout()
    }
    throw error
  }

  if (response.status === 204) return undefined as T

  const body = (await response.json()) as ApiSuccessResponse<T>
  return body.data
}
