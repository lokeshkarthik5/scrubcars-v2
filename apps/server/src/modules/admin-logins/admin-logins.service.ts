import {
  BREAK_GLASS_NAME,
  BREAK_GLASS_SUBJECT,
  personalAdminSubject,
  personalLoginId,
  type AdminActor,
} from '../../lib/admin-actor.js'
import { normalizeAdminUsername } from '../../lib/admin-logins.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { decoyCheck, hashPassword, verifyPassword } from '../../lib/passwords.js'
import { adminLoginsRepository, type AdminLoginRow } from './admin-logins.repository.js'
import type {
  ChangeOwnPasswordInput,
  CreateAdminLoginInput,
  ResetAdminPasswordInput,
  SetAdminLoginStatusInput,
} from './admin-logins.validation.js'

const log = logger.child({ module: 'admin-logins' })

function toResponse(row: AdminLoginRow) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    status: row.status,
    isOwner: row.isOwner,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  }
}

export type AdminLoginResponse = ReturnType<typeof toResponse>

function notFound() {
  return new AppError(404, 'That login does not exist', 'ADMIN_LOGIN_NOT_FOUND')
}

/**
 * Owner decision (19 Oct 2026): only the owner's login adds logins, resets
 * other people's passwords and turns logins on or off. Everyone changes
 * their own password. Enforced here, not only by hidden buttons.
 */
function ownerOnly() {
  return new AppError(403, 'Only the owner can change team logins.', 'ADMIN_OWNER_ONLY')
}

function actorOf(actor: AdminActor) {
  return { actorSub: actor.sub, actorName: actor.name }
}

