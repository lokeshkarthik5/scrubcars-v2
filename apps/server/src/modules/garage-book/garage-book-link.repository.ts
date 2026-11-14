import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { garageBookLinkServices, garageBookLinks } from '../../db/schema.js'
import type { WeekHours } from '../../lib/garage-book.js'
import { PAID, num } from './garage-book.repository.js'

/** The booking link's reads and writes (0074). */

export interface LinkGarage {
  vendorId: string
  slug: string
  active: boolean
  businessName: string
  city: string
  lat: number | null
  lng: number | null
  status: string
  deletedAt: Date | null
  purgedAt: Date | null
}

export const linkRepository = {
  async link(vendorId: string) {
    const [row] = await db.select().from(garageBookLinks).where(eq(garageBookLinks.vendorId, vendorId)).limit(1)
    return row ?? null
  },

  async slugTaken(slug: string) {
    const [row] = await db.select({ vendorId: garageBookLinks.vendorId }).from(garageBookLinks).where(eq(garageBookLinks.slug, slug)).limit(1)
    return Boolean(row)
  },

  /** Writes the garage's link with this slug, unless another garage took the slug first: true when written. */
  async insertLink(vendorId: string, slug: string) {
    const rows = await db.execute<{ vendor_id: string }>(sql`
      INSERT INTO garage_book_links (vendor_id, slug) VALUES (${vendorId}, ${slug})
      ON CONFLICT DO NOTHING RETURNING vendor_id
    `)
    return Array.from(rows).length > 0
  },

  async setActive(vendorId: string, active: boolean) {
    await db.update(garageBookLinks).set({ active }).where(eq(garageBookLinks.vendorId, vendorId))
  },

  async bySlug(slug: string): Promise<LinkGarage | null> {
    const rows = await db.execute<{
      vendor_id: string
      slug: string
      active: boolean
      business_name: string
      city: string
      lat: number | null
      lng: number | null
      status: string
      deleted_at: Date | string | null
      purged_at: Date | string | null
    }>(sql`
      SELECT l.vendor_id, l.slug, l.active, v.business_name, v.city, v.lat, v.lng, v.status, v.deleted_at, v.purged_at
        FROM garage_book_links l JOIN vendors v ON v.id = l.vendor_id
       WHERE l.slug = ${slug}
    `)
    const row = Array.from(rows)[0]
    if (!row) return null
    return {
      vendorId: row.vendor_id,
      slug: row.slug,
      active: Boolean(row.active),
      businessName: row.business_name,
      city: row.city,
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
      status: row.status,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      purgedAt: row.purged_at ? new Date(row.purged_at) : null,
    }
  },

  /** The garage's active services, each with whether the page shows it: a plain one does, an add-on doesn't, unless the garage said. */
  async services(vendorId: string) {
    const rows = await db.execute<{
      id: string
      name: string
      price: string
      duration_mins: number | null
      is_addon: boolean
      shown: boolean | null
    }>(sql`
      SELECT s.id, s.name, s.price, s.duration_mins, s.is_addon, ls.shown
        FROM services s
        LEFT JOIN garage_book_link_services ls ON ls.vendor_id = s.vendor_id AND ls.service_id = s.id
       WHERE s.vendor_id = ${vendorId} AND s.is_active = true AND s.deleted_at IS NULL
       ORDER BY s.is_addon, s.name
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      name: row.name,
      price: String(row.price),
      durationMins: row.duration_mins === null ? null : num(row.duration_mins),
      isAddon: Boolean(row.is_addon),
      shown: row.shown === null ? !row.is_addon : Boolean(row.shown),
    }))
  },

  async setShown(vendorId: string, rows: Array<{ serviceId: string; shown: boolean }>) {
    for (const row of rows) {
      await db
        .insert(garageBookLinkServices)
        .values({ vendorId, serviceId: row.serviceId, shown: row.shown })
        .onConflictDoUpdate({
          target: [garageBookLinkServices.vendorId, garageBookLinkServices.serviceId],
          set: { shown: row.shown },
        })
    }
  },

  async hours(vendorId: string): Promise<WeekHours[]> {
    const rows = await db.execute<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>(sql`
      SELECT day_of_week, open_time::text AS open_time, close_time::text AS close_time, is_closed
        FROM vendor_working_hours WHERE vendor_id = ${vendorId}
    `)
    return Array.from(rows).map((row) => ({
      dayOfWeek: num(row.day_of_week),
      openTime: String(row.open_time),
      closeTime: String(row.close_time),
      isClosed: Boolean(row.is_closed),
    }))
  },

  async closures(vendorId: string, fromDate: string, toDate: string) {
    const rows = await db.execute<{ date: string }>(sql`
      SELECT date::text AS date FROM vendor_closures
       WHERE vendor_id = ${vendorId} AND date >= ${fromDate}::date AND date <= ${toDate}::date
    `)
    return new Set(Array.from(rows).map((row) => String(row.date).slice(0, 10)))
  },

  /** Bookings made on the link between two instants (not cancelled ones). */
  async linkBookings(vendorId: string, start: Date, end: Date) {
    const rows = await db.execute<{ n: number | string }>(sql`
      SELECT count(*) AS n FROM garage_jobs
       WHERE vendor_id = ${vendorId} AND origin = 'link' AND status <> 'cancelled'
         AND created_at >= ${start.toISOString()}::timestamptz AND created_at < ${end.toISOString()}::timestamptz
    `)
    return num(Array.from(rows)[0]?.n)
  },

  /**
   * Decision 5: a Detlio customer with this phone who has booked this garage
   * through Detlio (a paid booking here). Only whether one exists: their
   * name and number are never read for the garage.
   */
  async bookedOnDetlio(vendorId: string, phone: string) {
    const rows = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM users u JOIN bookings b ON b.user_id = u.id
         WHERE u.phone = ${phone} AND u.deleted_at IS NULL AND b.vendor_id = ${vendorId}
           AND ${PAID} AND b.status <> 'rescheduled'
      ) AS ok
    `)
    return Boolean(Array.from(rows)[0]?.ok)
  },

  /** Link bookings for this phone at this garage since a moment, for the per-phone limit. */
  async bookingsByPhone(vendorId: string, phone: string, since: Date) {
    const rows = await db.execute<{ n: number | string }>(sql`
      SELECT count(*) AS n FROM garage_jobs j JOIN garage_customers c ON c.id = j.garage_customer_id
       WHERE j.vendor_id = ${vendorId} AND j.origin = 'link' AND c.phone = ${phone}
         AND j.created_at >= ${since.toISOString()}::timestamptz
    `)
    return num(Array.from(rows)[0]?.n)
  },

  async serviceOnLink(vendorId: string, serviceId: string) {
    const list = await this.services(vendorId)
    return list.find((service) => service.id === serviceId && service.shown) ?? null
  },
}
