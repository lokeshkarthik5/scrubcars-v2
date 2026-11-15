import { AiUnavailableError, documentClientFor, type DocumentClient, type DocumentFile } from '../../lib/ai.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  createRepairMediaUpload,
  repairMediaLink,
  repairMediaOwner,
  repairMediaStorageOn,
} from '../../lib/job-photo-storage.js'
import { logger } from '../../lib/logger.js'
import { nextFreeTimes, nextFreeWindow, type NextFree } from '../../lib/next-free.js'
import { customerRepairQuoteAnswered, garageNewRepairQuote } from '../../lib/push-messages.js'
import { garageRating } from '../../lib/ratings.js'
import {
  BRIEF_INSTRUCTIONS,
  BRIEF_JSON_SCHEMA,
  FAKE_BRIEF_READING,
  briefFromReading,
  briefPrompt,
  parseBriefReading,
  type RepairBrief,
} from '../../lib/repair-quote-brief.js'
import {
  REPAIR_QUOTE_RULES,
  REPAIR_VIDEO_TYPES,
  adminQuoteFilter,
  answerRefusal,
  billsMatchQuotes,
  bookRefusal,
  garageAnswerBy,
  isOwnRepairMediaKey,
  quoteState,
  requestClosesAt,
  requestState,
  requestTitle,
  type AdminQuoteFilter,
  type QuoteState,
  type RequestState,
} from '../../lib/repair-quotes.js'
import { maskPhone } from '../../lib/rewards.js'
import { effectiveDurationMins } from '../../lib/service-duration.js'
import { zoneFor } from '../../lib/zones.js'
import { bookingIntentsService } from '../booking-intents/booking-intents.service.js'
import { createBookingIntentSchema } from '../booking-intents/booking-intents.validation.js'
import { bookingRequestsRepository } from '../booking-requests/booking-requests.repository.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { pushService } from '../push/push.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { repairQuotesRepository as repo, type QuoteRow, type QuoteWithGarage, type RequestRow } from './repair-quotes.repository.js'
import type { AdminListQuery, AnswerInput, BriefInput, CreateRequestInput, UploadUrlInput } from './repair-quotes.validation.js'

const log = logger.child({ module: 'repair-quotes' })

const R = REPAIR_QUOTE_RULES
const DAY_MS = 24 * 60 * 60 * 1000
/** What the lists show: the last 30 days (and anything older still open). */
const LIST_DAYS = 30
const CUSTOMER_LIST_LIMIT = 20
const GARAGE_LIST_LIMIT = 100
const ADMIN_LIST_LIMIT = 300
const MAX_OUTPUT_TOKENS = 4_000

let reader: DocumentClient | null | undefined

/** The vision reader the config allows (OPENAI_API_KEY, or AI_FAKE), or null when AI is off. */
function documentClient(): DocumentClient | null {
  if (reader === undefined) {
    reader = documentClientFor({
      apiKey: env.openaiApiKey,
      model: env.aiVisionModel,
      fake: env.aiFake,
      fakeAnswer: JSON.stringify(FAKE_BRIEF_READING),
    })
  }
  return reader
}

/** Tests only: a stand-in reader (null puts back the env's). */
export function setBriefReaderForTests(client: DocumentClient | null | undefined) {
  reader = client
}

const notFound = () => new AppError(404, 'Request not found', 'REPAIR_QUOTE_NOT_FOUND')

/** The first bytes each picture type starts with: a broken or renamed file is refused before OpenAI. */
function looksLikeImage(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  return bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP'
}

const EXT_BY_IMAGE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const isVideoKey = (key: string) => Object.values(REPAIR_VIDEO_TYPES).some((ext) => key.endsWith(`.${ext}`))
const isImageKey = (key: string) => Object.values(EXT_BY_IMAGE).some((ext) => key.endsWith(`.${ext}`))

// ─── Views ───────────────────────────────────────────────────────────────────

function mediaView(request: RequestRow, now: number) {
  return {
    video: request.videoKey ? { url: repairMediaLink(request.videoKey, now), secs: request.videoSecs } : null,
    photos: request.photos.map((photo) => ({ url: repairMediaLink(photo.key, now), kind: photo.kind })),
  }
}