export const adminLoginsService = {
  /**
   * A personal login's sign-in: its subject, or null for a wrong username,
   * a wrong password or a login that is off, all alike. An unknown username
   * still checks a password (the decoy), so the refusal takes as long.
   */
  async signIn(usernameInput: string, password: string, now = new Date()): Promise<string | null> {
    const username = normalizeAdminUsername(usernameInput)
    const row = username ? await adminLoginsRepository.findByUsername(username) : undefined
    if (!row) {
      await decoyCheck(password)
      return null
    }
    if (!(await verifyPassword(password, row.passwordHash)) || row.status !== 'active') return null
    await adminLoginsRepository.recordLogin(row.id, now)
    log.info({ loginId: row.id }, 'admin-logins:signed_in')
    return personalAdminSubject(row.id)
  },

  /**
   * A personal login's session, checked on every admin request: the login is
   * still on, and the token was minted at or after `sessions_from` (a reset
   * or turning it off ends every older session). Null otherwise.
   */
  async sessionActor(sub: string, mintedAt: number | undefined): Promise<AdminActor | null> {
    const id = personalLoginId(sub)
    if (!id || mintedAt === undefined) return null
    const row = await adminLoginsRepository.findSession(id)
    if (!row || row.status !== 'active') return null
    if (mintedAt < row.sessionsFrom.getTime()) return null
    return { sub, kind: 'personal', name: row.name, username: row.username, loginId: row.id, isOwner: row.isOwner }
  },

  /**
   * What the Team logins page shows and allows: `canManage` for the owner,
   * and for the shared login while there is no owner (it makes the first
   * login, which becomes the owner); read-only for everyone else.
   */
  async list(actor: AdminActor) {
    const [rows, ownerExists] = await Promise.all([adminLoginsRepository.list(), adminLoginsRepository.ownerExists()])
    return {
      logins: rows.map(toResponse),
      youId: actor.loginId,
      ownerExists,
      canManage: actor.isOwner || (actor.kind === 'shared' && !ownerExists),
    }
  },

  /**
   * Owner only, with one bootstrap: the shared env login makes the first
   * personal login while there is no owner, and that login is the owner.
   * Racing bootstraps cannot make two: the one-owner index refuses the second.
   */
  async create(actor: AdminActor, input: CreateAdminLoginInput) {
    const bootstrap = !actor.isOwner && actor.kind === 'shared' && !(await adminLoginsRepository.ownerExists())
    if (!actor.isOwner && !bootstrap) throw ownerOnly()
    // The env login is checked first at sign-in, so a personal login with
    // its username could never sign in.
    if (input.username === normalizeAdminUsername(env.adminUsername)) {
      throw new AppError(409, 'That username is the shared login’s. Pick another.', 'ADMIN_USERNAME_TAKEN')
    }
    const row = await adminLoginsRepository.create(
      { username: input.username, name: input.name, passwordHash: await hashPassword(input.password), isOwner: bootstrap },
      actorOf(actor)
    )
    if (!row && bootstrap && (await adminLoginsRepository.ownerExists())) throw ownerOnly()
    if (!row) {
      throw new AppError(409, 'Someone already has that username or name. Pick another.', 'ADMIN_USERNAME_TAKEN')
    }
    log.info({ loginId: row.id, by: actor.sub, isOwner: row.isOwner }, 'admin-logins:created')
    return toResponse(row)
  },

  /** Someone else's password. Your own goes through changeOwnPassword, which asks for the current one. */
  async resetPassword(actor: AdminActor, id: string, input: ResetAdminPasswordInput, now = new Date()) {
    if (!actor.isOwner) throw ownerOnly()
    if (id === actor.loginId) {
      throw new AppError(409, 'Change your own password under Your password, with your current one.', 'ADMIN_LOGIN_SELF')
    }
    const row = await adminLoginsRepository.setPassword(
      id,
      await hashPassword(input.password),
      actorOf(actor),
      'admin_login_password_reset',
      now
    )
    if (!row) throw notFound()
    log.info({ loginId: id, by: actor.sub }, 'admin-logins:password_reset')
    return toResponse(row)
  },

  async setStatus(actor: AdminActor, id: string, input: SetAdminLoginStatusInput, now = new Date()) {
    if (!actor.isOwner) throw ownerOnly()
    // The owner is the only one who can turn logins back on: never off.
    if (id === actor.loginId) {
      throw new AppError(409, 'You can’t turn off your own login: you’re the owner.', 'ADMIN_LOGIN_SELF')
    }
    const row = await adminLoginsRepository.setStatus(id, input.status, actorOf(actor), now)
    if (!row) throw notFound()
    log.info({ loginId: id, status: input.status, by: actor.sub }, 'admin-logins:status')
    return toResponse(row)
  },

  /**
   * The signed-in person's own password, with the current one. Every other
   * session of theirs ends; the caller mints this one a fresh token.
   */
  async changeOwnPassword(actor: AdminActor, input: ChangeOwnPasswordInput, now = new Date()) {
    if (actor.kind === 'shared') {
      throw new AppError(
        409,
        'The shared login’s password is set in the server settings, not here.',
        'ADMIN_LOGIN_SHARED'
      )
    }
    if (!actor.loginId) {
      throw new AppError(409, 'You sign in with your phone, so there is no password to change.', 'ADMIN_LOGIN_NOT_PERSONAL')
    }
    const row = await adminLoginsRepository.findById(actor.loginId)
    if (!row || !(await verifyPassword(input.currentPassword, row.passwordHash))) {
      throw new AppError(400, 'Your current password is not right', 'ADMIN_PASSWORD_WRONG')
    }
    await adminLoginsRepository.setPassword(
      row.id,
      await hashPassword(input.newPassword),
      actorOf(actor),
      'admin_password_changed',
      now
    )
    log.info({ loginId: row.id }, 'admin-logins:password_changed')
    return personalAdminSubject(row.id)
  },
}

/**
 * The name an admin subject signs with, for code that has only the subject
 * (booking notes, notices, complaints, refunds, service pictures): 'admin'
 * for the shared login, the login's name for a personal one, and null for a
 * users id, which the caller looks up in users as before.
 */
export async function adminSubjectName(sub: string): Promise<string | null> {
  if (sub === BREAK_GLASS_SUBJECT) return BREAK_GLASS_NAME
  const id = personalLoginId(sub)
  if (!id) return null
  const row = await adminLoginsRepository.findSession(id)
  return row?.name ?? 'admin (removed login)'
}
