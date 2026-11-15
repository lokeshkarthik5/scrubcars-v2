import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, adminSettings, bookings, pickupFeeChanges, users, vendors } from '../../db/schema.js'
import { feeColumns, feeSnapshot, FREE_PICKUP_FEE, type GaragePickupFee } from '../../lib/pickup-fee.js'

export const PICKUP_FEE_SETTING_KEY = 'pickup_fee' as const

export type PickupFeeChangeRecord = typeof pickupFeeChanges.$inferSelect

/** The garage columns the fee screens read. */
const GARAGE_COLUMNS = {
  id: vendors.id,
  businessName: vendors.businessName,
  ownerId: vendors.ownerId,
  phone: vendors.phone,
  pickup: vendors.pickup,
  pickupRadiusKm: vendors.pickupRadiusKm,
  pickupTermsAcceptedAt: vendors.pickupTermsAcceptedAt,
  deletedAt: vendors.deletedAt,
  pickupFeeMode: vendors.pickupFeeMode,
  pickupFeeFixed: vendors.pickupFeeFixed,
  pickupFeeFreeKm: vendors.pickupFeeFreeKm,
  pickupFeePerKm: vendors.pickupFeePerKm,
  pickupFeeMin: vendors.pickupFeeMin,
  pickupFeeMax: vendors.pickupFeeMax,
  pickupFeeWaitingSince: vendors.pickupFeeWaitingSince,
  pickupFeeLockedAt: vendors.pickupFeeLockedAt,
  pickupFeeLockedBy: vendors.pickupFeeLockedBy,
  pickupFeeChangedAt: vendors.pickupFeeChangedAt,
}

async function selectGarage(vendorId: string) {
  const [row] = await db.select(GARAGE_COLUMNS).from(vendors).where(eq(vendors.id, vendorId))
  return row ?? null
}

export type GarageFeeRow = NonNullable<Awaited<ReturnType<typeof selectGarage>>>

export interface FeeActor {
  kind: 'garage' | 'detlio'
  userId: string | null
  name: string
}

