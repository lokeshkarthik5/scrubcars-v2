import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { runInBackground } from '../../lib/background.js'
import {
  acceptRefusal,
  adminRequestFilter,
  beyondLine,
  clockStep,
  confirmByFor,
  firstGarageRefusal,
  linesDuration,
  linesForCategories,
  linesForPicks,
  linesSubtotal,
  needsNoReplyAlert,
  pickableDays,
  pickNextGarage,
  quickWindows,
  REQUEST_RULES,
  requestStartTimes,
  requestState,
  respondByFor,
  startsInWindow,
  windowBounds,
  windowLabel,
  windowOpen,
  windowShapeProblem,
  type AdminRequestFilter,
  type GarageDay,
  type RequestCandidate,
  type RequestLine,
  type RequestMode,
  type RequestState,
  type RequestWindow,
  type WindowPart,
} from '../../lib/booking-requests.js'
import { bookingCommission, FREE_BOOKINGS } from '../../lib/commission.js'
import type { ServiceCategory } from '../../lib/categories.js'
import {
  customerRequestAccepted,
  customerRequestCancelledByDetlio,
  customerRequestForwarded,
  customerRequestLapsed,
  customerRequestNoGarage,
  garageNewRequest,
  type PushRequest,
} from '../../lib/push-messages.js'
import { maskPhone } from '../../lib/rewards.js'
import { getDayOfWeekFromDate } from '../../lib/slots.js'
import { zoneFor } from '../../lib/zones.js'
import type { VehicleTier } from '../../lib/pricing.js'
import { pushService } from '../push/push.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import {
  bookingRequestsRepository,
  type BookingRequestRecord,
  type MeasuredGarage,
} from './booking-requests.repository.js'
import type { AcceptRequestInput, CreateRequestInput, WindowsQuery } from './booking-requests.validation.js'

const log = logger.child({ module: 'booking-requests' })

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** A sweep's bounded batch: the cron runs every 10 minutes. */
const SWEEP_LIMIT = 20
/** Garages read when passing a request on; the nearest of them is asked. */
const CANDIDATE_LIMIT = 10

// ─── Views ───────────────────────────────────────────────────────────────────

/** Where a request stands for the customer, from its latest row (lib/booking-requests.ts requestState). */
export type CustomerRequestState = RequestState

export interface CustomerRequestView {
  /** The latest row's id: what Cancel and Confirm & pay act on. */
  id: string
  /** The first row's id, the same through a pass-on. */
  rootId: string
  state: CustomerRequestState
  status: string
  bookingType: RequestMode
  garage: { id: string; name: string }
  /** Garages asked so far, first first, for "Tried 1 of 2". */
  tried: string[]
  maxGarages: number
  items: Array<{ serviceId: string; name: string; amount: string }>
  subtotal: string
  window: { date: string; part: WindowPart; label: string; start: string; end: string }
  vehicleId: string | null
  addressId: string | null
  createdAt: string
  respondBy: string
  travelFee: number | null
  acceptedStartAt: string | null
  confirmBy: string | null
  bookingId: string | null
}

export interface GarageRequestView {
  id: string
  status: string
  bookingType: RequestMode
  /** Passed on from another garage that couldn't. */
  passedOn: boolean
  items: Array<{ name: string; amount: string }>
  subtotal: string
  vehicleType: VehicleTier
  window: { date: string; part: WindowPart; label: string; start: string; end: string }
  /** The zone the customer is in, by name; null outside every zone. */
  area: string | null
  distanceKm: number
  coverKm: number | null
  outsideKm: number
  /** "3.9 km beyond your 5 km". */
  beyond: string
  respondBy: string
  /** What the garage earns before any travel fee: owner seat only, null for operators. */
  earn: number | null
  durationMins: number
  reply: 'accepted' | 'declined' | null
  travelFee: number | null
  acceptedStartAt: string | null
  confirmBy: string | null
  createdAt: string
}

/** A request on the admin Requests list (0064): one entry per request, by its latest row. */
export interface AdminRequestView {
  /** The latest row's id: what Cancel acts on. */
  id: string
  rootId: string
  state: RequestState
  /** Which of Open / Accepted / Failed it is under; null (All only) for a cancelled one. */
  filter: Exclude<AdminRequestFilter, 'all'> | null
  status: string
  bookingType: RequestMode
  /** The customer, with only the last four digits of their phone. */
  customer: { id: string; name: string | null; phone: string }
  /** The garage asked now (the latest row), with its business phone for "Call garage". */
  garage: { id: string; name: string; phone: string | null }
  /** Every garage asked, first first: "passed on from". */
  chain: Array<{
    id: string
    garage: { id: string; name: string }
    status: string
    reply: 'accepted' | 'declined' | null
    repliedAt: string | null
  }>
  zone: { slug: string; name: string } | null
  items: Array<{ name: string; amount: string }>
  subtotal: string
  window: { date: string; part: WindowPart; label: string; start: string; end: string }
  /** When the customer sent it (the first row). */
  createdAt: string
  /** When the garage asked now got it. */
  sentAt: string
  respondBy: string
  travelFee: number | null
  acceptedStartAt: string | null
  confirmBy: string | null
  bookingId: string | null
  closedAt: string | null
  /** Who cancelled: the customer, or the team (with the name and reason). */
  cancelledBy: 'customer' | 'detlio' | null
  cancelledByName: string | null
  cancelReason: string | null
}

