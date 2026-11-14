import { randomUUID } from 'node:crypto'
import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import {
  GARAGE_BOOK_2_LIMITS,
  GARAGE_BOOK_LIMITS,
  istMonth,
  linkTimes,
  monthBounds,
  openNow,
  rupeesToPaise,
  slugFor,
  slugWithSuffix,
} from '../../lib/garage-book.js'
import { addDays, istDateKey } from '../../lib/ist.js'
import { garageAreaName } from '../../lib/localities.js'
import { logger } from '../../lib/logger.js'
import { ratingsFor } from '../reviews/reviews.service.js'
import { linkRepository as repo, type LinkGarage } from './garage-book-link.repository.js'
import { paymentDetailsService } from './garage-book-pay.service.js'
import { garageBookRepository } from './garage-book.repository.js'
import type { LinkBookInput, UpdateLinkInput } from './garage-book.validation.js'
import { normalisePhone, notFound, type Viewer } from './garage-book.viewer.js'

const log = logger.child({ module: 'garage-book-link' })

/**
 * The garage's own booking link (0074; owner decisions 5 and 12 Nov):
 * detlio.com/g/<slug>, free, for the garage's own customers, who pay at the
 * garage. No sign-in and no OTP, so it is rate-limited by address (the
 * route) and by phone (here, in the database).
 *
 * Decision 5, the anti-bypass rule: a phone that has booked this garage
 * through Detlio before books on Detlio, as a normal Detlio booking with
 * commission. Nothing is written for it; the page sends them to the
 * garage's Detlio page instead.
 *
 * Walk-ins never change Detlio slots (decision 3), so the page's times are
 * a plain list from opening hours and the garage confirms on WhatsApp. A
 * link booking lands on Today like a walk-in, marked "From your link".
 */

export function linkUrl(slug: string) {
  return `${env.garageBookSiteUrl}/g/${slug}`
}

/** A link that may be shown: switched on, at a garage that is open for business (not suspended or in the Bin). */
function usable(link: LinkGarage | null): link is LinkGarage {
  return Boolean(link && link.active && !link.deletedAt && !link.purgedAt && link.status !== 'suspended')
}

async function times(vendorId: string, now: Date) {
  const today = istDateKey(now)
  const [hours, closures] = [await repo.hours(vendorId), await repo.closures(vendorId, today, addDays(today, 8))]
  return { hours, closures, days: linkTimes(hours, closures, now) }
}

