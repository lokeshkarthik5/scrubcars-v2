import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  bookingItems,
  bookingNotes,
  bookings,
  guaranteeClaimPhotos,
  guaranteeClaims,
  jobPhotos,
  payments,
  servicePackageItems,
  services,
  users,
  vendors,
} from '../../db/schema.js'
import type { ServiceCategory } from '../../lib/categories.js'
import {
  REDO_MONEY,
  approvedWindowStart,
  limitReached,
  type ClaimDecision,
  type ClaimMove,
  type ClaimStatus,
  type CustomerClaimHistory,
  type GuaranteeIssue,
  type RoutedClaim,
  withdrawnClaim,
} from '../../lib/guarantee.js'
import { getDateKeyFromScheduledAt } from '../../lib/slots.js'
import {
  checkGarageCanTake,
  findOverlappingVehicleBooking,
  lockVehicle,
  readGarageCalendar,
  type GarageRefusal,
} from '../bookings/bookings.repository.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

export type ClaimRecord = typeof guaranteeClaims.$inferSelect
export type ClaimPhotoRecord = typeof guaranteeClaimPhotos.$inferSelect
export type ClaimWithPhotos = ClaimRecord & { photos: ClaimPhotoRecord[] }

/** A booking as a claim needs it: its money, its services and the garage's photo counts. */
export interface ClaimableBookingRow {
  id: string
  userId: string
  vendorId: string
  vendorName: string
  status: string
  bookingType: string
  scheduledAt: Date
  durationMins: number
  completedAt: Date | null
  markedTestAt: Date | null
  guaranteeRedo: boolean
  photosWaivedAt: Date | null
  paymentMethod: string
  vehicleId: string
  lat: number | null
  lng: number | null
  address: string | null
  originalBookingId: string | null
  payment: { status: string; amount: string; creditAmount: string; refundedAmount: string | null } | null
  items: Array<{
    serviceId: string
    name: string
    durationMins: number
    sortOrder: number
    category: ServiceCategory
    pricingType: string | null
    memberCategories: ServiceCategory[]
  }>
  garagePhotos: { before: number; after: number }
}

/** A customer's claim figures, as admin's flags read them. */
export interface AdminCustomerFigures {
  completedBookings: number
  /** Every claim they have made, this one included. */
  claims: number
  approvedRecently: number
  undecided: number
}

/** What the redo write did. */
export type BookRedoResult =
  | { kind: 'booked'; bookingId: string; claim: ClaimRecord }
  | { kind: 'claim_changed' }
  | { kind: 'vehicle_clash' }
  | { kind: 'garage'; refusal: GarageRefusal }

/** What a claim insert did. */
export type InsertClaimResult =
  | { kind: 'created'; claim: ClaimWithPhotos }
  | { kind: 'limit_reached' }
  | { kind: 'already_claimed' }

/** A customer's own guarantee writes queue here, on their own (lock list, AGENTS.md). */
async function lockCustomerClaims(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guarantee:${userId}`})::bigint)`)
}

async function readHistory(
  conn: Conn,
  params: { userId: string; completedAt: Date | null; now: Date }
): Promise<CustomerClaimHistory> {
  const completedAt = (params.completedAt ?? params.now).toISOString()
  const since = approvedWindowStart(params.now).toISOString()
  const [row] = await conn.execute<{
    completed: number
    completed_before: number
    claims: number
    approved_recently: number
    undecided: number
  }>(sql`
    select
      (select count(*)::int from bookings b
        where b.user_id = ${params.userId} and b.status = 'completed'
          and not b.guarantee_redo and b.marked_test_at is null) as completed,
      (select count(*)::int from bookings b
        where b.user_id = ${params.userId} and b.status = 'completed'
          and not b.guarantee_redo and b.marked_test_at is null
          and coalesce(b.completed_at, b.scheduled_at) < ${completedAt}::timestamptz) as completed_before,
      (select count(*)::int from guarantee_claims g where g.user_id = ${params.userId}) as claims,
      (select count(*)::int from guarantee_claims g
        where g.user_id = ${params.userId} and g.approved_at >= ${since}::timestamptz) as approved_recently,
      (select count(*)::int from guarantee_claims g
        where g.user_id = ${params.userId} and g.status in ('waiting_garage', 'needs_detlio')) as undecided
  `)
  return {
    completedBookings: Number(row?.completed ?? 0),
    completedBefore: Number(row?.completed_before ?? 0),
    claimsBefore: Number(row?.claims ?? 0),
    approvedRecently: Number(row?.approved_recently ?? 0),
    undecided: Number(row?.undecided ?? 0),
  }
}

