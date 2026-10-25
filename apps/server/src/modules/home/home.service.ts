import { tipOfTheDay, type CarTip } from '../../lib/car-tips.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  buildCars,
  nextBookingWithoutCar,
  pickActionCards,
  softCardWithComplaint,
  softCardWithReminder,
  type ActionCard,
  type GarageDays,
  type HomeCar,
  type HubCar,
  type LastJob,
  type NextBookingTile,
} from '../../lib/home-cards.js'
import {
  deriveUpdates,
  firstNameOf,
  hasUnread,
  UPDATES_WINDOW_DAYS,
  type HubBooking,
  type HubComplaint,
  type HubGuaranteeClaim,
  type HubRewards,
  type HubSlotAlert,
  type PausedGarage,
  type UpdateItem,
} from '../../lib/home-updates.js'
import { LIST_RADIUS_KM } from '../../lib/discovery.js'
import { istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { reportError } from '../../lib/monitoring.js'
import { toNoticeView, type NoticeRow, type NoticeView } from '../../lib/notices.js'
import { rankOffers, toHomeOffer, type HomeOffer } from '../../lib/offers.js'
import { serviceReminderRowId, type HubServiceReminder } from '../../lib/service-reminders.js'
import { isWashDue } from '../../lib/wash-status.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { carHistoryService } from '../car-history/car-history.service.js'
import { discountsRepository } from '../discounts/discounts.repository.js'
import { slotAlertsRepository } from '../slot-alerts/slot-alerts.repository.js'
import { rewardsService } from '../rewards/rewards.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { toHubBooking } from './home.mappers.js'
import { homeRepository } from './home.repository.js'
import { guaranteeRepository } from '../guarantee/guarantee.repository.js'
import type { HomeQuery, MarkUpdatesSeenInput } from './home.validation.js'

const log = logger.child({ module: 'home' })

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * "N garages within 50 km": the garage list's own radius (lib/discovery.ts),
 * so the count on Home matches the pinned part of the drop-in list.
 */
export const NEARBY_RADIUS_KM = LIST_RADIUS_KM

/** Home's Updates block: the pinned notice, then this many newest rows. */
const HOME_UPDATE_ROWS = 2

export interface HomeResponse {
  now: string
  header: { firstName: string; avatarUrl: string | null; hasUnread: boolean }
  /**
   * Suggested times to answer, extra work to approve, a bill due, or the
   * garage shut on a booking's day (in that order): above the offers.
   */
  mustAct: ActionCard | null
  /** Up to three, ranked. Null when the offers could not be read. */
  offers: HomeOffer[] | null
  /**
   * "Rate your wash", below the offers, only when there is no must-act card;
   * with neither, a complaint the team just resolved ("see our answer");
   * with none of those, a coating or detailing follow-up coming due (0046).
   */
  softCard: ActionCard | null
  /** Default car first; empty means "Add your car". */
  cars: HomeCar[]
  /**
   * Only when `cars` is empty: a live booking for a car since removed, shown
   * beside "Add your car" so Home never hides a booking. Null otherwise (the
   * default car's tile carries it).
   */
  nextBooking: NextBookingTile | null
  updates: { pinnedNotice: NoticeView | null; items: UpdateItem[]; total: number } | null
  nearby: { count: number; closestKm: number | null; radiusKm: number } | null
  tip: CarTip
}

/**
 * Runs one part of Home on its own. A part that fails comes back null and is
 * reported, and Home still renders around it: a broken offers query must not
 * take the customer's bookings with it. The queries still run one at a time.
 * Production's pool has one connection, so they would be serial anyway.
 */
async function part<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (err) {
    log.error({ err, part: name }, 'home:part_failed')
    reportError(err, { task: `home:${name}` })
    return null
  }
}

async function getActiveUser(userId: string) {
  const user = await homeRepository.findUser(userId)
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
  if (user.status === 'suspended') {
    throw new AppError(403, 'Account is suspended', 'ACCOUNT_SUSPENDED')
  }
  return user
}

/** The customer's bookings for Home and Updates, with which were moved. */
async function loadBookings(userId: string, now: Date): Promise<HubBooking[]> {
  const rows = await homeRepository.listHubBookings(
    userId,
    new Date(now.getTime() - UPDATES_WINDOW_DAYS * DAY_MS)
  )
  const moved = await bookingsRepository.findMovedBookingIds(rows.map((row) => row.id))
  return rows.map((row) => toHubBooking(row, moved))
}

