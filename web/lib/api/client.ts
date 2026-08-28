import type { ApiErrorResponse, ApiSuccessResponse } from './types'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

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

function noteSupportSession(response: Response) {
  const active = response.headers.get(SUPPORT_SESSION_HEADER) === 'true'
  if (active === isSupportSession) return
  isSupportSession = active
  supportSessionListeners.forEach((listener) => listener(active))
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
  auth?: boolean
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ApiErrorResponse | null
  return new ApiError(
    response.status,
    body?.message ?? response.statusText,
    body?.code
  )
}

async function tryRefreshCookies(): Promise<boolean> {
  if (refreshPromise) return refreshPromise

  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { params, headers, auth = true, ...rest } = options

  const url = new URL(
    `${API_BASE_URL}${endpoint}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  )
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(activeVendorId ? { 'X-Vendor-Id': activeVendorId } : {}),
    ...(headers as Record<string, string>),
  }

  let response = await fetch(url.toString(), {
    ...rest,
    headers: requestHeaders,
    credentials: 'include',
  })

  noteSupportSession(response)

  if (response.status === 401 && auth) {
    const refreshed = await tryRefreshCookies()
    if (refreshed) {
      response = await fetch(url.toString(), {
        ...rest,
        headers: requestHeaders,
        credentials: 'include',
      })
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