function auditSummary(claim: ClaimRecord, extra: Record<string, unknown>) {
  return { claimId: claim.id, bookingId: claim.bookingId, vendorId: claim.vendorId, ...extra }
}

export const guaranteeRepository = {
  /** One booking with what deciding a claim on it reads. */
  async findClaimableBooking(bookingId: string): Promise<ClaimableBookingRow | null> {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: { vendor: { columns: { businessName: true } }, payment: true },
    })
    if (!booking) return null

    const items = await db
      .select({
        serviceId: bookingItems.serviceId,
        name: bookingItems.name,
        durationMins: bookingItems.durationMins,
        sortOrder: bookingItems.sortOrder,
        category: services.category,
        pricingType: services.pricingType,
      })
      .from(bookingItems)
      .innerJoin(services, eq(services.id, bookingItems.serviceId))
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(asc(bookingItems.sortOrder))

    const packageIds = items.filter((item) => item.category === 'package').map((item) => item.serviceId)
    const members = packageIds.length
      ? await db
          .select({ packageId: servicePackageItems.packageId, category: services.category })
          .from(servicePackageItems)
          .innerJoin(services, eq(services.id, servicePackageItems.serviceId))
          .where(inArray(servicePackageItems.packageId, packageIds))
      : []

    const photoCounts = await db
      .select({ stage: jobPhotos.stage, n: sql<number>`count(*)::int` })
      .from(jobPhotos)
      .where(and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.uploadedByRole, 'garage')))
      .groupBy(jobPhotos.stage)
    const counted = (stage: 'before' | 'after') => Number(photoCounts.find((row) => row.stage === stage)?.n ?? 0)

    return {
      id: booking.id,
      userId: booking.userId,
      vendorId: booking.vendorId,
      vendorName: booking.vendor?.businessName ?? 'The garage',
      status: booking.status,
      bookingType: booking.bookingType,
      scheduledAt: booking.scheduledAt,
      durationMins: booking.durationMins,
      completedAt: booking.completedAt ?? booking.deliveredAt ?? null,
      markedTestAt: booking.markedTestAt,
      guaranteeRedo: booking.guaranteeRedo,
      photosWaivedAt: booking.photosWaivedAt,
      paymentMethod: booking.paymentMethod,
      vehicleId: booking.vehicleId,
      lat: booking.lat,
      lng: booking.lng,
      address: booking.address,
      originalBookingId: booking.originalBookingId,
      payment: booking.payment
        ? {
            status: booking.payment.status,
            amount: booking.payment.amount,
            creditAmount: booking.payment.creditAmount,
            refundedAmount: booking.payment.refundedAmount,
          }
        : null,
      items: items.map((item) => ({
        ...item,
        memberCategories: members.filter((member) => member.packageId === item.serviceId).map((member) => member.category),
      })),
      garagePhotos: { before: counted('before'), after: counted('after') },
    }
  },

  /** The customer's history, read outside any lock (for showing the button). */
  history(userId: string, completedAt: Date | null, now: Date) {
    return readHistory(db, { userId, completedAt, now })
  },

  findClaimByBooking(bookingId: string): Promise<ClaimWithPhotos | undefined> {
    return db.query.guaranteeClaims.findFirst({
      where: eq(guaranteeClaims.bookingId, bookingId),
      with: { photos: { orderBy: [asc(guaranteeClaimPhotos.createdAt)] } },
    })
  },

  findClaimById(id: string): Promise<ClaimWithPhotos | undefined> {
    return db.query.guaranteeClaims.findFirst({
      where: eq(guaranteeClaims.id, id),
      with: { photos: { orderBy: [asc(guaranteeClaimPhotos.createdAt)] } },
    })
  },

  /** What opening hours decide: the garage's calendar over the next two days. */
  readCalendar(vendorId: string, from: Date, until: Date) {
    return readGarageCalendar(db, vendorId, from, until)
  },

  /**
   * Writes a claim once: under the customer's own lock, the history is read
   * again and the limit checked again (two claims sent at once cannot both
   * pass it), and the route decided from it by `route` (pure). One claim per
   * booking is the unique index: a second is 'already_claimed'.
   */
  async insertClaim(params: {
    booking: ClaimableBookingRow
    issues: GuaranteeIssue[]
    otherText: string | null
    photos: Array<{ key: string; url: string }>
    now: Date
    route: (history: CustomerClaimHistory) => RoutedClaim & {
      garageRespondBy: Date | null
      detlioDecideBy: Date | null
      approvedAt: Date | null
      redoBookBy: Date | null
    }
  }): Promise<InsertClaimResult> {
    try {
      return await db.transaction(async (tx): Promise<InsertClaimResult> => {
        await lockCustomerClaims(tx, params.booking.userId)
        const history = await readHistory(tx, {
          userId: params.booking.userId,
          completedAt: params.booking.completedAt,
          now: params.now,
        })
        if (limitReached(history)) return { kind: 'limit_reached' }
        const [existing] = await tx
          .select({ id: guaranteeClaims.id })
          .from(guaranteeClaims)
          .where(eq(guaranteeClaims.bookingId, params.booking.id))
          .limit(1)
        if (existing) return { kind: 'already_claimed' }

        const routed = params.route(history)
        const [claim] = await tx
          .insert(guaranteeClaims)
          .values({
            bookingId: params.booking.id,
            userId: params.booking.userId,
            vendorId: params.booking.vendorId,
            issues: params.issues,
            otherText: params.otherText,
            status: routed.status,
            route: routed.route,
            routeReasons: routed.reasons,
            garageRespondBy: routed.garageRespondBy,
            detlioDecideBy: routed.detlioDecideBy,
            approvedAt: routed.approvedAt,
            redoBookBy: routed.redoBookBy,
            createdAt: params.now,
            updatedAt: params.now,
          })
          .returning()
        const photos = await tx
          .insert(guaranteeClaimPhotos)
          .values(params.photos.map((photo) => ({ claimId: claim.id, storageKey: photo.key, url: photo.url, createdAt: params.now })))
          .returning()
        await tx.insert(bookingNotes).values({
          bookingId: params.booking.id,
          author: 'Detlio',
          body: `Free redo claim made by the customer (${routed.route === 'garage' ? 'with the garage to answer' : routed.route === 'auto' ? 'approved at once: the garage has no before/after photos' : 'with Detlio to decide'}).`,
        })
        return { kind: 'created', claim: { ...claim, photos } }
      })
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') return { kind: 'already_claimed' }
      throw error
    }
  },

  /**
   * The customer withdraws their claim (0066): conditional on it being
   * theirs and still unanswered (no garage response, no decision, waiting
   * for the garage inside its time or with Detlio), in the same statement,
   * with a booking note. Null when any of that changed.
   */
  async withdraw(params: { claimId: string; userId: string; now: Date }): Promise<ClaimWithPhotos | null> {
    const updated = await db.transaction(async (tx) => {
      const [claim] = await tx
        .update(guaranteeClaims)
        .set({ ...withdrawnClaim(params.now), updatedAt: params.now })
        .where(
          and(
            eq(guaranteeClaims.id, params.claimId),
            eq(guaranteeClaims.userId, params.userId),
            isNull(guaranteeClaims.garageResponse),
            isNull(guaranteeClaims.decision),
            or(
              and(
                eq(guaranteeClaims.status, 'waiting_garage'),
                or(isNull(guaranteeClaims.garageRespondBy), gte(guaranteeClaims.garageRespondBy, params.now))
              ),
              eq(guaranteeClaims.status, 'needs_detlio')
            )
          )
        )
        .returning()
      if (!claim) return null
      await tx.insert(bookingNotes).values({
        bookingId: claim.bookingId,
        author: 'Detlio',
        body: 'Free redo claim withdrawn by the customer before anyone answered it.',
      })
      return claim
    })
    if (!updated) return null
    return (await guaranteeRepository.findClaimById(updated.id)) ?? null
  },

  /**
   * The garage's answer, conditional on the claim still waiting for it and
   * belonging to this garage (`vendorId` from resolveTenant).
   */
  async answerAsGarage(params: {
    claimId: string
    vendorId: string
    actorId: string
    response: 'accepted' | 'disputed'
    note: string | null
    set: Partial<typeof guaranteeClaims.$inferInsert>
    now: Date
    /** A dispute must still be inside the garage's time. */
    respondByAfter?: Date
  }): Promise<ClaimRecord | null> {
    return db.transaction(async (tx) => {
      const [claim] = await tx
        .update(guaranteeClaims)
        .set({
          ...params.set,
          garageResponse: params.response,
          garageNote: params.note,
          garageRespondedAt: params.now,
          garageRespondedBy: params.actorId,
          updatedAt: params.now,
        })
        .where(
          and(
            eq(guaranteeClaims.id, params.claimId),
            eq(guaranteeClaims.vendorId, params.vendorId),
            eq(guaranteeClaims.status, 'waiting_garage'),
            params.respondByAfter
              ? sql`${guaranteeClaims.garageRespondBy} >= ${params.respondByAfter.toISOString()}::timestamptz`
              : undefined
          )
        )
        .returning()
      if (!claim) return null
      await tx.insert(bookingNotes).values({
        bookingId: claim.bookingId,
        author: 'Garage',
        body:
          params.response === 'accepted'
            ? 'The garage accepted the free redo claim.'
            : `The garage disputed the free redo claim: ${params.note ?? ''}`.trim(),
      })
      return claim
    })
  },

  /**
   * Detlio's decision, once: the claim row FOR UPDATE, then the conditional
   * update from the states the decision may be made from, the original
   * booking's refund mark for a refund (conditional on it being completed and
   * not yet marked, so a refund is never approved twice), a booking note and
   * the audit row, in one transaction.
   */
  async decide(params: {
    claimId: string
    decision: ClaimDecision
    from: ClaimStatus[]
    set: Partial<typeof guaranteeClaims.$inferInsert>
    actorSub: string
    actorName: string
    note: string
    now: Date
  }): Promise<{ kind: 'decided'; claim: ClaimRecord } | { kind: 'changed' }> {
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(guaranteeClaims)
        .where(eq(guaranteeClaims.id, params.claimId))
        .for('update')
        .limit(1)
      if (!locked || !params.from.includes(locked.status)) return { kind: 'changed' as const }

      const [claim] = await tx
        .update(guaranteeClaims)
        .set({ ...params.set, updatedAt: params.now })
        .where(and(eq(guaranteeClaims.id, params.claimId), inArray(guaranteeClaims.status, params.from)))
        .returning()
      if (!claim) return { kind: 'changed' as const }

      if (params.decision === 'refund') {
        const [marked] = await tx
          .update(bookings)
          .set({ guaranteeRefundAt: params.now })
          .where(
            and(
              eq(bookings.id, claim.bookingId),
              eq(bookings.status, 'completed'),
              eq(bookings.guaranteeRedo, false),
              sql`${bookings.guaranteeRefundAt} is null`
            )
          )
          .returning({ id: bookings.id })
        // Throwing rolls the claim back too: nothing half-decided.
        if (!marked) throw Object.assign(new Error('booking not refundable'), { code: 'GUARANTEE_REFUND_STATE' })
      }

      await tx.insert(bookingNotes).values({ bookingId: claim.bookingId, author: params.actorName, body: params.note })
      await tx.insert(adminAuditLog).values({
        action: 'guarantee_claim_decided',
        actorSub: params.actorSub,
        actorName: params.actorName,
        summary: auditSummary(claim, { decision: params.decision, from: locked.status, to: claim.status }),
        detail: { reason: claim.decisionReason, routeReasons: claim.routeReasons },
      })
      return { kind: 'decided' as const, claim }
    })
  },

  /**
   * Books the free redo: a ₹0 booking at the same garage, through the same
   * locks and checks as any booking write. Lock order: the claim's row FOR
   * UPDATE first (step 0), then the vehicle, then the garage's day (inside
   * checkGarageCanTake); nothing is locked after. Written `confirmed`: the
   * garage agreed to redo it (or Detlio decided, under the garage agreement),
   * so there is nothing for it to accept, and no deadline to answer.
   */
  async bookRedo(params: {
    claimId: string
    userId: string
    scheduledAt: Date
    handoverCodes: { pickupCode: string; deliveryCode: string }
    now: Date
  }): Promise<BookRedoResult> {
    return db.transaction(async (tx): Promise<BookRedoResult> => {
      const [claim] = await tx
        .select()
        .from(guaranteeClaims)
        .where(and(eq(guaranteeClaims.id, params.claimId), eq(guaranteeClaims.userId, params.userId)))
        .for('update')
        .limit(1)
      if (
        !claim ||
        claim.status !== 'redo_approved' ||
        !claim.redoBookBy ||
        params.now.getTime() > claim.redoBookBy.getTime() ||
        params.scheduledAt.getTime() > claim.redoBookBy.getTime()
      ) {
        return { kind: 'claim_changed' }
      }

      const [original] = await tx.select().from(bookings).where(eq(bookings.id, claim.bookingId)).limit(1)
      if (!original) return { kind: 'claim_changed' }
      const items = await tx
        .select()
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, original.id))
        .orderBy(asc(bookingItems.sortOrder))

      await lockVehicle(tx, original.vehicleId)
      const clash = await findOverlappingVehicleBooking(tx, {
        vehicleId: original.vehicleId,
        scheduledAt: params.scheduledAt,
        durationMins: original.durationMins,
      })
      if (clash) return { kind: 'vehicle_clash' }

      const refusal = await checkGarageCanTake(tx, {
        vendorId: original.vendorId,
        scheduledAt: params.scheduledAt,
        durationMins: original.durationMins,
      })
      if (refusal) return { kind: 'garage', refusal }

      const [redo] = await tx
        .insert(bookings)
        .values({
          userId: original.userId,
          vendorId: original.vendorId,
          serviceId: original.serviceId,
          vehicleId: original.vehicleId,
          bookingType: original.bookingType,
          scheduledAt: params.scheduledAt,
          durationMins: original.durationMins,
          status: 'confirmed',
          acceptedAt: params.now,
          amount: REDO_MONEY.amount,
          subtotalAmount: REDO_MONEY.subtotalAmount,
          discountAmount: REDO_MONEY.discountAmount,
          paymentMethod: 'online',
          lat: original.lat,
          lng: original.lng,
          address: original.address,
          guaranteeRedo: true,
          ...(original.bookingType === 'pickup' && {
            pickupCode: params.handoverCodes.pickupCode,
            deliveryCode: params.handoverCodes.deliveryCode,
          }),
        })
        .returning({ id: bookings.id })

      await tx.insert(bookingItems).values(
        items.map((item) => ({
          bookingId: redo.id,
          serviceId: item.serviceId,
          name: item.name,
          // Free: the lines keep their names and lengths, at ₹0, so the
          // subtotal still adds up.
          amount: '0.00',
          durationMins: item.durationMins,
          sortOrder: item.sortOrder,
        }))
      )

      // Paid, at ₹0, so it holds the garage's room like any paid booking
      // (holdsCapacity). No Razorpay ids, no credit, no receipt number.
      await tx.insert(payments).values({
        bookingId: redo.id,
        gateway: 'razorpay',
        gatewayTxnId: null,
        amount: REDO_MONEY.payment.amount,
        creditAmount: REDO_MONEY.payment.creditAmount,
        status: REDO_MONEY.payment.status,
        paidAt: params.now,
      })

      const [updated] = await tx
        .update(guaranteeClaims)
        .set({ status: 'redo_booked', redoBookingId: redo.id, updatedAt: params.now })
        .where(and(eq(guaranteeClaims.id, claim.id), eq(guaranteeClaims.status, 'redo_approved')))
        .returning()

      await tx.insert(bookingNotes).values([
        { bookingId: redo.id, author: 'Detlio', body: `Free redo (Detlio Guarantee) of booking #${original.id.slice(0, 8).toUpperCase()}. ₹0: nothing to collect.` },
        { bookingId: original.id, author: 'Detlio', body: `Free redo booked for ${getDateKeyFromScheduledAt(params.scheduledAt)}: booking #${redo.id.slice(0, 8).toUpperCase()}.` },
      ])

      return { kind: 'booked', bookingId: redo.id, claim: updated }
    })
  },

  /** The redo booking's state, for the reconcile. */
  async findRedoState(bookingId: string) {
    const [row] = await db
      .select({
        status: bookings.status,
        noShow: bookings.noShow,
        cancelledBy: bookings.cancelledBy,
        cancelledOnBehalfOf: bookings.cancelledOnBehalfOf,
        scheduledAt: bookings.scheduledAt,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
    return row ?? null
  },

  /** The claim a redo booking answers. */
  async findClaimIdByRedo(bookingId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: guaranteeClaims.id })
      .from(guaranteeClaims)
      .where(eq(guaranteeClaims.redoBookingId, bookingId))
      .limit(1)
    return row?.id ?? null
  },

  /**
   * A move the claim makes on its own (lib/guarantee.ts nextClaimMove),
   * conditional on the status it was read in, with a booking note.
   */
  async applyMove(claim: ClaimRecord, move: ClaimMove, now: Date): Promise<ClaimRecord | null> {
    return db.transaction(async (tx) => {
      const closing = move.closeReason !== undefined
      const [updated] = await tx
        .update(guaranteeClaims)
        .set({
          status: move.status,
          updatedAt: now,
          ...(closing && { closedAt: now, closeReason: move.closeReason }),
          ...(move.detlioDecideBy && { detlioDecideBy: move.detlioDecideBy }),
          ...(move.clearRedo && { redoBookingId: null }),
          ...(move.garageResponse && { garageResponse: move.garageResponse, garageRespondedAt: now }),
          ...(move.approvedAt && { approvedAt: move.approvedAt }),
          ...(move.redoBookBy && { redoBookBy: move.redoBookBy }),
        })
        .where(and(eq(guaranteeClaims.id, claim.id), eq(guaranteeClaims.status, claim.status)))
        .returning()
      if (!updated) return null
      const words: Record<string, string> = {
        redo_approved: move.garageResponse === 'timed_out'
          ? "The garage did not answer the free redo claim in time, so it is approved."
          : 'The free redo was cancelled by the customer; they can pick another time.',
        redo_done: 'The free redo was completed. Claim closed.',
        lapsed: move.closeReason === 'redo_no_show'
          ? 'The customer missed the free redo. Claim closed, nothing more owed.'
          : 'No free redo was booked in time. Claim closed.',
        needs_detlio: "The free redo didn't happen on the garage's side. Detlio decides again.",
      }
      const body = words[move.status]
      if (body) await tx.insert(bookingNotes).values({ bookingId: claim.bookingId, author: 'Detlio', body })
      return updated
    })
  },

  /** Claims the cron may move: the garage's time, the redo window, a redo booked. */
  listToSweep(now: Date, limit: number): Promise<ClaimRecord[]> {
    return db
      .select()
      .from(guaranteeClaims)
      .where(
        sql`(${guaranteeClaims.status} = 'waiting_garage' and ${guaranteeClaims.garageRespondBy} < ${now.toISOString()}::timestamptz)
          or (${guaranteeClaims.status} = 'redo_approved' and ${guaranteeClaims.redoBookBy} < ${now.toISOString()}::timestamptz)
          or (${guaranteeClaims.status} = 'redo_booked' and (
                ${guaranteeClaims.redoBookingId} is null
                or exists (select 1 from bookings rb where rb.id = ${guaranteeClaims.redoBookingId} and rb.status in ('completed', 'cancelled'))))`
      )
      .orderBy(asc(guaranteeClaims.updatedAt))
      .limit(limit)
  },

  // ─── Lists ────────────────────────────────────────────────────────────────

  /** The customer's claims of the last 30 days, for Updates (the window is the caller's). */
  async listCustomerClaimsSince(userId: string, since: Date) {
    return db
      .select({
        id: guaranteeClaims.id,
        bookingId: guaranteeClaims.bookingId,
        vendorId: guaranteeClaims.vendorId,
        vendorName: vendors.businessName,
        status: guaranteeClaims.status,
        route: guaranteeClaims.route,
        decision: guaranteeClaims.decision,
        garageRespondBy: guaranteeClaims.garageRespondBy,
        approvedAt: guaranteeClaims.approvedAt,
        decidedAt: guaranteeClaims.decidedAt,
        closedAt: guaranteeClaims.closedAt,
        closeReason: guaranteeClaims.closeReason,
        createdAt: guaranteeClaims.createdAt,
        refundAmount: sql<string | null>`(select (p.amount + p.credit_amount)::text from payments p where p.booking_id = ${guaranteeClaims.bookingId})`,
      })
      .from(guaranteeClaims)
      .innerJoin(vendors, eq(vendors.id, guaranteeClaims.vendorId))
      .where(and(eq(guaranteeClaims.userId, userId), sql`${guaranteeClaims.updatedAt} >= ${since.toISOString()}::timestamptz`))
      .orderBy(desc(guaranteeClaims.createdAt))
      .limit(20)
  },

  /** A garage's claims, with the photos on each side, newest first. */
  async listGarageClaims(vendorId: string, scope: 'open' | 'closed', limit = 50) {
    const closed: ClaimStatus[] = ['redo_done', 'refund_approved', 'rejected', 'lapsed']
    return db.query.guaranteeClaims.findMany({
      where: and(
        eq(guaranteeClaims.vendorId, vendorId),
        scope === 'closed' ? inArray(guaranteeClaims.status, closed) : sql`${guaranteeClaims.status} not in ('redo_done', 'refund_approved', 'rejected', 'lapsed')`
      ),
      with: { photos: { orderBy: [asc(guaranteeClaimPhotos.createdAt)] } },
      orderBy: [desc(guaranteeClaims.createdAt)],
      limit,
    })
  },

  /** For each claim's booking: its services, slot, completion and the garage's before/after photos. */
  async bookingsForClaims(bookingIds: string[]) {
    if (bookingIds.length === 0) return []
    return db.query.bookings.findMany({
      where: inArray(bookings.id, bookingIds),
      columns: {
        id: true,
        userId: true,
        vendorId: true,
        bookingType: true,
        scheduledAt: true,
        completedAt: true,
        deliveredAt: true,
        photosWaivedAt: true,
        guaranteeRefundAt: true,
        markedTestAt: true,
      },
      with: {
        items: { columns: { name: true }, orderBy: [asc(bookingItems.sortOrder)] },
        photos: { orderBy: [asc(jobPhotos.createdAt), asc(jobPhotos.id)] },
        vendor: { columns: { businessName: true } },
        user: { columns: { name: true, phone: true } },
        vehicle: { columns: { make: true, model: true } },
        payment: { columns: { amount: true, creditAmount: true, refundedAmount: true, status: true } },
      },
    })
  },

  /** The redo bookings' times, for the claim views. */
  async redoTimes(bookingIds: string[]): Promise<Map<string, { scheduledAt: Date; status: string }>> {
    if (bookingIds.length === 0) return new Map()
    const rows = await db
      .select({ id: bookings.id, scheduledAt: bookings.scheduledAt, status: bookings.status })
      .from(bookings)
      .where(inArray(bookings.id, bookingIds))
    return new Map(rows.map((row) => [row.id, { scheduledAt: row.scheduledAt, status: row.status }]))
  },

  /** Admin's tabs: claims in these statuses, overdue-first ordering is the service's. */
  async listAdminClaims(statuses: readonly ClaimStatus[], limit = 200) {
    return db
      .select({
        claim: guaranteeClaims,
        garageName: vendors.businessName,
        customerName: users.name,
        customerPhone: users.phone,
      })
      .from(guaranteeClaims)
      .innerJoin(vendors, eq(vendors.id, guaranteeClaims.vendorId))
      .innerJoin(users, eq(users.id, guaranteeClaims.userId))
      .where(inArray(guaranteeClaims.status, [...statuses]))
      .orderBy(desc(guaranteeClaims.createdAt))
      .limit(limit)
  },

  /** Counts per admin tab, for the chips. */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db
      .select({ status: guaranteeClaims.status, n: sql<number>`count(*)::int` })
      .from(guaranteeClaims)
      .groupBy(guaranteeClaims.status)
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]))
  },

  /** Each customer's figures in one read, for admin's flags: never shown to the customer. */
  async historiesFor(userIds: string[], now: Date): Promise<Map<string, AdminCustomerFigures>> {
    if (userIds.length === 0) return new Map()
    const since = approvedWindowStart(now).toISOString()
    const ids = sql.join([...new Set(userIds)].map((id) => sql`${id}::uuid`), sql`, `)
    const rows = await db.execute<{
      user_id: string
      completed: number
      claims: number
      approved_recently: number
      undecided: number
    }>(sql`
      select u.id as user_id,
             (select count(*)::int from bookings b
               where b.user_id = u.id and b.status = 'completed'
                 and not b.guarantee_redo and b.marked_test_at is null) as completed,
             (select count(*)::int from guarantee_claims g where g.user_id = u.id) as claims,
             (select count(*)::int from guarantee_claims g
               where g.user_id = u.id and g.approved_at >= ${since}::timestamptz) as approved_recently,
             (select count(*)::int from guarantee_claims g
               where g.user_id = u.id and g.status in ('waiting_garage', 'needs_detlio')) as undecided
        from users u
       where u.id in (${ids})
    `)
    return new Map(
      rows.map((row) => [
        row.user_id,
        {
          completedBookings: Number(row.completed),
          claims: Number(row.claims),
          approvedRecently: Number(row.approved_recently),
          undecided: Number(row.undecided),
        },
      ])
    )
  },

  /** A customer's other claims, newest first, for the admin detail. */
  async listClaimsOfCustomer(userId: string, limit = 20) {
    return db
      .select({
        id: guaranteeClaims.id,
        bookingId: guaranteeClaims.bookingId,
        status: guaranteeClaims.status,
        createdAt: guaranteeClaims.createdAt,
        approvedAt: guaranteeClaims.approvedAt,
        garageName: vendors.businessName,
      })
      .from(guaranteeClaims)
      .innerJoin(vendors, eq(vendors.id, guaranteeClaims.vendorId))
      .where(eq(guaranteeClaims.userId, userId))
      .orderBy(desc(guaranteeClaims.createdAt))
      .limit(limit)
  },

  /** Approved claims per garage since `since`: the admin garage card's "N redo claims in 90 days". */
  async approvedCountsByVendor(since: Date): Promise<Map<string, number>> {
    const rows = await db
      .select({ vendorId: guaranteeClaims.vendorId, n: sql<number>`count(*)::int` })
      .from(guaranteeClaims)
      .innerJoin(bookings, eq(bookings.id, guaranteeClaims.bookingId))
      .where(
        and(
          isNotNull(guaranteeClaims.approvedAt),
          sql`${guaranteeClaims.approvedAt} >= ${since.toISOString()}::timestamptz`,
          sql`${bookings.markedTestAt} is null`
        )
      )
      .groupBy(guaranteeClaims.vendorId)
    return new Map(rows.map((row) => [row.vendorId, Number(row.n)]))
  },

}
