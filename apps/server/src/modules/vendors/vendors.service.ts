import { AppError } from '../../lib/errors.js'
import type { GeoSource } from '../../lib/geo/index.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import {
  MIN_NOTICE_MS,
  addDaysToDateKey,
  closureDateProblem,
  getDayOfWeekFromDate,
  slotsForDay,
  todayDateKey,
  type DayFacts,
} from '../../lib/slots.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import {
  computeStartingPrice,
  resolveServicePricing,
  sumAmounts,
  tiersOf,
  type VehicleTier,
} from '../../lib/pricing.js'

// Fixed order for every per-tier breakdown, so the UI can render rows without
// sorting and the "smallest saving" scan is deterministic.
const VEHICLE_TIERS: VehicleTier[] = ['hatchback', 'sedan', 'suv']
import { categoryLabel } from '../../lib/categories.js'
import { computeVendorPayout } from '../../lib/discounts.js'
import { earningKind, type EarningKind } from '../../lib/earnings.js'
import { paidChargesTotal } from '../../lib/final-bill.js'
import { listScope } from '../../lib/discovery.js'
import {
  outsideServiceCity,
  type OutsideServiceCity,
} from '../../lib/service-city.js'
import { matchedServiceName } from '../../lib/search.js'
import { isPickupOffered, planPickupChange } from '../../lib/pickup.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { toVendorBookingResponse } from '../bookings/bookings.service.js'
import { membersRepository } from '../members/members.repository.js'
import { reviewsRepository } from '../reviews/reviews.repository.js'
import { vendorsRepository } from './vendors.repository.js'
import { slotAlertsService } from '../slot-alerts/slot-alerts.service.js'
import { toPublicVendor, type PublicVendorFields } from './vendors.public.js'
import { isDocumentStorageConfigured } from '../../lib/document-storage.js'
import { summariesByVendor } from '../../lib/vendor-documents.js'

const log = logger.child({ module: 'vendors' })

// How many finished jobs the Earnings screen lists.
const RECENT_EARNINGS_JOBS = 10

// How far ahead the customer's slot picker is told about holidays. Its quick
// chips cover a week and its calendar a couple of months; a holiday further
// out than this is still refused at checkout, just not greyed in advance.
const PUBLIC_CLOSURE_DAYS_AHEAD = 60

// The listing cards only ever say "Closed today" or when a garage next opens,
// which is at most a week away.
const LISTING_CLOSURE_DAYS_AHEAD = 7

// Self-serve create is no longer capped at one company per person. The cap is
// on how many one account may *own* — high enough that a real multi-garage
// operator never meets it, low enough that a scripted loop does.
//
// Deliberately not a count of seats: holding a seat is someone else adding you
// to their garage, and being an operator at ten of them says nothing about
// whether you may start your own.
const MAX_COMPANIES_OWNED = 10
import type {
  ClosureRecord,
  PhotoRecord,
  ServiceAreaRecord,
  ServiceImageRecord,
  ServiceRecord,
  VendorRecord,
  WorkingHoursRecord,
} from './vendors.repository.js'
import type {
  CreateClosureInput,
  CreatePackageInput,
  DoorstepAreaInput,
  CreatePhotoInput,
  CreateServiceAreaInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  LogoUploadUrlInput,
  PauseBookingsInput,
  PhotoUploadUrlInput,
  ReorderPhotosInput,
  ServiceImageUploadUrlInput,
  SetLogoInput,
  SetWorkingHoursInput,
  SlotsQueryInput,
  ToggleServiceActiveInput,
  UpdateJobTypesInput,
  UpdatePackageInput,
  UpdateServiceInput,
  UpdateSlotIntervalInput,
  UpdateVendorInput,
} from './vendors.validation.js'
import type { AddPhotoInput } from '../service-media/service-media.validation.js'
import { certificationService } from '../certification/certification.service.js'
import {
  removeMediaFiles,
  serviceMediaService,
} from '../service-media/service-media.service.js'
import {
  toManagedMedia,
  toPublicMedia,
  type ManagedServiceMedia,
  type PublicServiceMedia,
} from '../../lib/service-media.js'

export type VendorResponse = {
  id: string
  ownerId: string
  businessName: string
  logoUrl: string | null
  phone: string
  address: string
  city: string
  pincode: string
  lat: number | null
  lng: number | null
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  /** The stored answer. Read `pickupEnabled` for whether it is on. */
  pickup: string | null
  pickupRadiusKm: number | null
  /**
   * Whether the garage offers pickup & drop now: said yes with the
   * responsibility terms on file (isPickupOffered, lib/pickup.ts).
   */
  pickupEnabled: boolean
  /** When the responsibility terms were last accepted; null if never. */
  pickupTermsAcceptedAt: string | null
  doorstepRadiusKm: number | null
  geoSource: GeoSource
  /** Set when an admin confirmed the pin on a map. Null means nobody has. */
  geoConfirmedAt: string | null
  bays: number | null
  jobsPerDay: number | null
  vehicleTypes: string[]
  // No `notes`: that column is the admin's internal "Notes (optional)" under
  // Onboarding status, read only through the admin API. It used to ride on
  // this shape, which put it on the public garage page's payload
  // (GET /vendors/:id) and on the garage's own portal.
  isVerified: boolean
  doorstepEnabled: boolean
  dropinEnabled: boolean
  slotIntervalMins: number
  status: string
  /**
   * When the garage stopped taking new bookings, or null while it takes them.
   * Public on purpose: the garage page says "Not taking bookings right now",
   * with the reason when the owner gave one.
   */
  bookingsPausedAt: string | null
  bookingsPausedReason: string | null
  createdAt: string
}

/**
 * GET /vendors/:id. An allow-list (vendors.public.ts), not the garage's own
 * shape minus a field or two: no phone, WhatsApp, email, street address, maps
 * link or ops note before the customer has booked.
 */
export type PublicVendorResponse = PublicVendorFields & {
  photos: PhotoResponse[]
  services: ServiceResponse[]
  // null when the vendor has no reviews yet — distinct from a rating of 0.
  rating: number | null
  reviewCount: number
  /**
   * Set when the garage is pinned more than 50 km from the Chennai centre, or
   * is unpinned and its own city names another town (km null), so its page
   * and checkout can say where it is (lib/service-city.ts). Null when it is
   * in the city, and when it has no pin and says Chennai (unknown).
   */
  outsideServiceCity: OutsideServiceCity | null
}

export type VendorListItemResponse = {
  id: string
  businessName: string
  logoUrl: string | null
  city: string
  isVerified: boolean
  status: string
  doorstepEnabled: boolean
  dropinEnabled: boolean
  /** Offers pickup & drop (isPickupOffered). */
  pickupEnabled: boolean
  /**
   * How far it collects cars from, from its pin; null is the default
   * (DEFAULT_PICKUP_RADIUS_KM). The garage page already shows it; on the card
   * it is for "Can collect your car" (0062). Null too when it does not collect.
   */
  pickupRadiusKm: number | null
  startingPrice: number | null
  // null when the vendor has no reviews yet — distinct from a rating of 0.
  rating: number | null
  reviewCount: number
  serviceTags: string[]
  photos: string[]
  // null when the caller sent no origin. Never 0 as a stand-in for "unknown" —
  // the same rule the client already applies to price and rating.
  distanceKm: number | null
  /**
   * The garage's own coordinates, for plotting it on the map view. Typed
   * nullable because the column is, though in practice a listed vendor always
   * has them: verification refuses a garage with no pin, and listings require
   * verification.
   */
  lat: number | null
  lng: number | null
  /**
   * The weekly hours, so a card can say "Open · closes 7 PM" from the garage's
   * real hours instead of reading `status` (an active account is not an open
   * garage). Whole week rather than today's row: when it is closed, the card
   * says when it next opens, which can be days away. Empty when none are set.
   */
  workingHours: OpeningHoursResponse[]
  /**
   * The garage's holidays in the coming week (IST date keys), so a card can
   * say "Closed today" on one rather than reading the weekly hours alone.
   */
  closures: string[]
  /**
   * On a search (`q`), the service the garage was found by when its name and
   * city did not match, so the card can say why it is listed. Null otherwise.
   * See matchedServiceName.
   */
  matchedService: string | null
  /**
   * Set when the garage is outside Chennai, for the card's "Outside Chennai ·
   * Sivakasi" chip. The same rule as the garage page; see outsideServiceCity.
   */
  outsideServiceCity: OutsideServiceCity | null
  /**
   * Detlio has approved every required document: the card's shield. Only
   * this boolean (vendors.public.ts says why). False while documents are off.
   */
  documentsVerified: boolean
  /**
   * Detlio Certified (0048): the card's seal. Only this boolean
   * (vendors.public.ts says why). A certified card shows the seal in place
   * of the documents shield: certification needs the documents.
   */
  certified: boolean
}

