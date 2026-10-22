import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingIntentItems,
  bookingIntents,
  bookingItems,
  bookings,
  discounts,
  internalAccessLog,
  notices,
  serviceImages,
  servicePackageItems,
  services,
  userFavouriteVendors,
  userMemberMapping,
  users,
  vendorClosures,
  vendorDocumentFiles,
  vendorDocuments,
  vendorPayoutAccounts,
  vendorPhotos,
  vendors,
  vendorServiceAreas,
  vendorWorkingHours,
} from '../../db/schema.js'
import { UPCOMING_STATUSES } from '../../lib/vendor-bin.js'
import {
  dataResetReads,
  dataResetWrites,
  type DataResetReads,
  type DataResetWrites,
  type Tx,
} from '../data-reset/data-reset.repository.js'
import { VENDOR_SCOPED_ROLES } from '../members/members.repository.js'
import { vendorNotInBin } from '../vendors/vendors.predicates.js'

type Conn = typeof db | Tx

export type VendorRecord = typeof vendors.$inferSelect

/** A service's photo or video file, as service-media's removeMediaFiles takes it. */
export type GarageMediaFile = Pick<
  typeof serviceImages.$inferSelect,
  'id' | 'kind' | 'url' | 'storageKey' | 'videoUid'
>

/** The garage's own services, packages included. */
const ofGarage = (vendorId: string) =>
  sql`(select ${services.id} from ${services} where ${services.vendorId} = ${vendorId})`

/** Reads, through the plain connection or the transaction. */
function reads(conn: Conn) {
  return {
    async findVendor(id: string): Promise<VendorRecord | undefined> {
      const [row] = await conn.select().from(vendors).where(eq(vendors.id, id)).limit(1)
      return row
    },

    /**
     * The garage's bookings still to happen, soonest first, with what the
     * Bin's dialog says about each: whose, when, how much and whether it
     * was paid. No phone numbers: the dialog names the customer, nothing more.
     */
    listUpcomingBookings(vendorId: string) {
      return conn.query.bookings.findMany({
        where: and(
          eq(bookings.vendorId, vendorId),
          inArray(bookings.status, [...UPCOMING_STATUSES])
        ),
        columns: { id: true, status: true, scheduledAt: true, amount: true },
        with: {
          user: { columns: { name: true } },
          payment: { columns: { status: true } },
        },
        orderBy: [asc(bookings.scheduledAt), asc(bookings.id)],
      })
    },

    /** The ids of the garage's bookings still to happen, inside the Bin's transaction. */
    async listUpcomingBookingIds(vendorId: string): Promise<string[]> {
      const rows = await conn
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(eq(bookings.vendorId, vendorId), inArray(bookings.status, [...UPCOMING_STATUSES]))
        )
        .orderBy(asc(bookings.scheduledAt), asc(bookings.id))
      return rows.map((row) => row.id)
    },

    /**
     * What else goes when the garage is deleted forever, counted for the
     * dialog and the audit: its gallery (and logo), its services' photos and
     * videos, its services and packages, and its team's seats.
     */
    async countAssets(vendorId: string) {
      const [photos] = await conn
        .select({ n: count() })
        .from(vendorPhotos)
        .where(eq(vendorPhotos.vendorId, vendorId))
      const media = await conn
        .select({ kind: serviceImages.kind, n: count() })
        .from(serviceImages)
        .where(sql`${serviceImages.serviceId} in ${ofGarage(vendorId)}`)
        .groupBy(serviceImages.kind)
      const [serviceRows] = await conn
        .select({ n: count() })
        .from(services)
        .where(eq(services.vendorId, vendorId))
      const [seats] = await conn
        .select({ n: count() })
        .from(userMemberMapping)
        .where(eq(userMemberMapping.vendorId, vendorId))
      const [documents] = await conn
        .select({ n: count() })
        .from(vendorDocuments)
        .where(eq(vendorDocuments.vendorId, vendorId))
      return {
        photos: photos?.n ?? 0,
        servicePictures: media.find((row) => row.kind === 'image')?.n ?? 0,
        videos: media.find((row) => row.kind === 'video')?.n ?? 0,
        services: serviceRows?.n ?? 0,
        teamLogins: seats?.n ?? 0,
        // Garage documents (0043): ID and bank proof among them.
        documents: documents?.n ?? 0,
      }
    },

    /**
     * Rows that cascade with the garage row when it is deleted outright, and
     * that no booking chain covers: notices about it, garage-only offers, and
     * support-session access records. Counted into the audit row so their
     * going is on record.
     */
    async countCascadeRows(vendorId: string) {
      const [noticeRows] = await conn
        .select({ n: count() })
        .from(notices)
        .where(eq(notices.vendorId, vendorId))
      const [offerRows] = await conn
        .select({ n: count() })
        .from(discounts)
        .where(eq(discounts.vendorId, vendorId))
      const [accessRows] = await conn
        .select({ n: count() })
        .from(internalAccessLog)
        .where(eq(internalAccessLog.vendorId, vendorId))
      return {
        notices: noticeRows?.n ?? 0,
        offers: offerRows?.n ?? 0,
        supportAccessRecords: accessRows?.n ?? 0,
      }
    },
  }
}

