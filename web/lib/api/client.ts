import type { ApiErrorResponse, ApiSuccessResponse } from './types'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
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

async function refreshAccessToken(): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    setAccessToken(null)
    return null
  }

  const body = (await response.json()) as ApiSuccessResponse<{
    accessToken: string
  }>
  setAccessToken(body.data.accessToken)
  return body.data.accessToken
}

async function getValidToken(): Promise<string | null> {
  if (accessToken) return accessToken
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
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

  if (auth) {
    const token = await getValidToken()
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`
    }
  }

  let response = await fetch(url.toString(), {
    ...rest,
    headers: requestHeaders,
    credentials: 'include',
  })

  if (response.status === 401 && auth && accessToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      requestHeaders.Authorization = `Bearer ${newToken}`
      response = await fetch(url.toString(), {
        ...rest,
        headers: requestHeaders,
        credentials: 'include',
      })
    }
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) return undefined as T

  const body = (await response.json()) as ApiSuccessResponse<T>
  return body.data
}