export type VendorListResponse = {
  items: VendorListItemResponse[]
  /**
   * Opaque. Pass back as `cursor` for the next page; null when the list is
   * exhausted. Opaque on purpose: it is offset-backed today, and keyset
   * pagination can replace that later without an API change.
   */
  nextCursor: string | null
  /**
   * How far from the customer the located garages were searched, in km: set
   * whenever a radius applied (an origin, no bbox, not doorstep, no `q`), even
   * when nothing was found within it, so the screen can say "No garages within
   * 50 km of you yet." Null when no radius applied.
   */
  radiusKm: number | null
  /**
   * Deprecated, always null; remove once no web bundle older than this reads
   * it. It named the ring of the old auto-widening ladder, and bundles from
   * then print "Nothing within 10 km — showing garages within N km" for any
   * value over 10, which with one 50 km radius would be on every list.
   */
  appliedRadiusKm: null
}

export type WorkingHoursResponse = {
  id: string
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

/** A list item's hours: the same fields without the row id nobody needs. */
export type OpeningHoursResponse = Omit<WorkingHoursResponse, 'id'>

export type ClosureResponse = {
  id: string
  /** The IST calendar day, YYYY-MM-DD. */
  date: string
  reason: string | null
  /**
   * Bookings still on for that day. Marking a holiday does not touch them, so
   * the garage is told how many it has to sort out with the customers.
   */
  activeBookingCount: number
}

export type ServiceAreaResponse = {
  id: string
  areaName: string
  pincode: string
  radiusKm: number | null
}

export type PhotoResponse = {
  id: string
  url: string
  sortOrder: number
  createdAt: string
}

export type ServiceImageResponse = {
  id: string
  url: string
  sortOrder: number
}

export type ServiceResponse = {
  id: string
  name: string
  description: string | null
  category: string
  pricingType: string
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  durationMins: number
  isActive: boolean
  /** Photos only, as before videos existed. Kept for older clients. */
  images: ServiceImageResponse[]
  /**
   * Photos and the video. Customers get the public view (a video only once
   * it is ready, nothing about who added it or the privacy tick); the
   * garage's own app gets every row with its state.
   */
  media: PublicServiceMedia[] | ManagedServiceMedia[]
}

export type PackageItemResponse = {
  serviceId: string
  name: string
  price: string
  durationMins: number
  isActive: boolean
}

export type TierBreakdownEntry = {
  price: string
  itemsTotal: string
  savings: string | null
}

// A package response is a service response plus its contents. `itemsTotal` and
// `savings` are computed per request from the members' current prices rather
// than stored, so editing a member's price can never leave a stale claim on
// screen. `savings` is null when the package is not cheaper than its parts, so
// the UI has nothing to badge.
//
// For a per-vehicle package those two headline figures are floor-to-floor
// (cheapest tier vs the sum of the members' cheapest tiers), which is the right
// basis for a browsing card but is not what an SUV owner will pay. So a
// per-vehicle package also carries `tierBreakdown` — the real price, parts total
// and saving for each vehicle — and its headline `savings` is narrowed to the
// smallest saving across tiers, so the badge understates rather than overpromises.
export type PackageResponse = ServiceResponse & {
  items: PackageItemResponse[]
  itemsTotal: string
  savings: string | null
  tierBreakdown: Record<VehicleTier, TierBreakdownEntry> | null
  hasInactiveItems: boolean
}

export type EarningsSummaryResponse = {
  totalEarned: number
  jobsDone: number
  pending: number
  avgRating: number
}

export type EarningsJobResponse = {
  id: string
  /** Deprecated: the first service. Read `serviceNames` instead. */
  serviceName: string
  /** Every service on the job, in the order the customer picked them. */
  serviceNames: string[]
  customerName: string
  scheduledAt: string
  bookingType: string
  amount: number
  settled: boolean
  /**
   * What earned it: the job done, or a customer who didn't turn up (paid as
   * if the job happened, see lib/earnings.ts). The screen labels the second.
   */
  kind: EarningKind
}

export type EarningsResponse = {
  summary: EarningsSummaryResponse
  /** Always the trailing week, whatever period the screen is showing. */
  weekEarnings: number
  jobs: EarningsJobResponse[]
}

// Earnings read the payout, never the charged amount. When Detlio funds a promo
// code the garage is still owed the full pre-discount price, so paying them what
// the customer was charged would silently dock them for a campaign they did not
// run. The rule lives in computeVendorPayout; this file just applies it.
//
// A final bill the customer paid in the app is the garage's too — it is the
// rest of the work's price — so it is added on top. Only once paid: a bill
// still due is money nobody has collected yet.
type EarningBooking = {
  amount: string
  subtotalAmount?: string | null
  discountFundedBy?: 'platform' | 'vendor' | null
  charges?: Array<{ status: string; amountDue: string }> | null
}

// Added in paise and handed back in rupees: a bill can carry paise, and
// 1099.9 + 250.2 in floating point is 1350.1000000000001, which the screen
// would print as it stands.
function payoutOf(booking: EarningBooking) {
  return Number(
    sumAmounts([
      computeVendorPayout({
        amount: booking.amount,
        subtotalAmount: booking.subtotalAmount ?? booking.amount,
        discountFundedBy: booking.discountFundedBy ?? null,
      }),
      paidChargesTotal(booking.charges),
    ])
  )
}

function sumPayouts(bookings: EarningBooking[]) {
  return Number(sumAmounts(bookings.map((booking) => String(payoutOf(booking)))))
}

function isSettledPayment(status: string | undefined | null) {
  return status === 'paid' || status === 'collected'
}

function isWithinDays(date: Date, days: number) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return date >= cutoff
}

function isWithinMonths(date: Date, months: number) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return date >= cutoff
}

function toVendorResponse(vendor: VendorRecord): VendorResponse {
  return {
    id: vendor.id,
    ownerId: vendor.ownerId,
    businessName: vendor.businessName,
    logoUrl: vendor.logoUrl,
    phone: vendor.phone,
    address: vendor.address,
    city: vendor.city,
    pincode: vendor.pincode,
    lat: vendor.lat,
    lng: vendor.lng,
    whatsapp: vendor.whatsapp,
    email: vendor.email,
    yearsInOperation: vendor.yearsInOperation,
    mapsUrl: vendor.mapsUrl,
    pickup: vendor.pickup,
    pickupRadiusKm: vendor.pickupRadiusKm,
    pickupEnabled: isPickupOffered(vendor),
    pickupTermsAcceptedAt: vendor.pickupTermsAcceptedAt?.toISOString() ?? null,
    doorstepRadiusKm: vendor.doorstepRadiusKm,
    geoSource: vendor.geoSource,
    geoConfirmedAt: vendor.geoConfirmedAt?.toISOString() ?? null,
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
    vehicleTypes: vendor.vehicleTypes,
    isVerified: vendor.isVerified,
    doorstepEnabled: vendor.doorstepEnabled,
    dropinEnabled: vendor.dropinEnabled,
    slotIntervalMins: vendor.slotIntervalMins,
    status: vendor.status,
    bookingsPausedAt: vendor.bookingsPausedAt?.toISOString() ?? null,
    bookingsPausedReason: vendor.bookingsPausedReason,
    createdAt: vendor.createdAt.toISOString(),
  }
}

