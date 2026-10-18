/**
 * The invite a visitor opened before signing up (Detlio Rewards, 0050): the
 * code and the API's signed note of when it was opened, kept on this device
 * only until the new account takes it up. Never sent anywhere but back to
 * the API's claim.
 */
const KEY = 'detlio:invite'

export interface StoredInvite {
  code: string
  token: string
}

export function readStoredInvite(code: string): StoredInvite | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredInvite>
    if (typeof parsed.code !== 'string' || typeof parsed.token !== 'string') return null
    return parsed.code.toUpperCase() === code.toUpperCase() ? { code: parsed.code, token: parsed.token } : null
  } catch {
    return null
  }
}

export function storeInvite(invite: StoredInvite) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(invite))
  } catch {
    // Storage blocked: the claim uses the page's own token instead.
  }
}

export function forgetInvite() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}
