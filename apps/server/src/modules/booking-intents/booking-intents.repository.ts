import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingIntentItems,
  bookingIntents,
  bookingItems,
  bookings,
  discountRedemptions,
  discounts,
  payments,
} from '../../db/schema.js'
import {
  countHeldRedemptions,
  findOverlappingVehicleBooking,
  lockDiscount,
  lockVehicle,
} from '../bookings/bookings.repository.js'

export type BookingIntentRecord = typeof bookingIntents.$inferSelect
type BookingIntentInsert = typeof bookingIntents.$inferInsert

// The lines an intent was priced from, in the customer's order. Copied
// verbatim into booking_items when the payment lands.
export interface BookingIntentItemInput {
  serviceId: string
  name: string
  amount: string
  durationMins: number
}

// What `consumeIntent` did. Everything except 'created' and 'already' means no
// booking exists for money that may already have been captured, so the service
// layer decides which of those are the customer's problem (expired, not found)
// and which are ours to refund (clash, discount_exhausted).
export type ConsumeIntentResult =
  | { kind: 'created'; bookingId: string }
  | { kind: 'already'; bookingId: string }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'order_mismatch' }
  | { kind: 'vehicle_clash'; clashingBookingId: string }
  | { kind: 'discount_exhausted' }
  | { kind: 'previously_failed'; failureReason: string | null }