function toClosureResponse(
  closure: ClosureRecord,
  activeBookingCount: number
): ClosureResponse {
  return {
    id: closure.id,
    date: closure.date,
    reason: closure.reason,
    activeBookingCount,
  }
}

function toWorkingHoursResponse(
  hours: WorkingHoursRecord
): WorkingHoursResponse {
  return {
    id: hours.id,
    dayOfWeek: hours.dayOfWeek,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    isClosed: hours.isClosed,
  }
}

function toOpeningHoursResponse(
  hours: WorkingHoursRecord
): OpeningHoursResponse {
  return {
    dayOfWeek: hours.dayOfWeek,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    isClosed: hours.isClosed,
  }
}

function toServiceAreaResponse(area: ServiceAreaRecord): ServiceAreaResponse {
  return {
    id: area.id,
    areaName: area.areaName,
    pincode: area.pincode,
    radiusKm: area.radiusKm,
  }
}

function toPhotoResponse(photo: PhotoRecord): PhotoResponse {
  return {
    id: photo.id,
    url: photo.url,
    sortOrder: photo.sortOrder,
    createdAt: photo.createdAt.toISOString(),
  }
}

function toServiceImageResponse(
  image: ServiceImageRecord
): ServiceImageResponse {
  return {
    id: image.id,
    url: image.url,
    sortOrder: image.sortOrder,
  }
}

/**
 * Who a service response is for. 'public' is the garage page (customers);
 * 'manage' the garage's own app. Only the media differ.
 */
type ServiceView = 'public' | 'manage'

// `images` is optional on the record because the write paths return a bare row
// from `returning()`. Callers that mutate images pass the fresh list explicitly.
function toServiceResponse(
  service: ServiceRecord & { images?: ServiceImageRecord[] },
  images: ServiceImageRecord[] = service.images ?? [],
  view: ServiceView = 'manage'
): ServiceResponse {
  return {
    images: images.filter((image) => image.kind === 'image').map(toServiceImageResponse),
    media: view === 'public' ? toPublicMedia(images) : toManagedMedia(images),
    id: service.id,
    name: service.name,
    description: service.description,
    category: service.category,
    pricingType: service.pricingType,
    price: service.price,
    priceHatchback: service.priceHatchback,
    priceSedan: service.priceSedan,
    priceSuv: service.priceSuv,
    durationMins: service.durationMins,
    isActive: service.isActive,
  }
}

type PackageWithItems = ServiceRecord & {
  images?: ServiceImageRecord[]
  packageItems: Array<{ sortOrder: number; service: ServiceRecord }>
}

function toPackageResponse(
  pkg: PackageWithItems,
  view: ServiceView = 'manage'
): PackageResponse {
  const items = pkg.packageItems.map(({ service }) => ({
    serviceId: service.id,
    name: service.name,
    price: service.price,
    durationMins: service.durationMins,
    isActive: service.isActive,
  }))

  // Compare like with like: a package's own base price against the sum of its
  // members' base prices. For per-vehicle members `price` is the cheapest tier
  // (see resolveServicePricing), so this stays a consistent floor-to-floor
  // comparison rather than mixing a tier price into a flat total.
  const itemsTotal = items.reduce((sum, item) => sum + Number(item.price), 0)
  const packagePrice = Number(pkg.price)
  const saved = itemsTotal - packagePrice

  // What each vehicle actually pays, and saves. Only meaningful when the
  // package itself prices by vehicle; a flat package costs the same either way.
  const tierBreakdown =
    pkg.pricingType === 'per_vehicle'
      ? VEHICLE_TIERS.reduce(
          (acc, tier) => {
            // A member that doesn't price by vehicle contributes its flat price
            // to every tier. A tier a member never priced falls back to its
            // base — only reachable on rows predating the all-tiers rule.
            const tierItemsTotal = pkg.packageItems.reduce(
              (sum, { service }) =>
                sum + Number(tiersOf(service)[tier] ?? service.price),
              0
            )
            const tierPrice = Number(tiersOf(pkg)[tier] ?? pkg.price)
            const tierSaved = tierItemsTotal - tierPrice

            acc[tier] = {
              price: tierPrice.toFixed(2),
              itemsTotal: tierItemsTotal.toFixed(2),
              savings: tierSaved > 0 ? tierSaved.toFixed(2) : null,
            }
            return acc
          },
          {} as Record<VehicleTier, TierBreakdownEntry>
        )
      : null

  // Headline saving. For a per-vehicle package, the smallest saving any vehicle
  // gets — so "Save ₹X" is true for every customer, not just the cheapest one.
  // Null if any tier doesn't save, since the claim wouldn't hold for them.
  const headlineSavings = tierBreakdown
    ? VEHICLE_TIERS.every((tier) => tierBreakdown[tier].savings !== null)
      ? VEHICLE_TIERS.map((tier) => Number(tierBreakdown[tier].savings))
          .reduce((min, value) => Math.min(min, value))
          .toFixed(2)
      : null
    : saved > 0
      ? saved.toFixed(2)
      : null

  return {
    ...toServiceResponse(pkg, pkg.images ?? [], view),
    items,
    itemsTotal: itemsTotal.toFixed(2),
    savings: headlineSavings,
    tierBreakdown,
    hasInactiveItems: items.some((item) => !item.isActive),
  }
}

// Validates that every requested member is one of this vendor's own active,
// non-package services, and returns them in the caller's order. Rejecting here
// (rather than letting the FK fail) is what stops a vendor bundling another
// vendor's service or nesting a package inside a package.
async function assertValidPackageMembers(
  vendorId: string,
  serviceIds: string[]
): Promise<void> {
  const eligible = await vendorsRepository.findEligiblePackageMembers(
    vendorId,
    serviceIds
  )
  const eligibleIds = new Set(eligible.map((s) => s.id))
  const rejected = serviceIds.filter((id) => !eligibleIds.has(id))

  if (rejected.length > 0) {
    throw new AppError(
      400,
      `A package can only contain your own active services (${rejected.length} invalid)`,
      'INVALID_PACKAGE_ITEMS'
    )
  }
}

// Read back a service after an image write. A package is a services row, so it
// resolves here too — and must come back in its package shape (contents,
// savings), because the client swaps the whole object into its list and would
// otherwise lose the composition.
async function readServiceOrPackage(
  vendorId: string,
  serviceId: string
): Promise<ServiceResponse | PackageResponse> {
  const service = await vendorsRepository.findAnyServiceById(vendorId, serviceId)

  if (!service) {
    throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
  }

  if (service.category !== 'package') {
    return toServiceResponse(service)
  }

  const pkg = await vendorsRepository.findPackageById(vendorId, serviceId)
  return pkg ? toPackageResponse(pkg) : toServiceResponse(service)
}

// Worded after the button the owner has next to Delete ("Disable"), so the
// way out is the control they can see. Packages are services underneath but
// not to the owner, so they get their own noun.
function serviceInUse(kind: 'service' | 'package' = 'service') {
  return new AppError(
    409,
    `This ${kind} has bookings. Disable it instead.`,
    'SERVICE_IN_USE'
  )
}

/**
 * Loads the company the caller is acting as. The vendorId always comes from
 * `resolveTenant`, which has already checked the caller has an active seat in
 * it — this function re-reads the row, it does not re-authorize.
 */
async function getTenantVendor(vendorId: string): Promise<VendorRecord> {
  const vendor = await vendorsRepository.findVendorById(vendorId)

  if (!vendor) {
    throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  }

  return vendor
}

const DEFAULT_PAGE_SIZE = 20

type Segment = 'located' | 'unlocated'

/**
 * Opaque to callers; offset-backed today. Carries the segment as well as the
 * offset, because the list is really two lists back to back — garages with
 * coordinates, then those still waiting for a pin — and a bare offset could not
 * say which one a page continues.
 *
 * See VendorListResponse.nextCursor.
 */
function encodeCursor(segment: Segment, offset: number): string {
  return Buffer.from(`${segment}:${offset}`).toString('base64url')
}