function briefView(request: RequestRow) {
  return {
    text: request.brief,
    area: request.damageArea,
    damage: request.damageLabel,
    box: request.box,
    source: request.briefSource,
  }
}

function customerQuoteView(entry: QuoteWithGarage, state: RequestState, now: Date, badges: Map<string, boolean>) {
  const { quote, garage } = entry
  const rating = garageRating({ average: garage.ratingAverage, count: garage.ratingCount })
  const status = quoteState(quote, state, now)
  return {
    id: quote.id,
    garage: { id: garage.id, name: garage.name, rating: rating.rating, reviewCount: rating.reviewCount, isNew: rating.isNew },
    distanceKm: Number(quote.distanceKm),
    state: status,
    respondBy: quote.respondBy.toISOString(),
    priceFrom: quote.priceFrom,
    priceTo: quote.priceTo,
    days: quote.days,
    needsInspection: quote.needsInspection,
    note: quote.note,
    declineReason: quote.declineReason,
    billsMatchQuotes: badges.get(quote.vendorId) === true,
    bookingId: quote.bookingId,
  }
}

/** The answer-by ring's time: the latest any garage still in time has to answer. */
function answerBy(quotes: QuoteRow[], state: RequestState, now: Date): string | null {
  const waiting = quotes.filter((quote) => quoteState(quote, state, now) === 'waiting')
  if (waiting.length === 0) return null
  return new Date(Math.max(...waiting.map((quote) => quote.respondBy.getTime()))).toISOString()
}

async function badgesFor(vendorIds: string[]): Promise<Map<string, boolean>> {
  const jobs = await repo.badgeJobs(Array.from(new Set(vendorIds)))
  const out = new Map<string, boolean>()
  for (const id of new Set(vendorIds)) {
    out.set(id, billsMatchQuotes(jobs.filter((job) => job.vendorId === id)).badge)
  }
  return out
}

async function customerViews(requests: RequestRow[], now: Date) {
  const quotes = await repo.quotesFor(requests.map((request) => request.id))
  const badges = await badgesFor(quotes.map((entry) => entry.quote.vendorId))
  return requests.map((request) => {
    const state = requestState(request, now)
    const mine = quotes.filter((entry) => entry.quote.requestId === request.id)
    const booked = mine.find((entry) => entry.quote.id === request.bookedQuoteId)
    return {
      id: request.id,
      state,
      vehicle: { id: request.vehicleId, label: request.vehicleLabel, type: request.vehicleType },
      area: request.area,
      title: requestTitle(request),
      note: request.note,
      brief: briefView(request),
      ...mediaView(request, now.getTime()),
      createdAt: request.createdAt.toISOString(),
      closesAt: request.closesAt.toISOString(),
      answerBy: answerBy(
        mine.map((entry) => entry.quote),
        state,
        now
      ),
      answerWindowMins: R.answerMinutes,
      sentTo: mine.length,
      quotes: mine.map((entry) => customerQuoteView(entry, state, now, badges)),
      bookingId: booked?.quote.bookingId ?? null,
    }
  })
}

export type CustomerRepairRequest = Awaited<ReturnType<typeof customerViews>>[number]

function garageView(quote: QuoteRow, request: RequestRow, now: Date) {
  const state = requestState(request, now)
  return {
    id: quote.id,
    state: quoteState(quote, state, now),
    requestState: state,
    title: requestTitle(request),
    vehicle: { label: request.vehicleLabel, type: request.vehicleType },
    area: request.area,
    distanceKm: Number(quote.distanceKm),
    note: request.note,
    brief: briefView(request),
    ...mediaView(request, now.getTime()),
    createdAt: quote.createdAt.toISOString(),
    respondBy: quote.respondBy.toISOString(),
    answerWindowMins: R.answerMinutes,
    priceFrom: quote.priceFrom,
    priceTo: quote.priceTo,
    days: quote.days,
    needsInspection: quote.needsInspection,
    answerNote: quote.note,
    declineReason: quote.declineReason,
    answeredAt: quote.answeredAt?.toISOString() ?? null,
    // Booked from this garage's quote: the visit is on its Bookings page,
    // where the customer's phone shows in the usual contact window.
    bookingId: quote.bookingId,
  }
}

