import { runInBackground } from '../../lib/background.js'
import { bookingReference } from '../../lib/booking-ops.js'
import {
  KEPT_REASONS,
  MONEY_LABELS,
  countLines,
  planReset,
  type ChainPlan,
  type CheckoutPlan,
  type RazorpayLookup,
  type ResetPlan,
  type ResetScope,
} from '../../lib/data-reset.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { deleteDocumentObjects } from '../../lib/document-storage.js'
import { removeJobPhotoObjects } from '../../lib/job-photo-storage.js'
import { deleteObject, isStorageConfigured, keyFromPublicUrl } from '../../lib/storage.js'
import {
  BIN_CANCELLATION,
  garageNameMatches,
  garageNameMismatch,
  deleteNeedsBin,
  isPaid,
  purgeBusy,
  purgeOutcome,
  purgePreviewStale,
  tombstoneFields,
  upcomingSummary,
  vendorInBin,
  type PurgeOutcome,
} from '../../lib/vendor-bin.js'
import { adminService } from '../admin/admin.service.js'
import {
  deletePlannedRows,
  finishRestarts,
  isBusyError,
  loadPlanInput,
  rowsToLock,
} from '../data-reset/data-reset.service.js'
import { removeMediaFiles } from '../service-media/service-media.service.js'
import { isInBin } from '../vendors/vendors.predicates.js'
import {
  vendorBinRepository,
  type VendorBinWork,
  type VendorRecord,
} from './vendor-bin.repository.js'
import type {
  BinVendorInput,
  DeleteVendorForeverInput,
  RestoreVendorInput,
} from './vendor-bin.validation.js'

const log = logger.child({ module: 'vendor-bin' })

/** The audit log's names for the three actions. */
const AUDIT = {
  bin: 'garage_binned',
  restore: 'garage_restored',
  delete: 'garage_deleted',
} as const

/** Why a voided receipt number was voided, as receipt_number_voids records it. */
const VOID_REASON = 'Garage deleted forever from the admin Bin'

function vendorNotFound() {
  return new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
}

function notInBin() {
  return new AppError(409, 'This garage is not in the Bin.', 'VENDOR_NOT_IN_BIN')
}

/**
 * A garage the Bin can act on: one that exists and was not deleted forever.
 * A tombstone is gone as far as admin is concerned, so it is a 404 like a
 * garage that never was.
 */
function assertLive(vendor: VendorRecord | undefined): VendorRecord {
  if (!vendor || vendor.purgedAt) throw vendorNotFound()
  return vendor
}

/** The garage as the Bin's answers describe it. */
function garageView(vendor: VendorRecord) {
  return {
    id: vendor.id,
    businessName: vendor.businessName,
    deletedAt: vendor.deletedAt?.toISOString() ?? null,
    deletedByName: vendor.deletedByName,
    deletedReason: vendor.deletedReason,
  }
}

/**
 * Puts each seat holder's `is_vendor_owner` back in step with their seats,
 * inside the transaction that just moved the garage. The vendor-app login is
 * "an active seat or the flag" (auth.service canOpenVendorApp), and a seat at
 * a garage in the Bin is no seat, so without this the garage's owner would
 * still pass the login and land in the app with no company. Someone who
 * also has a seat at a garage on the app keeps the flag, and so their login.
 */
async function syncOwnerFlags(repo: VendorBinWork, userIds: string[]) {
  for (const userId of [...new Set(userIds)]) {
    await repo.setOwnerFlag(userId, (await repo.countActiveSeats(userId)) > 0)
  }
}

// ─── Delete forever: the plan ────────────────────────────────────────────────

/**
 * Razorpay is never asked from here. Money from before gateway_mode (0032)
 * that the test-data reset's dry run has not already classed is treated as
 * unconfirmed, and so kept: deleting a garage must never be the thing that
 * loses a real payment. Running Start pilot clean's dry run first records
 * what Razorpay says about those payments, and this then reads it.
 */
const NO_LOOKUPS = new Map<string, RazorpayLookup>()

function garageScope(vendorId: string): ResetScope {
  return { kind: 'garage', vendorId }
}

function keptView(row: ChainPlan | CheckoutPlan) {
  if (!row.kept) return null
  const isChain = 'rootId' in row
  return {
    kind: isChain ? ('booking' as const) : ('checkout' as const),
    id: isChain ? row.rootId : row.id,
    reference: row.reference,
    moneyLabel: MONEY_LABELS[row.money],
    ...KEPT_REASONS[row.kept],
  }
}