function decodeCursor(cursor: string | undefined): {
  segment: Segment
  offset: number
} {
  const fallback = { segment: 'located' as Segment, offset: 0 }
  if (!cursor) return fallback
  try {
    const [segment, rawOffset] = Buffer.from(cursor, 'base64url')
      .toString('utf8')
      .split(':')
    const offset = Number(rawOffset)
    if (segment !== 'located' && segment !== 'unlocated') return fallback
    if (!Number.isInteger(offset) || offset < 0) return fallback
    return { segment, offset }
  } catch {
    // A malformed cursor is a client bug, not a reason to 400 a browse — the
    // worst case of ignoring it is that the customer sees page one again.
    return fallback
  }
}

/**
 * The list's garage cards for ids already chosen, in the order given, each
 * with its distance when one was measured. The garage list and the
 * customer's Saved garages (modules/favourites) both build their cards here,
 * so the two are always the same shape. Filtering is the caller's: this
 * only hydrates.
 */
export async function vendorCardsFor(
  page: Array<{ id: string; distanceM: number | null }>,
  q?: string
): Promise<VendorListItemResponse[]> {
  const rows = await vendorsRepository.listPublicVendorsByIds(
    page.map((row) => row.id)
  )

  const today = todayDateKey()
  const [aggregates, closures, verified, certified] = await Promise.all([
    vendorsRepository.getRatingAggregates(rows.map((vendor) => vendor.id)),
    vendorsRepository.listClosuresForVendors(
      rows.map((vendor) => vendor.id),
      today,
      addDaysToDateKey(today, LISTING_CLOSURE_DAYS_AHEAD)
    ),
    documentsVerifiedIds(rows.map((vendor) => vendor.id)),
    certificationService.certifiedIds(rows.map((vendor) => vendor.id)),
  ])
  const closuresByVendor = new Map<string, string[]>()
  for (const closure of closures) {
    const dates = closuresByVendor.get(closure.vendorId) ?? []
    dates.push(closure.date)
    closuresByVendor.set(closure.vendorId, dates)
  }
  const ratingsByVendor = new Map(
    aggregates.map((row) => [row.vendorId, row])
  )
  const distanceByVendor = new Map(
    page.map((row) => [row.id, row.distanceM])
  )

  return rows.map((vendor): VendorListItemResponse => {
    const categories = [
      ...new Set(vendor.services.map((service) => service.category)),
    ]
    const rating = ratingsByVendor.get(vendor.id)
    const distanceM = distanceByVendor.get(vendor.id) ?? null

    return {
      id: vendor.id,
      businessName: vendor.businessName,
      logoUrl: vendor.logoUrl,
      city: vendor.city,
      isVerified: vendor.isVerified,
      status: vendor.status,
      doorstepEnabled: vendor.doorstepEnabled,
      dropinEnabled: vendor.dropinEnabled,
      pickupEnabled: isPickupOffered(vendor),
      pickupRadiusKm: isPickupOffered(vendor) ? vendor.pickupRadiusKm : null,
      startingPrice: computeStartingPrice(vendor.services),
      rating: rating ? Number(rating.average.toFixed(2)) : null,
      reviewCount: rating?.count ?? 0,
      serviceTags: categories.map(categoryLabel),
      photos: vendor.photos.map((photo) => photo.url),
      // One decimal is all a straight-line distance can honestly claim.
      distanceKm:
        distanceM === null ? null : Number((distanceM / 1000).toFixed(1)),
      lat: vendor.lat,
      lng: vendor.lng,
      workingHours: vendor.workingHours.map(toOpeningHoursResponse),
      closures: closuresByVendor.get(vendor.id) ?? [],
      // From the active services loaded above, the same set the search
      // clause reads.
      matchedService: q ? matchedServiceName(q, vendor) : null,
      outsideServiceCity: outsideServiceCity(vendor),
      documentsVerified: verified.has(vendor.id),
      certified: certified.has(vendor.id),
    }
  })
}

/**
 * The garages, of these, with the "Documents verified" badge: every required
 * document approved (lib/vendor-documents.ts). Nothing is read, and nobody
 * has the badge, while garage documents are off (no R2_DOCS_BUCKET). Also
 * read by the Service History certificate (0053).
 */
export async function documentsVerifiedIds(vendorIds: string[]): Promise<Set<string>> {
  if (vendorIds.length === 0 || !isDocumentStorageConfigured()) return new Set()
  const rows = await vendorsRepository.listApprovedDocumentTypes(vendorIds)
  return new Set(
    [...summariesByVendor(rows)].filter(([, summary]) => summary.verified).map(([vendorId]) => vendorId)
  )
}

/**
 * The free start times for one job at a garage on one IST day: the slot
 * list's whole rule (lib/slots.ts) for a job of `durationMins` of this
 * booking type — open hours, holidays and pause, the notice, then the bays
 * and the day's cap. `excludeBookingId` is a booking being moved, which must
 * not count against itself. The customer's slot picker and the garage's
 * "Suggest another time" (0041) both read it, so the two never offer
 * different times.
 */
type BookingTypeForSlots = SlotsQueryInput['bookingType']

export async function jobSlots(
  vendor: {
    id: string
    bookingsPausedAt: Date | null
    slotIntervalMins: number
    bays: number | null
    jobsPerDay: number | null
  },
  job: { date: string; bookingType: BookingTypeForSlots; durationMins: number; serviceIds: string[] },
  options: { excludeBookingId?: string } = {}
) {
  const durationMins = job.durationMins
  const dayOfWeek = getDayOfWeekFromDate(job.date)
  const [hours, closure] = await Promise.all([
    vendorsRepository.findWorkingHoursForDay(vendor.id, dayOfWeek),
    bookingsRepository.findClosure(vendor.id, job.date),
  ])

  const minNoticeMins = MIN_NOTICE_MS[job.bookingType] / 60_000
  const base = {
    date: job.date,
    serviceIds: job.serviceIds,
    durationMins,
    slotIntervalMins: vendor.slotIntervalMins,
    minNoticeMins,
  }

  const facts: DayFacts = {
    date: job.date,
    pausedAt: vendor.bookingsPausedAt,
    isHoliday: !!closure,
    hours,
    intervalMins: vendor.slotIntervalMins,
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
    busy: [],
  }
  const rule = { durationMins, bookingType: job.bookingType }
  // The day, the hours, the job's length and the notice first, with no
  // bookings counted (lib/slots.ts slotsForDay).
  const first = slotsForDay(facts, rule)
  const day = first.day

  // A paused garage is not "closed on this day" — every day is the same to
  // it — so it says `paused` rather than borrowing isClosed. A holiday is a
  // closed day like a weekly one, and `closedReason` tells the two apart.
  if (!day.open) {
    return {
      ...base,
      isClosed: day.reason !== 'paused',
      closedReason: day.reason === 'paused' ? null : day.reason,
      paused: day.reason === 'paused',
      fitsInDay: true,
      fullSlots: 0,
      slots: [] as string[],
    }
  }

  // Then the garage's room: a time at which it already has as many cars as
  // bays, or a day that has reached its job cap, is not offered. Past times
  // and times too soon for the garage to accept (1h at the garage, 3h
  // doorstep) were dropped above; the bookings are only read when there is
  // something left to filter.
  const busy =
    first.noticed.length > 0
      ? await bookingsRepository.listCapacityHolders({
          vendorId: vendor.id,
          date: job.date,
          excludeBookingId: options.excludeBookingId,
        })
      : []
  const { allDay, noticed, slots } = busy.length > 0 ? slotsForDay({ ...facts, busy }, rule) : first

  log.debug({ vendorId: vendor.id, date: job.date, serviceIds: job.serviceIds, durationMins, bookingType: job.bookingType, count: slots.length, full: noticed.length - slots.length }, 'slots:computed')

  // `fitsInDay` is judged before the notice and capacity filters: an empty
  // list because the job is longer than the garage's day ("pick fewer
  // services") is a different message from an evening with no time left
  // ("pick another day"). `fullSlots` is how many times had enough notice
  // but were booked up, so the picker can say "all booked" when that is why
  // the list is empty.
  return {
    ...base,
    isClosed: false,
    closedReason: null,
    paused: false,
    fitsInDay: allDay.length > 0,
    fullSlots: noticed.length - slots.length,
    slots,
  }
}