/** The customer's complaints the team answered in the Updates window. */
function loadComplaints(userId: string, now: Date): Promise<HubComplaint[]> {
  return homeRepository.listAnsweredComplaints(userId, new Date(now.getTime() - UPDATES_WINDOW_DAYS * DAY_MS))
}

/**
 * Open coating and detailing follow-ups on the customer's current cars, with
 * where each stands (0046): one read, plus the cars' bookings only when there
 * is a reminder.
 */
function loadServiceReminders(userId: string, now: Date): Promise<HubServiceReminder[]> {
  return carHistoryService.remindersForHub(userId, now)
}

/**
 * The customer's free redo claims moved in the Updates window (0051): one
 * bounded read (20 rows), and none at all while GUARANTEE_ENABLED is off.
 */
async function loadGuaranteeClaims(userId: string, now: Date): Promise<HubGuaranteeClaim[]> {
  if (!env.guaranteeEnabled) return []
  return guaranteeRepository.listCustomerClaimsSince(userId, new Date(now.getTime() - UPDATES_WINDOW_DAYS * DAY_MS))
}

/** The customer's slot alerts that were told a time opened, in the Updates window (0047). */
async function loadSlotAlerts(userId: string, now: Date): Promise<HubSlotAlert[]> {
  const rows = await slotAlertsRepository.listToldSince(userId, new Date(now.getTime() - UPDATES_WINDOW_DAYS * DAY_MS))
  return rows.flatMap((row) =>
    row.notifiedAt && row.notifiedSlotAt
      ? [{ ...row, notifiedAt: row.notifiedAt, notifiedSlotAt: row.notifiedSlotAt }]
      : []
  )
}

/** Detlio Rewards news in the Updates window (0050): three bounded reads, none while not live. */
function loadRewards(userId: string, now: Date): Promise<HubRewards | null> {
  return rewardsService.hubEvents(userId, new Date(now.getTime() - UPDATES_WINDOW_DAYS * DAY_MS))
}

/** Holidays and weekly hours for the garages of upcoming bookings only. */
async function loadGarageDays(bookings: HubBooking[], now: Date): Promise<GarageDays> {
  const upcoming = bookings.filter(
    (b) => (b.status === 'pending' || b.status === 'confirmed') && b.scheduledAt > now
  )
  const days: GarageDays = { closures: new Map(), hours: new Map() }
  if (upcoming.length === 0) return days

  const { closures, hours } = await homeRepository.garageDays(
    [...new Set(upcoming.map((b) => b.vendorId))],
    [...new Set(upcoming.map((b) => istDateKey(b.scheduledAt)))]
  )
  for (const closure of closures) {
    const set = days.closures.get(closure.vendorId) ?? new Set<string>()
    set.add(closure.date)
    days.closures.set(closure.vendorId, set)
  }
  for (const row of hours) {
    const byDay = days.hours.get(row.vendorId) ?? new Map<number, { isClosed: boolean }>()
    byDay.set(row.dayOfWeek, { isClosed: row.isClosed })
    days.hours.set(row.vendorId, byDay)
  }
  return days
}