export const bookingIntentsRepository = {
  /**
   * One intent and its lines, in a transaction. An intent without its items
   * would price a booking nobody could reconstruct — and `consumeIntent`
   * builds the booking's lines from exactly these rows.
   */
  createIntent(data: BookingIntentInsert, items: BookingIntentItemInput[]) {
    return db.transaction(async (tx) => {
      const [intent] = await tx.insert(bookingIntents).values(data).returning()

      await tx.insert(bookingIntentItems).values(
        items.map((item, index) => ({
          intentId: intent.id,
          serviceId: item.serviceId,
          name: item.name,
          amount: item.amount,
          durationMins: item.durationMins,
          sortOrder: index,
        }))
      )

      return [intent]
    })
  },

  setGatewayTxnId(intentId: string, gatewayTxnId: string) {
    return db
      .update(bookingIntents)
      .set({ gatewayTxnId })
      .where(eq(bookingIntents.id, intentId))
      .returning()
  },

  findById(id: string) {
    return db.query.bookingIntents.findFirst({
      where: eq(bookingIntents.id, id),
    })
  },

  findByGatewayTxnId(gatewayTxnId: string) {
    return db.query.bookingIntents.findFirst({
      where: eq(bookingIntents.gatewayTxnId, gatewayTxnId),
    })
  },

  /**
   * Records a captured payment that produced no booking. Only a still-pending
   * intent is written: when the browser callback and the webhook both fail
   * the same intent, the second write matches nothing and returns no row, so
   * the refund is flagged once.
   */
  markFailed(intentId: string, paymentRef: string, failureReason: string) {
    return db
      .update(bookingIntents)
      .set({ status: 'failed', paymentRef, failureReason })
      .where(and(eq(bookingIntents.id, intentId), eq(bookingIntents.status, 'pending')))
      .returning()
  },

  /**
   * Turn a paid intent into a booking, once.
   *
   * The whole point of the intent flow lives here: the booking, its *paid*
   * payment and any discount redemption are written in one transaction, so a
   * customer who abandons checkout leaves none of them behind.
   *
   * Idempotent by construction. Both the client callback and the Razorpay
   * webhook confirm the same intent — whichever arrives second sees
   * `status: 'consumed'` under the row lock and gets the booking the first one
   * created, rather than a duplicate. That row lock is taken before anything
   * else, so the two can never interleave.
   *
   * The vehicle-overlap and discount-limit checks are re-run here rather than
   * trusted from intent-creation time: minutes of Razorpay sheet can pass in
   * between, and the intent deliberately holds no claim on either while it
   * waits.
   */
  consumeIntent(params: {
    intentId: string
    razorpayPaymentId: string
    // The order this payment settled. Must match what the intent was created
    // against, or the two are unrelated and nothing should be written.
    razorpayOrderId?: string
    // Set on the customer-facing path; omitted for the webhook, which is
    // authenticated by signature rather than by session.
    userId?: string
  }): Promise<ConsumeIntentResult> {
    return db.transaction(async (tx): Promise<ConsumeIntentResult> => {
      const [intent] = await tx
        .select()
        .from(bookingIntents)
        .where(eq(bookingIntents.id, params.intentId))
        .for('update')
        .limit(1)

      if (!intent) return { kind: 'not_found' }
      if (params.userId && intent.userId !== params.userId) {
        return { kind: 'not_found' }
      }

      if (intent.status === 'consumed' && intent.bookingId) {
        return { kind: 'already', bookingId: intent.bookingId }
      }

      if (intent.status === 'failed') {
        return { kind: 'previously_failed', failureReason: intent.failureReason }
      }

      if (
        params.razorpayOrderId &&
        intent.gatewayTxnId &&
        intent.gatewayTxnId !== params.razorpayOrderId
      ) {
        return { kind: 'order_mismatch' }
      }

      if (intent.expiresAt.getTime() <= Date.now()) {
        return { kind: 'expired' }
      }

      await lockVehicle(tx, intent.vehicleId)

      const clash = await findOverlappingVehicleBooking(tx, {
        vehicleId: intent.vehicleId,
        scheduledAt: intent.scheduledAt,
        durationMins: intent.serviceDurationMins,
      })

      if (clash) {
        return { kind: 'vehicle_clash', clashingBookingId: clash.id }
      }

      // Limits are read live rather than snapshotted onto the intent: an admin
      // who tightens a code while a checkout is open means it to bite.
      if (intent.discountId) {
        await lockDiscount(tx, intent.discountId)

        const [discount] = await tx
          .select({
            totalUsageLimit: discounts.totalUsageLimit,
            perUserLimit: discounts.perUserLimit,
          })
          .from(discounts)
          .where(eq(discounts.id, intent.discountId))
          .limit(1)

        if (!discount) return { kind: 'discount_exhausted' }

        if (discount.totalUsageLimit !== null) {
          const used = await countHeldRedemptions(tx, intent.discountId)
          if (used >= discount.totalUsageLimit) {
            return { kind: 'discount_exhausted' }
          }
        }

        if (discount.perUserLimit !== null) {
          const usedByUser = await countHeldRedemptions(
            tx,
            intent.discountId,
            intent.userId
          )
          if (usedByUser >= discount.perUserLimit) {
            return { kind: 'discount_exhausted' }
          }
        }
      }

      // The lines the customer paid against. Read before the booking is
      // written so the two land in the same transaction — a booking whose
      // items failed to copy would show as an empty order.
      const intentItems = await tx
        .select()
        .from(bookingIntentItems)
        .where(eq(bookingIntentItems.intentId, intent.id))
        .orderBy(asc(bookingIntentItems.sortOrder))

      const [booking] = await tx
        .insert(bookings)
        .values({
          userId: intent.userId,
          vendorId: intent.vendorId,
          serviceId: intent.serviceId,
          vehicleId: intent.vehicleId,
          bookingType: intent.bookingType,
          scheduledAt: intent.scheduledAt,
          durationMins: intent.serviceDurationMins,
          subtotalAmount: intent.subtotalAmount,
          amount: intent.amount,
          discountAmount: intent.discountAmount,
          discountId: intent.discountId,
          discountCode: intent.discountCode,
          discountFundedBy: intent.discountFundedBy,
          paymentMethod: intent.paymentMethod,
          lat: intent.lat,
          lng: intent.lng,
          address: intent.address,
        })
        .returning()

      await tx.insert(bookingItems).values(
        intentItems.map((item) => ({
          bookingId: booking.id,
          serviceId: item.serviceId,
          name: item.name,
          amount: item.amount,
          durationMins: item.durationMins,
          sortOrder: item.sortOrder,
        }))
      )

      // `paid` from the outset — this row only exists because the money landed.
      await tx.insert(payments).values({
        bookingId: booking.id,
        gateway: 'razorpay',
        gatewayTxnId: params.razorpayPaymentId,
        amount: intent.amount,
        status: 'paid',
        paidAt: new Date(),
      })

      if (intent.discountId && intent.discountCode) {
        await tx.insert(discountRedemptions).values({
          discountId: intent.discountId,
          bookingId: booking.id,
          userId: intent.userId,
          code: intent.discountCode,
          discountAmount: intent.discountAmount,
        })
      }

      await tx
        .update(bookingIntents)
        .set({
          status: 'consumed',
          bookingId: booking.id,
          paymentRef: params.razorpayPaymentId,
        })
        .where(eq(bookingIntents.id, intent.id))

      return { kind: 'created', bookingId: booking.id }
    })
  },
}
