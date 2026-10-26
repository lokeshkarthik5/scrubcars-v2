/**
 * Personal admin logins (0058): the rules for a username, a name and a
 * password, in the words the server sends. The server's twin is
 * apps/server/src/lib/admin-logins.ts (a parity test keeps them the same),
 * so the panel can say what is wrong before asking.
 */
export const ADMIN_LOGIN_LIMITS = {
  usernameMin: 3,
  usernameMax: 40,
  nameMin: 2,
  nameMax: 60,
  passwordMin: 10,
  passwordMax: 200,
} as const

export const ADMIN_USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/

/** Usernames are kept in lower case, so "Raga" and "raga" are one login. */
export function normalizeAdminUsername(value: string): string {
  return value.trim().toLowerCase()
}

/** One line with single spaces: the name signs actions and alerts. */
export function normalizeAdminName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function adminUsernameProblem(value: string): string | null {
  const username = normalizeAdminUsername(value)
  if (username.length < ADMIN_LOGIN_LIMITS.usernameMin) return 'Use at least 3 letters or numbers'
  if (username.length > ADMIN_LOGIN_LIMITS.usernameMax) return 'Use 40 characters or fewer'
  if (!ADMIN_USERNAME_RE.test(username)) {
    return 'Use letters, numbers, dots, dashes or underscores, starting with a letter or number'
  }
  return null
}

export function adminNameProblem(value: string): string | null {
  const name = normalizeAdminName(value)
  if (name.length < ADMIN_LOGIN_LIMITS.nameMin) return 'Type the name actions are signed with'
  if (name.length > ADMIN_LOGIN_LIMITS.nameMax) return 'Use 60 characters or fewer'
  return null
}

export function adminPasswordProblem(value: string): string | null {
  if (value.length < ADMIN_LOGIN_LIMITS.passwordMin) return 'Use at least 10 characters'
  if (value.length > ADMIN_LOGIN_LIMITS.passwordMax) return 'Use 200 characters or fewer'
  if (value.trim().length === 0) return 'Use at least 10 characters'
  return null
}