/** The Bin's own statements, inside its transaction. None decides anything. */
function writes(tx: Tx) {
  return {
    /**
     * The garage row, FOR UPDATE: the first lock moving it to the Bin,
     * restoring it or deleting it forever takes, so two of them on one garage
     * run one after the other. Nothing else in the app locks a garage row.
     */
    async lockVendor(id: string): Promise<VendorRecord | undefined> {
      const [row] = await tx.select().from(vendors).where(eq(vendors.id, id)).limit(1).for('update')
      return row
    },

    async setBin(
      id: string,
      bin: { deletedAt: Date | null; deletedByName: string | null; deletedReason: string | null }
    ) {
      const [row] = await tx.update(vendors).set(bin).where(eq(vendors.id, id)).returning()
      return row
    },

    /** Everyone with a seat at the garage, active or suspended. */
    async listSeatHolderIds(vendorId: string): Promise<string[]> {
      const rows = await tx
        .select({ userId: userMemberMapping.userId })
        .from(userMemberMapping)
        .where(eq(userMemberMapping.vendorId, vendorId))
      return rows.map((row) => row.userId)
    },

    /**
     * Seats that open the garage app: active, at a garage not in the Bin.
     * The same rule as membersRepository.countActiveVendorSeats, read through
     * the transaction so it sees the change just made.
     */
    async countActiveSeats(userId: string): Promise<number> {
      const [row] = await tx
        .select({ n: count() })
        .from(userMemberMapping)
        .innerJoin(vendors, eq(vendors.id, userMemberMapping.vendorId))
        .where(
          and(
            eq(userMemberMapping.userId, userId),
            eq(userMemberMapping.status, 'active'),
            inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES]),
            vendorNotInBin()
          )
        )
      return row?.n ?? 0
    },

    async setOwnerFlag(userId: string, value: boolean) {
      await tx.update(users).set({ isVendorOwner: value }).where(eq(users.id, userId))
    },

    /** The garage's gallery photos and logo files, to remove after the commit. */
    async galleryKeys(vendorId: string) {
      return tx
        .select({ url: vendorPhotos.url, storageKey: vendorPhotos.storageKey })
        .from(vendorPhotos)
        .where(eq(vendorPhotos.vendorId, vendorId))
    },

    /**
     * The garage's document files in the private bucket (0043), with each
     * one's type, to remove after the commit: all of them when the garage
     * row goes, all but the signed agreement's on a tombstone.
     */
    async documentFiles(vendorId: string): Promise<Array<{ type: string; storageKey: string }>> {
      return tx
        .select({ type: vendorDocuments.type, storageKey: vendorDocumentFiles.storageKey })
        .from(vendorDocumentFiles)
        .innerJoin(vendorDocuments, eq(vendorDocuments.id, vendorDocumentFiles.documentId))
        .where(eq(vendorDocuments.vendorId, vendorId))
    },

    /** Every photo and video on the garage's services, to remove after the commit. */
    async mediaFiles(vendorId: string): Promise<GarageMediaFile[]> {
      return tx
        .select({
          id: serviceImages.id,
          kind: serviceImages.kind,
          url: serviceImages.url,
          storageKey: serviceImages.storageKey,
          videoUid: serviceImages.videoUid,
        })
        .from(serviceImages)
        .where(sql`${serviceImages.serviceId} in ${ofGarage(vendorId)}`)
    },

    // ── Deleting what is left, in an order the foreign keys allow ──
    //
    // A package's members are ON DELETE RESTRICT while the package side
    // cascades, and a checkout's service is RESTRICT while its garage
    // cascades. Left to the garage row's cascade, Postgres may reach a
    // service before the rows that hold it and refuse with a 500. So the
    // package contents go first, the checkouts went with the plan, then the
    // services nothing still points at, then the garage.

    async deletePackageItems(vendorId: string) {
      await tx
        .delete(servicePackageItems)
        .where(sql`${servicePackageItems.packageId} in ${ofGarage(vendorId)}`)
    },

    async deleteServiceMedia(vendorId: string) {
      await tx.delete(serviceImages).where(sql`${serviceImages.serviceId} in ${ofGarage(vendorId)}`)
    },

    /**
     * The garage's services no kept booking or checkout was for. A kept one
     * still names its services (each FK is RESTRICT), so those stay.
     */
    async deleteUnreferencedServices(vendorId: string): Promise<number> {
      const rows = await tx
        .delete(services)
        .where(
          and(
            eq(services.vendorId, vendorId),
            sql`not exists (select 1 from ${bookingItems} where ${bookingItems.serviceId} = ${services.id})`,
            sql`not exists (select 1 from ${bookings} where ${bookings.serviceId} = ${services.id})`,
            sql`not exists (select 1 from ${bookingIntents} where ${bookingIntents.serviceId} = ${services.id})`,
            sql`not exists (select 1 from ${bookingIntentItems} where ${bookingIntentItems.serviceId} = ${services.id})`
          )
        )
        .returning({ id: services.id })
      return rows.length
    },

    async deactivateServices(vendorId: string) {
      await tx.update(services).set({ isActive: false }).where(eq(services.vendorId, vendorId))
    },

    async deleteGallery(vendorId: string) {
      await tx.delete(vendorPhotos).where(eq(vendorPhotos.vendorId, vendorId))
    },

    async deleteHoursAndReach(vendorId: string) {
      await tx.delete(vendorWorkingHours).where(eq(vendorWorkingHours.vendorId, vendorId))
      await tx.delete(vendorClosures).where(eq(vendorClosures.vendorId, vendorId))
      await tx.delete(vendorServiceAreas).where(eq(vendorServiceAreas.vendorId, vendorId))
    },

    /** Where Detlio paid the garage (0038): bank and UPI details go with a tombstone's contact fields. */
    async deletePayoutAccount(vendorId: string) {
      await tx.delete(vendorPayoutAccounts).where(eq(vendorPayoutAccounts.vendorId, vendorId))
    },

    /**
     * A tombstone's documents (0043), all but the signed agreement: the
     * owner's ID, bank proof, shop photo, GST and trade licence have no use
     * once the garage is gone. The agreement stays with the bookings kept
     * for their money, as the contract they were taken under. Files cascade.
     */
    async deleteDocumentsExceptAgreement(vendorId: string) {
      await tx
        .delete(vendorDocuments)
        .where(and(eq(vendorDocuments.vendorId, vendorId), sql`${vendorDocuments.type} <> 'agreement'`))
    },

    /**
     * Customers' saves of the garage (0039): a tombstone is on no list and
     * has no page, so a save of it is personal data with no use left.
     */
    async deleteFavourites(vendorId: string) {
      await tx.delete(userFavouriteVendors).where(eq(userFavouriteVendors.vendorId, vendorId))
    },

    async deleteSeats(vendorId: string) {
      await tx.delete(userMemberMapping).where(eq(userMemberMapping.vendorId, vendorId))
    },

    /** Garage-only offers stop working; their redemptions on kept bookings stay. */
    async deactivateOffers(vendorId: string) {
      await tx
        .update(discounts)
        .set({ isActive: false, showOnHome: false })
        .where(eq(discounts.vendorId, vendorId))
    },

    /**
     * The garage row as a tombstone (lib/vendor-bin.ts tombstoneFields), and
     * its drawn doorstep area cleared (raw SQL: the column is not in the
     * Drizzle schema). Only while it is still in the Bin.
     */
    async makeTombstone(id: string, fields: Partial<typeof vendors.$inferInsert>) {
      const [row] = await tx
        .update(vendors)
        .set(fields)
        .where(and(eq(vendors.id, id), sql`${vendors.deletedAt} is not null`, isNull(vendors.purgedAt)))
        .returning({ id: vendors.id })
      await tx.execute(sql`update vendors set doorstep_area = null where id = ${id}`)
      return row
    },

    async deleteVendor(id: string) {
      const [row] = await tx.delete(vendors).where(eq(vendors.id, id)).returning({ id: vendors.id })
      return row
    },
  }
}

export type VendorBinWork = DataResetReads & DataResetWrites & ReturnType<typeof reads> & ReturnType<typeof writes>

export const vendorBinRepository = {
  // The reset's reads too, so Delete forever's preview plans the garage's
  // bookings exactly as the delete will.
  ...dataResetReads(db),
  ...reads(db),

  /**
   * Runs the work in one transaction, handing it the Bin's reads and writes
   * and the test-data reset's (for deleting a garage's bookings) bound to it.
   * Everything rolls back together on any throw.
   */
  transaction<T>(work: (repo: VendorBinWork) => Promise<T>): Promise<T> {
    return db.transaction((tx) =>
      work({ ...dataResetReads(tx), ...dataResetWrites(tx), ...reads(tx), ...writes(tx) })
    )
  },
}