/** The admin list's window: the last 30 days' requests (and any older one still open), newest first, at most 300. */
const ADMIN_LIST_DAYS = 30
const ADMIN_LIST_LIMIT = 300

type AdminRow = Awaited<ReturnType<typeof bookingRequestsRepository.listForAdmin>>[number]

function toAdminView(rows: AdminRow[], names: Map<string, string>, now: Date): AdminRequestView {
  const first = rows[0]!
  const last = rows[rows.length - 1]!
  const latest = last.request
  const state = requestState(latest)
  return {
    id: latest.id,
    rootId: first.request.id,
    state,
    filter: adminRequestFilter(state),
    status: latest.status,
    bookingType: latest.bookingType,
    customer: { id: latest.userId, name: first.customerName, phone: maskPhone(first.customerPhone) },
    garage: { id: latest.vendorId, name: last.garageName, phone: last.garagePhone },
    chain: rows.map((row) => ({
      id: row.request.id,
      garage: { id: row.request.vendorId, name: row.garageName },
      status: row.request.status,
      reply: row.request.reply,
      repliedAt: row.request.repliedAt?.toISOString() ?? null,
    })),
    zone: latest.zoneSlug ? { slug: latest.zoneSlug, name: names.get(latest.zoneSlug) ?? latest.zoneSlug } : null,
    items: latest.items.map((item) => ({ name: item.name, amount: item.amount })),
    subtotal: latest.subtotalAmount,
    window: windowOf(latest, now),
    createdAt: first.request.createdAt.toISOString(),
    sentAt: latest.createdAt.toISOString(),
    respondBy: latest.respondBy.toISOString(),
    travelFee: toNumber(latest.travelFee),
    acceptedStartAt: latest.acceptedStartAt?.toISOString() ?? null,
    confirmBy: latest.confirmBy?.toISOString() ?? null,
    bookingId: latest.bookingId,
    closedAt: latest.closedAt?.toISOString() ?? null,
    cancelledBy: latest.status !== 'cancelled' ? null : latest.cancelledByName ? 'detlio' : 'customer',
    cancelledByName: latest.cancelledByName,
    cancelReason: latest.cancelReason,
  }
}

function windowOf(row: BookingRequestRecord, now: Date) {
  const window: RequestWindow = { date: row.windowDate, part: row.windowPart }
  return {
    date: row.windowDate,
    part: row.windowPart,
    label: windowLabel(window, now),
    start: row.windowStart.toISOString(),
    end: row.windowEnd.toISOString(),
  }
}

function toPushRequest(row: BookingRequestRecord, now: Date): PushRequest {
  return {
    id: row.id,
    rootRequestId: row.rootRequestId,
    bookingType: row.bookingType,
    items: row.items.map((item) => ({ name: item.name })),
    windowLabel: windowLabel({ date: row.windowDate, part: row.windowPart }, now),
  }
}

// ─── Facts ───────────────────────────────────────────────────────────────────

/** A garage's day for the request rules: paused, a holiday or its hours. */
async function garageDayFor(garage: Pick<MeasuredGarage, 'vendorId' | 'bookingsPausedAt' | 'slotIntervalMins'>, date: string): Promise<GarageDay> {
  const { hours, holiday } = await bookingRequestsRepository.garageDay(garage.vendorId, date, getDayOfWeekFromDate(date))
  return {
    closed: garage.bookingsPausedAt !== null || holiday,
    hours,
    intervalMins: garage.slotIntervalMins,
  }
}

/** The last start a window still has at a garage, with the lead a new request needs. */
async function lastStartFor(
  garage: MeasuredGarage,
  window: RequestWindow,
  durationMins: number,
  earliest: Date
): Promise<Date | null> {
  const day = await garageDayFor(garage, window.date)
  const starts = startsInWindow(window, day, durationMins, earliest)
  return starts.length > 0 ? starts[starts.length - 1]! : null
}

async function zoneSlugFor(point: { lat: number; lng: number }): Promise<string | null> {
  const zones = await bookingRequestsRepository.listZones()
  return zoneFor(point, zones)?.slug ?? null
}

async function zoneNames(): Promise<Map<string, string>> {
  const zones = await bookingRequestsRepository.listZones()
  return new Map(zones.map((zone) => [zone.slug, zone.name]))
}

/**
 * What the garage earns on these lines, by the payout rules (free 25, then
 * commission). `received` is its received bookings so far
 * (countReceivedChains), read once per inbox rather than once per card.
 */
