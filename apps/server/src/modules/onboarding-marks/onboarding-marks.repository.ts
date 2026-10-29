import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  services,
  vendorDocuments,
  vendorOnboardingMarks,
  vendorPayoutAccounts,
  vendors,
} from '../../db/schema.js'
import { hasPgCode } from '../../lib/errors.js'
import type { MissingKey } from '../../lib/vendor-missing.js'

export type MarkRecord = typeof vendorOnboardingMarks.$inferSelect
type MarkInsert = typeof vendorOnboardingMarks.$inferInsert
type MarkPatch = Partial<
  Pick<
    MarkInsert,
    | 'status'
    | 'label'
    | 'note'
    | 'items'
    | 'askedAt'
    | 'askedByName'
    | 'receivedAt'
    | 'updatedByName'
    | 'updatedAt'
  >
>

/** The open-mark index's predicate (0059), for the bulk upsert's ON CONFLICT. */
const OPEN_PRESET = sql.raw(`kind <> 'custom' AND status <> 'received'`)

/** Unique violation: an open mark of that missing key already exists. */
const isUniqueViolation = (error: unknown) => hasPgCode(error, '23505')

export const onboardingMarksRepository = {
  async findGarage(vendorId: string) {
    const [row] = await db
      .select({
        id: vendors.id,
        deletedAt: vendors.deletedAt,
        purgedAt: vendors.purgedAt,
      })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1)
    return row
  },

  findGarages(vendorIds: string[]) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return db
      .select({
        id: vendors.id,
        deletedAt: vendors.deletedAt,
        purgedAt: vendors.purgedAt,
      })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds))
  },

  /** Every mark of the garage: open ones first, newest first. */
  list(vendorId: string): Promise<MarkRecord[]> {
    return db
      .select()
      .from(vendorOnboardingMarks)
      .where(eq(vendorOnboardingMarks.vendorId, vendorId))
      .orderBy(
        sql`(${vendorOnboardingMarks.status} = 'received')`,
        desc(vendorOnboardingMarks.createdAt),
        desc(vendorOnboardingMarks.id)
      )
  },

  async find(
    vendorId: string,
    markId: string
  ): Promise<MarkRecord | undefined> {
    const [row] = await db
      .select()
      .from(vendorOnboardingMarks)
      .where(
        and(
          eq(vendorOnboardingMarks.id, markId),
          eq(vendorOnboardingMarks.vendorId, vendorId)
        )
      )
      .limit(1)
    return row
  },

  /** 'exists' when the garage already has an open mark of that missing key. */
  async insert(values: MarkInsert): Promise<MarkRecord | 'exists'> {
    try {
      const [row] = await db
        .insert(vendorOnboardingMarks)
        .values(values)
        .returning()
      return row!
    } catch (error) {
      if (isUniqueViolation(error)) return 'exists'
      throw error
    }
  },

  /**
   * Undefined when it is not the garage's; 'exists' when reopening it would
   * make a second open mark of its missing key.
   */
  async update(
    vendorId: string,
    markId: string,
    patch: MarkPatch
  ): Promise<MarkRecord | 'exists' | undefined> {
    try {
      const [row] = await db
        .update(vendorOnboardingMarks)
        .set(patch)
        .where(
          and(
            eq(vendorOnboardingMarks.id, markId),
            eq(vendorOnboardingMarks.vendorId, vendorId)
          )
        )
        .returning()
      return row
    } catch (error) {
      if (isUniqueViolation(error)) return 'exists'
      throw error
    }
  },

  /**
   * One change to a mark, read and written under its row lock (FOR UPDATE),
   * so two people ticking items of the same mark at once each keep their
   * tick. `change` is handed the row as it stands and returns the patch
   * (the service's rules). Undefined when it is not the garage's; 'exists'
   * as in update.
   */
  async updateLocked(
    vendorId: string,
    markId: string,
    change: (row: MarkRecord) => MarkPatch
  ): Promise<MarkRecord | 'exists' | undefined> {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(vendorOnboardingMarks)
          .where(
            and(
              eq(vendorOnboardingMarks.id, markId),
              eq(vendorOnboardingMarks.vendorId, vendorId)
            )
          )
          .for('update')
        if (!row) return undefined
        const [updated] = await tx
          .update(vendorOnboardingMarks)
          .set(change(row))
          .where(eq(vendorOnboardingMarks.id, markId))
          .returning()
        return updated
      })
    } catch (error) {
      if (isUniqueViolation(error)) return 'exists'
      throw error
    }
  },

  async remove(vendorId: string, markId: string): Promise<boolean> {
    const rows = await db
      .delete(vendorOnboardingMarks)
      .where(
        and(
          eq(vendorOnboardingMarks.id, markId),
          eq(vendorOnboardingMarks.vendorId, vendorId)
        )
      )
      .returning({ id: vendorOnboardingMarks.id })
    return rows.length > 0
  },

  /**
   * In one transaction, per garage: each missing key's open mark moves to
   * Asked (one is made, as Asked, where there is none: an upsert on the
   * open-mark index, so two people asking at once make one), then the named
   * marks of that garage not yet Received. The rows as they now stand.
   */
  async markAsked(
    garages: ReadonlyArray<{
      vendorId: string
      kinds: readonly MissingKey[]
      markIds: readonly string[]
    }>,
    actorName: string,
    now: Date
  ): Promise<MarkRecord[]> {
    const asked = {
      status: 'asked' as const,
      askedAt: now,
      askedByName: actorName,
      receivedAt: null,
      updatedByName: actorName,
      updatedAt: now,
    }
    return db.transaction(async (tx) => {
      const out: MarkRecord[] = []
      for (const garage of garages) {
        if (garage.kinds.length > 0) {
          const rows = await tx
            .insert(vendorOnboardingMarks)
            .values(
              garage.kinds.map((kind) => ({
                vendorId: garage.vendorId,
                kind,
                ...asked,
                createdByName: actorName,
                createdAt: now,
              }))
            )
            .onConflictDoUpdate({
              target: [
                vendorOnboardingMarks.vendorId,
                vendorOnboardingMarks.kind,
              ],
              targetWhere: OPEN_PRESET,
              set: asked,
            })
            .returning()
          out.push(...rows)
        }
        if (garage.markIds.length > 0) {
          const rows = await tx
            .update(vendorOnboardingMarks)
            .set(asked)
            .where(
              and(
                eq(vendorOnboardingMarks.vendorId, garage.vendorId),
                inArray(vendorOnboardingMarks.id, [...garage.markIds]),
                ne(vendorOnboardingMarks.status, 'received')
              )
            )
            .returning()
          out.push(...rows)
        }
      }
      return out
    })
  },

  /** Every garage's marks not yet Received, oldest first: one grouped read. */
  listOpenBriefs() {
    return db
      .select({
        id: vendorOnboardingMarks.id,
        vendorId: vendorOnboardingMarks.vendorId,
        kind: vendorOnboardingMarks.kind,
        label: vendorOnboardingMarks.label,
        status: vendorOnboardingMarks.status,
        askedAt: vendorOnboardingMarks.askedAt,
        // The checklist's progress (0064), read as the mark is.
        items: vendorOnboardingMarks.items,
        note: vendorOnboardingMarks.note,
      })
      .from(vendorOnboardingMarks)
      .where(ne(vendorOnboardingMarks.status, 'received'))
      .orderBy(
        asc(vendorOnboardingMarks.createdAt),
        asc(vendorOnboardingMarks.id)
      )
  },

  // ─── What the missing keys read (lib/vendor-missing.ts) ────────────────────

  /**
   * The garages' own facts the missing keys read, for a few garages (the
   * editor's one, a collection list's). The Garages list reads its own.
   */
  listMissingFacts(vendorIds: string[]) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return db.query.vendors.findMany({
      where: inArray(vendors.id, vendorIds),
      columns: {
        id: true,
        logoUrl: true,
        lat: true,
        lng: true,
        doorstepEnabled: true,
        doorstepRadiusKm: true,
        bays: true,
      },
      with: {
        photos: { columns: { id: true } },
        // Live plain services, as everywhere in admin.
        services: {
          columns: {
            pricingType: true,
            price: true,
            priceHatchback: true,
            priceSedan: true,
            priceSuv: true,
          },
          where: and(
            eq(services.isActive, true),
            ne(services.category, 'package')
          ),
        },
        workingHours: { columns: { isClosed: true } },
      },
    })
  },

  /**
   * Of these garages, the ones that drew their own doorstep area. Raw SQL:
   * `doorstep_area` is not declared in the Drizzle schema.
   */
  async listDrawnAreaIds(vendorIds: string[]): Promise<string[]> {
    if (vendorIds.length === 0) return []
    const rows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(inArray(vendors.id, vendorIds), sql`doorstep_area IS NOT NULL`)
      )
    return rows.map((row) => row.id)
  },

  /**
   * Payout accounts, as whether they can be paid to: every garage's in one
   * read when no ids are given (the Garages list). Never shown.
   */
  listPayoutAccounts(vendorIds?: string[]) {
    if (vendorIds && vendorIds.length === 0) return Promise.resolve([])
    return db
      .select({
        vendorId: vendorPayoutAccounts.vendorId,
        accountNumber: vendorPayoutAccounts.accountNumber,
        ifsc: vendorPayoutAccounts.ifsc,
        upiId: vendorPayoutAccounts.upiId,
      })
      .from(vendorPayoutAccounts)
      .where(
        vendorIds
          ? inArray(vendorPayoutAccounts.vendorId, vendorIds)
          : undefined
      )
  },

  /** These garages' documents as type and status only. */
  listDocumentStates(vendorIds: string[]) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return db
      .select({
        vendorId: vendorDocuments.vendorId,
        type: vendorDocuments.type,
        status: vendorDocuments.status,
      })
      .from(vendorDocuments)
      .where(inArray(vendorDocuments.vendorId, vendorIds))
  },
}
