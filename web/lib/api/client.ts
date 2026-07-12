import type { ApiErrorResponse, ApiSuccessResponse } from './types'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

let unauthorizedHandler: (() => void | Promise<void>) | null = null
let handlingUnauthorized = false

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
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
  return response.ok
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { params, headers, auth = true, ...rest } = options

  const url = new URL(`${API_BASE_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  }

  let response = await fetch(url.toString(), {
    ...rest,
    headers: requestHeaders,
    credentials: 'include',
  })

  if (response.status === 401 && auth) {
    const refreshed = await tryRefreshCookies()
    if (refreshed) {
      response = await fetch(url.toString(), {
        ...rest,
        headers: requestHeaders,
        credentials: 'include',
      })
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
