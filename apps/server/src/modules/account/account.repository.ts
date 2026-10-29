import { and, eq, gt, inArray, isNull, notExists, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  analyticsEvents,
  bookingIntents,
  bookingRequests,
  bookings,
  bypassReports,
  couponCodeAttempts,
  garageRecommendations,
  giftCodeAttempts,
  noticeDismissals,
  offerDismissals,
  pushSubscriptions,
  refreshTokens,
  rewardNudges,
  rewardReferralCodes,
  slotAlerts,
  userAddresses,
  userFavouriteVendors,
  userMemberMapping,
  users,
  userVehicles,
  vehicleCertificateLinks,
  vehicleServiceReminders,
  vendors,
  zoneSignups,
} from '../../db/schema.js'
import { anonymisedUser, anonymisedVehicle } from '../../lib/account-deletion.js'

/** The booking statuses that are still open: to come, or being worked on. */
const OPEN_BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress'] as const

/** Raised inside the transaction when something opened after the checks. */
export class DeletionRaced extends Error {
  constructor() {
    super('account deletion raced a new booking or checkout')
  }
}

export const accountRepository = {
  findUser(userId: string) {
    return db.query.users.findFirst({ where: eq(users.id, userId) })
  },

  async ownsGarage(userId: string): Promise<boolean> {
    const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1)
    return Boolean(row)
  },

  listOpenBookings(userId: string) {
    return db
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.userId, userId), inArray(bookings.status, [...OPEN_BOOKING_STATUSES])))
      .limit(20)
  },

  async hasOpenCheckout(userId: string, now: Date): Promise<boolean> {
    const [row] = await db
      .select({ id: bookingIntents.id })
      .from(bookingIntents)
      .where(and(eq(bookingIntents.userId, userId), eq(bookingIntents.status, 'pending'), gt(bookingIntents.expiresAt, now)))
      .limit(1)
    return Boolean(row)
  },

  /**
   * The deletion, in one transaction (lib/account-deletion.ts says what and
   * why). The users row is locked first and the open bookings and checkouts
   * read again under it: a booking or checkout written since the checks
   * rolls the whole thing back (DeletionRaced). Returns the avatar key to
   * delete from storage after the commit, if any.
   */
  anonymise(input: { userId: string; now: Date; phone: string }): Promise<{ avatarKey: string | null; avatarUrl: string | null } | null> {
    const { userId, now } = input
    return db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, deletedAt: users.deletedAt, avatarStorageKey: users.avatarStorageKey, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, userId))
        .for('update')
        .limit(1)
      if (!user || user.deletedAt) return null

      const [open] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.userId, userId), inArray(bookings.status, [...OPEN_BOOKING_STATUSES])))
        .limit(1)
      const [checkout] = await tx
        .select({ id: bookingIntents.id })
        .from(bookingIntents)
        .where(and(eq(bookingIntents.userId, userId), eq(bookingIntents.status, 'pending'), gt(bookingIntents.expiresAt, now)))
        .limit(1)
      if (open || checkout) throw new DeletionRaced()

      // Every session, on every device: a refresh is refused from now on,
      // and an access token still in a browser lapses within 15 minutes
      // (and is refused by every read that checks the account).
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
      // Seats in garages (a staff login) and any platform role. The owner of
      // a garage never gets here (refused before).
      await tx.delete(userMemberMapping).where(eq(userMemberMapping.userId, userId))

      // Requests to garages (0062) hold their pin; the whole chain is the
      // customer's, so it goes in one statement (its own SET NULLs land on
      // rows going too). Before the addresses, which they name.
      await tx.delete(bookingRequests).where(eq(bookingRequests.userId, userId))
      await tx.delete(userAddresses).where(eq(userAddresses.userId, userId))

      // Cars: kept (blanked) where a booking or checkout names them, else
      // deleted. Reminders and certificate links go either way: a shared
      // certificate link stops working now.
      await tx.delete(vehicleServiceReminders).where(eq(vehicleServiceReminders.userId, userId))
      await tx.delete(vehicleCertificateLinks).where(eq(vehicleCertificateLinks.userId, userId))
      await tx
        .delete(userVehicles)
        .where(
          and(
            eq(userVehicles.userId, userId),
            notExists(tx.select({ one: sql`1` }).from(bookings).where(eq(bookings.vehicleId, userVehicles.id))),
            notExists(tx.select({ one: sql`1` }).from(bookingIntents).where(eq(bookingIntents.vehicleId, userVehicles.id)))
          )
        )
      await tx.update(userVehicles).set(anonymisedVehicle(now)).where(eq(userVehicles.userId, userId))

      // The address copied onto each doorstep or pickup booking: the money
      // record stays, where they live does not.
      await tx.update(bookings).set({ address: null, lat: null, lng: null }).where(eq(bookings.userId, userId))

      await tx.delete(userFavouriteVendors).where(eq(userFavouriteVendors.userId, userId))
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
      await tx.delete(slotAlerts).where(eq(slotAlerts.userId, userId))
      await tx.delete(zoneSignups).where(eq(zoneSignups.userId, userId))
      await tx.delete(noticeDismissals).where(eq(noticeDismissals.userId, userId))
      await tx.delete(offerDismissals).where(eq(offerDismissals.userId, userId))
      await tx.delete(giftCodeAttempts).where(eq(giftCodeAttempts.userId, userId))
      await tx.delete(couponCodeAttempts).where(eq(couponCodeAttempts.userId, userId))
      await tx.delete(rewardReferralCodes).where(eq(rewardReferralCodes.userId, userId))
      await tx.delete(rewardNudges).where(eq(rewardNudges.userId, userId))

      // What a deleted account left unlinked before (their ON DELETE SET
      // NULL): usage events, garages they recommended, bypass reports.
      await tx.update(analyticsEvents).set({ userId: null }).where(eq(analyticsEvents.userId, userId))
      await tx.update(garageRecommendations).set({ userId: null }).where(eq(garageRecommendations.userId, userId))
      await tx.update(bypassReports).set({ userId: null }).where(eq(bypassReports.userId, userId))

      const [done] = await tx
        .update(users)
        .set(anonymisedUser({ now, phone: input.phone }))
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({ id: users.id })
      if (!done) throw new DeletionRaced()

      return { avatarKey: user.avatarStorageKey ?? null, avatarUrl: user.avatarUrl ?? null }
    })
  },
}
