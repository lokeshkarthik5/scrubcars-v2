import { AppError } from '../../lib/errors.js'
import { accountService } from '../account/account.service.js'
import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { adminCustomersRepository } from './admin-customers.repository.js'
import type { CustomerSearchQuery } from './admin-customers.validation.js'

function customerNotFound() {
  return new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
}

/** "+91 98400 12345" or "98400-12345" → "9840012345"; any part of it searches. */
function phoneDigits(q: string): string {
  const digits = q.replace(/\D/g, '')
  return digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits
}

/**
 * The Customers page (10 Nov 2026): find a customer by phone or name, see
 * what they have with Detlio, and (the owner only) delete their account.
 * The team works with customers by phone, so the full number is shown here,
 * as on a booking's page; it never goes into a log or an audit row.
 */
export const adminCustomersService = {
  async search(query: CustomerSearchQuery) {
    const q = query.q.trim()
    const digits = phoneDigits(q)
    const words = /\d/.test(q) ? '' : q
    const rows = await adminCustomersRepository.search({ digits, words })
    return {
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        joinedAt: row.createdAt.toISOString(),
      })),
    }
  },

  /** One customer: name, phone, how many bookings, credit left and rewards. */
  async getCustomer(id: string, now = new Date()) {
    const row = await adminCustomersRepository.findCustomer(id)
    if (!row || row.deletedAt) throw customerNotFound()
    const bookings = await adminCustomersRepository.countBookings(id)
    const creditPaise = await giftCreditService.availablePaise(id, now)
    const rewards = await adminCustomersRepository.rewardCounts(id, now)
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      joinedAt: row.createdAt.toISOString(),
      bookings,
      credit: (creditPaise / 100).toFixed(2),
      rewards,
    }
  },

  /** What Delete customer account would do: a garage owner is refused, the rest warned. */
  async deletionPreview(id: string, now = new Date()) {
    const row = await adminCustomersRepository.findCustomer(id)
    if (!row || row.deletedAt) throw customerNotFound()
    return accountService.adminDeletionPreview(id, now)
  },

  async deleteCustomer(actor: { sub: string; name: string }, id: string, confirmText: string) {
    const row = await adminCustomersRepository.findCustomer(id)
    if (!row || row.deletedAt) throw customerNotFound()
    return accountService.adminDeleteAccount(actor, id, confirmText)
  },
}
