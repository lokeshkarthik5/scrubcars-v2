import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { services } from '../../db/schema.js'
import type { ServiceCategory } from '../../lib/categories.js'

/** A live plain service filed under Others, as Settings → Services in Others lists it. */
export interface OthersServiceRow {
  id: string
  name: string
  vendorId: string
  vendorName: string
  pricingType: string
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  approxPrice: string | null
  categoryHintDismissedAt: Date | null
}

/** What a move needs to know about a service before it changes it. */
export interface MovableService {
  id: string
  vendorId: string
  category: ServiceCategory
  isAddon: boolean
  deleted: boolean
  vendorInBin: boolean
}

export const serviceCategoriesRepository = {
  /**
   * Every live plain service in Others at a garage not in the Bin: shown or
   * hidden, never an add-on (always Others, never shown) or a deleted one.
   * One read; the page decides which ones look like another category.
   */
  async listOthers(): Promise<OthersServiceRow[]> {
    const rows = await db.execute<{
      id: string
      name: string
      vendor_id: string
      vendor_name: string
      pricing_type: string
      price: string
      price_hatchback: string | null
      price_sedan: string | null
      price_suv: string | null
      approx_price: string | null
      category_hint_dismissed_at: Date | string | null
    }>(sql`
      SELECT s.id, s.name, s.vendor_id, v.business_name AS vendor_name, s.pricing_type,
             s.price::text AS price, s.price_hatchback::text AS price_hatchback,
             s.price_sedan::text AS price_sedan, s.price_suv::text AS price_suv,
             s.approx_price::text AS approx_price, s.category_hint_dismissed_at
        FROM services s
        JOIN vendors v ON v.id = s.vendor_id
       WHERE s.category = 'others' AND s.is_addon = false AND s.deleted_at IS NULL
         AND v.deleted_at IS NULL
       ORDER BY v.business_name ASC, s.name ASC, s.id ASC
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      name: row.name,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      pricingType: row.pricing_type,
      price: row.price,
      priceHatchback: row.price_hatchback,
      priceSedan: row.price_sedan,
      priceSuv: row.price_suv,
      approxPrice: row.approx_price,
      categoryHintDismissedAt:
        row.category_hint_dismissed_at === null ? null : new Date(row.category_hint_dismissed_at),
    }))
  },

  async findService(id: string): Promise<MovableService | undefined> {
    const rows = await db.execute<{
      id: string
      vendor_id: string
      category: ServiceCategory
      is_addon: boolean
      deleted: boolean
      vendor_in_bin: boolean
    }>(sql`
      SELECT s.id, s.vendor_id, s.category, s.is_addon,
             (s.deleted_at IS NOT NULL) AS deleted, (v.deleted_at IS NOT NULL) AS vendor_in_bin
        FROM services s
        JOIN vendors v ON v.id = s.vendor_id
       WHERE s.id = ${id}
    `)
    const row = Array.from(rows)[0]
    return row
      ? {
          id: row.id,
          vendorId: row.vendor_id,
          category: row.category,
          isAddon: row.is_addon,
          deleted: row.deleted,
          vendorInBin: row.vendor_in_bin,
        }
      : undefined
  },

  /**
   * The category, only while it is still `from` (one statement, so two tabs
   * never both move it). Undefined when it had changed.
   */
  async setCategory(id: string, from: ServiceCategory, to: ServiceCategory) {
    const [row] = await db
      .update(services)
      .set({ category: to })
      .where(
        and(eq(services.id, id), eq(services.category, from), eq(services.isAddon, false), isNull(services.deletedAt))
      )
      .returning({ id: services.id, category: services.category })
    return row
  },

  /** "Not this": kept from the first time; cleared to show the hint again. */
  async setHintDismissed(id: string, dismissed: boolean) {
    const [row] = await db
      .update(services)
      .set({
        categoryHintDismissedAt: dismissed
          ? sql`coalesce(${services.categoryHintDismissedAt}, now())`
          : null,
      })
      .where(and(eq(services.id, id), isNull(services.deletedAt)))
      .returning({ id: services.id, categoryHintDismissedAt: services.categoryHintDismissedAt })
    return row
  },
}
