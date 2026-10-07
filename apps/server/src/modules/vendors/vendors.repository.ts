import { and, asc, eq, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingIntentItems,
  bookingIntents,
  bookingItems,
  bookings,
  reviews,
  serviceImages,
  servicePackageItems,
  services,
  users,
  vendorClosures,
  vendorPhotos,
  vendors,
  vendorServiceAreas,
  vendorWorkingHours,
} from '../../db/schema.js'
import type {
  serviceCategoryEnum,
  servicePricingTypeEnum,
} from '../../db/schema.js'

type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]
type VendorSort = 'distance' | 'rating' | 'price_asc' | 'price_desc' | 'relevance'
type ServicePricingType = (typeof servicePricingTypeEnum.enumValues)[number]

export type VendorRecord = typeof vendors.$inferSelect
export type VendorInsert = typeof vendors.$inferInsert
export type VendorUpdate = Partial<Omit<VendorInsert, 'id' | 'ownerId' | 'createdAt'>>
export type WorkingHoursRecord = typeof vendorWorkingHours.$inferSelect
export type ServiceAreaRecord = typeof vendorServiceAreas.$inferSelect
export type PhotoRecord = typeof vendorPhotos.$inferSelect
export type ServiceRecord = typeof services.$inferSelect
export type ServiceImageRecord = typeof serviceImages.$inferSelect
export type ServiceWithImages = ServiceRecord & { images: ServiceImageRecord[] }
export type BookingRecord = typeof bookings.$inferSelect
export type ClosureRecord = typeof vendorClosures.$inferSelect

function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time
}

// Images ride along with every service read, so the garage page never needs a
// second round trip to fill the details popup.
const withImages = {
  images: {
    orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
  },
}

