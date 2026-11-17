import { randomBytes } from 'node:crypto'
import {
  ACCOUNT_DELETED_REASON,
  adminDeletionCheck,
  deletedPhone,
  deletionBlockers,
  type AccountDeletionBlocker,
  type AccountDeletionFacts,
} from '../../lib/account-deletion.js'
import { runInBackground } from '../../lib/background.js'
import { bookingReference } from '../../lib/booking-ops.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { deleteObject, keyFromPublicUrl } from '../../lib/storage.js'
import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { giftsService } from '../gifts/gifts.service.js'
import { refundsService } from '../refunds/refunds.service.js'
import { shineScoreService } from '../shine-score/shine-score.service.js'
import { accountRepository, DeletionRaced } from './account.repository.js'
import { removeRepairMediaObjects } from '../../lib/job-photo-storage.js'

const log = logger.child({ module: 'account' })

export interface DeletionPreview {
  canDelete: boolean
  /** What has to finish first, in the order the sheet shows it; empty when it can go now. */
  blockers: AccountDeletionBlocker[]
}

function userNotFound() {
  return new AppError(404, 'User not found', 'USER_NOT_FOUND')
}

/** The facts lib/account-deletion.ts decides on, read one after the other (one connection). */
async function factsFor(userId: string, now: Date): Promise<AccountDeletionFacts> {
  const ownsGarage = await accountRepository.ownsGarage(userId)
  const openBookings = await accountRepository.listOpenBookings(userId)
  const openCheckout = await accountRepository.hasOpenCheckout(userId, now)
  const openClaims = await accountRepository.listOpenClaims(userId)
  const owed = await refundsService.listOwedForUser(userId)
  const creditBalancePaise = await giftCreditService.availablePaise(userId, now)
  const unredeemedGifts = await giftsService.unredeemedBought(userId, now)
  return {
    ownsGarage,
    openBookings: openBookings.map((b) => ({ reference: bookingReference(b.id), status: b.status })),
    openCheckout,
    openClaims: openClaims.map((c) => ({ reference: bookingReference(c.bookingId) })),
    refundsOwed: owed.map((item) => ({ reference: item.reference, amount: item.amountOwed })),
    creditBalancePaise,
    unredeemedGifts,
  }
}

async function blockersFor(userId: string, now: Date): Promise<AccountDeletionBlocker[]> {
  return deletionBlockers(await factsFor(userId, now))
}

function accountChanged() {
  return new AppError(
    409,
    'Something on your account changed just now (a booking or a payment). Check it, then try again.',
    'ACCOUNT_CHANGED'
  )
}

/**
 * The profile photo's file, after the commit, best effort; and the Shine
 * Score scans (0075) the deletion unlinked, with their private photos.
 */
function removeAvatar(result: {
  avatarKey: string | null
  avatarUrl: string | null
  shineScanIds?: string[]
}) {
  const avatarKey = result.avatarKey ?? (result.avatarUrl ? keyFromPublicUrl(result.avatarUrl) : null)
  if (avatarKey) {
    runInBackground('account:avatar_delete', () => deleteObject(avatarKey))
  }
  shineScoreService.scheduleDeleteScans(result.shineScanIds ?? [])
}

export const accountService = {
  /** What deleting the account would need first (the sheet reads it before asking). */
  async deletionPreview(userId: string, now = new Date()): Promise<DeletionPreview> {
    const user = await accountRepository.findUser(userId)
    if (!user || user.deletedAt) throw userNotFound()
    const blockers = await blockersFor(userId, now)
    return { canDelete: blockers.length === 0, blockers }
  },

  /**
   * Deletes the account: refused (409, the first blocker's code and words)
   * while anything is open, else the person is blanked in one transaction
   * (account.repository anonymise) and every session ends. The profile
   * photo's file goes after the commit, best effort.
   */
  async deleteAccount(userId: string, now = new Date()): Promise<void> {
    const user = await accountRepository.findUser(userId)
    if (!user || user.deletedAt) throw userNotFound()

    const blockers = await blockersFor(userId, now)
    if (blockers.length > 0) {
      const [first] = blockers
      throw new AppError(409, first!.message, first!.code)
    }

    let result: Awaited<ReturnType<typeof accountRepository.anonymise>>
    try {
      result = await accountRepository.anonymise({ userId, now, phone: deletedPhone(randomBytes(12)) })
    } catch (error) {
      if (error instanceof DeletionRaced) throw accountChanged()
      throw error
    }
    if (!result) throw userNotFound()
    log.info({ userId }, 'account:deleted')
    removeAvatar(result)
    if (result.repairMediaKeys?.length) runInBackground('account:repair_media_delete', () => removeRepairMediaObjects(result.repairMediaKeys ?? [], 'account_deleted'))
  },

  /**
   * The owner's Delete customer account, from admin's Customers page (10 Nov
   * 2026): only owning a garage still blocks it; everything else open is a
   * warning, in the team's words, saying what the delete does with it.
   */
  async adminDeletionPreview(userId: string, now = new Date()) {
    const user = await accountRepository.findUser(userId)
    if (!user || user.deletedAt) throw userNotFound()
    const check = adminDeletionCheck(await factsFor(userId, now))
    return { canDelete: check.block === null, block: check.block, warnings: check.warnings }
  },

  /**
   * Deletes a customer's account from admin, the same anonymise as their own
   * delete. Refused only for a garage owner (409 VENDOR_OWNER_ACCOUNT); their
   * bookings still on are cancelled first without telling anyone, an open
   * checkout is closed, and the delete is audited (customer_account_deleted).
   * The person types the customer's phone number to confirm (400
   * CONFIRM_TEXT_MISMATCH otherwise).
   */
  async adminDeleteAccount(
    actor: { sub: string; name: string },
    userId: string,
    confirmText: string,
    now = new Date()
  ) {
    const user = await accountRepository.findUser(userId)
    if (!user || user.deletedAt) throw userNotFound()
    if (confirmText.trim() !== user.phone) {
      throw new AppError(400, `Type ${user.phone} exactly as shown to confirm.`, 'CONFIRM_TEXT_MISMATCH')
    }
    const check = adminDeletionCheck(await factsFor(userId, now))
    if (check.block) throw new AppError(409, check.block.message, check.block.code)

    let result: Awaited<ReturnType<typeof accountRepository.anonymise>>
    try {
      result = await accountRepository.anonymise({
        userId,
        now,
        phone: deletedPhone(randomBytes(12)),
        byAdmin: { sub: actor.sub, name: actor.name, reason: ACCOUNT_DELETED_REASON },
      })
    } catch (error) {
      if (error instanceof DeletionRaced) throw accountChanged()
      throw error
    }
    if (!result) throw userNotFound()
    log.warn({ userId, by: actor.name, endedBookings: result.endedBookingIds.length }, 'account:deleted_by_admin')
    removeAvatar(result)
    if (result.repairMediaKeys?.length) runInBackground('account:repair_media_delete', () => removeRepairMediaObjects(result.repairMediaKeys ?? [], 'account_deleted'))
    return { id: userId, deleted: true as const, endedBookings: result.endedBookingIds.length }
  },
}