export type GarageRepairQuote = ReturnType<typeof garageView>

// ─── The service ─────────────────────────────────────────────────────────────

export const repairQuotesService = {
  /** Public: whether it is on and its numbers, for the apps to show the tile and say the rules. */
  config() {
    const on = env.repairQuotesEnabled
    return {
      enabled: on,
      ai: on && documentClient() !== null,
      maxGarages: R.maxGarages,
      answerHours: R.answerMinutes / 60,
      openHours: R.openHours,
      videoMinSecs: R.videoMinSecs,
      videoMaxSecs: R.videoMaxSecs,
      videoMaxBytes: R.videoMaxBytes,
      maxPhotos: R.maxPhotos,
      maxFrames: R.maxFrames,
    }
  },

  /** A one-file upload link into the customer's own private folder. */
  async uploadUrl(userId: string, input: UploadUrlInput) {
    const upload = await createRepairMediaUpload(userId, input.contentType, input.sizeBytes)
    if (!upload) {
      throw new AppError(503, 'Photo and video uploads are not set up yet. Please try again later.', 'REPAIR_MEDIA_NOT_SET_UP')
    }
    return upload
  },

  /**
   * The AI's brief from the pictures and the customer's line. Nothing is
   * stored or logged but counts and timing; the pictures live in this
   * request's memory. Any failure is said so the app lets the customer write
   * the brief by hand.
   */
  async brief(userId: string, input: BriefInput): Promise<RepairBrief> {
    const client = documentClient()
    if (!client) {
      throw new AppError(503, 'Detlio can’t write a summary right now. Write one for the garages yourself.', 'AI_UNAVAILABLE')
    }
    const total = input.images.reduce((sum, image) => sum + image.dataBase64.length, 0)
    if (total > 6_000_000) {
      throw new AppError(413, 'These pictures are too large to read together.', 'BRIEF_TOO_LARGE')
    }
    const files: DocumentFile[] = input.images.map((image, index) => {
      const bytes = Buffer.from(image.dataBase64, 'base64')
      if (!looksLikeImage(image.mimeType, bytes)) {
        throw new AppError(400, 'One of the pictures could not be read. Take it again.', 'BRIEF_BAD_IMAGE')
      }
      return { name: `picture-${index + 1}.${EXT_BY_IMAGE[image.mimeType]}`, mimeType: image.mimeType, dataBase64: image.dataBase64 }
    })
    const started = Date.now()
    let answer: string
    try {
      answer = await client.read({
        instructions: BRIEF_INSTRUCTIONS,
        files,
        text: briefPrompt(input.note),
        schemaName: 'repair_brief',
        schema: BRIEF_JSON_SCHEMA as unknown as Record<string, unknown>,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      })
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        log.warn({ err: err.cause ?? err, images: files.length }, 'repair_brief:ai_unavailable')
        throw new AppError(503, 'Detlio can’t write a summary right now. Write one for the garages yourself.', 'AI_UNAVAILABLE')
      }
      throw err
    }
    const reading = parseBriefReading(answer)
    const brief = reading ? briefFromReading(reading, files.length) : null
    log.info({ userId, images: files.length, ms: Date.now() - started, ok: brief !== null }, 'repair_brief:read')
    if (!brief) {
      throw new AppError(
        422,
        'We couldn’t see the damage clearly. Write a line for the garages yourself, or add a closer photo.',
        'BRIEF_UNREADABLE'
      )
    }
    return brief
  },

  /** Send a request to the nearest garages that take repair quotes. */
  async create(userId: string, input: CreateRequestInput, now = new Date()) {
    if (!repairMediaStorageOn()) {
      throw new AppError(503, 'Photo and video uploads are not set up yet. Please try again later.', 'REPAIR_MEDIA_NOT_SET_UP')
    }
    const keys = [...(input.video ? [input.video.key] : []), ...input.photos.map((photo) => photo.key)]
    const owner = repairMediaOwner(userId)
    const badKey =
      keys.some((key) => !isOwnRepairMediaKey(key, owner)) ||
      (input.video !== null && !isVideoKey(input.video.key)) ||
      input.photos.some((photo) => !isImageKey(photo.key)) ||
      new Set(keys).size !== keys.length
    if (badKey) throw new AppError(400, 'Upload the video and photos again.', 'REPAIR_MEDIA_INVALID')

    const vehicle = await bookingRequestsRepository.findVehicle(userId, input.vehicleId)
    if (!vehicle) throw new AppError(404, 'Car not found', 'VEHICLE_NOT_FOUND')

    const point = { lat: input.lat, lng: input.lng }
    const garages = await repo.nearestGarages(point, R.reachKm * 1000, R.maxGarages)
    if (garages.length === 0) {
      throw new AppError(
        409,
        'No garage near you takes repair quotes yet. We’re adding more every week.',
        'REPAIR_QUOTE_NO_GARAGE'
      )
    }

    const closesAt = requestClosesAt(now)
    const quotes: Array<{ vendorId: string; distanceKm: string; respondBy: Date }> = []
    for (const garage of garages) {
      // One read at a time: production has one database connection.
      const calendar = await repo.calendar(garage.vendorId, now, closesAt)
      quotes.push({
        vendorId: garage.vendorId,
        distanceKm: (Math.round(garage.distanceM / 100) / 10).toFixed(1),
        respondBy: garageAnswerBy({ askedAt: now, closesAt, calendar }),
      })
    }
    const zones = await bookingRequestsRepository.listZones()
    const area = zoneFor(point, zones)?.name ?? null

    const edited = input.brief.source
    const created = await repo.createRequest({
      request: {
        userId,
        vehicleId: vehicle.id,
        vehicleLabel: `${vehicle.make} ${vehicle.model}`.trim().slice(0, 120),
        vehicleType: vehicle.vehicleType,
        lat: input.lat,
        lng: input.lng,
        area,
        note: input.note,
        brief: input.brief.text,
        damageArea: input.brief.area || null,
        damageLabel: input.brief.damage || null,
        briefSource: edited,
        box: input.brief.box,
        videoKey: input.video?.key ?? null,
        videoSecs: input.video?.secs ?? null,
        photos: input.photos,
        closesAt,
        createdAt: now,
      },
      quotes,
      maxOpen: R.maxOpenPerCustomer,
    })
    if (!created) {
      throw new AppError(
        409,
        `You already have ${R.maxOpenPerCustomer} repair requests open. Cancel one or wait for it to close.`,
        'REPAIR_QUOTE_LIMIT'
      )
    }
    log.info(
      { requestId: created.request.id, garages: created.quotes.length, video: input.video !== null, photos: input.photos.length },
      'repair_quote:sent'
    )
    for (const quote of created.quotes) {
      pushService.notifyGarage(quote.vendorId, garageNewRepairQuote(quote, now))
    }
    const [view] = await customerViews([created.request], now)
    return view!
  },

  async listMine(userId: string, now = new Date()) {
    const requests = await repo.listRequestsForUser(userId, CUSTOMER_LIST_LIMIT)
    return { items: await customerViews(requests, now) }
  },

  async getMine(userId: string, id: string, now = new Date()) {
    const request = await repo.findRequest(id)
    if (!request || request.userId !== userId) throw notFound()
    const [view] = await customerViews([request], now)
    return view!
  },

  async cancelMine(userId: string, id: string, now = new Date()) {
    const request = await repo.findRequest(id)
    if (!request || request.userId !== userId) throw notFound()
    const cancelled = await repo.cancelRequest(id, userId, now)
    if (!cancelled) {
      throw new AppError(409, 'This request isn’t open any more.', 'REPAIR_QUOTE_NOT_OPEN')
    }
    log.info({ requestId: id }, 'repair_quote:cancelled')
    const [view] = await customerViews([cancelled], now)
    return view!
  },

  /** The customer's request and one quote of it that can be booked now; 404/409 otherwise. */
  async bookableQuote(userId: string, id: string, quoteId: string, now: Date) {
    const request = await repo.findRequest(id)
    if (!request || request.userId !== userId) throw notFound()
    const [entry] = (await repo.quotesFor([id])).filter((row) => row.quote.id === quoteId)
    if (!entry) throw new AppError(404, 'Quote not found', 'REPAIR_QUOTE_NOT_FOUND')
    const state = requestState(request, now)
    const refusal = bookRefusal(entry.quote, state)
    if (state === 'booked') {
      throw new AppError(409, 'A visit is already booked from this request.', 'REPAIR_QUOTE_BOOKED')
    }
    if (refusal === 'not_open') {
      throw new AppError(409, 'This request has closed. Send a new one to get fresh quotes.', 'REPAIR_QUOTE_NOT_OPEN')
    }
    if (refusal === 'not_quoted') {
      throw new AppError(409, 'This garage hasn’t sent a quote.', 'REPAIR_QUOTE_NOT_QUOTED')
    }
    const service = await repo.inspectionServiceFor(entry.quote.vendorId)
    if (!service) {
      throw new AppError(409, 'This garage can’t take visits in the app right now.', 'REPAIR_QUOTE_NOT_BOOKABLE')
    }
    return { request, quote: entry.quote, garage: entry.garage, serviceId: service.id }
  },

  /**
   * The next free day's first times at the garage for its free inspection
   * visit: the picker's own rules (lib/next-free.ts over lib/slots.ts), so
   * a time shown is one the booking would take.
   */
  async nextFree(userId: string, id: string, quoteId: string, now = new Date()): Promise<NextFree | null> {
    const { quote, serviceId } = await repairQuotesService.bookableQuote(userId, id, quoteId, now)
    const window = nextFreeWindow(now.getTime())
    const ids = [quote.vendorId]
    const garages = await vendorsRepository.findPublicVendorsByIds(ids)
    const services = await vendorsRepository.findPublicServices(quote.vendorId, [serviceId])
    const hours = await vendorsRepository.listWorkingHoursForVendors(ids)
    const closures = await vendorsRepository.listClosuresForVendors(ids, window.first, window.last)
    const busy = await bookingsRepository.listCapacityHoldersForVendors(ids, window.from, window.to)
    const garage = garages[0]
    const service = services[0]
    if (!garage || !service || !garage.dropinEnabled) return null
    return nextFreeTimes(
      {
        pausedAt: garage.bookingsPausedAt,
        slotIntervalMins: garage.slotIntervalMins,
        bays: garage.bays,
        jobsPerDay: garage.jobsPerDay,
        hours,
        closures: new Set(closures.map((row) => row.date)),
        busy,
      },
      { durationMins: effectiveDurationMins(service), bookingType: 'dropin' },
      now.getTime()
    )
  },

  /**
   * Book a visit from a quote: today's checkout (POST /booking-intents'
   * own service, every slot, car and garage check under its locks) for the
   * garage's free inspection service, at the garage, which books with
   * nothing to pay (0073, no Razorpay order). No new payment path.
   *
   * The request is claimed for this quote first (one conditional write), so
   * a double tap, a second device or a second garage can't turn one request
   * into two visits; if checkout refuses, the claim is undone and the
   * request is open again.
   */
  async book(userId: string, id: string, quoteId: string, scheduledAt: string, now = new Date()) {
    const { request, quote, serviceId } = await repairQuotesService.bookableQuote(userId, id, quoteId, now)
    if (!request.vehicleId) {
      throw new AppError(409, 'This car was removed. Add it again and send a new request.', 'VEHICLE_NOT_FOUND')
    }
    const input = createBookingIntentSchema.parse({
      vendorId: quote.vendorId,
      serviceIds: [serviceId],
      vehicleId: request.vehicleId,
      bookingType: 'dropin',
      scheduledAt,
      paymentMethod: 'online',
    })
    const claimed = await repo.claimForBooking({ requestId: id, quoteId, userId, now })
    if (!claimed) {
      const again = await repo.findRequest(id)
      if (again && requestState(again, now) === 'booked') {
        throw new AppError(409, 'A visit is already booked from this request.', 'REPAIR_QUOTE_BOOKED')
      }
      throw new AppError(409, 'This request has closed. Send a new one to get fresh quotes.', 'REPAIR_QUOTE_NOT_OPEN')
    }
    const release = () =>
      repo.releaseBookingClaim({ requestId: id, quoteId, now }).catch((err: unknown) => {
        log.error({ err, requestId: id, quoteId }, 'repair_quote:claim_release_failed')
      })
    let result: Awaited<ReturnType<typeof bookingIntentsService.createIntent>>
    try {
      result = await bookingIntentsService.createIntent(userId, input)
    } catch (err) {
      await release()
      throw err
    }
    if (!result.free || !result.bookingId) {
      // Unreachable: the service has no fee, so nothing goes to Razorpay.
      await release()
      log.error({ requestId: id, quoteId }, 'repair_quote:visit_not_free')
      throw new AppError(409, 'This visit couldn’t be booked. Nothing was charged.', 'REPAIR_QUOTE_NOT_BOOKABLE')
    }
    const marked = await repo.markBooked({ requestId: id, quoteId, bookingId: result.bookingId })
    if (!marked) log.warn({ requestId: id, quoteId, bookingId: result.bookingId }, 'repair_quote:booking_not_marked')
    log.info({ requestId: id, quoteId, bookingId: result.bookingId }, 'repair_quote:visit_booked')
    return { bookingId: result.bookingId }
  },

  // ─── The garage ────────────────────────────────────────────────────────────

  async listForGarage(vendorId: string, scope: 'open' | 'closed', now = new Date()) {
    const rows = await repo.listForGarage(vendorId, new Date(now.getTime() - LIST_DAYS * DAY_MS), GARAGE_LIST_LIMIT)
    const views = rows.map((row) => garageView(row.quote, row.request, now))
    const items = views.filter((view) => (scope === 'open' ? view.state === 'waiting' : view.state !== 'waiting'))
    return { items, waiting: views.filter((view) => view.state === 'waiting').length }
  },

  async waitingCount(vendorId: string, now = new Date()) {
    return { waiting: await repo.waitingCount(vendorId, now) }
  },

  /** "Can do" with an estimate, or "Can't do": only in time, and only while the request is open. */
  async answer(vendorId: string, userId: string, quoteId: string, input: AnswerInput, now = new Date()) {
    const found = await repo.findQuoteForGarage(quoteId, vendorId)
    if (!found) throw notFound()
    const refusal = answerRefusal(found.quote, requestState(found.request, now), now)
    if (refusal) throw answerError(refusal)
    const answered = await repo.answer({
      quoteId,
      vendorId,
      userId,
      now,
      answer: input.canDo
        ? {
            canDo: true,
            priceFrom: input.priceFrom,
            priceTo: input.priceTo,
            days: input.days,
            needsInspection: input.needsInspection,
            note: input.note?.trim() || null,
          }
        : { canDo: false, reason: input.reason?.trim() || null },
    })
    if (!answered) {
      const again = await repo.findQuoteForGarage(quoteId, vendorId)
      const why = again ? answerRefusal(again.quote, requestState(again.request, now), now) : 'closed'
      throw answerError(why ?? 'closed')
    }
    log.info({ quoteId, vendorId, canDo: input.canDo }, 'repair_quote:answered')
    pushService.notifyLater(async () => {
      const garage = await vendorsRepository.findVendorById(vendorId)
      return [
        {
          recipient: { audience: 'customer' as const, userId: found.request.userId },
          message: customerRepairQuoteAnswered(
            found.request,
            answered,
            garage?.businessName ?? 'A garage',
            input.canDo ? { canDo: true, priceFrom: input.priceFrom, priceTo: input.priceTo } : { canDo: false }
          ),
        },
      ]
    })
    return garageView(answered, found.request, now)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async listForAdmin(query: AdminListQuery, now = new Date()) {
    const rows = await repo.listForAdmin(new Date(now.getTime() - LIST_DAYS * DAY_MS), now, ADMIN_LIST_LIMIT)
    const quotes = await repo.quotesFor(rows.map((row) => row.request.id))
    const phones = await repo.garagePhones(Array.from(new Set(quotes.map((entry) => entry.quote.vendorId))))
    const all = rows.map(({ request, customerName, customerPhone }) => {
      const state = requestState(request, now)
      const mine = quotes.filter((entry) => entry.quote.requestId === request.id)
      const states: QuoteState[] = mine.map((entry) => quoteState(entry.quote, state, now))
      return {
        id: request.id,
        ref: `RQ${request.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        state,
        filter: adminQuoteFilter(state, states),
        title: requestTitle(request),
        vehicle: request.vehicleLabel,
        area: request.area,
        customer: { name: customerName, phone: customerPhone ? maskPhone(customerPhone) : null },
        brief: briefView(request),
        note: request.note,
        ...mediaView(request, now.getTime()),
        createdAt: request.createdAt.toISOString(),
        closesAt: request.closesAt.toISOString(),
        answerBy: answerBy(
          mine.map((entry) => entry.quote),
          state,
          now
        ),
        quotes: mine.map((entry, index) => ({
          id: entry.quote.id,
          garage: { id: entry.garage.id, name: entry.garage.name, phone: phones.get(entry.garage.id) ?? null },
          state: states[index]!,
          respondBy: entry.quote.respondBy.toISOString(),
          priceFrom: entry.quote.priceFrom,
          priceTo: entry.quote.priceTo,
          days: entry.quote.days,
          needsInspection: entry.quote.needsInspection,
          declineReason: entry.quote.declineReason,
          bookingId: entry.quote.bookingId,
        })),
      }
    })
    const counts: Record<AdminQuoteFilter, number> = { all: all.length, open: 0, booked: 0, no_quote: 0, expired: 0 }
    for (const item of all) if (item.filter) counts[item.filter] += 1
    const items = query.filter === 'all' ? all : all.filter((item) => item.filter === query.filter)
    return { items, counts, days: LIST_DAYS }
  },

  /** The garage editor's card: the switch, whether a visit can be booked, and the last 30 days. */
  async garageSetting(vendorId: string, now = new Date()) {
    const setting = await repo.garageSetting(vendorId)
    if (!setting) throw new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
    const stats = await repo.garageStats(vendorId, new Date(now.getTime() - LIST_DAYS * DAY_MS))
    const bills = billsMatchQuotes(await repo.badgeJobs([vendorId]))
    return {
      enabled: setting.enabled,
      bookable: setting.bookable,
      maxGarages: R.maxGarages,
      asked: stats.asked,
      answeredInTime: stats.answeredInTime,
      billsInside: bills.inside,
      billsTotal: bills.billed,
      billsMatchQuotes: bills.badge,
    }
  },

  async setGarageSetting(vendorId: string, enabled: boolean, actorName: string, now = new Date()) {
    const setting = await repo.garageSetting(vendorId)
    if (!setting) throw new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
    if (enabled && !setting.bookable) {
      throw new AppError(
        400,
        'Add a free inspection service first (Price on inspection, no fee): customers book their visit as that.',
        'REPAIR_QUOTES_NEED_INSPECTION_SERVICE'
      )
    }
    await repo.setGarageEnabled(vendorId, enabled)
    log.info({ vendorId, enabled, actorName }, 'repair_quote:garage_setting')
    return repairQuotesService.garageSetting(vendorId, now)
  },
}

function answerError(refusal: NonNullable<ReturnType<typeof answerRefusal>>): AppError {
  switch (refusal) {
    case 'already_answered':
      return new AppError(409, 'You’ve already answered this request.', 'REPAIR_QUOTE_ANSWERED')
    case 'time_passed':
      return new AppError(409, 'The time to answer this request has passed.', 'REPAIR_QUOTE_TIME_PASSED')
    case 'closed':
      return new AppError(409, 'This request has closed.', 'REPAIR_QUOTE_CLOSED')
  }
}
