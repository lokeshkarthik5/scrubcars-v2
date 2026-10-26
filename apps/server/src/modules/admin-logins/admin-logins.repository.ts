import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, adminLogins } from '../../db/schema.js'

export type AdminLoginRecord = typeof adminLogins.$inferSelect

/** What may leave the server about a login: never the hash. */
const PUBLIC_COLUMNS = {
  id: adminLogins.id,
  username: adminLogins.username,
  name: adminLogins.name,
  status: adminLogins.status,
  isOwner: adminLogins.isOwner,
  lastLoginAt: adminLogins.lastLoginAt,
  createdByName: adminLogins.createdByName,
  createdAt: adminLogins.createdAt,
  phone: adminLogins.phone,
} as const

export type AdminLoginRow = {
  id: string
  username: string
  name: string
  status: 'active' | 'off'
  isOwner: boolean
  lastLoginAt: Date | null
  createdByName: string
  createdAt: Date
  /** Optional (0059), for "Also send on WhatsApp" with a collection list. */
  phone: string | null
}

type Actor = { actorSub: string; actorName: string }

/** One audit row per change, in the same transaction; never a password or hash. */
function audit(
  tx: Pick<typeof db, 'insert'>,
  action: string,
  actor: Actor,
  login: { id: string; username: string },
  detail: Record<string, unknown> = {}
) {
  return tx.insert(adminAuditLog).values({
    action,
    actorSub: actor.actorSub,
    actorName: actor.actorName,
    summary: { loginId: login.id, username: login.username },
    detail,
  })
}

export const adminLoginsRepository = {
  /** For sign-in: the row with its hash. */
  async findByUsername(username: string): Promise<AdminLoginRecord | undefined> {
    const [row] = await db.select().from(adminLogins).where(eq(adminLogins.username, username)).limit(1)
    return row
  },

  /** For every admin request: is this login on, since when, and its name. */
  async findSession(id: string) {
    const [row] = await db
      .select({
        id: adminLogins.id,
        username: adminLogins.username,
        name: adminLogins.name,
        status: adminLogins.status,
        isOwner: adminLogins.isOwner,
        sessionsFrom: adminLogins.sessionsFrom,
      })
      .from(adminLogins)
      .where(eq(adminLogins.id, id))
      .limit(1)
    return row
  },

  async findById(id: string): Promise<AdminLoginRecord | undefined> {
    const [row] = await db.select().from(adminLogins).where(eq(adminLogins.id, id)).limit(1)
    return row
  },

  /** Whether the team has an owner yet (the shared login's bootstrap). */
  async ownerExists(): Promise<boolean> {
    const [row] = await db.select({ id: adminLogins.id }).from(adminLogins).where(eq(adminLogins.isOwner, true)).limit(1)
    return row !== undefined
  },

  async list(): Promise<AdminLoginRow[]> {
    return db.select(PUBLIC_COLUMNS).from(adminLogins).orderBy(asc(adminLogins.name), asc(adminLogins.username))
  },

  async recordLogin(id: string, at: Date) {
    await db.update(adminLogins).set({ lastLoginAt: at }).where(eq(adminLogins.id, id))
  },

  /**
   * Undefined when the username or the name is taken, or (`isOwner`) when
   * there is an owner already: the unique indexes decide, not a read.
   */
  async create(
    input: { username: string; name: string; passwordHash: string; isOwner: boolean; phone?: string | null },
    actor: Actor
  ): Promise<AdminLoginRow | undefined> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(adminLogins)
        .values({ ...input, createdByName: actor.actorName })
        .onConflictDoNothing()
        .returning(PUBLIC_COLUMNS)
      if (!row) return undefined
      await audit(tx, 'admin_login_created', actor, row, { name: row.name, isOwner: row.isOwner })
      return row
    })
  },

  /**
   * A new password, and every session minted before now refused: a reset is
   * also how a lost or shared password is shut out. `action` names it in the
   * audit log (someone else's reset, or the person's own change).
   */
  async setPassword(
    id: string,
    passwordHash: string,
    actor: Actor,
    action: 'admin_login_password_reset' | 'admin_password_changed',
    now: Date
  ): Promise<AdminLoginRow | undefined> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(adminLogins)
        .set({ passwordHash, sessionsFrom: now, updatedAt: now })
        .where(eq(adminLogins.id, id))
        .returning(PUBLIC_COLUMNS)
      if (!row) return undefined
      await audit(tx, action, actor, row)
      return row
    })
  },

  /**
   * On or off. Off also refuses every session it has; on again needs a fresh
   * sign-in, since its sessions stay refused. Undefined when it does not
   * exist; unchanged (no audit row) when it already was.
   */
  async setStatus(id: string, status: 'active' | 'off', actor: Actor, now: Date): Promise<AdminLoginRow | undefined> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select(PUBLIC_COLUMNS)
        .from(adminLogins)
        .where(eq(adminLogins.id, id))
        .for('update')
      if (!current) return undefined
      if (current.status === status) return current
      const [row] = await tx
        .update(adminLogins)
        .set({ status, updatedAt: now, ...(status === 'off' ? { sessionsFrom: now } : {}) })
        .where(eq(adminLogins.id, id))
        .returning(PUBLIC_COLUMNS)
      await audit(tx, status === 'off' ? 'admin_login_turned_off' : 'admin_login_turned_on', actor, row!)
      return row
    })
  },

  /**
   * The login's phone (0059). Undefined when it does not exist; unchanged
   * (no audit row) when it already was. The audit row never holds the number.
   */
  async setPhone(id: string, phone: string | null, actor: Actor, now: Date): Promise<AdminLoginRow | undefined> {
    return db.transaction(async (tx) => {
      const [current] = await tx.select(PUBLIC_COLUMNS).from(adminLogins).where(eq(adminLogins.id, id)).for('update')
      if (!current) return undefined
      if (current.phone === phone) return current
      const [row] = await tx
        .update(adminLogins)
        .set({ phone, updatedAt: now })
        .where(eq(adminLogins.id, id))
        .returning(PUBLIC_COLUMNS)
      await audit(tx, 'admin_login_phone_changed', actor, row!, { phoneSet: phone !== null })
      return row
    })
  },

}
