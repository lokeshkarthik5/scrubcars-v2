import { AppError } from '../../lib/errors.js'
import type { GeoSource } from '../../lib/geo/index.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import {
  computeAvailableSlots,
  getDayOfWeekFromDate,
} from '../../lib/slots.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import {
  computeStartingPrice,
  resolveServicePricing,
  tiersOf,
  type VehicleTier,
} from '../../lib/pricing.js'

// Fixed order for every per-tier breakdown, so the UI can render rows without
// sorting and the "smallest saving" scan is deterministic.
const VEHICLE_TIERS: VehicleTier[] = ['hatchback', 'sedan', 'suv']
import { categoryLabel } from '../../lib/categories.js'
import { computeVendorPayout } from '../../lib/discounts.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { membersRepository } from '../members/members.repository.js'
import { reviewsRepository } from '../reviews/reviews.repository.js'
import { vendorsRepository } from './vendors.repository.js'

const log = logger.child({ module: 'vendors' })

// How many finished jobs the Earnings screen lists.
const RECENT_EARNINGS_JOBS = 10

// Self-serve create is no longer capped at one company per person. The cap is
// on how many one account may *own* — high enough that a real multi-garage
// operator never meets it, low enough that a scripted loop does.
//
// Deliberately not a count of seats: holding a seat is someone else adding you
// to their garage, and being an operator at ten of them says nothing about
// whether you may start your own.
const MAX_COMPANIES_OWNED = 10
import type {
  PhotoRecord,
  ServiceAreaRecord,
  ServiceImageRecord,
  ServiceRecord,
  VendorRecord,
  WorkingHoursRecord,
} from './vendors.repository.js'
import type {
  CreatePackageInput,
  DoorstepAreaInput,
  CreatePhotoInput,
  CreateServiceAreaInput,
  CreateServiceImageInput,
  CreateServiceInput,
  CreateVendorInput,
  ListPublicVendorsQuery,
  LogoUploadUrlInput,
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
  pickup: string | null
  pickupRadiusKm: number | null
  doorstepRadiusKm: number | null
  geoSource: GeoSource
  /** Set when an admin confirmed the pin on a map. Null means nobody has. */
  geoConfirmedAt: string | null
  bays: number | null
  jobsPerDay: number | null
  vehicleTypes: string[]
  notes: string | null
  isVerified: boolean
  doorstepEnabled: boolean
  dropinEnabled: boolean
  slotIntervalMins: number
  status: string
  createdAt: string
}

export type PublicVendorResponse = Omit<VendorResponse, 'ownerId'> & {
  photos: PhotoResponse[]
  services: ServiceResponse[]
  // null when the vendor has no reviews yet — distinct from a rating of 0.
  rating: number | null
  reviewCount: number
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
   * The radius that actually produced these results, in km. Differs from the
   * requested one when the search auto-widened, and the UI must say so —
   * silently returning 25 km results for a 10 km query makes a far garage look
   * near, which is exactly the trust a distance figure is meant to build.
   */
  appliedRadiusKm: number | null
}