/** What the dialog and the Bin card read, from a plan and the garage's other rows. */
function purgeView(
  vendor: VendorRecord,
  plan: ResetPlan,
  assets: Awaited<ReturnType<typeof vendorBinRepository.countAssets>>
) {
  const keptChains = plan.chains.filter((chain) => chain.kept)
  const keptCheckouts = plan.checkouts.filter((checkout) => checkout.kept)
  return {
    garage: garageView(vendor),
    outcome: purgeOutcome(plan),
    bookings: { deleted: plan.counts.bookings, kept: keptChains.length },
    checkouts: { deleted: plan.selectedCheckoutIds.length, kept: keptCheckouts.length },
    // The logo is one file on the garage row, counted with its gallery.
    assets: { ...assets, photos: assets.photos + (vendor.logoStorageKey || vendor.logoUrl ? 1 : 0) },
    countLines: countLines(plan.counts),
    receiptPlan: plan.receiptPlan,
    kept: [...keptChains, ...keptCheckouts].map(keptView).filter((row) => row !== null),
    overCap: plan.overCap,
    selectionHash: plan.selectionHash,
  }
}

/**
 * The files to remove once the delete has committed: the logo and gallery,
 * every service's photos and videos (AI pictures among them: they live in
 * the service's folder once chosen), and the deleted bookings' job photos.
 * Best effort and after the commit, as everywhere else: a failure leaves a
 * file nobody can reach, and is logged.
 */
function removeGarageFiles(files: {
  logoKey: string | null
  galleryKeys: string[]
  media: Parameters<typeof removeMediaFiles>[0]
  jobPhotoKeys: string[]
  documentKeys: string[]
}) {
  removeMediaFiles(files.media)
  // Garage documents live in their own private bucket (0043).
  if (files.documentKeys.length > 0) {
    const documentKeys = files.documentKeys
    runInBackground('vendor_bin_documents', () => deleteDocumentObjects(documentKeys, 'garage_deleted'))
  }
  // Job photos live in the private bucket (older ones in the public one):
  // lib/job-photo-storage.ts asks both.
  if (files.jobPhotoKeys.length > 0) {
    const jobPhotoKeys = files.jobPhotoKeys
    runInBackground('vendor_bin_job_photos', () => removeJobPhotoObjects(jobPhotoKeys, 'garage_deleted'))
  }
  const keys = [files.logoKey, ...files.galleryKeys].filter((key): key is string => Boolean(key))
  if (keys.length === 0 || !isStorageConfigured()) return
  runInBackground('vendor_bin_files', async () => {
    for (const key of keys) await deleteObject(key)
    log.info({ files: keys.length }, 'vendor_bin:files_removed')
  })
}

