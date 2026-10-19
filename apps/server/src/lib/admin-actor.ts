import { z } from 'zod'

/**
 * Who an admin session is, from its token's subject. Three kinds, and only
 * three (requireSuperAdmin checks each per request):
 *
 *   - 'admin': the env-credential login (ADMIN_USERNAME / ADMIN_PASSWORD), the
 *     bootstrap and break-glass door. No row anywhere; signs as 'admin'.
 *   - 'admin:<admin_logins.id>': a personal admin login (0058). Signs with
 *     the login's name.
 *   - a users id holding an active super_admin row in user_member_mapping.
 *
 * Only the last is a users id. Anything that stores the subject in a column
 * referencing users, or looks it up in users, must go through
 * `userIdFromSubject`, never take the subject as it is.
 */
export const BREAK_GLASS_SUBJECT = 'admin'

/** The name the shared env login signs with (as before 0058). */
export const BREAK_GLASS_NAME = 'admin'

const PERSONAL_PREFIX = 'admin:'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function personalAdminSubject(loginId: string): string {
  return `${PERSONAL_PREFIX}${loginId}`
}

/** The admin_logins id in a personal login's subject; null for any other. */
export function personalLoginId(subject: string): string | null {
  if (!subject.startsWith(PERSONAL_PREFIX)) return null
  const id = subject.slice(PERSONAL_PREFIX.length)
  return UUID_RE.test(id) ? id : null
}

/** The users id a subject names, or null when it names no users row. */
export function userIdFromSubject(subject: string): string | null {
  return UUID_RE.test(subject) ? subject : null
}

export type AdminActorKind = 'shared' | 'personal' | 'member'

/** The signed-in admin, as requireSuperAdmin found them. */
export type AdminActor = {
  sub: string
  kind: AdminActorKind
  /** What every action is signed with. */
  name: string
  /** The personal login's username; null for the other two kinds. */
  username: string | null
  /** The personal login's id; null for the other two kinds. */
  loginId: string | null
}

/**
 * The `actorName` of an admin write's schema since 0058: adminSignedJson
 * fills it in with the signed-in admin's name once the body is valid. A name
 * a client sends (a panel from before personal logins) is accepted and
 * ignored, so the API and the panel can deploy in either order.
 */
export const signedActorName = z.unknown().optional().transform((): string => '')