export const pickupFeesRepository = {
  /** The stored settings (admin_settings 'pickup_fee'); null before admin saves any. */
  async readSettings(): Promise<unknown | null> {
    const [row] = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, PICKUP_FEE_SETTING_KEY))
    return row?.value ?? null
  },

  /** Saves the settings, with who, and an audit row with before and after. */
  async saveSettings(value: Record<string, unknown>, actor: { sub: string; name: string }): Promise<void> {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ value: adminSettings.value })
        .from(adminSettings)
        .where(eq(adminSettings.key, PICKUP_FEE_SETTING_KEY))
        .for('update')
      await tx
        .insert(adminSettings)
        .values({ key: PICKUP_FEE_SETTING_KEY, value, updatedByName: actor.name })
        .onConflictDoUpdate({
          target: adminSettings.key,
          set: { value, updatedByName: actor.name, updatedAt: sql`now()` },
        })
      await tx.insert(adminAuditLog).values({
        action: 'pickup_fee_settings_changed',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { setting: PICKUP_FEE_SETTING_KEY },
        detail: { before: before?.value ?? null, after: value },
      })
    })
  },

  findGarage(vendorId: string): Promise<GarageFeeRow | null> {
    return selectGarage(vendorId)
  },

  /** A seat's name and phone, for "Velan Car Care (owner)". */
  async findPerson(userId: string) {
    const [row] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, userId))
    return row ?? null
  },

  /** The garage's changes, newest first. */
  listChanges(vendorId: string, limit = 20) {
    return db
      .select()
      .from(pickupFeeChanges)
      .where(eq(pickupFeeChanges.vendorId, vendorId))
      .orderBy(desc(pickupFeeChanges.createdAt))
      .limit(limit)
  },

  /** The latest of Detlio's decisions on this garage's fee, for its screen. */
  async latestDecision(vendorId: string) {
    const [row] = await db
      .select()
      .from(pickupFeeChanges)
      .where(and(eq(pickupFeeChanges.vendorId, vendorId), inArray(pickupFeeChanges.status, ['approved', 'kept'])))
      .orderBy(desc(pickupFeeChanges.decidedAt))
      .limit(1)
    return row ?? null
  },

  /** The garage's waiting change, if any. */
  async waitingChange(vendorId: string) {
    const [row] = await db
      .select()
      .from(pickupFeeChanges)
      .where(and(eq(pickupFeeChanges.vendorId, vendorId), eq(pickupFeeChanges.status, 'waiting')))
    return row ?? null
  },

  /**
   * The garage's own change, under its row lock and only if its last change
   * is still the one the service planned on (a second phone saving at the
   * same time gets null). A waiting change before it is replaced.
   */
  async writeGarageChange(input: {
    vendorId: string
    fee: GaragePickupFee
    before: GaragePickupFee
    status: 'live' | 'waiting'
    expectedChangedAt: Date | null
    actor: FeeActor
    now: Date
  }): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ changedAt: vendors.pickupFeeChangedAt, lockedAt: vendors.pickupFeeLockedAt })
        .from(vendors)
        .where(eq(vendors.id, input.vendorId))
        .for('update')
      if (!locked || locked.lockedAt) return false
      if ((locked.changedAt?.getTime() ?? null) !== (input.expectedChangedAt?.getTime() ?? null)) return false
      await tx
        .update(pickupFeeChanges)
        .set({ status: 'replaced' })
        .where(and(eq(pickupFeeChanges.vendorId, input.vendorId), eq(pickupFeeChanges.status, 'waiting')))
      await tx
        .update(vendors)
        .set({
          ...feeColumns(input.fee),
          pickupFeeWaitingSince: input.status === 'waiting' ? input.now : null,
          pickupFeeChangedAt: input.now,
        })
        .where(eq(vendors.id, input.vendorId))
      await tx.insert(pickupFeeChanges).values({
        vendorId: input.vendorId,
        kind: 'fee',
        byKind: input.actor.kind,
        byUserId: input.actor.userId,
        byName: input.actor.name.slice(0, 120),
        before: feeSnapshot(input.before),
        after: feeSnapshot(input.fee),
        status: input.status,
        createdAt: input.now,
      })
      return true
    })
  },

  /**
   * Detlio sets or overrides the garage's fee: live at once, no check, and
   * not the garage's change (its 7 days are untouched). A waiting change is
   * replaced by it.
   */
  async writeAdminFee(input: { vendorId: string; fee: GaragePickupFee; before: GaragePickupFee; actor: FeeActor; now: Date }) {
    await db.transaction(async (tx) => {
      await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, input.vendorId)).for('update')
      await tx
        .update(pickupFeeChanges)
        .set({ status: 'replaced' })
        .where(and(eq(pickupFeeChanges.vendorId, input.vendorId), eq(pickupFeeChanges.status, 'waiting')))
      await tx
        .update(vendors)
        .set({ ...feeColumns(input.fee), pickupFeeWaitingSince: null })
        .where(eq(vendors.id, input.vendorId))
      await tx.insert(pickupFeeChanges).values({
        vendorId: input.vendorId,
        kind: 'fee',
        byKind: 'detlio',
        byUserId: null,
        byName: input.actor.name.slice(0, 120),
        before: feeSnapshot(input.before),
        after: feeSnapshot(input.fee),
        status: 'live',
        createdAt: input.now,
      })
    })
  },

  /** "Lock to Detlio's fee", or unlock, with a log row. False when it already was. */
  async setLock(input: { vendorId: string; locked: boolean; fee: GaragePickupFee; actor: FeeActor; now: Date }): Promise<boolean> {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(vendors)
        .set(
          input.locked
            ? { pickupFeeLockedAt: input.now, pickupFeeLockedBy: input.actor.name.slice(0, 100) }
            : { pickupFeeLockedAt: null, pickupFeeLockedBy: null }
        )
        .where(
          and(
            eq(vendors.id, input.vendorId),
            input.locked ? isNull(vendors.pickupFeeLockedAt) : sql`${vendors.pickupFeeLockedAt} is not null`
          )
        )
        .returning({ id: vendors.id })
      if (updated.length === 0) return false
      await tx.insert(pickupFeeChanges).values({
        vendorId: input.vendorId,
        kind: input.locked ? 'locked' : 'unlocked',
        byKind: 'detlio',
        byUserId: null,
        byName: input.actor.name.slice(0, 120),
        before: feeSnapshot(input.fee),
        after: feeSnapshot(input.fee),
        status: 'live',
        createdAt: input.now,
      })
      return true
    })
  },

  /**
   * Approve a waiting fee, or keep Detlio's (the garage's fee becomes
   * Detlio's By distance, with a log row, and the reason is kept for the
   * garage). Conditional on the change still waiting: null otherwise.
   */
  async decide(input: {
    changeId: string
    decision: 'approved' | 'kept'
    reason: string | null
    actorName: string
    now: Date
  }): Promise<PickupFeeChangeRecord | null> {
    return db.transaction(async (tx) => {
      const [change] = await tx
        .select()
        .from(pickupFeeChanges)
        .where(and(eq(pickupFeeChanges.id, input.changeId), eq(pickupFeeChanges.status, 'waiting')))
        .for('update')
      if (!change) return null
      await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, change.vendorId)).for('update')
      const [decided] = await tx
        .update(pickupFeeChanges)
        .set({
          status: input.decision,
          decidedAt: input.now,
          decidedBy: input.actorName.slice(0, 100),
          decisionReason: input.reason,
        })
        .where(eq(pickupFeeChanges.id, change.id))
        .returning()
      if (input.decision === 'approved') {
        await tx.update(vendors).set({ pickupFeeWaitingSince: null }).where(eq(vendors.id, change.vendorId))
      } else {
        const detlio: GaragePickupFee = { ...FREE_PICKUP_FEE, mode: 'distance' }
        await tx
          .update(vendors)
          .set({ ...feeColumns(detlio), pickupFeeWaitingSince: null })
          .where(eq(vendors.id, change.vendorId))
        await tx.insert(pickupFeeChanges).values({
          vendorId: change.vendorId,
          kind: 'fee',
          byKind: 'detlio',
          byUserId: null,
          byName: input.actorName.slice(0, 120),
          before: change.after,
          after: feeSnapshot(detlio),
          status: 'live',
          createdAt: input.now,
        })
      }
      return decided ?? null
    })
  },

  /** Issues → Pickup fees: one status's changes, newest first, with the garage and who asked. */
  listForCheck(status: 'waiting' | 'approved' | 'kept', limit = 200) {
    return db
      .select({
        change: pickupFeeChanges,
        garageName: vendors.businessName,
        garageOwnerId: vendors.ownerId,
        askedByPhone: users.phone,
      })
      .from(pickupFeeChanges)
      .innerJoin(vendors, eq(vendors.id, pickupFeeChanges.vendorId))
      .leftJoin(users, eq(users.id, pickupFeeChanges.byUserId))
      .where(eq(pickupFeeChanges.status, status))
      .orderBy(desc(pickupFeeChanges.createdAt))
      .limit(limit)
  },

  async countByStatus(): Promise<Record<'waiting' | 'approved' | 'kept', number>> {
    const rows = await db
      .select({ status: pickupFeeChanges.status, count: sql<number>`count(*)::int` })
      .from(pickupFeeChanges)
      .where(inArray(pickupFeeChanges.status, ['waiting', 'approved', 'kept']))
      .groupBy(pickupFeeChanges.status)
    const counts = { waiting: 0, approved: 0, kept: 0 }
    for (const row of rows) counts[row.status as keyof typeof counts] = Number(row.count)
    return counts
  },

  /** Pickup bookings each garage was booked for in the last 30 days (Test-marked left out). */
  async pickupsSince(vendorIds: string[], since: Date): Promise<Map<string, number>> {
    if (vendorIds.length === 0) return new Map()
    const rows = await db
      .select({ vendorId: bookings.vendorId, count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          inArray(bookings.vendorId, vendorIds),
          eq(bookings.bookingType, 'pickup'),
          gte(bookings.createdAt, since),
          isNull(bookings.markedTestAt),
          isNull(bookings.rescheduledFromId)
        )
      )
      .groupBy(bookings.vendorId)
    return new Map(rows.map((row) => [row.vendorId, Number(row.count)]))
  },
}