export const linkService = {
  /** The garage's link, made the first time it is asked for, from its name ("-2" after a clash). */
  async ensure(vendorId: string) {
    const existing = await repo.link(vendorId)
    if (existing) return existing
    const garage = await garageBookRepository.vendor(vendorId)
    if (!garage) notFound('Garage')
    const base = slugFor(garage.businessName)
    for (let attempt = 1; attempt <= 50; attempt++) {
      const slug = slugWithSuffix(base, attempt)
      if (await repo.slugTaken(slug)) continue
      if (await repo.insertLink(vendorId, slug)) break
      // Another garage took it this instant, or this garage's own link was just made: look again.
      const made = await repo.link(vendorId)
      if (made) return made
    }
    const made = await repo.link(vendorId)
    if (!made) throw new AppError(409, 'Couldn’t make your link. Try again.', 'LINK_SLUG_TAKEN')
    return made
  },

  async get(viewer: Viewer, now = new Date()) {
    const link = await this.ensure(viewer.vendorId)
    const bounds = monthBounds(istMonth(now))!
    const [services, bookings] = [
      await repo.services(viewer.vendorId),
      await repo.linkBookings(viewer.vendorId, bounds.start, bounds.end),
    ]
    return {
      slug: link.slug,
      url: linkUrl(link.slug),
      active: link.active,
      bookingsThisMonth: bookings,
      // Customers pay the garage at the garage: Detlio takes nothing.
      commissionPaise: 0,
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        pricePaise: rupeesToPaise(service.price),
        durationMins: service.durationMins,
        isAddon: service.isAddon,
        shown: service.shown,
      })),
    }
  },

  async update(viewer: Viewer, input: UpdateLinkInput, now = new Date()) {
    await this.ensure(viewer.vendorId)
    if (input.services) {
      const known = new Set((await repo.services(viewer.vendorId)).map((service) => service.id))
      if (input.services.some((row) => !known.has(row.serviceId))) notFound('Service')
      await repo.setShown(viewer.vendorId, input.services)
    }
    if (input.active !== undefined) await repo.setActive(viewer.vendorId, input.active)
    return this.get(viewer, now)
  },

  /** The public booking page (/g/<slug>): a 404 for a link that is off or a garage that isn't open for business. */
  async page(slug: string, now = new Date()) {
    const link = await repo.bySlug(slug)
    if (!usable(link)) notFound('Page')
    const [services, slots, ratings, pay] = [
      await repo.services(link.vendorId),
      await times(link.vendorId, now),
      await ratingsFor([link.vendorId]),
      await paymentDetailsService.shownOn(link.vendorId, 'booking_page'),
    ]
    const rating = ratings.get(link.vendorId)
    return {
      garage: {
        name: link.businessName,
        area: garageAreaName({ city: link.city, lat: link.lat, lng: link.lng }),
        openNow: openNow(slots.hours, slots.closures, now),
        rating: rating?.rating ?? null,
        reviewCount: rating?.reviewCount ?? 0,
      },
      services: services
        .filter((service) => service.shown)
        .map((service) => ({
          id: service.id,
          name: service.name,
          durationMins: service.durationMins,
          pricePaise: rupeesToPaise(service.price),
        })),
      days: slots.days,
      // "Pay at the garage: Cash or UPI · GPay/PhonePe 98400 00000", when the garage shows it here.
      pay: pay ? { phone: pay.phone, apps: pay.apps, appsText: pay.appsText, upiId: pay.upiId } : null,
    }
  },

  /**
   * Books a time on the link. A phone that booked this garage on Detlio
   * before gets `{ detlio: true, url }` and nothing is written (decision 5).
   * Anyone else becomes (or is found as) the garage's own customer, with a
   * booked walk-in at that time, paid at the garage.
   */
  async book(slug: string, input: LinkBookInput, now = new Date()) {
    const link = await repo.bySlug(slug)
    if (!usable(link)) notFound('Page')
    const phone = normalisePhone(input.phone)
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      throw new AppError(400, 'Type your 10-digit mobile number.', 'INVALID_PHONE')
    }
    const service = await repo.serviceOnLink(link.vendorId, input.serviceId)
    if (!service) throw new AppError(400, 'That service isn’t on this page any more.', 'UNKNOWN_SERVICE')
    const at = new Date(input.at)
    const { days } = await times(link.vendorId, now)
    if (!days.some((day) => day.times.includes(at.toISOString()))) {
      throw new AppError(400, 'That time isn’t open any more. Pick another.', 'TIME_NOT_OPEN')
    }

    if (await repo.bookedOnDetlio(link.vendorId, phone)) {
      log.info({ vendorId: link.vendorId }, 'garage_link:sent_to_detlio')
      return { detlio: true as const, url: `${env.garageBookSiteUrl}/garage/${link.vendorId}` }
    }

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    if ((await repo.bookingsByPhone(link.vendorId, phone, since)) >= GARAGE_BOOK_2_LIMITS.linkBookingsPerPhonePerDay) {
      throw new AppError(429, 'You’ve booked here a few times today. Call the garage to book more.', 'LINK_TOO_MANY', {
        retryAfterSeconds: 60 * 60,
      })
    }

    const pricePaise = rupeesToPaise(service.price)
    await garageBookRepository.transaction(async (tx) => {
      await garageBookRepository.lockPhone(tx, link.vendorId, phone)
      const known = await garageBookRepository.ownCustomerByPhone(tx, link.vendorId, phone)
      const customerId =
        known?.id ??
        (
          await garageBookRepository.insertCustomer(tx, {
            vendorId: link.vendorId,
            name: input.name.trim().slice(0, GARAGE_BOOK_LIMITS.nameMax),
            phone,
          })
        ).id
      const cars = (await garageBookRepository.cars([customerId], tx)).get(customerId) ?? []
      await garageBookRepository.insertJob(
        tx,
        {
          vendorId: link.vendorId,
          clientId: `link-${randomUUID()}`,
          garageCustomerId: customerId,
          carId: cars.length === 1 ? cars[0]!.id : null,
          scheduledAt: at,
          status: 'booked',
          // Paid at the garage; the garage says how when it finishes the job.
          paymentMethod: 'cash',
          totalPaise: pricePaise,
          remindInDays: null,
          createdBy: null,
          doneAt: null,
          origin: 'link',
        },
        [{ serviceId: service.id, label: service.name.slice(0, GARAGE_BOOK_LIMITS.nameMax), pricePaise, qty: 1 }]
      )
    })
    log.info({ vendorId: link.vendorId }, 'garage_link:booked')
    return {
      detlio: false as const,
      booked: { garage: link.businessName, service: service.name, at: at.toISOString(), pricePaise },
    }
  },
}