export const vendorBinService = {
  /**
   * Before moving a garage to the Bin: the bookings still to happen there,
   * which the move will cancel, and which of them are paid (each becomes a
   * refund owed). Changes nothing.
   */
  async binPreview(id: string) {
    const vendor = assertLive(await vendorBinRepository.findVendor(id))
    const upcoming = await vendorBinRepository.listUpcomingBookings(id)
    const summary = upcomingSummary(upcoming.map((booking) => ({ payment: booking.payment ?? null })))
    return {
      garage: garageView(vendor),
      inBin: isInBin(vendor),
      upcomingCount: summary.count,
      paidCount: summary.paid,
      upcoming: upcoming.map((booking) => ({
        id: booking.id,
        reference: bookingReference(booking.id),
        status: booking.status,
        scheduledAt: booking.scheduledAt.toISOString(),
        amount: booking.amount,
        customerName: booking.user?.name ?? null,
        paid: isPaid(booking.payment),
      })),
    }
  },

  /**
   * Moves a garage to the Bin, in one transaction: the garage row (locked
   * first), the audit row, and every seat holder's owner flag. From the
   * commit on, the garage is off every customer read and its team's seats
   * open nothing (vendors.predicates.ts, members.repository).
   *
   * Then each booking still to happen is cancelled through the admin cancel,
   * as Detlio, "Garage removed": one at a time, each its own transaction, so
   * a paid one is a refund owed on the Refunds page exactly as an admin
   * cancellation makes it, with its note and its alert. Nothing is refunded
   * here. They are cancelled after the garage is in the Bin, so none can be
   * paid for in between (a payment that lands anyway is refused as for a
   * paused garage, and owed back). One that cannot be cancelled is listed in
   * the answer, for ops to cancel from its page.
   */
  async bin(sub: string, id: string, input: BinVendorInput, now = new Date()) {
    const { vendor, upcomingIds, auditId } = await vendorBinRepository.transaction(async (repo) => {
      const current = assertLive(await repo.lockVendor(id))
      if (isInBin(current)) throw vendorInBin()

      const updated = await repo.setBin(id, {
        deletedAt: now,
        deletedByName: input.actorName,
        deletedReason: input.reason ?? null,
      })
      await syncOwnerFlags(repo, await repo.listSeatHolderIds(id))
      // The owner asked to close it (0066): this confirms that request.
      const closureRequestId = await repo.confirmClosureRequest(id, input.actorName, now)
      const upcoming = await repo.listUpcomingBookingIds(id)
      const audit = await repo.insertAudit({
        action: AUDIT.bin,
        actorSub: sub,
        actorName: input.actorName,
        summary: {
          vendorId: id,
          garageName: current.businessName,
          reason: input.reason ?? null,
          upcomingBookings: upcoming.length,
          closureRequestId,
        },
        detail: { bookingIds: upcoming },
      })
      return { vendor: updated, upcomingIds: upcoming, auditId: audit.id }
    })

    const cancelled: Array<{ id: string; reference: string; paid: boolean }> = []
    const notCancelled: Array<{ id: string; reference: string; message: string }> = []
    for (const bookingId of upcomingIds) {
      try {
        const booking = await adminService.cancelBooking(bookingId, sub, BIN_CANCELLATION)
        cancelled.push({
          id: bookingId,
          reference: bookingReference(bookingId),
          paid: booking.refundOwed !== null,
        })
      } catch (error) {
        // Cancelled or finished by someone else a moment ago, most likely.
        log.warn({ err: error, vendorId: id, bookingId }, 'vendor_bin:cancel_failed')
        notCancelled.push({
          id: bookingId,
          reference: bookingReference(bookingId),
          message: error instanceof AppError ? error.message : "Couldn't cancel this booking.",
        })
      }
    }

    log.warn(
      { vendorId: id, auditId, by: input.actorName, cancelled: cancelled.length, failed: notCancelled.length },
      'vendor_bin:binned'
    )
    return {
      garage: garageView(vendor),
      auditId,
      cancelled,
      refundsOwed: cancelled.filter((booking) => booking.paid).length,
      notCancelled,
    }
  },

  /**
   * Takes a garage out of the Bin as it went in: stage, verification and
   * pause were never touched, so it is back exactly where it was, and its
   * team's seats open it again (owner flags re-synced). Bookings the Bin
   * cancelled stay cancelled.
   */
  async restore(sub: string, id: string, input: RestoreVendorInput) {
    const { vendor, auditId } = await vendorBinRepository.transaction(async (repo) => {
      const current = assertLive(await repo.lockVendor(id))
      if (!isInBin(current)) throw notInBin()

      const updated = await repo.setBin(id, { deletedAt: null, deletedByName: null, deletedReason: null })
      await syncOwnerFlags(repo, await repo.listSeatHolderIds(id))
      const audit = await repo.insertAudit({
        action: AUDIT.restore,
        actorSub: sub,
        actorName: input.actorName,
        summary: { vendorId: id, garageName: current.businessName },
        detail: {
          binnedAt: current.deletedAt?.toISOString() ?? null,
          binnedBy: current.deletedByName,
          reason: current.deletedReason,
        },
      })
      return { vendor: updated, auditId: audit.id }
    })

    log.warn({ vendorId: id, auditId, by: input.actorName }, 'vendor_bin:restored')
    return { garage: garageView(vendor), auditId }
  },

  /**
   * What Delete forever would do now: the garage's bookings and checkouts
   * as lib/data-reset.ts plans them (deleted, or kept for their money and
   * why), what else goes with it, and whether the garage row goes too or
   * stays as a tombstone. Deletes nothing. The fingerprint is what the
   * delete must match.
   */
  async deletePreview(id: string, now = new Date()) {
    const vendor = assertLive(await vendorBinRepository.findVendor(id))
    const plan = planReset(
      await loadPlanInput(vendorBinRepository, garageScope(id), undefined, NO_LOOKUPS, true, now)
    )
    const assets = await vendorBinRepository.countAssets(id)
    return { inBin: isInBin(vendor), ...purgeView(vendor, plan, assets) }
  },

  /**
   * Deletes a garage in the Bin forever, in one transaction:
   *
   *   1. lock_timeout 5s and statement_timeout 60s, as the reset;
   *   2. the garage row FOR UPDATE, checked to be in the Bin and the typed
   *      name to be its name;
   *   3. its checkouts, then its bookings, FOR UPDATE in id order, and the
   *      plan worked out again from them, refused unless it is the preview's
   *      (409 PREVIEW_STALE);
   *   4. the audit row, with the full snapshot;
   *   5. the reset's own deletes (deletePlannedRows): receipt numbers voided
   *      or restarted, never renumbered; the deletable checkouts and booking
   *      chains with everything on them. Real money is never in the plan;
   *   6. the garage: outright when nothing was kept, in an order the foreign
   *      keys allow (package contents, services, then the row); otherwise a
   *      tombstone, keeping only what the kept receipts print. Either way
   *      the seat holders' owner flags are re-synced;
   *   7. last of all, a restarting year's counter (finishRestarts).
   *
   * After the commit: the garage's files are removed from R2 and Stream,
   * best effort, and the team is told on Telegram.
   */
  async deleteForever(sub: string, id: string, input: DeleteVendorForeverInput, now = new Date()) {
    const scope = garageScope(id)
    let result: {
      vendor: VendorRecord
      plan: ResetPlan
      outcome: PurgeOutcome
      auditId: string
      files: Parameters<typeof removeGarageFiles>[0]
    }
    try {
      result = await vendorBinRepository.transaction(async (repo) => {
        await repo.limitWaits()

        const vendor = assertLive(await repo.lockVendor(id))
        if (!isInBin(vendor)) throw deleteNeedsBin()
        if (!garageNameMatches(input.confirmName, vendor.businessName)) throw garageNameMismatch()

        const seen = await loadPlanInput(repo, scope, undefined, NO_LOOKUPS, true, now)
        const toLock = rowsToLock(seen, undefined)
        await repo.lockIntents(toLock.intentIds)
        await repo.lockBookings(toLock.bookingIds)
        const plan = planReset(await loadPlanInput(repo, scope, undefined, NO_LOOKUPS, true, now))
        if (plan.selectionHash !== input.selectionHash) throw purgePreviewStale()

        const outcome = purgeOutcome(plan)
        const assets = await repo.countAssets(id)
        const cascades = await repo.countCascadeRows(id)
        const seatHolders = await repo.listSeatHolderIds(id)
        const kept = [...plan.chains, ...plan.checkouts].filter((row) => row.kept)
        const audit = await repo.insertAudit({
          action: AUDIT.delete,
          actorSub: sub,
          actorName: input.actorName,
          summary: {
            vendorId: id,
            garageName: vendor.businessName,
            outcome,
            counts: plan.counts,
            keptBookings: plan.chains.filter((chain) => chain.kept).length,
            keptCheckouts: plan.checkouts.filter((checkout) => checkout.kept).length,
            receipts: plan.receiptPlan.map((year) => year.words),
            assets,
            cascades: outcome === 'hard_delete' ? cascades : null,
          },
          // Ids, references, amounts and Razorpay ids; never phone numbers.
          detail: {
            binnedAt: vendor.deletedAt?.toISOString() ?? null,
            binnedBy: vendor.deletedByName,
            reason: vendor.deletedReason,
            chains: plan.chains
              .filter((chain) => chain.selected)
              .map((chain) => ({
                rootId: chain.rootId,
                reference: chain.reference,
                bookingIds: chain.bookingIds,
                createdAt: chain.createdAt.toISOString(),
                status: chain.status,
                customerId: chain.customerId,
                amount: chain.amount,
                paymentStatus: chain.paymentStatus,
                razorpayIds: chain.razorpayIds,
                money: chain.money,
                receiptNumber: chain.receiptNumber,
                refunded: chain.refunded,
              })),
            intentIds: plan.selectedIntentIds,
            payoutIds: plan.selectedPayoutIds,
            receiptPlan: plan.receiptPlan,
            kept: kept.map((row) => ({ id: 'rootId' in row ? row.rootId : row.id, reason: row.kept })),
            seatHolders,
            selectionHash: plan.selectionHash,
          },
        })

        // Read before the rows go: what to remove from storage afterwards.
        const deletingGarage = outcome !== 'partial'
        const galleryKeys = deletingGarage
          ? (await repo.galleryKeys(id))
              .map((photo) => photo.storageKey ?? keyFromPublicUrl(photo.url))
              .filter((key): key is string => Boolean(key))
          : []
        const media = deletingGarage ? await repo.mediaFiles(id) : []
        // Its documents' files: every one when the row goes; on a tombstone
        // all but the signed agreement, which stays with the kept bookings.
        const documentKeys = deletingGarage
          ? (await repo.documentFiles(id))
              .filter((file) => outcome === 'hard_delete' || file.type !== 'agreement')
              .map((file) => file.storageKey)
          : []

        const { photoKeys, restartYears } = await deletePlannedRows(repo, plan, audit.id, VOID_REASON)

        if (outcome === 'hard_delete') {
          await repo.deletePackageItems(id)
          await repo.deleteUnreferencedServices(id)
          await repo.deleteVendor(id)
        } else if (outcome === 'tombstone') {
          await repo.deleteServiceMedia(id)
          await repo.deletePackageItems(id)
          await repo.deleteUnreferencedServices(id)
          // Those left are named by a kept booking: off sale, not deleted.
          await repo.deactivateServices(id)
          await repo.deleteGallery(id)
          await repo.deleteHoursAndReach(id)
          await repo.deleteSeats(id)
          await repo.deactivateOffers(id)
          // Its payouts on kept bookings stay, for the accounts; where the
          // money was sent does not.
          await repo.deletePayoutAccount(id)
          // Customers' saves of it go too (a deleted garage's go by cascade).
          await repo.deleteFavourites(id)
          // Its documents too, but for the signed agreement (a deleted
          // garage's go by cascade).
          await repo.deleteDocumentsExceptAgreement(id)
          // And its quality checks and certification (a deleted garage's go
          // by cascade).
          await repo.deleteCertification(id)
          // And its onboarding marks and collection items (0059; a deleted
          // garage's go by cascade).
          await repo.deleteOnboardingRecords(id)
          await repo.makeTombstone(id, tombstoneFields(now))
        }
        if (deletingGarage) await syncOwnerFlags(repo, seatHolders)

        // The counter's lock is the last one any transaction takes.
        await finishRestarts(repo, restartYears)

        return {
          vendor,
          plan,
          outcome,
          auditId: audit.id,
          files: {
            logoKey: deletingGarage
              ? (vendor.logoStorageKey ?? (vendor.logoUrl ? keyFromPublicUrl(vendor.logoUrl) : null))
              : null,
            galleryKeys,
            media,
            jobPhotoKeys: photoKeys,
            documentKeys,
          },
        }
      })
    } catch (error) {
      if (error instanceof AppError) {
        // The reset's own refusal, raised by a receipt year that moved under
        // the run: said in the Bin's words.
        throw error.code === 'PREVIEW_STALE' ? purgePreviewStale() : error
      }
      if (isBusyError(error)) {
        log.warn({ err: error, vendorId: id }, 'vendor_bin:busy')
        throw purgeBusy()
      }
      throw error
    }

    const { vendor, plan, outcome, auditId, files } = result
    removeGarageFiles(files)
    const keptBookings = plan.chains.filter((chain) => chain.kept).length
    log.warn(
      { vendorId: id, auditId, by: input.actorName, outcome, counts: plan.counts, keptBookings },
      'vendor_bin:deleted'
    )
    alertOps({
      kind: 'garage_deleted',
      by: input.actorName,
      garage: vendor.businessName,
      bookings: plan.counts.bookings,
      keptBookings,
      outcome,
      auditId,
    })

    return {
      garage: { id, businessName: vendor.businessName },
      outcome,
      auditId,
      counts: plan.counts,
      countLines: countLines(plan.counts),
      receiptPlan: plan.receiptPlan,
      keptBookings,
      keptCheckouts: plan.checkouts.filter((checkout) => checkout.kept).length,
      remaining: plan.overCap,
    }
  },
}