export const vendorsRepository = {
  findVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
    })
  },

  findVendorByOwnerId(ownerId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.ownerId, ownerId),
    })
  },

  findPublicVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: and(
        eq(vendors.id, id),
        eq(vendors.status, 'active'),
        eq(vendors.isVerified, true)
      ),
    })
  },

  /**
   * One page of public vendor ids, already filtered, sorted and bounded.
   *
   * Filtering and sorting are in SQL rather than in JS over the whole table,
   * because neither survives pagination: you cannot sort page 2 of a list the
   * caller can only partly see. That is also why this returns ids rather than
   * rows — the page is chosen here, and the payload for those ids is loaded
   * with Drizzle's relational queries afterwards.
   *
   * All PostGIS calls are schema-qualified (`gis.`), since the extension lives
   * outside `public` and Supabase's pooler does not reliably carry a
   * session-level search_path in transaction mode.
   */
  async listPublicVendorPage(params: {
    origin?: { lat: number; lng: number }
    radiusM?: number
    bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number }
    bookingType?: 'dropin' | 'doorstep'
    category?: ServiceCategory
    q?: string
    sort: VendorSort
    /**
     * Which half of the result set to read.
     *
     * 'located'   — garages with coordinates. Geo-filtered and KNN-ordered.
     * 'unlocated' — garages with no pin yet. Every geo filter is skipped, since
     *               none of them can be evaluated without coordinates.
     *
     * They are read as separate queries rather than one query with
     * `ORDER BY (geo IS NULL), geo <-> point`, because a leading non-geo sort
     * key defeats the KNN index scan — Postgres would fall back to sorting the
     * whole candidate set, which is exactly the property this design exists to
     * preserve.
     */
    segment: 'located' | 'unlocated'
    limit: number
    offset: number
  }): Promise<Array<{ id: string; distanceM: number | null }>> {
    const { origin, bbox, bookingType, category, q, sort, segment, limit, offset } =
      params

    const unlocated = segment === 'unlocated'

    const point =
      origin && !unlocated
        ? sql`gis.ST_SetSRID(gis.ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::gis.geography`
        : null

    const conditions = [
      sql`v.status = 'active'`,
      sql`v.is_verified = true`,
      // A paused garage takes no new bookings, so it is left out of every
      // list a customer browses — search and the map read this too. Its own
      // page still loads (findPublicVendorById does not filter on it) and says
      // why it cannot be booked.
      sql`v.bookings_paused_at IS NULL`,
      unlocated ? sql`v.geo IS NULL` : sql`v.geo IS NOT NULL`,
    ]

    if (q) {
      const term = `%${q}%`
      conditions.push(sql`(v.business_name ILIKE ${term} OR v.city ILIKE ${term})`)
    }

    if (category) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM services s
         WHERE s.vendor_id = v.id AND s.is_active = true AND s.category = ${category}
      )`)
    }

    if (bookingType === 'dropin') conditions.push(sql`v.dropin_enabled = true`)

    if (bookingType === 'doorstep') {
      conditions.push(sql`v.doorstep_enabled = true`)
      // Doorstep asks "who will come to me", so the bound is the garage's own
      // willingness to travel — not a radius the customer picked. A drawn
      // polygon wins when there is one, since real coverage is rarely circular;
      // otherwise the radius applies. A vendor with neither has not opted into
      // travelling anywhere yet, which COALESCE to 0 expresses exactly.
      if (point) {
        conditions.push(sql`CASE
          WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ${point})
          ELSE gis.ST_DWithin(v.geo, ${point}, COALESCE(v.doorstep_radius_km, 0) * 1000, false)
        END`)
      }
    } else if (point && params.radiusM) {
      // `false` selects sphere maths over spheroid: measurably faster, and
      // under 0.5% off at city scale. The spheroid stays for the distance we
      // actually show the customer, below.
      conditions.push(sql`gis.ST_DWithin(v.geo, ${point}, ${params.radiusM}, false)`)
    }

    if (bbox && !unlocated) {
      // OPERATOR(gis.&&), not a bare `&&`. PostGIS lives in the `gis` schema and
      // nothing here relies on search_path, but an infix operator cannot take a
      // `gis.` prefix the way a function can — it needs this form or it fails at
      // runtime with "operator does not exist".
      conditions.push(
        sql`v.geo OPERATOR(gis.&&) gis.ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)::gis.geography`
      )
    }

    const distance = point
      ? sql`gis.ST_Distance(v.geo, ${point})`
      : sql`NULL::double precision`

    // Aggregates needed only for their sorts. Scalar subqueries rather than
    // joins so the rating average cannot fan out the row count.
    const rating = sql`(SELECT avg(r.rating) FROM reviews r WHERE r.vendor_id = v.id)`
    const startingPrice = sql`(
      SELECT min(s.price) FROM services s
       WHERE s.vendor_id = v.id AND s.is_active = true AND s.price > 0
    )`

    const orderBy = (() => {
      // Validation rejects sort=distance without an origin, and the service
      // never picks it without one. Belt-and-braces because the alternative is
      // interpolating a null into the KNN operator, which is a SQL error rather
      // than a wrong answer.
      // Distance is meaningless without an origin, and impossible for a garage
      // with no pin — the unlocated tail falls back to alphabetical.
      const effectiveSort =
        sort === 'distance' && (!point || unlocated) ? 'relevance' : sort

      switch (effectiveSort) {
        // The KNN operator: PostgreSQL walks the GiST index in distance order
        // and stops at LIMIT, rather than scanning the candidate set and
        // sorting it. This is the piece that stays flat as the garage count
        // grows.
        //
        // Spelled OPERATOR(gis.<->) because PostGIS is in the `gis` schema and
        // nothing here relies on search_path. An infix operator cannot take a
        // `gis.` prefix the way a function can, so a bare `<->` fails at
        // runtime with "operator does not exist".
        case 'distance':
          return sql`v.geo OPERATOR(gis.<->) ${point}`
        case 'rating':
          return sql`${rating} DESC NULLS LAST, v.business_name ASC`
        case 'price_asc':
          return sql`${startingPrice} ASC NULLS LAST, v.business_name ASC`
        case 'price_desc':
          return sql`${startingPrice} DESC NULLS LAST, v.business_name ASC`
        default:
          return sql`v.business_name ASC`
      }
    })()

    const rows = await db.execute<{ id: string; distance_m: number | null }>(sql`
      SELECT v.id, ${distance} AS distance_m
        FROM vendors v
       WHERE ${sql.join(conditions, sql` AND `)}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}
    `)

    return Array.from(rows).map((row) => ({
      id: row.id,
      distanceM: row.distance_m === null ? null : Number(row.distance_m),
    }))
  },

  /**
   * Full payload for one page of vendor ids, in the order given. The page is
   * already chosen by `listPublicVendorPage`; this only hydrates it.
   */
  async listPublicVendorsByIds(ids: string[]) {
    if (ids.length === 0) return []

    const rows = await db.query.vendors.findMany({
      where: inArray(vendors.id, ids),
      with: {
        photos: {
          orderBy: [asc(vendorPhotos.sortOrder)],
        },
        services: {
          where: eq(services.isActive, true),
        },
        serviceAreas: true,
        workingHours: {
          orderBy: [asc(vendorWorkingHours.dayOfWeek)],
        },
      },
    })

    // `inArray` does not preserve the ordering the page was chosen in, and that
    // ordering is the whole product of the query above.
    const byId = new Map(rows.map((row) => [row.id, row]))
    return ids.map((id) => byId.get(id)).filter((row) => row !== undefined)
  },

  /**
   * The vendor's drawn doorstep polygon as a GeoJSON ring, or null.
   *
   * Read through an explicit ST_AsGeoJSON rather than by selecting the column:
   * the driver would otherwise hand back EWKB hex, and the browser wants
   * GeoJSON to draw with. Same reason the `geo` columns are not declared in the
   * Drizzle schema at all — see the note at the top of db/schema.ts.
   */
  async getDoorstepArea(
    vendorId: string
  ): Promise<Array<[number, number]> | null> {
    const rows = await db.execute<{ ring: string | null }>(sql`
      SELECT gis.ST_AsGeoJSON(v.doorstep_area) AS ring
        FROM vendors v
       WHERE v.id = ${vendorId}
    `)

    const raw = Array.from(rows)[0]?.ring
    if (!raw) return null

    const parsed = JSON.parse(raw) as { coordinates?: number[][][] }
    // GeoJSON polygons are an array of rings; we only ever store the outer one.
    return (parsed.coordinates?.[0] as Array<[number, number]>) ?? null
  },

  /**
   * Replaces the drawn coverage area. `null` clears it, which falls the vendor
   * back to `doorstep_radius_km`.
   *
   * ST_MakeValid guards the one thing a drag-to-draw UI reliably produces: a
   * self-intersecting ring. An invalid polygon would make every ST_Covers
   * against it throw at *booking* time, which is the worst place to find out.
   */
  async setDoorstepArea(
    vendorId: string,
    ring: Array<[number, number]> | null
  ) {
    // Raw SQL both ways: `doorstep_area` is deliberately not declared in the
    // Drizzle schema, for the same reason the `geo` columns are not — see the
    // note at the top of db/schema.ts.
    if (ring === null) {
      return db.execute(sql`
        UPDATE vendors SET doorstep_area = NULL WHERE id = ${vendorId}
      `)
    }

    const geojson = JSON.stringify({ type: 'Polygon', coordinates: [ring] })

    return db.execute(sql`
      UPDATE vendors
         SET doorstep_area = gis.ST_MakeValid(
               gis.ST_SetSRID(gis.ST_GeomFromGeoJSON(${geojson}), 4326)
             )::gis.geography
       WHERE id = ${vendorId}
    `)
  },

  createVendor(data: VendorInsert) {
    return db.insert(vendors).values(data).returning()
  },

  updateVendor(vendorId: string, data: VendorUpdate) {
    return db
      .update(vendors)
      .set(data)
      .where(eq(vendors.id, vendorId))
      .returning()
  },

  setUserAsVendorOwner(userId: string) {
    return db
      .update(users)
      .set({ isVendorOwner: true })
      .where(eq(users.id, userId))
      .returning()
  },

  listWorkingHours(vendorId: string) {
    return db.query.vendorWorkingHours.findMany({
      where: eq(vendorWorkingHours.vendorId, vendorId),
      orderBy: [asc(vendorWorkingHours.dayOfWeek)],
    })
  },

  /**
   * Average rating and review count per vendor, for the listing cards and the
   * "Top Rated" sort. One grouped query for the whole page rather than one per
   * vendor. Vendors with no reviews are simply absent from the result — callers
   * treat a missing entry as "not yet rated", which is not the same as zero.
   */
  async getRatingAggregates(vendorIds: string[]) {
    if (vendorIds.length === 0) return []

    return db
      .select({
        vendorId: reviews.vendorId,
        average: sql<number>`avg(${reviews.rating})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(inArray(reviews.vendorId, vendorIds))
      .groupBy(reviews.vendorId)
  },

  findWorkingHoursForDay(vendorId: string, dayOfWeek: number) {
    return db.query.vendorWorkingHours.findFirst({
      where: and(
        eq(vendorWorkingHours.vendorId, vendorId),
        eq(vendorWorkingHours.dayOfWeek, dayOfWeek)
      ),
    })
  },

  upsertWorkingHours(
    vendorId: string,
    days: Array<{
      dayOfWeek: number
      openTime: string
      closeTime: string
      isClosed: boolean
    }>
  ) {
    return db.transaction(async (tx) => {
      const results: WorkingHoursRecord[] = []

      for (const day of days) {
        const [row] = await tx
          .insert(vendorWorkingHours)
          .values({
            vendorId,
            dayOfWeek: day.dayOfWeek,
            openTime: normalizeTime(day.openTime),
            closeTime: normalizeTime(day.closeTime),
            isClosed: day.isClosed,
          })
          .onConflictDoUpdate({
            target: [vendorWorkingHours.vendorId, vendorWorkingHours.dayOfWeek],
            set: {
              openTime: normalizeTime(day.openTime),
              closeTime: normalizeTime(day.closeTime),
              isClosed: day.isClosed,
            },
          })
          .returning()

        results.push(row)
      }

      return results.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    })
  },

  // ─── Holidays ──────────────────────────────────────────────────────────────

  /** The garage's holidays from `from` through `to` (inclusive), soonest first. */
  listClosures(vendorId: string, from: string, to?: string) {
    return db.query.vendorClosures.findMany({
      where: and(
        eq(vendorClosures.vendorId, vendorId),
        gte(vendorClosures.date, from),
        ...(to ? [lte(vendorClosures.date, to)] : [])
      ),
      orderBy: [asc(vendorClosures.date)],
    })
  },

  /** The same for a page of garages at once, for the listing cards. */
  listClosuresForVendors(vendorIds: string[], from: string, to: string) {
    if (vendorIds.length === 0) return Promise.resolve([])

    return db.query.vendorClosures.findMany({
      columns: { vendorId: true, date: true },
      where: and(
        inArray(vendorClosures.vendorId, vendorIds),
        gte(vendorClosures.date, from),
        lte(vendorClosures.date, to)
      ),
      orderBy: [asc(vendorClosures.date)],
    })
  },

  findClosureById(vendorId: string, closureId: string) {
    return db.query.vendorClosures.findFirst({
      where: and(
        eq(vendorClosures.id, closureId),
        eq(vendorClosures.vendorId, vendorId)
      ),
    })
  },

  /** Empty when the day is already a holiday — the unique key decides. */
  createClosure(vendorId: string, data: { date: string; reason: string | null }) {
    return db
      .insert(vendorClosures)
      .values({ vendorId, date: data.date, reason: data.reason })
      .onConflictDoNothing({
        target: [vendorClosures.vendorId, vendorClosures.date],
      })
      .returning()
  },

  deleteClosure(vendorId: string, closureId: string) {
    return db
      .delete(vendorClosures)
      .where(
        and(
          eq(vendorClosures.id, closureId),
          eq(vendorClosures.vendorId, vendorId)
        )
      )
      .returning()
  },

  listServiceAreas(vendorId: string) {
    return db.query.vendorServiceAreas.findMany({
      where: eq(vendorServiceAreas.vendorId, vendorId),
      orderBy: [asc(vendorServiceAreas.areaName)],
    })
  },

  createServiceArea(
    vendorId: string,
    data: { areaName: string; pincode: string; radiusKm?: number | null }
  ) {
    return db
      .insert(vendorServiceAreas)
      .values({
        vendorId,
        areaName: data.areaName,
        pincode: data.pincode,
        radiusKm: data.radiusKm ?? null,
      })
      .returning()
  },

  findServiceAreaById(vendorId: string, areaId: string) {
    return db.query.vendorServiceAreas.findFirst({
      where: and(
        eq(vendorServiceAreas.id, areaId),
        eq(vendorServiceAreas.vendorId, vendorId)
      ),
    })
  },

  deleteServiceArea(vendorId: string, areaId: string) {
    return db
      .delete(vendorServiceAreas)
      .where(
        and(
          eq(vendorServiceAreas.id, areaId),
          eq(vendorServiceAreas.vendorId, vendorId)
        )
      )
      .returning()
  },

  listPhotos(vendorId: string) {
    return db.query.vendorPhotos.findMany({
      where: eq(vendorPhotos.vendorId, vendorId),
      orderBy: [asc(vendorPhotos.sortOrder), asc(vendorPhotos.createdAt)],
    })
  },

  getNextPhotoSortOrder(vendorId: string) {
    return db
      .select({
        maxOrder: sql<number>`coalesce(max(${vendorPhotos.sortOrder}), -1)`,
      })
      .from(vendorPhotos)
      .where(eq(vendorPhotos.vendorId, vendorId))
  },

  createPhoto(
    vendorId: string,
    data: { url: string; sortOrder: number; storageKey?: string | null }
  ) {
    return db
      .insert(vendorPhotos)
      .values({
        vendorId,
        url: data.url,
        storageKey: data.storageKey ?? null,
        sortOrder: data.sortOrder,
      })
      .returning()
  },

  countPhotos(vendorId: string) {
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendorPhotos)
      .where(eq(vendorPhotos.vendorId, vendorId))
  },

  findPhotoById(vendorId: string, photoId: string) {
    return db.query.vendorPhotos.findFirst({
      where: and(
        eq(vendorPhotos.id, photoId),
        eq(vendorPhotos.vendorId, vendorId)
      ),
    })
  },

  deletePhoto(vendorId: string, photoId: string) {
    return db
      .delete(vendorPhotos)
      .where(
        and(eq(vendorPhotos.id, photoId), eq(vendorPhotos.vendorId, vendorId))
      )
      .returning()
  },

  updatePhotoSortOrders(
    vendorId: string,
    updates: Array<{ id: string; sortOrder: number }>
  ) {
    return db.transaction(async (tx) => {
      const results: PhotoRecord[] = []

      for (const update of updates) {
        const [row] = await tx
          .update(vendorPhotos)
          .set({ sortOrder: update.sortOrder })
          .where(
            and(
              eq(vendorPhotos.id, update.id),
              eq(vendorPhotos.vendorId, vendorId)
            )
          )
          .returning()

        if (row) {
          results.push(row)
        }
      }

      return results.sort((a, b) => a.sortOrder - b.sortOrder)
    })
  },

  // Plain services only. Packages live in the same table but are listed via
  // listPackages — a caller that means "the vendor's services" must never get
  // packages mixed in, or the garage page renders a bundle as a line item and
  // the admin service count double-counts.
  listServices(vendorId: string, activeOnly = false) {
    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        ne(services.category, 'package'),
        ...(activeOnly ? [eq(services.isActive, true)] : [])
      ),
      orderBy: [asc(services.name)],
      with: withImages,
    })
  },

  listPackages(vendorId: string, activeOnly = false) {
    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        eq(services.category, 'package'),
        ...(activeOnly ? [eq(services.isActive, true)] : [])
      ),
      orderBy: [asc(services.name)],
      with: {
        ...withImages,
        packageItems: {
          orderBy: [asc(servicePackageItems.sortOrder)],
          with: { service: true },
        },
      },
    })
  },

  findPackageById(vendorId: string, packageId: string) {
    return db.query.services.findFirst({
      where: and(
        eq(services.id, packageId),
        eq(services.vendorId, vendorId),
        eq(services.category, 'package')
      ),
      with: {
        ...withImages,
        packageItems: {
          orderBy: [asc(servicePackageItems.sortOrder)],
          with: { service: true },
        },
      },
    })
  },

  // Members a vendor is allowed to bundle: their own, active, non-package
  // services. Used to validate serviceIds before writing the composition.
  findEligiblePackageMembers(vendorId: string, serviceIds: string[]) {
    if (serviceIds.length === 0) return Promise.resolve([])

    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        inArray(services.id, serviceIds),
        ne(services.category, 'package'),
        eq(services.isActive, true)
      ),
    })
  },

  // Packages that contain this service — non-empty means deactivating or
  // deleting the service would leave those packages misrepresenting contents.
  findPackagesContaining(vendorId: string, serviceId: string) {
    return db
      .select({ id: services.id, name: services.name })
      .from(servicePackageItems)
      .innerJoin(services, eq(servicePackageItems.packageId, services.id))
      .where(
        and(
          eq(servicePackageItems.serviceId, serviceId),
          eq(services.vendorId, vendorId)
        )
      )
  },

  // Create the package row and its composition atomically, so a failure part
  // way through can never leave a package with no contents.
  createPackage(
    vendorId: string,
    data: {
      name: string
      description?: string | null
      pricingType: ServicePricingType
      price: string
      priceHatchback?: string | null
      priceSedan?: string | null
      priceSuv?: string | null
      durationMins: number
    },
    serviceIds: string[]
  ) {
    return db.transaction(async (tx) => {
      const [pkg] = await tx
        .insert(services)
        .values({
          vendorId,
          name: data.name,
          description: data.description ?? null,
          category: 'package',
          pricingType: data.pricingType,
          price: data.price,
          priceHatchback: data.priceHatchback ?? null,
          priceSedan: data.priceSedan ?? null,
          priceSuv: data.priceSuv ?? null,
          durationMins: data.durationMins,
        })
        .returning()

      await tx.insert(servicePackageItems).values(
        serviceIds.map((serviceId, index) => ({
          packageId: pkg.id,
          serviceId,
          sortOrder: index,
        }))
      )

      return pkg
    })
  },

  replacePackageItems(packageId: string, serviceIds: string[]) {
    return db.transaction(async (tx) => {
      await tx
        .delete(servicePackageItems)
        .where(eq(servicePackageItems.packageId, packageId))

      await tx.insert(servicePackageItems).values(
        serviceIds.map((serviceId, index) => ({
          packageId,
          serviceId,
          sortOrder: index,
        }))
      )
    })
  },

  // Plain services only — the package endpoints use findPackageById, so a
  // package can't be reshaped through the generic service update/delete path
  // (which has no way to keep its composition coherent).
  findServiceById(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(
        eq(services.id, serviceId),
        eq(services.vendorId, vendorId),
        ne(services.category, 'package')
      ),
      with: withImages,
    })
  },

  // Either kind. Used by the shared active-toggle and the image endpoints,
  // which are valid for both.
  findAnyServiceById(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId)),
      with: withImages,
    })
  },

  findPublicServices(vendorId: string, serviceIds: string[]) {
    return db.query.services.findMany({
      where: and(
        inArray(services.id, serviceIds),
        eq(services.vendorId, vendorId),
        eq(services.isActive, true)
      ),
    })
  },

  createService(
    vendorId: string,
    data: {
      name: string
      description?: string | null
      category: ServiceCategory
      pricingType: ServicePricingType
      price: string
      priceHatchback?: string | null
      priceSedan?: string | null
      priceSuv?: string | null
      durationMins: number
    }
  ) {
    return db
      .insert(services)
      .values({
        vendorId,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        pricingType: data.pricingType,
        price: data.price,
        priceHatchback: data.priceHatchback ?? null,
        priceSedan: data.priceSedan ?? null,
        priceSuv: data.priceSuv ?? null,
        durationMins: data.durationMins,
      })
      .returning()
  },

  updateService(
    vendorId: string,
    serviceId: string,
    data: Partial<{
      name: string
      description: string | null
      category: ServiceCategory
      pricingType: ServicePricingType
      price: string
      priceHatchback: string | null
      priceSedan: string | null
      priceSuv: string | null
      durationMins: number
      isActive: boolean
    }>
  ) {
    return db
      .update(services)
      .set(data)
      .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId)))
      .returning()
  },

  /**
   * Whether anything a customer paid for, or started paying for, names this
   * service. All four columns hold a restrict FK, so deleting a service that
   * any of them points at fails in the database — this is the check that
   * turns that into a message instead of a 500.
   */
  async isServiceReferenced(serviceId: string): Promise<boolean> {
    const rows = await db.execute<{ used: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM ${bookingItems} WHERE ${bookingItems.serviceId} = ${serviceId})
          OR EXISTS (SELECT 1 FROM ${bookings} WHERE ${bookings.serviceId} = ${serviceId})
          OR EXISTS (SELECT 1 FROM ${bookingIntentItems} WHERE ${bookingIntentItems.serviceId} = ${serviceId})
          OR EXISTS (SELECT 1 FROM ${bookingIntents} WHERE ${bookingIntents.serviceId} = ${serviceId})
          AS used
    `)

    return Array.from(rows)[0]?.used === true
  },

  deleteService(vendorId: string, serviceId: string) {
    return db
      .delete(services)
      .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId)))
      .returning()
  },

  listServiceImages(serviceId: string) {
    return db.query.serviceImages.findMany({
      where: eq(serviceImages.serviceId, serviceId),
      orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
    })
  },

  countServiceImages(serviceId: string) {
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceImages)
      .where(eq(serviceImages.serviceId, serviceId))
  },

  getNextServiceImageSortOrder(serviceId: string) {
    return db
      .select({
        maxOrder: sql<number>`coalesce(max(${serviceImages.sortOrder}), -1)`,
      })
      .from(serviceImages)
      .where(eq(serviceImages.serviceId, serviceId))
  },

  createServiceImage(
    serviceId: string,
    data: { url: string; sortOrder: number; storageKey?: string | null }
  ) {
    return db
      .insert(serviceImages)
      .values({
        serviceId,
        url: data.url,
        storageKey: data.storageKey ?? null,
        sortOrder: data.sortOrder,
      })
      .returning()
  },

  findServiceImageById(serviceId: string, imageId: string) {
    return db.query.serviceImages.findFirst({
      where: and(
        eq(serviceImages.id, imageId),
        eq(serviceImages.serviceId, serviceId)
      ),
    })
  },

  deleteServiceImage(serviceId: string, imageId: string) {
    return db
      .delete(serviceImages)
      .where(
        and(
          eq(serviceImages.id, imageId),
          eq(serviceImages.serviceId, serviceId)
        )
      )
      .returning()
  },
}