async function loadLastJobs(userId: string, cars: HubCar[]): Promise<Map<string, LastJob>> {
  const jobs = await homeRepository.lastJobsByCar(userId, cars.map((car) => car.id))
  const services = await homeRepository.servicesOfBookings(jobs.map((job) => job.booking_id))
  return new Map(
    jobs.map((job) => [
      job.vehicle_id,
      {
        bookingId: job.booking_id,
        vehicleId: job.vehicle_id,
        vendorId: job.vendor_id,
        vendorName: job.vendor_name,
        garage: {
          active: job.vendor_active === true,
          verified: job.vendor_verified === true,
          pinned: job.vendor_pinned === true,
          dropinEnabled: job.vendor_dropin_enabled === true,
          doorstepEnabled: job.vendor_doorstep_enabled === true,
          pickupOffered: job.vendor_pickup_offered === true,
        },
        vendorPausedAt: job.vendor_paused_at === null ? null : new Date(job.vendor_paused_at),
        bookingType: job.booking_type,
        services: services
          .filter((service) => service.bookingId === job.booking_id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      },
    ])
  )
}

/** The paused garages behind the customer's Book again tiles. */
function pausedGaragesOf(lastJobs: Map<string, LastJob>): PausedGarage[] {
  return [...lastJobs.values()].flatMap((job) =>
    job.vendorPausedAt
      ? [{ vendorId: job.vendorId, vendorName: job.vendorName, pausedAt: job.vendorPausedAt }]
      : []
  )
}

/** The live notices this customer has not closed, split by audience. */
function splitNotices(notices: NoticeRow[]) {
  return {
    // The newest 'all' notice is pinned; an older one waits for it to end.
    pinned: notices.find((notice) => notice.audience === 'all') ?? null,
    bookingWindow: notices.filter((notice) => notice.audience === 'with_booking_between'),
  }
}

export const homeService = {
  /**
   * Everything the Home hub shows, in one read. `query.lat/lng` is the
   * customer's rounded location, when the app has it.
   */
  async getHome(userId: string, query: HomeQuery, now = new Date()): Promise<HomeResponse> {
    const user = await getActiveUser(userId)
    const origin =
      query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null

    const cars: HubCar[] = await homeRepository.listCars(userId)
    const bookings = await loadBookings(userId, now)

    const notices = (await part('notices', () => homeRepository.listLiveNotices(userId, now))) ?? []
    const { pinned, bookingWindow } = splitNotices(notices)
    const garageDays =
      (await part('garage_days', () => loadGarageDays(bookings, now))) ??
      { closures: new Map(), hours: new Map() }
    const lastWashAt = (await part('last_wash', () => homeRepository.lastWashByCar(userId))) ?? new Map()
    const lastJobs = (await part('last_jobs', () => loadLastJobs(userId, cars))) ?? new Map()

    const complaints = (await part('complaints', () => loadComplaints(userId, now))) ?? []
    const serviceReminders = (await part('service_reminders', () => loadServiceReminders(userId, now))) ?? []
    const slotAlerts = (await part('slot_alerts', () => loadSlotAlerts(userId, now))) ?? []
    const guaranteeClaims = (await part('guarantee_claims', () => loadGuaranteeClaims(userId, now))) ?? []
    const rewards = await part('rewards', () => loadRewards(userId, now))
    const seenAt = user.updatesSeenAt ?? user.createdAt

    const homeCars = buildCars({ cars, bookings, lastWashAt, lastJobs, notices: bookingWindow, now })
    const picked = pickActionCards(bookings, garageDays, now)
    const { mustAct } = picked
    // A complaint the team just resolved, then a service reminder coming
    // due, take the soft card's place only when it is free (lib/home-cards.ts).
    const softCard = softCardWithReminder(
      { mustAct, softCard: softCardWithComplaint(picked, complaints, seenAt, now) },
      serviceReminders
    )

    const offers = await part('offers', async () => {
      const targeting = env.homeOfferTargeting
      // Location is only used for offers while targeting is on.
      const rows = await homeRepository.listHomeOfferCandidates(userId, now, targeting ? origin : null)
      if (rows.length === 0) return []
      const held = await discountsRepository.countHeldMany(rows.map((row) => row.id), userId)
      const customer = targeting
        ? {
            bookedVendorIds: await homeRepository.bookedVendorIds(userId),
            washDue: homeCars.some((car) => isWashDue(car.wash)),
            carTypes: new Set(homeCars.map((car) => car.vehicleType)),
          }
        : undefined
      return rankOffers(rows, {
        now,
        targetingEnabled: targeting,
        hasCar: cars.length > 0,
        held,
        customer,
      }).map((row) => toHomeOffer(row, now))
    })

    const feed = deriveUpdates({
      bookings,
      notices: bookingWindow,
      pausedGarages: pausedGaragesOf(lastJobs),
      complaints,
      serviceReminders,
      slotAlerts,
      guaranteeClaims,
      rewards,
      seenAt,
      now,
    })
    // A row shown as the action card above is not repeated below it.
    const shownChargeId =
      mustAct?.kind === 'bill_due' || mustAct?.kind === 'extra_work_due' ? mustAct.chargeId : null
    const shownRow =
      softCard?.kind === 'complaint_resolved'
        ? `complaint_resolved:${softCard.complaintId}`
        : softCard?.kind === 'service_reminder'
          ? serviceReminderRowId({ id: softCard.reminderId }, softCard.dueOn)
          : mustAct?.kind === 'time_proposal'
          ? `proposal:${mustAct.proposalId}`
          : null
    const rows = feed.filter(
      (item) => !(shownChargeId && item.chargeId === shownChargeId) && item.id !== shownRow
    )

    const nearby = origin
      ? await part('nearby', async () => {
          const summary = await vendorsRepository.nearbySummary(origin, NEARBY_RADIUS_KM * 1000)
          return {
            count: summary.count,
            closestKm: summary.closestM === null ? null : Math.round(summary.closestM / 100) / 10,
            radiusKm: NEARBY_RADIUS_KM,
          }
        })
      : null

    return {
      now: now.toISOString(),
      header: {
        firstName: firstNameOf(user.name),
        avatarUrl: user.avatarUrl,
        hasUnread: hasUnread(feed, pinned, seenAt),
      },
      mustAct,
      offers,
      softCard,
      cars: homeCars,
      nextBooking: nextBookingWithoutCar({ cars, bookings, notices: bookingWindow }),
      updates: {
        pinnedNotice: pinned ? toNoticeView(pinned) : null,
        items: rows.slice(0, HOME_UPDATE_ROWS),
        total: rows.length,
      },
      nearby,
      tip: tipOfTheDay(now),
    }
  },

  /**
   * The Updates screen: what is waiting on the customer (To do), the pinned
   * notice, and the last 30 days newest first, with the read marker.
   * `now` is the server's clock: the app sends it back as POST
   * /updates/seen's `at`, so a phone running slow cannot leave the newest
   * rows unread.
   */
  async getUpdates(userId: string, now = new Date()) {
    const user = await getActiveUser(userId)
    const bookings = await loadBookings(userId, now)
    const notices = await homeRepository.listLiveNotices(userId, now)
    const { pinned, bookingWindow } = splitNotices(notices)
    const garageDays = await loadGarageDays(bookings, now)
    // The same feed Home's bell counts from, so the two always agree.
    const lastJobs = await loadLastJobs(userId, await homeRepository.listCars(userId))
    const complaints = await loadComplaints(userId, now)
    // Isolated like Home's parts: a reminder read that fails leaves Updates whole.
    const serviceReminders = (await part('service_reminders', () => loadServiceReminders(userId, now))) ?? []
    const slotAlerts = await loadSlotAlerts(userId, now)
    const guaranteeClaims = (await part('guarantee_claims', () => loadGuaranteeClaims(userId, now))) ?? []
    const rewards = await part('rewards', () => loadRewards(userId, now))
    const seenAt = user.updatesSeenAt ?? user.createdAt

    return {
      todo: pickActionCards(bookings, garageDays, now).todo,
      pinnedNotice: pinned
        ? { ...toNoticeView(pinned), unread: pinned.startsAt > seenAt }
        : null,
      items: deriveUpdates({
        bookings,
        notices: bookingWindow,
        pausedGarages: pausedGaragesOf(lastJobs),
        complaints,
        serviceReminders,
        slotAlerts,
        guaranteeClaims,
        rewards,
        seenAt,
        now,
      }),
      seenAt: seenAt.toISOString(),
      now: now.toISOString(),
    }
  },

  async markUpdatesSeen(userId: string, input: MarkUpdatesSeenInput) {
    await getActiveUser(userId)
    await homeRepository.markUpdatesSeen(userId, new Date(input.at))
  },

  /** × on a notice: hidden for this customer on every device. */
  async dismissNotice(userId: string, noticeId: string) {
    await getActiveUser(userId)
    if (!(await homeRepository.noticeExists(noticeId))) {
      throw new AppError(404, 'Notice not found', 'NOTICE_NOT_FOUND')
    }
    await homeRepository.dismissNotice(userId, noticeId)
    log.info({ userId, noticeId }, 'home:notice_dismissed')
  },

  /**
   * × on an offer: off this customer's Home for good. The code still works
   * if they type it at checkout.
   */
  async dismissOffer(userId: string, discountId: string) {
    await getActiveUser(userId)
    if (!(await homeRepository.offerExists(discountId))) {
      throw new AppError(404, 'Offer not found', 'OFFER_NOT_FOUND')
    }
    await homeRepository.dismissOffer(userId, discountId)
    log.info({ userId, discountId }, 'home:offer_dismissed')
  },
}