export const vendorsService = {
  async listPublicVendors(
    query: ListPublicVendorsQuery
  ): Promise<VendorListResponse> {
    const origin =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : undefined

    // Distance is the most useful default once we know where the customer is,
    // and impossible before then.
    const sort = query.sort ?? (origin ? 'distance' : 'relevance')
    const limit = query.limit ?? DEFAULT_PAGE_SIZE
    const { segment: startSegment, offset } = decodeCursor(query.cursor)

    // The radius (the same on every page) and whether the unpinned tail
    // follows: lib/discovery.ts, where the rules are unit-tested.
    const { radiusKm, includeUnlocated } = listScope({
      hasOrigin: origin !== undefined,
      bbox: query.bbox,
      bookingType: query.bookingType,
      q: query.q,
      radiusKm: query.radiusKm,
      includeUnlocated: query.includeUnlocated,
    })

    let page: Array<{ id: string; distanceM: number | null }> = []
    let segment: Segment = startSegment
    let segmentOffset = offset

    // ── Located garages ──────────────────────────────────────────────────────
    if (segment === 'located') {
      page = await vendorsRepository.listPublicVendorPage({
        origin,
        radiusM: radiusKm === null ? undefined : radiusKm * 1000,
        bbox: query.bbox,
        bookingType: query.bookingType,
        category: query.category,
        certifiedOnly: query.certified,
        q: query.q,
        sort,
        segment: 'located',
        limit,
        offset,
      })

      // The located half is exhausted, so this page continues into the tail.
      if (page.length < limit && includeUnlocated) {
        const tail = await vendorsRepository.listPublicVendorPage({
          bookingType: query.bookingType,
          category: query.category,
          certifiedOnly: query.certified,
          q: query.q,
          sort,
          segment: 'unlocated',
          limit: limit - page.length,
          offset: 0,
        })
        segment = 'unlocated'
        segmentOffset = tail.length
        page = [...page, ...tail]
      } else {
        segmentOffset = offset + page.length
      }
    } else if (includeUnlocated) {
      // ── Unlocated tail, continued ──────────────────────────────────────────
      page = await vendorsRepository.listPublicVendorPage({
        bookingType: query.bookingType,
        category: query.category,
        certifiedOnly: query.certified,
        q: query.q,
        sort,
        segment: 'unlocated',
        limit,
        offset,
      })
      segmentOffset = offset + page.length
    }

    const items = await vendorCardsFor(page, query.q)

    return {
      items,
      // A full page means there may be another. A short one is the end — and in
      // the located segment that is only true once the tail has been offered
      // too, which the segment switch above has already done.
      nextCursor:
        items.length === limit ? encodeCursor(segment, segmentOffset) : null,
      radiusKm,
      appliedRadiusKm: null,
    }
  },

  async getPublicVendor(vendorId: string): Promise<PublicVendorResponse> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [photos, services, aggregates, verified, certified] = await Promise.all([
      vendorsRepository.listPhotos(vendor.id),
      vendorsRepository.listServices(vendor.id, true),
      vendorsRepository.getRatingAggregates([vendor.id]),
      documentsVerifiedIds([vendor.id]),
      certificationService.certifiedIds([vendor.id]),
    ])

    const rating = aggregates[0]

    return {
      ...toPublicVendor(vendor, {
        documentsVerified: verified.has(vendor.id),
        certified: certified.has(vendor.id),
      }),
      photos: photos.map(toPhotoResponse),
      services: services.map((service) => toServiceResponse(service, service.images, 'public')),
      rating: rating ? Number(rating.average.toFixed(2)) : null,
      reviewCount: rating?.count ?? 0,
      outsideServiceCity: outsideServiceCity(vendor),
    }
  },

  async getMyVendor(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    return toVendorResponse(vendor)
  },

  async createVendor(ownerId: string, input: CreateVendorInput) {
    // A second company is the point of this feature, so there is no
    // "vendor already exists" block any more. The guard that replaces it is a
    // sane cap, which stops a scripted signup loop without standing in the way
    // of anyone who genuinely runs a few garages.
    const [{ value: ownedCount }] =
      await membersRepository.countOwnedVendors(ownerId)

    if (Number(ownedCount) >= MAX_COMPANIES_OWNED) {
      throw new AppError(
        409,
        `You can own at most ${MAX_COMPANIES_OWNED} companies`,
        'COMPANY_LIMIT_REACHED'
      )
    }

    const [vendor] = await vendorsRepository.createVendor({
      ownerId,
      ...input,
      // Coordinates are required at creation, so provenance is always known.
      // 'map_pin' rather than 'gps' when the client did not say: it makes the
      // weaker claim, and only 'gps' asserts device-grade accuracy.
      geoSource: input.geoSource ?? 'map_pin',
    })

    await vendorsRepository.setUserAsVendorOwner(ownerId)
    // The owner is always an active vendor_admin. Writing it here is what makes
    // "at least one active vendor_admin exists" true by construction rather
    // than something to enforce with a count query.
    await membersRepository.createOwnerMembership(vendor.id, ownerId)
    log.info({ vendorId: vendor.id, ownerId, businessName: vendor.businessName }, 'vendor:created')

    return toVendorResponse(vendor)
  },

  async updateVendor(vendorId: string, input: UpdateVendorInput) {
    const vendor = await getTenantVendor(vendorId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      ...input,
      // Provenance moves with the coordinates it describes, never on its own.
      // Moving the pin also clears any prior admin confirmation: what was
      // confirmed is not where it now is.
      ...(input.lat !== undefined
        ? {
            geoSource: input.geoSource ?? 'map_pin',
            geoConfirmedAt: null,
          }
        : {}),
    })
    return toVendorResponse(updated)
  },

  async getDoorstepArea(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    const ring = await vendorsRepository.getDoorstepArea(vendor.id)
    return { ring, doorstepRadiusKm: vendor.doorstepRadiusKm }
  },

  async setDoorstepArea(vendorId: string, input: DoorstepAreaInput) {
    const vendor = await getTenantVendor(vendorId)

    // A ring must close. Accepting an open one and silently closing it would
    // hide a client bug that produces a subtly different area than was drawn.
    if (input.ring) {
      const [first] = input.ring
      const last = input.ring[input.ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new AppError(
          400,
          'Coverage area must be a closed ring',
          'INVALID_COVERAGE_AREA'
        )
      }
    }

    await vendorsRepository.setDoorstepArea(vendor.id, input.ring)
    log.info(
      { vendorId: vendor.id, cleared: input.ring === null },
      'vendor:doorstep_area_updated'
    )

    return vendorsRepository.getDoorstepArea(vendor.id).then((ring) => ({ ring }))
  },

  async updateJobTypes(
    vendorId: string,
    input: UpdateJobTypesInput,
    actor: { userId: string; viaSupport: boolean }
  ) {
    const vendor = await getTenantVendor(vendorId)

    // Pickup & drop (0037): turning it on records the owner's tick that the
    // garage is responsible for the car from pickup until it is returned.
    // A Detlio support session cannot give that tick for the garage: a
    // signed agreement is recorded from admin instead.
    let pickupPatch = {}
    if (input.pickupEnabled !== undefined || input.pickupRadiusKm !== undefined) {
      if (
        actor.viaSupport &&
        input.pickupEnabled === true &&
        !isPickupOffered(vendor)
      ) {
        throw new AppError(
          403,
          "Only the garage can accept pickup & drop responsibility here. Record the garage's signed agreement in admin instead.",
          'PICKUP_TERMS_GARAGE_ONLY'
        )
      }
      const person =
        input.pickupEnabled === true ? await vendorsRepository.findUserContact(actor.userId) : null
      const change = planPickupChange(vendor, {
        enabled: input.pickupEnabled,
        radiusKm: input.pickupRadiusKm,
        termsAccepted: input.pickupTermsAccepted,
        actor: person?.name?.trim() || person?.phone || actor.userId,
        now: new Date(),
      })
      if (!change.ok) throw new AppError(400, change.message, change.code)
      pickupPatch = change.patch
      if (input.pickupEnabled !== undefined) {
        log.info(
          { vendorId: vendor.id, actorId: actor.userId, pickupEnabled: input.pickupEnabled },
          'vendor:pickup_updated'
        )
      }
    }

    // No "set a radius first" refusal any more. The travel radius is optional
    // (owner decision, 2026-10-16): a garage that turns doorstep on without
    // one covers DEFAULT_DOORSTEP_RADIUS_KM from its pin (lib/doorstep.ts),
    // in the Doorstep list and at booking alike, so it can be found and booked.
    const patch = {
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && { doorstepEnabled: input.doorstepEnabled }),
      ...(input.doorstepRadiusKm !== undefined && {
        doorstepRadiusKm: input.doorstepRadiusKm,
      }),
      ...pickupPatch,
    }
    // Turning off what is already off leaves nothing to write.
    if (Object.keys(patch).length === 0) return toVendorResponse(vendor)

    const [updated] = await vendorsRepository.updateVendor(vendor.id, patch)
    return toVendorResponse(updated)
  },

  // ─── Holidays and pausing ──────────────────────────────────────────────────
  //
  // Neither touches a booking that already exists. A holiday is shown with the
  // bookings still on that day, and the owner sorts those out with the
  // customers — cancelling them for the garage would be a decision nobody
  // asked it to make.

  async listMyClosures(vendorId: string): Promise<ClosureResponse[]> {
    const vendor = await getTenantVendor(vendorId)
    const today = todayDateKey()
    const closures = await vendorsRepository.listClosures(vendor.id, today)

    if (closures.length === 0) return []

    const last = closures[closures.length - 1].date
    const counts = await bookingsRepository.countActiveBookingsByDate(
      vendor.id,
      today,
      addDaysToDateKey(last, 1)
    )

    return closures.map((closure) =>
      toClosureResponse(closure, counts.get(closure.date) ?? 0)
    )
  },

  async addClosure(vendorId: string, input: CreateClosureInput) {
    const vendor = await getTenantVendor(vendorId)

    const problem = closureDateProblem(input.date)
    if (problem) {
      throw new AppError(
        400,
        problem === 'in_the_past'
          ? 'Pick today or a later day.'
          : 'Holidays can be set up to a year ahead.',
        'INVALID_CLOSURE_DATE'
      )
    }

    const [created] = await vendorsRepository.createClosure(vendor.id, {
      date: input.date,
      reason: input.reason || null,
    })

    if (!created) {
      throw new AppError(
        409,
        'That day is already marked as a holiday.',
        'CLOSURE_EXISTS'
      )
    }

    const bookings = await bookingsRepository.listActiveBookingsForVendorOn(
      vendor.id,
      created.date
    )

    log.info(
      { vendorId: vendor.id, date: created.date, activeBookings: bookings.length },
      'vendor:closure_added'
    )

    return {
      closure: toClosureResponse(created, bookings.length),
      // The jobs still on that day, in the vendor shape: the screen names them
      // so the owner knows whom to call.
      bookings: bookings.map(toVendorBookingResponse),
    }
  },

  async removeClosure(vendorId: string, closureId: string) {
    const vendor = await getTenantVendor(vendorId)
    const [deleted] = await vendorsRepository.deleteClosure(vendor.id, closureId)

    // Another garage's closure id reads exactly like one that never existed.
    if (!deleted) {
      throw new AppError(404, 'Holiday not found', 'CLOSURE_NOT_FOUND')
    }

    log.info({ vendorId: vendor.id, date: deleted.date }, 'vendor:closure_removed')
    // The day is open again: anyone waiting for it hears (0047).
    slotAlertsService.dayChanged(vendor.id, deleted.date, 'holiday_removed')
    return toClosureResponse(deleted, 0)
  },

  async pauseBookings(vendorId: string, input: PauseBookingsInput) {
    const vendor = await getTenantVendor(vendorId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      // Pausing again only changes the reason: "paused since" stays the day
      // it actually stopped.
      bookingsPausedAt: vendor.bookingsPausedAt ?? new Date(),
      bookingsPausedReason: input.reason || null,
    })
    log.info({ vendorId: vendor.id }, 'vendor:bookings_paused')
    return toVendorResponse(updated)
  },

  async resumeBookings(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      bookingsPausedAt: null,
      bookingsPausedReason: null,
    })
    log.info({ vendorId: vendor.id }, 'vendor:bookings_resumed')
    slotAlertsService.garageChanged(vendor.id, 'resumed')
    return toVendorResponse(updated)
  },

  async updateSlotInterval(vendorId: string, input: UpdateSlotIntervalInput) {
    const vendor = await getTenantVendor(vendorId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      slotIntervalMins: input.slotIntervalMins,
    })
    slotAlertsService.garageChanged(vendor.id, 'slot_length_changed')
    return toVendorResponse(updated)
  },

  async getWorkingHours(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    const hours = await vendorsRepository.listWorkingHours(vendor.id)
    return hours.map(toWorkingHoursResponse)
  },

  async setWorkingHours(vendorId: string, input: SetWorkingHoursInput) {
    const vendor = await getTenantVendor(vendorId)

    for (const day of input.days) {
      if (!day.isClosed && day.openTime >= day.closeTime) {
        throw new AppError(
          400,
          `openTime must be before closeTime for day ${day.dayOfWeek}`,
          'INVALID_WORKING_HOURS'
        )
      }
    }

    const hours = await vendorsRepository.upsertWorkingHours(
      vendor.id,
      input.days
    )
    // A day opened or longer hours may have made room (0047).
    slotAlertsService.garageChanged(vendor.id, 'hours_changed')

    return hours.map(toWorkingHoursResponse)
  },

  async listServiceAreas(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    const areas = await vendorsRepository.listServiceAreas(vendor.id)
    return areas.map(toServiceAreaResponse)
  },

  async createServiceArea(vendorId: string, input: CreateServiceAreaInput) {
    const vendor = await getTenantVendor(vendorId)
    const [area] = await vendorsRepository.createServiceArea(vendor.id, input)
    return toServiceAreaResponse(area)
  },

  async deleteServiceArea(vendorId: string, areaId: string) {
    const vendor = await getTenantVendor(vendorId)
    const area = await vendorsRepository.findServiceAreaById(vendor.id, areaId)

    if (!area) {
      throw new AppError(
        404,
        'Service area not found',
        'SERVICE_AREA_NOT_FOUND'
      )
    }

    const [deleted] = await vendorsRepository.deleteServiceArea(
      vendor.id,
      areaId
    )

    return toServiceAreaResponse(deleted)
  },

  async createLogoUploadUrl(vendorId: string, input: LogoUploadUrlInput) {
    const vendor = await getTenantVendor(vendorId)
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      'logo'
    )
    return { uploadUrl, publicUrl }
  },

  async setLogo(vendorId: string, input: SetLogoInput) {
    const vendor = await getTenantVendor(vendorId)

    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid logo URL', 'INVALID_LOGO_URL')
    }

    const previousKey = vendor.logoStorageKey

    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      logoUrl: input.url,
      logoStorageKey: storageKey,
    })

    // Remove the old logo object once the new one is saved.
    if (previousKey && previousKey !== storageKey) {
      await deleteObject(previousKey)
    }

    log.info({ vendorId: vendor.id }, 'vendor:logo-updated')
    return toVendorResponse(updated)
  },

  async deleteLogo(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)

    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      logoUrl: null,
      logoStorageKey: null,
    })

    const key = vendor.logoStorageKey ?? keyFromPublicUrl(vendor.logoUrl ?? '')
    if (key) {
      await deleteObject(key)
    }

    log.info({ vendorId: vendor.id }, 'vendor:logo-removed')
    return toVendorResponse(updated)
  },

  async listPhotos(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    const photos = await vendorsRepository.listPhotos(vendor.id)
    return photos.map(toPhotoResponse)
  },

  async createPhotoUploadUrl(vendorId: string, input: PhotoUploadUrlInput) {
    const vendor = await getTenantVendor(vendorId)

    const [{ count }] = await vendorsRepository.countPhotos(vendor.id)
    if (count >= env.r2MaxPhotosPerVendor) {
      throw new AppError(
        409,
        `You can upload at most ${env.r2MaxPhotosPerVendor} photos`,
        'PHOTO_LIMIT_REACHED'
      )
    }

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType
    )
    return { uploadUrl, publicUrl }
  },

  async addPhoto(vendorId: string, input: CreatePhotoInput) {
    const vendor = await getTenantVendor(vendorId)

    // Only accept URLs that actually point at our bucket.
    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid photo URL', 'INVALID_PHOTO_URL')
    }

    const [{ count }] = await vendorsRepository.countPhotos(vendor.id)
    if (count >= env.r2MaxPhotosPerVendor) {
      throw new AppError(
        409,
        `You can upload at most ${env.r2MaxPhotosPerVendor} photos`,
        'PHOTO_LIMIT_REACHED'
      )
    }

    const [{ maxOrder }] = await vendorsRepository.getNextPhotoSortOrder(
      vendor.id
    )
    const [created] = await vendorsRepository.createPhoto(vendor.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info({ vendorId: vendor.id, photoId: created.id }, 'vendor:photo-added')
    return toPhotoResponse(created)
  },

  async reorderPhotos(vendorId: string, input: ReorderPhotosInput) {
    const vendor = await getTenantVendor(vendorId)
    const existing = await vendorsRepository.listPhotos(vendor.id)
    const existingIds = new Set(existing.map((photo) => photo.id))

    for (const photo of input.photos) {
      if (!existingIds.has(photo.id)) {
        throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
      }
    }

    const photos = await vendorsRepository.updatePhotoSortOrders(
      vendor.id,
      input.photos
    )

    return photos.map(toPhotoResponse)
  },

  async deletePhoto(vendorId: string, photoId: string) {
    const vendor = await getTenantVendor(vendorId)
    const photo = await vendorsRepository.findPhotoById(vendor.id, photoId)

    if (!photo) {
      throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deletePhoto(vendor.id, photoId)

    // Best-effort remove the underlying object so storage doesn't leak.
    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return toPhotoResponse(deleted)
  },

  async listPublicServices(vendorId: string) {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const services = await vendorsRepository.listServices(vendor.id, true)
    return services.map((service) => toServiceResponse(service, service.images, 'public'))
  },

  async listMyServices(vendorId: string) {
    const vendor = await getTenantVendor(vendorId)
    const services = await vendorsRepository.listServices(vendor.id)
    return services.map((service) => toServiceResponse(service))
  },

  async createService(vendorId: string, input: CreateServiceInput) {
    const vendor = await getTenantVendor(vendorId)
    const pricing = resolveServicePricing(input)
    const [service] = await vendorsRepository.createService(vendor.id, {
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      ...pricing,
      durationMins: input.durationMins,
    })

    return toServiceResponse(service)
  },

  async updateService(
    vendorId: string,
    serviceId: string,
    input: UpdateServiceInput
  ) {
    const vendor = await getTenantVendor(vendorId)
    const existing = await vendorsRepository.findServiceById(
      vendor.id,
      serviceId
    )

    if (!existing) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // When the pricing type is provided we rewrite the whole pricing block
    // (type + base price + all tiers) so stale tier values can't linger after
    // switching, say, from per-vehicle to flat. Otherwise leave pricing as-is.
    const pricing =
      input.pricingType !== undefined
        ? resolveServicePricing({
            pricingType: input.pricingType,
            price: input.price,
            priceHatchback: input.priceHatchback,
            priceSedan: input.priceSedan,
            priceSuv: input.priceSuv,
          })
        : input.price !== undefined
          ? { price: input.price.toFixed(2) }
          : {}

    const [updated] = await vendorsRepository.updateService(
      vendor.id,
      serviceId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...pricing,
        ...(input.durationMins !== undefined
          ? { durationMins: input.durationMins }
          : {}),
      }
    )

    return toServiceResponse(updated, existing.images)
  },

  async toggleServiceActive(
    vendorId: string,
    serviceId: string,
    input: ToggleServiceActiveInput
  ) {
    const vendor = await getTenantVendor(vendorId)
    // findAnyServiceById, not findServiceById: activating/deactivating is
    // valid for a package too, and the packages list uses this same endpoint.
    const existing = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!existing) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const [updated] = await vendorsRepository.updateService(
      vendor.id,
      serviceId,
      { isActive: input.isActive }
    )

    return toServiceResponse(updated, existing.images)
  },

  async deleteService(vendorId: string, serviceId: string) {
    const vendor = await getTenantVendor(vendorId)
    const existing = await vendorsRepository.findServiceById(
      vendor.id,
      serviceId
    )

    if (!existing) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // service_package_items holds a restrict FK on the member side, so this
    // delete would fail at the DB with an opaque constraint error. Check first
    // and name the packages, so the vendor knows what to edit.
    const containing = await vendorsRepository.findPackagesContaining(
      vendor.id,
      serviceId
    )

    if (containing.length > 0) {
      throw new AppError(
        409,
        `Remove this service from ${containing
          .map((p) => `"${p.name}"`)
          .join(', ')} before deleting it`,
        'SERVICE_IN_PACKAGE'
      )
    }

    // Bookings name the service they were for, and that history must stay
    // whole, so a service anyone has booked is switched off, never deleted.
    if (await vendorsRepository.isServiceReferenced(serviceId)) {
      throw serviceInUse()
    }

    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      serviceId
    )

    // The rows cascade with the service; the files behind them (R2 photos,
    // Stream videos) don't, so clear them here or storage keeps paying for
    // orphans.
    removeMediaFiles(existing.images)

    return toServiceResponse(deleted, existing.images)
  },

  // ─── Service photos and video ──────────────────────────────────────────────
  //
  // Scoped by service, but valid for a package too — a package is a services
  // row, and its details popup wants the same treatment. The rules (the
  // privacy tick, the limits, AI samples giving way to a real photo) are
  // serviceMediaService's, shared with admin; these wrap them for the
  // garage's app. Each mutation returns the whole service so the client can
  // swap one object into its list rather than reconciling a sub-array.

  async createServiceImageUploadUrl(
    vendorId: string,
    serviceId: string,
    input: ServiceImageUploadUrlInput
  ) {
    const vendor = await getTenantVendor(vendorId)
    return serviceMediaService.createPhotoUploadUrl(
      { kind: 'garage', vendorId: vendor.id },
      serviceId,
      input
    )
  },

  async addServiceImage(vendorId: string, serviceId: string, input: AddPhotoInput) {
    const vendor = await getTenantVendor(vendorId)
    await serviceMediaService.addPhoto({ kind: 'garage', vendorId: vendor.id }, serviceId, input)
    return readServiceOrPackage(vendor.id, serviceId)
  },

  /** Removes a photo or the video. */
  async deleteServiceImage(vendorId: string, serviceId: string, imageId: string) {
    const vendor = await getTenantVendor(vendorId)
    await serviceMediaService.deleteMedia({ kind: 'garage', vendorId: vendor.id }, serviceId, imageId)
    return readServiceOrPackage(vendor.id, serviceId)
  },

  async listMyPackages(vendorId: string): Promise<PackageResponse[]> {
    const vendor = await getTenantVendor(vendorId)
    const packages = await vendorsRepository.listPackages(vendor.id)
    return packages.map((pkg) => toPackageResponse(pkg))
  },

  async listPublicPackages(vendorId: string): Promise<PackageResponse[]> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const packages = await vendorsRepository.listPackages(vendor.id, true)
    return packages.map((pkg) => toPackageResponse(pkg, 'public'))
  },

  async createPackage(vendorId: string, input: CreatePackageInput) {
    const vendor = await getTenantVendor(vendorId)
    await assertValidPackageMembers(vendor.id, input.serviceIds)

    const pricing = resolveServicePricing(input)
    const pkg = await vendorsRepository.createPackage(
      vendor.id,
      {
        name: input.name,
        description: input.description ?? null,
        ...pricing,
        durationMins: input.durationMins,
      },
      input.serviceIds
    )

    const created = await vendorsRepository.findPackageById(vendor.id, pkg.id)
    return toPackageResponse(created as PackageWithItems)
  },

  async updatePackage(
    vendorId: string,
    packageId: string,
    input: UpdatePackageInput
  ) {
    const vendor = await getTenantVendor(vendorId)
    const existing = await vendorsRepository.findPackageById(
      vendor.id,
      packageId
    )

    if (!existing) {
      throw new AppError(404, 'Package not found', 'PACKAGE_NOT_FOUND')
    }

    if (input.serviceIds !== undefined) {
      await assertValidPackageMembers(vendor.id, input.serviceIds)
      await vendorsRepository.replacePackageItems(packageId, input.serviceIds)
    }

    // Same rule as updateService: providing a pricing type rewrites the whole
    // pricing block so stale tiers can't survive a type switch.
    const pricing =
      input.pricingType !== undefined
        ? resolveServicePricing({
            pricingType: input.pricingType,
            price: input.price,
            priceHatchback: input.priceHatchback,
            priceSedan: input.priceSedan,
            priceSuv: input.priceSuv,
          })
        : {}

    await vendorsRepository.updateService(vendor.id, packageId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...pricing,
      ...(input.durationMins !== undefined
        ? { durationMins: input.durationMins }
        : {}),
    })

    const updated = await vendorsRepository.findPackageById(
      vendor.id,
      packageId
    )
    return toPackageResponse(updated as PackageWithItems)
  },

  async deletePackage(vendorId: string, packageId: string) {
    const vendor = await getTenantVendor(vendorId)
    const existing = await vendorsRepository.findPackageById(
      vendor.id,
      packageId
    )

    if (!existing) {
      throw new AppError(404, 'Package not found', 'PACKAGE_NOT_FOUND')
    }

    // Items cascade with the package row. Bookings hold a restrict FK on
    // services, so a package that has ever been booked can't be hard-deleted —
    // the vendor deactivates it instead, exactly like a plain service.
    if (await vendorsRepository.isServiceReferenced(packageId)) {
      throw serviceInUse('package')
    }

    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      packageId
    )

    // A package has its own photos and video, like a service. The rows
    // cascade; the R2 photos and Stream video behind them don't, so clear
    // them here as deleteService does, or Stream keeps billing for a video
    // nothing points at.
    removeMediaFiles(existing.images)

    return toServiceResponse(deleted)
  },

  async getAvailableSlots(
    vendorId: string,
    query: SlotsQueryInput,
    // The booking a reschedule is moving. It holds its current time until the
    // move is written, so counting it would hide the times around its own —
    // at a one-bay garage, every time that overlaps it.
    options: { excludeBookingId?: string } = {}
  ) {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const requested = await vendorsRepository.findPublicServices(
      vendor.id,
      query.serviceIds
    )

    // Every requested service must exist: a partial match would quote times
    // for a shorter job than the customer is about to book.
    if (requested.length !== query.serviceIds.length) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // Services run one after another, so the block to fit is their sum.
    const durationMins = requested.reduce(
      (total, service) => total + service.durationMins,
      0
    )

    return jobSlots(
      vendor,
      { date: query.date, bookingType: query.bookingType, durationMins, serviceIds: query.serviceIds },
      options
    )
  },

  /**
   * The slot list for moving one of the customer's own bookings: the same
   * list, except the booking being moved does not count against the garage.
   * The reschedule itself excludes it the same way (validateSlotAvailability
   * and checkGarageCanTake), so this offers exactly the times it would accept.
   *
   * Someone else's booking, or one at another garage, is a 404 — the same
   * answer as one that does not exist, so ids cannot be probed.
   */
  async getRescheduleSlots(
    userId: string,
    vendorId: string,
    bookingId: string,
    query: SlotsQueryInput
  ) {
    const booking = await bookingsRepository.findBookingById(bookingId)

    if (!booking || booking.userId !== userId || booking.vendorId !== vendorId) {
      throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
    }

    return vendorsService.getAvailableSlots(vendorId, query, {
      excludeBookingId: booking.id,
    })
  },

  /**
   * The garage's holidays over the next couple of months, as IST date keys,
   * so the customer's picker can grey them out like weekly off days.
   */
  async getPublicClosures(vendorId: string): Promise<string[]> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const today = todayDateKey()
    const closures = await vendorsRepository.listClosures(
      vendor.id,
      today,
      addDaysToDateKey(today, PUBLIC_CLOSURE_DAYS_AHEAD)
    )
    return closures.map((closure) => closure.date)
  },

  async getPublicWorkingHours(vendorId: string) {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const hours = await vendorsRepository.listWorkingHours(vendor.id)
    return hours.map(toWorkingHoursResponse)
  },

  /**
   * Everything the Earnings screen and the home dashboard's week-earnings tile
   * used to derive on the client from the vendor booking list.
   *
   * The computation moved here so the money can leave the booking payload
   * entirely (see toVendorBookingResponse). That is what makes the boundary
   * hold: a field that is never serialized cannot be forgotten about on a new
   * endpoint, whereas a role-conditional response shape has to be got right
   * every time. The role check lives in exactly one place — this route's
   * middleware.
   */
  async getEarnings(
    vendorId: string,
    period: 'week' | 'month'
  ): Promise<EarningsResponse> {
    const [bookings, reviews] = await Promise.all([
      bookingsRepository.listBookingsForVendor(vendorId),
      reviewsRepository.listReviewsForVendor(vendorId),
    ])

    // Every booking that earns the garage its payout: finished jobs, and
    // customer no-shows on a payment Detlio kept (the garage held the slot,
    // so it is paid as if the job happened). Garage no-shows and other
    // cancellations earn nothing. The rule is lib/earnings.ts.
    const earning = bookings.flatMap((booking) => {
      const kind = earningKind(booking)
      return kind ? [{ ...booking, kind }] : []
    })
    const inPeriod = earning.filter((booking) =>
      period === 'week'
        ? isWithinDays(booking.scheduledAt, 7)
        : isWithinMonths(booking.scheduledAt, 1)
    )

    const settled = inPeriod.filter((booking) =>
      isSettledPayment(booking.payment?.status)
    )
    const unsettled = inPeriod.filter(
      (booking) => !isSettledPayment(booking.payment?.status)
    )

    const avgRating =
      reviews.length === 0
        ? 0
        : reviews.reduce((sum, review) => sum + review.rating, 0) /
          reviews.length

    return {
      summary: {
        totalEarned: sumPayouts(settled),
        // Jobs the garage did; a no-show is paid for but was not a job.
        jobsDone: inPeriod.filter((booking) => booking.kind === 'job').length,
        pending: sumPayouts(unsettled),
        avgRating,
      },
      // The home dashboard's tile is always the trailing week, regardless of
      // the period the Earnings screen is showing.
      weekEarnings: sumPayouts(
        earning
          .filter((booking) => isWithinDays(booking.scheduledAt, 7))
          .filter((booking) => isSettledPayment(booking.payment?.status))
      ),
      jobs: earning
        .slice()
        .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
        .slice(0, RECENT_EARNINGS_JOBS)
        .map((booking) => ({
          id: booking.id,
          serviceName: booking.items[0]?.name ?? booking.service?.name ?? '',
          serviceNames: booking.items.map((item) => item.name),
          customerName: booking.user?.name ?? 'Customer',
          scheduledAt: booking.scheduledAt.toISOString(),
          bookingType: booking.bookingType,
          amount: payoutOf(booking),
          settled: isSettledPayment(booking.payment?.status),
          kind: booking.kind,
        })),
    }
  },
}
