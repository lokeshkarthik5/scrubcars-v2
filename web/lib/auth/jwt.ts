import type { AuthAudience } from '@/lib/api/types'

type AccessTokenPayload = {
  aud?: AuthAudience
  sub?: string
}

/** Decode JWT payload without verification (client-side hints only). */
export function decodeAccessTokenPayload(
  token: string
): AccessTokenPayload | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null

    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(normalized)
    return JSON.parse(json) as AccessTokenPayload
  } catch {
    return null
  }
}

export function deriveAudience(
  accessToken: string,
  vendor: { id: string } | null
): AuthAudience {
  const payload = decodeAccessTokenPayload(accessToken)
  if (payload?.aud === 'customer' || payload?.aud === 'vendor') {
    return payload.aud
  }
  return vendor ? 'vendor' : 'customer'
}
