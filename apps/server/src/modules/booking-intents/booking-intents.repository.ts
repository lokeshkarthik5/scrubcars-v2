import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingIntentItems,
  bookingIntents,
  bookingItems,
  bookingRequests,
  bookings,
  discountRedemptions,
  discounts,
  payments,
  type GatewayMode,
} from '../../db/schema.js'
import {
  allocateReceiptNumber,
  checkGarageCanTake,
  countHeldRedemptions,
  findOverlappingVehicleBooking,
  lockDiscount,
  lockVehicle,
  respondByFor,
  type ReceiptNumberAllocation,
} from '../bookings/bookings.repository.js'
import {
  insertCreditDraws,
  lockAndPlanCreditDraw,
} from '../gift-credit/gift-credit.repository.js'
import { paise, rupees } from '../../lib/gift-credit.js'

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
// and which are ours to refund (clash, the garage refusing, discount_exhausted).
//
// 'created' carries the receipt number issued with the booking's payment.
export type ConsumeIntentResult =
  | { kind: 'created'; bookingId: string; receipt: ReceiptNumberAllocation }
  | { kind: 'already'; bookingId: string }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'order_mismatch' }
  | { kind: 'vehicle_clash'; clashingBookingId: string }
  | { kind: 'slot_full' }
  | { kind: 'garage_closed' }
  | { kind: 'garage_paused' }
  | { kind: 'discount_exhausted' }
  // The customer's Detlio credit no longer covers what this checkout was
  // priced with (spent in another checkout, or expired, meanwhile; 0049).
  | { kind: 'credit_exhausted' }
  // The accepted request this checkout confirms is no longer accepted
  // (cancelled, lapsed, or confirmed by another checkout; 0062).
  | { kind: 'request_gone' }
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

  // With the order's Razorpay mode (0032), so the test-data reset can tell
  // test money from real without asking Razorpay.
  setGatewayTxnId(intentId: string, gatewayTxnId: string, gatewayMode: GatewayMode) {
    return db
      .update(bookingIntents)
      .set({ gatewayTxnId, gatewayMode })
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
  markFailed(intentId: string, paymentRef: string | null, failureReason: string) {
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
   * The vehicle-overlap, garage and discount-limit checks are re-run here
   * rather than trusted from intent-creation time: minutes of Razorpay sheet
   * can pass in between, and the intent deliberately holds no claim on any of
   * them while it waits. In particular it holds no bay, so the last one can
   * go to whoever pays first — the garage's check runs under its vendor-day
   * lock so only one of two racing payments gets it.
   */
  consumeIntent(params: {
    intentId: string
    /**
     * The captured Razorpay payment. Null only for a checkout paid wholly
     * with Detlio credit (0049), which has no Razorpay order and is consumed
     * the moment it is made.
     */
    razorpayPaymentId: string | null
    // The order this payment settled. Must match what the intent was created
    // against, or the two are unrelated and nothing should be written.
    razorpayOrderId?: string
    // Set on the customer-facing path; omitted for the webhook, which is
    // authenticated by signature rather than by session.
    userId?: string
    // Fresh handover codes from the service (lib/pickup.ts). Written only if
    // the intent turns out to be a pickup & drop booking; the CHECK in 0037
    // keeps them off every other type.
    handoverCodes: { pickupCode: string; deliveryCode: string }
    /**
     * GARAGE_RESPONSE_MINUTES (0042): the booking is written paid and
     * pending, so the garage's deadline to answer is written with it.
     */
    responseWindowMins: number
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

      // A checkout with a Razorpay part is only ever consumed by its captured
      // payment; one with none (paid wholly with credit) only without one.
      const creditPaise = paise(intent.creditAmount)
      const cashPaise = paise(intent.amount)
      if ((params.razorpayPaymentId === null) !== (cashPaise === 0)) {
        return { kind: 'order_mismatch' }
      }
      // Never a booking that nothing paid for.
      if (params.razorpayPaymentId === null && creditPaise === 0) {
        return { kind: 'order_mismatch' }
      }

      // An accepted request's row first (0062): a new first step in the lock
      // order, before the vehicle, taken only by a checkout that confirms
      // one. Still accepted, or the money goes back.
      let requestYes: { repliedBy: string | null } | null = null
      if (intent.requestId) {
        const [request] = await tx
          .select({ status: bookingRequests.status, repliedBy: bookingRequests.repliedBy })
          .from(bookingRequests)
          .where(eq(bookingRequests.id, intent.requestId))
          .for('update')
          .limit(1)
        if (!request || request.status !== 'accepted') return { kind: 'request_gone' }
        requestYes = { repliedBy: request.repliedBy }
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

      // After the vehicle lock and before the discount lock: the order every
      // booking write takes them in (see bookings.repository.ts).
      const garageRefusal = await checkGarageCanTake(tx, {
        vendorId: intent.vendorId,
        scheduledAt: intent.scheduledAt,
        durationMins: intent.serviceDurationMins,
      })

      if (garageRefusal === 'slot_full') return { kind: 'slot_full' }
      if (garageRefusal === 'closed') return { kind: 'garage_closed' }
      if (garageRefusal === 'paused') return { kind: 'garage_paused' }

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

      // Detlio credit (0049): after the discount lock and before the
      // receipt's, under the customer's credit lock (see the lock order in
      // bookings.repository.ts). The balance is read live: credit is never
      // held by an open checkout, so another checkout may have spent it, or
      // it may have run out, while this one was paying.
      let creditDraws: Array<{ lotId: string; paise: number }> = []
      if (creditPaise > 0) {
        const plan = await lockAndPlanCreditDraw(tx, {
          userId: intent.userId,
          amountPaise: creditPaise,
          now: new Date(),
        })
        if (!plan) return { kind: 'credit_exhausted' }
        creditDraws = plan
      }

      // The lines the customer paid against. Read before the booking is
      // written so the two land in the same transaction — a booking whose
      // items failed to copy would show as an empty order.
      const intentItems = await tx
        .select()
        .from(bookingIntentItems)
        .where(eq(bookingIntentItems.intentId, intent.id))
        .orderBy(asc(bookingIntentItems.sortOrder))

      // The money landed now: the garage's deadline to answer is measured
      // from here (0042). Plain reads, after every lock this write takes.
      const paidAt = new Date()
      // A request the garage said yes to (0062) is booked accepted, as a
      // time the garage suggested is: it already agreed to this exact job
      // and time, so there is nothing left for it to answer.
      const respondBy = requestYes ? null : await respondByFor(tx, {
        vendorId: intent.vendorId,
        from: paidAt,
        scheduledAt: intent.scheduledAt,
        windowMins: params.responseWindowMins,
      })

      const [booking] = await tx
        .insert(bookings)
        .values({
          userId: intent.userId,
          respondBy,
          ...(requestYes && { status: 'confirmed' as const, acceptedAt: paidAt, acceptedBy: requestYes.repliedBy }),
          vendorId: intent.vendorId,
          serviceId: intent.serviceId,
          vehicleId: intent.vehicleId,
          bookingType: intent.bookingType,
          scheduledAt: intent.scheduledAt,
          durationMins: intent.serviceDurationMins,
          subtotalAmount: intent.subtotalAmount,
          travelFee: intent.travelFee,
          // What the booking costs after any promo: the Razorpay part and the
          // credit part together (amount = subtotal − discount still holds).
          amount: rupees(cashPaise + creditPaise),
          discountAmount: intent.discountAmount,
          discountId: intent.discountId,
          discountCode: intent.discountCode,
          discountFundedBy: intent.discountFundedBy,
          paymentMethod: intent.paymentMethod,
          lat: intent.lat,
          lng: intent.lng,
          address: intent.address,
          ...(intent.bookingType === 'pickup' && {
            pickupCode: params.handoverCodes.pickupCode,
            deliveryCode: params.handoverCodes.deliveryCode,
          }),
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
      // `amount` is only what Razorpay took, so every refund rule only ever
      // sends back money Razorpay holds; the credit part is `credit_amount`
      // and goes back as credit (0049). Paid wholly with credit: 0.00 and no
      // gateway ids (the test-data reset then keeps it as real money).
      await tx.insert(payments).values({
        bookingId: booking.id,
        gateway: 'razorpay',
        gatewayTxnId: params.razorpayPaymentId,
        // The mode of the order it was paid through, carried over.
        gatewayMode: intent.gatewayMode,
        amount: intent.amount,
        creditAmount: intent.creditAmount,
        status: 'paid',
        paidAt,
      })

      // The credit spent, one draw per lot, named by this booking (the
      // chain's first, which is how a cancellation finds it to give back).
      await insertCreditDraws(tx, { userId: intent.userId, bookingId: booking.id, draws: creditDraws })

      if (intent.discountId && intent.discountCode) {
        await tx.insert(discountRedemptions).values({
          discountId: intent.discountId,
          bookingId: booking.id,
          userId: intent.userId,
          code: intent.discountCode,
          discountAmount: intent.discountAmount,
        })
      }

      // The request is now this booking (0062), in the same transaction.
      if (intent.requestId) {
        await tx
          .update(bookingRequests)
          .set({ status: 'converted', bookingId: booking.id, closedAt: paidAt, updatedAt: paidAt })
          .where(and(eq(bookingRequests.id, intent.requestId), eq(bookingRequests.status, 'accepted')))
      }

      await tx
        .update(bookingIntents)
        .set({
          status: 'consumed',
          bookingId: booking.id,
          paymentRef: params.razorpayPaymentId,
        })
        .where(eq(bookingIntents.id, intent.id))

      // The receipt number, last: its counter lock is held until this
      // transaction commits and comes after every other lock (see the lock
      // order in bookings.repository.ts). A new booking is its own chain.
      const receipt = await allocateReceiptNumber(tx, booking.id, paidAt)

      return { kind: 'created', bookingId: booking.id, receipt }
    })
  },
}