export type WorkingHoursResponse = {
  id: string
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
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
  images: ServiceImageResponse[]
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
function payoutOf(booking: {
  amount: string
  subtotalAmount?: string | null
  discountFundedBy?: 'platform' | 'vendor' | null
}) {
  return computeVendorPayout({
    amount: booking.amount,
    subtotalAmount: booking.subtotalAmount ?? booking.amount,
    discountFundedBy: booking.discountFundedBy ?? null,
  })
}

function sumPayouts(
  bookings: {
    amount: string
    subtotalAmount?: string | null
    discountFundedBy?: 'platform' | 'vendor' | null
  }[]
) {
  return bookings.reduce((sum, booking) => sum + Number(payoutOf(booking)), 0)
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
    doorstepRadiusKm: vendor.doorstepRadiusKm,
    geoSource: vendor.geoSource,
    geoConfirmedAt: vendor.geoConfirmedAt?.toISOString() ?? null,
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
    vehicleTypes: vendor.vehicleTypes,
    notes: vendor.notes,
    isVerified: vendor.isVerified,
    doorstepEnabled: vendor.doorstepEnabled,
    dropinEnabled: vendor.dropinEnabled,
    slotIntervalMins: vendor.slotIntervalMins,
    status: vendor.status,
    createdAt: vendor.createdAt.toISOString(),
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

// `images` is optional on the record because the write paths return a bare row
// from `returning()`. Callers that mutate images pass the fresh list explicitly.
function toServiceResponse(
  service: ServiceRecord & { images?: ServiceImageRecord[] },
  images: ServiceImageRecord[] = service.images ?? []
): ServiceResponse {
  return {
    images: images.map(toServiceImageResponse),
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

function toPackageResponse(pkg: PackageWithItems): PackageResponse {
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
    ...toServiceResponse(pkg),
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

/**
 * Drop-in default. Deliberately not 15 km: nobody drives across a city for a
 * car wash, and a padded list is a worse list. The ladder below handles the
 * small-town case where 10 km genuinely has nothing in it.
 */
const DEFAULT_RADIUS_KM = 10

/**
 * Tried in order until a page comes back non-empty. Widening is visible to the
 * caller via `appliedRadiusKm` — a silent widen would make a far garage look
 * near, which defeats the point of showing a distance at all.
 *
 * Only used when the caller did not pin a radius themselves; an explicit
 * `radiusKm` is taken as a real constraint, not a suggestion.
 */
const RADIUS_LADDER_KM = [10, 25, 50]

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

    // Doorstep is bounded by each vendor's own doorstepRadiusKm, and the map
    // view is bounded by the viewport. Neither takes a customer radius, so
    // neither has anything to widen.
    const usesRadius =
      origin !== undefined &&
      query.bbox === undefined &&
      query.bookingType !== 'doorstep'

    /**
     * Whether to append garages that have no coordinates yet.
     *
     * On by default, because hiding them is the worse failure. Most garages are
     * still unpinned, and a geo filter they cannot satisfy would empty the
     * listing entirely — a customer would see "no garages" for a city full of
     * them. They are appended after the located ones rather than mixed in,
     * since there is no honest way to rank a garage whose distance is unknown
     * against one whose distance is 800 m.
     *
     * The map view is the exception and passes false: a garage with no
     * coordinates cannot be drawn on a map, so there is nothing to show.
     */
    const includeUnlocated = query.bbox ? false : (query.includeUnlocated ?? true)

    const attempts = !usesRadius
      ? [undefined]
      : query.radiusKm !== undefined
        ? [query.radiusKm]
        : RADIUS_LADDER_KM

    let page: Array<{ id: string; distanceM: number | null }> = []
    let appliedRadiusKm: number | null = null
    let segment: Segment = startSegment
    let segmentOffset = offset

    // ── Located garages ──────────────────────────────────────────────────────
    if (segment === 'located') {
      for (const radiusKm of attempts) {
        page = await vendorsRepository.listPublicVendorPage({
          origin,
          radiusM: radiusKm === undefined ? undefined : radiusKm * 1000,
          bbox: query.bbox,
          bookingType: query.bookingType,
          category: query.category,
          q: query.q,
          sort,
          segment: 'located',
          limit,
          offset,
        })
        // Only claim a radius that actually produced something. Otherwise a
        // page made entirely of unlocated garages would be labelled "showing
        // garages within 50 km" — a statement about a radius that matched
        // nothing, attached to results the radius never touched.
        appliedRadiusKm = page.length > 0 ? (radiusKm ?? null) : null
        // Widening only makes sense while looking at the first page. Past that,
        // an empty page means the list ran out, not that the radius was too tight.
        if (page.length > 0 || offset > 0) break
      }

      // The located half is exhausted, so this page continues into the tail.
      if (page.length < limit && includeUnlocated) {
        const tail = await vendorsRepository.listPublicVendorPage({
          bookingType: query.bookingType,
          category: query.category,
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
        q: query.q,
        sort,
        segment: 'unlocated',
        limit,
        offset,
      })
      segmentOffset = offset + page.length
    }

    const rows = await vendorsRepository.listPublicVendorsByIds(
      page.map((row) => row.id)
    )

    const aggregates = await vendorsRepository.getRatingAggregates(
      rows.map((vendor) => vendor.id)
    )
    const ratingsByVendor = new Map(
      aggregates.map((row) => [row.vendorId, row])
    )
    const distanceByVendor = new Map(
      page.map((row) => [row.id, row.distanceM])
    )

    const items = rows.map((vendor): VendorListItemResponse => {
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
      }
    })

    return {
      items,
      // A full page means there may be another. A short one is the end — and in
      // the located segment that is only true once the tail has been offered
      // too, which the segment switch above has already done.
      nextCursor:
        items.length === limit ? encodeCursor(segment, segmentOffset) : null,
      appliedRadiusKm,
    }
  },

  async getPublicVendor(vendorId: string): Promise<PublicVendorResponse> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [photos, services, aggregates] = await Promise.all([
      vendorsRepository.listPhotos(vendor.id),
      vendorsRepository.listServices(vendor.id, true),
      vendorsRepository.getRatingAggregates([vendor.id]),
    ])

    const { ownerId: _ownerId, ...publicVendor } = toVendorResponse(vendor)
    const rating = aggregates[0]

    return {
      ...publicVendor,
      photos: photos.map(toPhotoResponse),
      services: services.map((service) => toServiceResponse(service)),
      rating: rating ? Number(rating.average.toFixed(2)) : null,
      reviewCount: rating?.count ?? 0,
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

  async updateJobTypes(vendorId: string, input: UpdateJobTypesInput) {
    const vendor = await getTenantVendor(vendorId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && { doorstepEnabled: input.doorstepEnabled }),
    })
    return toVendorResponse(updated)
  },

  async updateSlotInterval(vendorId: string, input: UpdateSlotIntervalInput) {
    const vendor = await getTenantVendor(vendorId)
    const [updated] = await vendorsRepository.updateVendor(vendor.id, {
      slotIntervalMins: input.slotIntervalMins,
    })
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
    return services.map((service) => toServiceResponse(service))
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

    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      serviceId
    )

    // The rows cascade with the service; the objects behind them don't, so
    // clear them here or the bucket keeps paying for orphans.
    for (const image of existing.images) {
      const key = image.storageKey ?? keyFromPublicUrl(image.url)
      if (key) {
        await deleteObject(key)
      }
    }

    return toServiceResponse(deleted, existing.images)
  },

  // ─── Service images ────────────────────────────────────────────────────────
  //
  // Scoped by service, but resolved through findAnyServiceById so a package can
  // carry images too — a package is a services row, and its details popup wants
  // the same treatment. Each mutation returns the whole service so the client
  // can swap one object into its list rather than reconciling a sub-array.

  async createServiceImageUploadUrl(
    vendorId: string,
    serviceId: string,
    input: ServiceImageUploadUrlInput
  ) {
    const vendor = await getTenantVendor(vendorId)
    const service = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const [{ count }] = await vendorsRepository.countServiceImages(serviceId)
    if (count >= env.r2MaxImagesPerService) {
      throw new AppError(
        409,
        `You can add at most ${env.r2MaxImagesPerService} images per service`,
        'SERVICE_IMAGE_LIMIT_REACHED'
      )
    }

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      `services/${serviceId}`
    )
    return { uploadUrl, publicUrl }
  },

  async addServiceImage(
    vendorId: string,
    serviceId: string,
    input: CreateServiceImageInput
  ) {
    const vendor = await getTenantVendor(vendorId)
    const service = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    // Only accept URLs that actually point at our bucket.
    const storageKey = keyFromPublicUrl(input.url)
    if (!storageKey) {
      throw new AppError(400, 'Invalid image URL', 'INVALID_SERVICE_IMAGE_URL')
    }

    // Re-check the cap here, not just at presign time: the presigned URL is
    // reusable within its TTL, so this is the check that actually holds.
    const [{ count }] = await vendorsRepository.countServiceImages(serviceId)
    if (count >= env.r2MaxImagesPerService) {
      throw new AppError(
        409,
        `You can add at most ${env.r2MaxImagesPerService} images per service`,
        'SERVICE_IMAGE_LIMIT_REACHED'
      )
    }

    const [{ maxOrder }] =
      await vendorsRepository.getNextServiceImageSortOrder(serviceId)
    const [created] = await vendorsRepository.createServiceImage(serviceId, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: vendor.id, serviceId, imageId: created.id },
      'service:image-added'
    )

    return readServiceOrPackage(vendor.id, serviceId)
  },

  async deleteServiceImage(
    vendorId: string,
    serviceId: string,
    imageId: string
  ) {
    const vendor = await getTenantVendor(vendorId)
    const service = await vendorsRepository.findAnyServiceById(
      vendor.id,
      serviceId
    )

    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const image = await vendorsRepository.findServiceImageById(
      serviceId,
      imageId
    )

    if (!image) {
      throw new AppError(404, 'Image not found', 'SERVICE_IMAGE_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deleteServiceImage(
      serviceId,
      imageId
    )

    // Best-effort remove the underlying object so storage doesn't leak.
    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return readServiceOrPackage(vendor.id, serviceId)
  },

  async listMyPackages(vendorId: string): Promise<PackageResponse[]> {
    const vendor = await getTenantVendor(vendorId)
    const packages = await vendorsRepository.listPackages(vendor.id)
    return packages.map(toPackageResponse)
  },

  async listPublicPackages(vendorId: string): Promise<PackageResponse[]> {
    const vendor = await vendorsRepository.findPublicVendorById(vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const packages = await vendorsRepository.listPackages(vendor.id, true)
    return packages.map(toPackageResponse)
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
    const [deleted] = await vendorsRepository.deleteService(
      vendor.id,
      packageId
    )

    return toServiceResponse(deleted)
  },

  async getAvailableSlots(vendorId: string, query: SlotsQueryInput) {
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

    const dayOfWeek = getDayOfWeekFromDate(query.date)
    const hours = await vendorsRepository.findWorkingHoursForDay(
      vendor.id,
      dayOfWeek
    )

    if (!hours || hours.isClosed) {
      return {
        date: query.date,
        serviceIds: query.serviceIds,
        durationMins,
        slotIntervalMins: vendor.slotIntervalMins,
        isClosed: true,
        slots: [] as string[],
      }
    }

    // Existing bookings are not consulted: capacity is unlimited, so every slot
    // within working hours is offered no matter how many bookings it already has.
    const slots = computeAvailableSlots({
      date: query.date,
      openTime: hours.openTime,
      closeTime: hours.closeTime,
      intervalMins: vendor.slotIntervalMins,
      isClosed: hours.isClosed,
      serviceDurationMins: durationMins,
    })

    log.debug({ vendorId: vendor.id, date: query.date, serviceIds: query.serviceIds, durationMins, count: slots.length }, 'slots:computed')

    // An empty list on an open day means the combined duration does not fit
    // between opening and closing — the client says so rather than showing an
    // empty picker the customer can retry all afternoon.
    return {
      date: query.date,
      serviceIds: query.serviceIds,
      durationMins,
      slotIntervalMins: vendor.slotIntervalMins,
      isClosed: false,
      slots,
    }
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

    const completed = bookings.filter(
      (booking) => booking.status === 'completed'
    )
    const inPeriod = completed.filter((booking) =>
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
        jobsDone: inPeriod.length,
        pending: sumPayouts(unsettled),
        avgRating,
      },
      // The home dashboard's tile is always the trailing week, regardless of
      // the period the Earnings screen is showing.
      weekEarnings: sumPayouts(
        completed
          .filter((booking) => isWithinDays(booking.scheduledAt, 7))
          .filter((booking) => isSettledPayment(booking.payment?.status))
      ),
      jobs: completed
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
          amount: Number(payoutOf(booking)),
          settled: isSettledPayment(booking.payment?.status),
        })),
    }
  },
}
