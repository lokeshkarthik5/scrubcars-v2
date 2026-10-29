import { randomBytes } from 'node:crypto'
import {
  deletedPhone,
  deletionBlockers,
  type AccountDeletionBlocker,
} from '../../lib/account-deletion.js'
import { runInBackground } from '../../lib/background.js'
import { bookingReference } from '../../lib/booking-ops.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { deleteObject, keyFromPublicUrl } from '../../lib/storage.js'
import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { giftsService } from '../gifts/gifts.service.js'
import { refundsService } from '../refunds/refunds.service.js'
import { accountRepository, DeletionRaced } from './account.repository.js'

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
async function blockersFor(userId: string, now: Date): Promise<AccountDeletionBlocker[]> {
  const ownsGarage = await accountRepository.ownsGarage(userId)
  const openBookings = await accountRepository.listOpenBookings(userId)
  const openCheckout = await accountRepository.hasOpenCheckout(userId, now)
  const openClaims = await accountRepository.listOpenClaims(userId)
  const owed = await refundsService.listOwedForUser(userId)
  const creditBalancePaise = await giftCreditService.availablePaise(userId, now)
  const unredeemedGifts = await giftsService.unredeemedBought(userId, now)
  return deletionBlockers({
    ownsGarage,
    openBookings: openBookings.map((b) => ({ reference: bookingReference(b.id), status: b.status })),
    openCheckout,
    openClaims: openClaims.map((c) => ({ reference: bookingReference(c.bookingId) })),
    refundsOwed: owed.map((item) => ({ reference: item.reference, amount: item.amountOwed })),
    creditBalancePaise,
    unredeemedGifts,
  })
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
      if (error instanceof DeletionRaced) {
        throw new AppError(
          409,
          'Something on your account changed just now (a booking or a payment). Check it, then try again.',
          'ACCOUNT_CHANGED'
        )
      }
      throw error
    }
    if (!result) throw userNotFound()
    log.info({ userId }, 'account:deleted')

    const avatarKey = result.avatarKey ?? (result.avatarUrl ? keyFromPublicUrl(result.avatarUrl) : null)
    if (avatarKey) {
      runInBackground('account:avatar_delete', () => deleteObject(avatarKey))
    }
  },
}
