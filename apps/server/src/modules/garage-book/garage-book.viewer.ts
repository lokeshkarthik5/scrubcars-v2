import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import type { VendorScopedRole } from '../members/members.repository.js'

/**
 * Who is asking, and what they may see, for every Garage Book service
 * (0072, 0073). Decided here once:
 *
 *   - `owner` (vendor_admin) sees money; staff (vendor_operator) never do.
 *     Every figure in paise, and every Detlio booking amount, is left out of
 *     a staff response (`money()`), and the money routes are owner-only in
 *     garage-book.routes.ts.
 *   - A Detlio customer never carries a phone number.
 */

export interface Viewer {
  vendorId: string
  userId: string
  role: VendorScopedRole
}

export const isOwner = (viewer: Pick<Viewer, 'role'>) => viewer.role === 'vendor_admin'

/** A money figure for the owner; nothing at all for staff. */
export function money<T>(viewer: Pick<Viewer, 'role'>, value: T): T | undefined {
  return isOwner(viewer) ? value : undefined
}

export function notFound(what = 'Customer'): never {
  throw new AppError(404, `${what} not found`, 'NOT_FOUND')
}

/** Ten national digits, or null. A number that isn't one is refused. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  while (digits.length > 10 && (digits.startsWith('0') || (digits.startsWith('91') && digits.length >= 12))) {
    digits = digits.startsWith('0') ? digits.slice(1) : digits.slice(2)
  }
  if (digits.length === 0) return null
  if (!/^[1-9]\d{9}$/.test(digits)) {
    throw new AppError(400, 'That phone number doesn’t look right. Type the 10 digits.', 'INVALID_PHONE')
  }
  return digits
}

/** normalisePhone for a number Detlio already holds (the garage's own): null rather than a refusal. */
export function normalisePhoneSafe(raw: string | null | undefined): string | null {
  try {
    return normalisePhone(raw)
  } catch (err) {
    logger.debug({ err }, 'garage_book:garage_phone_unreadable')
    return null
  }
}

/** The wa.me link for an Indian mobile, the message typed in. Null for a landline. */
export function whatsAppUrl(phone: string, message: string): string | null {
  if (!/^[6-9]\d{9}$/.test(phone)) return null
  return `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
}

export function carLabel(car: { make?: string | null; model?: string | null } | null | undefined): string | null {
  if (!car) return null
  const label = [car.make, car.model].filter(Boolean).join(' ').trim()
  return label || null
}