function earnFor(received: number, lines: readonly RequestLine[]): number {
  const subtotal = linesSubtotal(lines)
  if (received + 1 <= FREE_BOOKINGS) return Number(subtotal)
  const commission = bookingCommission({
    status: 'completed',
    noShow: null,
    paymentStatus: 'paid',
    paymentRefunded: null,
    amount: subtotal,
    subtotalAmount: subtotal,
    discountFundedBy: null,
    items: lines.map((line, index) => ({
      category: line.category as ServiceCategory,
      amount: line.amount,
      sortOrder: index,
    })),
    billsPaid: null,
  })
  return Math.round((Number(subtotal) - commission) * 100) / 100
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value)
}

/** `received`: the garage's received bookings so far, for the owner's `earn`; null for an operator (not read). */
function toGarageView(row: BookingRequestRecord, received: number | null, names: Map<string, string>, now: Date): GarageRequestView {
  const outsideKm = Number(row.outsideKm)
  const coverKm = toNumber(row.coverKm)
  return {
    id: row.id,
    status: row.status,
    bookingType: row.bookingType,
    passedOn: row.chainNo > 1,
    items: row.items.map((item) => ({ name: item.name, amount: item.amount })),
    subtotal: row.subtotalAmount,
    vehicleType: row.vehicleType,
    window: windowOf(row, now),
    area: row.zoneSlug ? (names.get(row.zoneSlug) ?? null) : null,
    distanceKm: Number(row.distanceKm),
    coverKm,
    outsideKm,
    beyond: beyondLine(outsideKm, coverKm),
    respondBy: row.respondBy.toISOString(),
    earn: received === null ? null : earnFor(received, row.items),
    durationMins: row.durationMins,
    reply: row.reply,
    travelFee: toNumber(row.travelFee),
    acceptedStartAt: row.acceptedStartAt?.toISOString() ?? null,
    confirmBy: row.confirmBy?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function toCustomerView(chain: BookingRequestRecord[], now: Date): Promise<CustomerRequestView> {
  const latest = chain[chain.length - 1]!
  const first = chain[0]!
  const names = await Promise.all(
    chain.map(async (row) => (await bookingRequestsRepository.garageName(row.vendorId)) ?? 'A garage')
  )
  return {
    id: latest.id,
    rootId: first.id,
    state: requestState(latest),
    status: latest.status,
    bookingType: latest.bookingType,
    garage: { id: latest.vendorId, name: names[names.length - 1]! },
    tried: names,
    maxGarages: REQUEST_RULES.maxGarages,
    items: latest.items.map((item) => ({ serviceId: item.serviceId, name: item.name, amount: item.amount })),
    subtotal: latest.subtotalAmount,
    window: windowOf(latest, now),
    vehicleId: latest.vehicleId,
    addressId: latest.addressId,
    createdAt: first.createdAt.toISOString(),
    respondBy: latest.respondBy.toISOString(),
    travelFee: toNumber(latest.travelFee),
    acceptedStartAt: latest.acceptedStartAt?.toISOString() ?? null,
    confirmBy: latest.confirmBy?.toISOString() ?? null,
    bookingId: latest.bookingId,
  }
}

function notFound(): never {
  throw new AppError(404, 'Request not found', 'REQUEST_NOT_FOUND')
}

const REFUSALS: Record<string, { status: 400 | 404 | 409; message: string }> = {
  GARAGE_NOT_LISTED: { status: 404, message: "This garage isn't taking requests right now." },
  MODE_NOT_OFFERED: { status: 409, message: "This garage doesn't offer that." },
  GARAGE_COVERS_YOU: { status: 409, message: 'This garage already comes to your address. Book a time with it directly.' },
  TOO_FAR: { status: 409, message: 'This garage is too far from your address to ask.' },
  SERVICES_NOT_OFFERED: { status: 409, message: "One of the services isn't priced for your car at this garage." },
  WINDOW_NOT_OPEN: { status: 409, message: "The garage can't fit that window. Pick another." },
}

// ─── The service ─────────────────────────────────────────────────────────────

export const bookingRequestsService = {
  /**
   * The windows a garage can be asked for, for a job this long (public: the
   * sheet shows them before sign-in). Today evening and tomorrow's two, then
   * the next two weeks' mornings and afternoons, each open or not by the
   * garage's hours, holidays and pause.
   */
  async windows(query: WindowsQuery, now = new Date()) {
    const measured = await bookingRequestsRepository.garageFacts(query.vendorId, query.mode)
    if (!measured || !measured.listed || !measured.offersMode) notFound()
    const days = pickableDays(now)
    const [hours, closures] = [
      await bookingRequestsRepository.listHours(query.vendorId),
      new Set(await bookingRequestsRepository.listClosureDates(query.vendorId, days[0]!, days[days.length - 1]!)),
    ]
    const dayFor = (date: string): GarageDay => ({
      closed: measured.bookingsPausedAt !== null || closures.has(date),
      hours: hours.find((h) => h.dayOfWeek === getDayOfWeekFromDate(date)) ?? null,
      intervalMins: measured.slotIntervalMins,
    })
    const open = (window: RequestWindow) => windowOpen(window, dayFor(window.date), query.durationMins, now)
    return {
      quick: quickWindows(now).map((window) => ({ ...window, label: windowLabel(window, now), open: open(window) })),
      days: days.map((date) => ({
        date,
        morning: open({ date, part: 'morning' }),
        afternoon: open({ date, part: 'afternoon' }),
      })),
      respondMinutes: REQUEST_RULES.respondMinutes,
      confirmMinutes: REQUEST_RULES.confirmMinutes,
    }
  },

  /**
   * A customer asks a garage just outside its reach to come. Their own car
   * and pinned address; the garage listed, offering the mode, not covering
   * them and within 15 km past its reach; every service theirs to sell for
   * this car; the window open there. At most two open requests (409
   * REQUEST_LIMIT, counted under the customer's lock).
   */
  async create(userId: string, input: CreateRequestInput, now = new Date()): Promise<CustomerRequestView> {
    const window: RequestWindow = input.window
    const shape = windowShapeProblem(window, now)
    if (shape) throw new AppError(400, shape, 'REQUEST_WINDOW_INVALID')

    const vehicle = await bookingRequestsRepository.findVehicle(userId, input.vehicleId)
    if (!vehicle) throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
    const address = await bookingRequestsRepository.findAddress(userId, input.addressId)
    if (!address) throw new AppError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
    if (address.lat === null || address.lng === null) {
      throw new AppError(422, 'Confirm exactly where your car is on the map', 'ADDRESS_LOCATION_REQUIRED')
    }
    const point = { lat: address.lat, lng: address.lng }

    const garage = await bookingRequestsRepository.measureGarage(input.vendorId, input.bookingType, point)
    if (!garage) throw new AppError(404, "This garage isn't taking requests right now.", 'GARAGE_NOT_LISTED')
    const services = await bookingRequestsRepository.listGarageServices([garage.vendorId])
    const vehicleType = vehicle.vehicleType as VehicleTier
    const lines = linesForPicks(input.serviceIds, services, vehicleType)
    const durationMins = lines ? linesDuration(lines) : 0
    const earliest = new Date(now.getTime() + REQUEST_RULES.windowLeadMinutes * MINUTE_MS)
    const lastStart = lines ? await lastStartFor(garage, window, durationMins, earliest) : null
    const outsideKm = garage.covers ? 0 : Math.max(0.1, garage.outsideM / 1000)
    const refusal = firstGarageRefusal({
      vendorId: garage.vendorId,
      listed: garage.listed,
      offersMode: garage.offersMode,
      distanceKm: garage.distanceM / 1000,
      outsideKm,
      lines,
      lastStart,
    })
    if (refusal) {
      const known = REFUSALS[refusal]!
      throw new AppError(known.status, known.message, refusal === 'GARAGE_COVERS_YOU' ? 'REQUEST_NOT_NEEDED' : `REQUEST_${refusal}`)
    }
    const respondBy = respondByFor(now, lastStart)
    if (!respondBy || !lines) {
      throw new AppError(409, "The garage can't fit that window. Pick another.", 'REQUEST_WINDOW_NOT_OPEN')
    }

    const bounds = windowBounds(window)
    const row = await bookingRequestsRepository.createFirst(
      {
        userId,
        vendorId: garage.vendorId,
        bookingType: input.bookingType,
        vehicleId: vehicle.id,
        vehicleType,
        addressId: address.id,
        lat: point.lat,
        lng: point.lng,
        zoneSlug: await zoneSlugFor(point),
        distanceKm: (Math.round(garage.distanceM / 100) / 10).toFixed(1),
        coverKm: garage.coverKm === null ? null : garage.coverKm.toFixed(1),
        outsideKm: (Math.round(outsideKm * 10) / 10).toFixed(1),
        items: lines,
        subtotalAmount: linesSubtotal(lines),
        durationMins,
        windowDate: window.date,
        windowPart: window.part,
        windowStart: bounds.start,
        windowEnd: bounds.end,
        respondBy,
      },
      REQUEST_RULES.maxOpenPerCustomer
    )
    if (!row) {
      throw new AppError(
        409,
        `You can have ${REQUEST_RULES.maxOpenPerCustomer} requests open at once. Cancel one, or wait for an answer.`,
        'REQUEST_LIMIT'
      )
    }
    log.info({ requestId: row.id, userId, vendorId: row.vendorId, mode: row.bookingType }, 'booking_request:created')
    tellGarageOfNew(row, false, now)
    return toCustomerView([row], now)
  },

  /** The customer's requests: one entry per request (its latest garage), open first. */
  async listForCustomer(userId: string, now = new Date()): Promise<CustomerRequestView[]> {
    const rows = await bookingRequestsRepository.listForCustomer(userId, new Date(now.getTime() - 7 * DAY_MS))
    const byRoot = new Map<string, BookingRequestRecord[]>()
    for (const row of rows) {
      const root = row.rootRequestId ?? row.id
      byRoot.set(root, [...(byRoot.get(root) ?? []), row])
    }
    const views: CustomerRequestView[] = []
    for (const [root, known] of byRoot) {
      // The chain as stored (a row older than the week may be missing above).
      const chain = known.length > 1 || known[0]!.chainNo > 1 ? await bookingRequestsRepository.listChain(root) : known
      const latest = chain[chain.length - 1]!
      // Only a request's latest garage counts: an earlier row passed on is history.
      if (latest.status === 'forwarded') continue
      views.push(await toCustomerView(chain, now))
    }
    const rank = (view: CustomerRequestView) => (view.state === 'accepted' ? 0 : view.state === 'waiting' ? 1 : 2)
    return views.sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt))
  },

  /** One of the customer's requests, by any of its rows' ids. Anyone else's: 404. */
  async getForCustomer(userId: string, id: string, now = new Date()): Promise<CustomerRequestView> {
    const row = await bookingRequestsRepository.findById(id)
    if (!row || row.userId !== userId) notFound()
    const chain = await bookingRequestsRepository.listChain(row.rootRequestId ?? row.id)
    return toCustomerView(chain, now)
  },

  /** The customer's cancel: the request's open row, theirs. 409 once it is not open. */
  async cancel(userId: string, id: string, now = new Date()): Promise<CustomerRequestView> {
    const row = await bookingRequestsRepository.findById(id)
    if (!row || row.userId !== userId) notFound()
    const cancelled = await bookingRequestsRepository.cancel(id, userId, now)
    if (!cancelled) throw new AppError(409, 'This request has already moved on. Pull to refresh.', 'REQUEST_STATE_CHANGED')
    log.info({ requestId: id, userId }, 'booking_request:cancelled')
    const chain = await bookingRequestsRepository.listChain(cancelled.rootRequestId ?? cancelled.id)
    return toCustomerView(chain, now)
  },

  // ─── Admin (0064) ────────────────────────────────────────────────────────

  /**
   * The admin Requests list: one entry per request, newest first, the last
   * 30 days' and any older one still open; `zoneSlug` keeps one zone's.
   * `counts` are each filter's, in that zone when one is given.
   */
  async listForAdmin(query: { filter: AdminRequestFilter; zoneSlug?: string }, now = new Date()) {
    const rows = await bookingRequestsRepository.listForAdmin(new Date(now.getTime() - ADMIN_LIST_DAYS * DAY_MS), ADMIN_LIST_LIMIT)
    const byRoot = new Map<string, AdminRow[]>()
    for (const row of rows) {
      const root = row.request.rootRequestId ?? row.request.id
      byRoot.set(root, [...(byRoot.get(root) ?? []), row])
    }
    const names = await zoneNames()
    const views = [...byRoot.values()]
      .map((chain) => toAdminView(chain.sort((a, b) => a.request.chainNo - b.request.chainNo), names, now))
      .filter((view) => !query.zoneSlug || view.zone?.slug === query.zoneSlug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const counts = { open: 0, accepted: 0, failed: 0, all: views.length }
    for (const view of views) if (view.filter) counts[view.filter]++
    return {
      items: query.filter === 'all' ? views : views.filter((view) => view.filter === query.filter),
      counts,
      zone: query.zoneSlug ? { slug: query.zoneSlug, name: names.get(query.zoneSlug) ?? query.zoneSlug } : null,
      days: ADMIN_LIST_DAYS,
    }
  },

  /**
   * The team cancels an open request (waiting, or accepted and not being
   * paid for right now), with a reason the team keeps. The customer is told
   * the way an expiry is (a push, then `customer_told_at`); nothing was
   * paid. 409 REQUEST_CHECKOUT_OPEN while the customer is paying for it,
   * REQUEST_STATE_CHANGED once it is not open.
   */
  async cancelByAdmin(
    id: string,
    input: { reason: string; actorName: string; actorSub: string },
    now = new Date()
  ): Promise<{ id: string; status: 'cancelled' }> {
    const row = await bookingRequestsRepository.findById(id)
    if (!row) notFound()
    const cancelled = await bookingRequestsRepository.cancelByAdmin({
      id,
      actorName: input.actorName,
      actorSub: input.actorSub,
      reason: input.reason,
      now,
    })
    if (!cancelled) {
      if (row.status === 'accepted' && (await bookingRequestsRepository.hasOpenCheckout(id, now))) {
        throw new AppError(409, 'The customer is paying for this right now. Try again in a few minutes.', 'REQUEST_CHECKOUT_OPEN')
      }
      throw new AppError(409, 'This request has already moved on. Reload to see where it is.', 'REQUEST_STATE_CHANGED')
    }
    log.info({ requestId: id, vendorId: cancelled.vendorId }, 'booking_request:cancelled_by_admin')
    runInBackground('booking_request:told', async () => {
      const garage = (await bookingRequestsRepository.garageName(cancelled.vendorId)) ?? 'the garage'
      pushService.notifyCustomer(cancelled.userId, customerRequestCancelledByDetlio(toPushRequest(cancelled, now), garage))
      await bookingRequestsRepository.markCustomerTold(cancelled.id, new Date())
    })
    return { id: cancelled.id, status: 'cancelled' as const }
  },

  // ─── The garage ──────────────────────────────────────────────────────────

  /** The garage's inbox: waiting and accepted ones, or the last month's others. */
  async listForGarage(vendorId: string, isOwner: boolean, scope: 'open' | 'closed', now = new Date()) {
    const rows = await bookingRequestsRepository.listForGarage(vendorId, scope, new Date(now.getTime() - 30 * DAY_MS))
    const names = await zoneNames()
    // One read for every card's `earn` (owner seat only), not one per card.
    const received = isOwner && rows.length > 0 ? await bookingRequestsRepository.countReceivedChains(vendorId) : null
    const items = rows.map((row) => toGarageView(row, received, names, now))
    return {
      items,
      waiting: await bookingRequestsRepository.countWaitingForGarage(vendorId, now),
      travelFees: REQUEST_RULES.travelFees,
    }
  },

  /** Requests waiting for this garage's answer: the portal's badge. */
  async waitingCount(vendorId: string, now = new Date()) {
    return { waiting: await bookingRequestsRepository.countWaitingForGarage(vendorId, now) }
  },

  /** The start times the garage may pick for a yes (its free slots in the window). */
  async startTimes(vendorId: string, id: string, now = new Date()) {
    const row = await bookingRequestsRepository.findById(id)
    if (!row || row.vendorId !== vendorId) notFound()
    return { starts: (await startTimesFor(row, now)).map((at) => at.toISOString()) }
  },

  /** The garage's yes, with a start time from its list and a travel fee. */
  async accept(vendorId: string, actorUserId: string, id: string, input: AcceptRequestInput, isOwner = false, now = new Date()) {
    const row = await bookingRequestsRepository.findById(id)
    if (!row || row.vendorId !== vendorId) notFound()
    const startAt = new Date(input.startAt)
    const starts = row.status === 'pending' ? await startTimesFor(row, now) : []
    const refusal = acceptRefusal({
      status: row.status,
      respondBy: row.respondBy,
      travelFee: input.travelFee,
      startAt,
      starts,
      now,
    })
    if (refusal === 'REQUEST_NOT_WAITING') {
      throw new AppError(409, 'This request has already been answered or passed on.', 'REQUEST_STATE_CHANGED')
    }
    if (refusal === 'REQUEST_TIME_PASSED') {
      throw new AppError(409, 'The time to answer this request has passed.', 'REQUEST_TIME_PASSED')
    }
    if (refusal === 'TRAVEL_FEE_INVALID') throw new AppError(400, 'Pick a travel fee of ₹0, ₹100 or ₹200.', 'TRAVEL_FEE_INVALID')
    if (refusal === 'START_NOT_OFFERED') {
      throw new AppError(409, 'That start time is no longer free. Pick another.', 'REQUEST_START_NOT_FREE')
    }

    const accepted = await bookingRequestsRepository.accept({
      id,
      vendorId,
      userId: actorUserId,
      travelFee: input.travelFee.toFixed(2),
      startAt,
      confirmBy: confirmByFor(now, startAt),
      now,
    })
    if (!accepted) throw new AppError(409, 'This request has already been answered or passed on.', 'REQUEST_STATE_CHANGED')
    log.info({ requestId: id, vendorId, travelFee: input.travelFee }, 'booking_request:accepted')

    const garage = (await bookingRequestsRepository.garageName(vendorId)) ?? 'The garage'
    pushService.notifyCustomer(
      accepted.userId,
      customerRequestAccepted(toPushRequest(accepted, now), garage, startAt, accepted.confirmBy!, now)
    )
    // `earn` is money: the owner seat's alone (an operator's answer has none).
    const received = isOwner ? await bookingRequestsRepository.countReceivedChains(vendorId) : null
    return toGarageView(accepted, received, await zoneNames(), now)
  },

  /** The garage's "Can't": passed on to the next nearest garage, or ended. */
  async decline(vendorId: string, actorUserId: string, id: string, now = new Date()) {
    const row = await bookingRequestsRepository.findById(id)
    if (!row || row.vendorId !== vendorId) notFound()
    if (row.status !== 'pending') {
      throw new AppError(409, 'This request has already been answered or passed on.', 'REQUEST_STATE_CHANGED')
    }
    const outcome = await moveOn(row, { kind: 'declined', by: actorUserId }, now)
    if (outcome === 'state_changed') {
      throw new AppError(409, 'This request has already been answered or passed on.', 'REQUEST_STATE_CHANGED')
    }
    log.info({ requestId: id, vendorId, outcome }, 'booking_request:declined')
    return { outcome }
  },

  // ─── The cron (pending-digest, every 10 minutes) ─────────────────────────

  /**
   * One run: the 30-minute "no answer" alerts, then waiting requests whose
   * garage ran out of time (passed on or ended), then yeses the customer did
   * not confirm in time (expired, and told). Bounded batches; a failing
   * request is logged and the rest go on.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const summary = { alerted: 0, passedOn: 0, ended: 0, lapsed: 0, failed: 0 }
    const alerts = await bookingRequestsRepository.listNeedingAlert(
      new Date(now.getTime() - REQUEST_RULES.alertAfterMinutes * MINUTE_MS),
      SWEEP_LIMIT
    )
    const waiting = await bookingRequestsRepository.listWaitingPastDeadline(now, SWEEP_LIMIT)
    const accepted = await bookingRequestsRepository.listAcceptedPastDeadline(now, SWEEP_LIMIT)
    if (options.dryRun) {
      return { ...summary, alerted: alerts.length, passedOn: waiting.length, lapsed: accepted.length, dryRun: true }
    }

    for (const row of alerts) {
      if (!needsNoReplyAlert(row, now)) continue
      try {
        if (await bookingRequestsRepository.claimNoReplyAlert(row.id, now)) {
          summary.alerted++
          alertOps(async () => {
            const vendor = await vendorsRepository.findVendorById(row.vendorId)
            return {
              kind: 'request_no_reply',
              requestId: row.id,
              garageName: vendor?.businessName ?? 'A garage',
              garagePhone: vendor?.phone ?? null,
              bookingType: row.bookingType,
              services: row.items.map((item) => item.name),
              windowLabel: windowLabel({ date: row.windowDate, part: row.windowPart }, now),
              respondBy: row.respondBy,
            }
          })
        }
      } catch (err) {
        summary.failed++
        log.error({ err, requestId: row.id }, 'booking_request:alert_failed')
      }
    }

    for (const row of waiting) {
      if (clockStep(row, now) !== 'expire_waiting') continue
      try {
        const outcome = await moveOn(row, { kind: 'expired' }, now)
        if (outcome === 'passed_on') summary.passedOn++
        else if (outcome === 'ended') summary.ended++
      } catch (err) {
        summary.failed++
        log.error({ err, requestId: row.id }, 'booking_request:expire_failed')
      }
    }

    for (const row of accepted) {
      if (clockStep(row, now) !== 'expire_accepted') continue
      try {
        const lapsed = await bookingRequestsRepository.expireAccepted(row.id, now)
        if (!lapsed) continue
        summary.lapsed++
        const garage = (await bookingRequestsRepository.garageName(row.vendorId)) ?? 'The garage'
        pushService.notifyCustomer(row.userId, customerRequestLapsed(toPushRequest(row, now), garage))
      } catch (err) {
        summary.failed++
        log.error({ err, requestId: row.id }, 'booking_request:lapse_failed')
      }
    }
    if (summary.alerted + summary.passedOn + summary.ended + summary.lapsed > 0) {
      log.info(summary, 'booking_request:sweep')
    }
    return summary
  },
}

/** The garage's free start times in a request's window, now. */
async function startTimesFor(row: BookingRequestRecord, now: Date): Promise<Date[]> {
  const vendor = await vendorsRepository.findVendorById(row.vendorId)
  if (!vendor) return []
  const day = await garageDayFor(
    { vendorId: row.vendorId, bookingsPausedAt: vendor.bookingsPausedAt, slotIntervalMins: vendor.slotIntervalMins },
    row.windowDate
  )
  return requestStartTimes({
    window: { date: row.windowDate, part: row.windowPart },
    day,
    durationMins: row.durationMins,
    busy: await bookingRequestsRepository.capacityHolders(row.vendorId, row.windowDate),
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
    now,
  })
}

/** Push and Telegram for a request a garage has just been given. */
function tellGarageOfNew(row: BookingRequestRecord, forwarded: boolean, now: Date) {
  const beyond = beyondLine(Number(row.outsideKm), toNumber(row.coverKm))
  const push = toPushRequest(row, now)
  pushService.notifyGarage(row.vendorId, garageNewRequest(push, beyond, row.respondBy, now))
  alertOps(async () => ({
    kind: 'request_received',
    requestId: row.id,
    garageName: (await bookingRequestsRepository.garageName(row.vendorId)) ?? 'A garage',
    bookingType: row.bookingType,
    services: row.items.map((item) => item.name),
    windowLabel: push.windowLabel,
    beyond,
    respondBy: row.respondBy,
    forwarded,
  }))
}

/**
 * A waiting request the garage declined, or whose time ran out: passed to
 * the next nearest garage that can take it (at most two garages a request),
 * or ended, and the customer told either way. 'state_changed' when the row
 * was no longer waiting (answered, cancelled or swept meanwhile).
 */
async function moveOn(
  row: BookingRequestRecord,
  how: { kind: 'declined'; by: string } | { kind: 'expired' },
  now: Date
): Promise<'passed_on' | 'ended' | 'state_changed'> {
  const rootId = row.rootRequestId ?? row.id
  const chain = await bookingRequestsRepository.listChain(rootId)
  const tried = new Set(chain.map((r) => r.vendorId))
  const onlyIfPastDeadline = how.kind === 'expired'

  let next: { candidate: RequestCandidate; garage: MeasuredGarage; respondBy: Date } | null = null
  if (chain.length < REQUEST_RULES.maxGarages) {
    const point = { lat: row.lat, lng: row.lng }
    const window: RequestWindow = { date: row.windowDate, part: row.windowPart }
    const garages = await bookingRequestsRepository.listCandidates({
      mode: row.bookingType,
      point,
      justOutsideKm: REQUEST_RULES.justOutsideKm,
      exclude: [...tried],
      limit: CANDIDATE_LIMIT,
    })
    const services = await bookingRequestsRepository.listGarageServices(garages.map((g) => g.vendorId))
    const categories = row.items.map((item) => item.category)
    const candidates: Array<{ candidate: RequestCandidate; garage: MeasuredGarage }> = []
    for (const garage of garages) {
      const lines = linesForCategories(
        categories,
        services.filter((s) => s.vendorId === garage.vendorId),
        row.vehicleType
      )
      const lastStart = lines
        ? await lastStartFor(garage, window, linesDuration(lines), new Date(now.getTime() + REQUEST_RULES.startNoticeMinutes * MINUTE_MS))
        : null
      candidates.push({
        garage,
        candidate: {
          vendorId: garage.vendorId,
          listed: garage.listed,
          offersMode: garage.offersMode,
          distanceKm: garage.distanceM / 1000,
          outsideKm: garage.covers ? 0 : garage.outsideM / 1000,
          lines,
          // A pass-on needs time for this garage to answer too.
          lastStart: lastStart && respondByFor(now, lastStart) ? lastStart : null,
        },
      })
    }
    const picked = pickNextGarage(
      candidates.map((c) => c.candidate),
      tried,
      chain.length
    )
    const match = picked ? candidates.find((c) => c.candidate.vendorId === picked.vendorId) : null
    if (match && picked?.lastStart) {
      next = { candidate: picked, garage: match.garage, respondBy: respondByFor(now, picked.lastStart)! }
    }
  }

  if (next && next.candidate.lines) {
    const lines = next.candidate.lines
    const outsideKm = Math.max(0, next.candidate.outsideKm)
    const moved = await bookingRequestsRepository.forward({
      fromId: row.id,
      from: how.kind === 'declined' ? { status: 'declined_now', repliedBy: how.by } : { status: 'pending' },
      onlyIfPastDeadline,
      now,
      next: {
        userId: row.userId,
        vendorId: next.garage.vendorId,
        rootRequestId: rootId,
        forwardedFromId: row.id,
        chainNo: chain.length + 1,
        bookingType: row.bookingType,
        vehicleId: row.vehicleId,
        vehicleType: row.vehicleType,
        addressId: row.addressId,
        lat: row.lat,
        lng: row.lng,
        zoneSlug: row.zoneSlug,
        distanceKm: (Math.round(next.garage.distanceM / 100) / 10).toFixed(1),
        coverKm: next.garage.coverKm === null ? null : next.garage.coverKm.toFixed(1),
        outsideKm: (Math.round(outsideKm * 10) / 10).toFixed(1),
        items: lines,
        subtotalAmount: linesSubtotal(lines),
        durationMins: linesDuration(lines),
        windowDate: row.windowDate,
        windowPart: row.windowPart,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
        respondBy: next.respondBy,
      },
    })
    if (!moved) return 'state_changed'
    log.info({ requestId: row.id, nextId: moved.next.id, vendorId: moved.next.vendorId }, 'booking_request:passed_on')
    tellGarageOfNew(moved.next, true, now)
    const [from, to] = [
      (await bookingRequestsRepository.garageName(row.vendorId)) ?? 'The garage',
      next.garage.businessName,
    ]
    pushService.notifyCustomer(row.userId, customerRequestForwarded(toPushRequest(moved.next, now), from, to))
    return 'passed_on'
  }

  const ended = await bookingRequestsRepository.closeWaiting({
    id: row.id,
    status: how.kind === 'declined' ? 'declined' : 'expired',
    reply: how.kind === 'declined' ? 'declined' : null,
    repliedBy: how.kind === 'declined' ? how.by : null,
    now,
    onlyIfPastDeadline,
  })
  if (!ended) return 'state_changed'
  runInBackground('booking_request:told', async () => {
    pushService.notifyCustomer(ended.userId, customerRequestNoGarage(toPushRequest(ended, now)))
    await bookingRequestsRepository.markCustomerTold(ended.id, new Date())
  })
  return 'ended'
}
