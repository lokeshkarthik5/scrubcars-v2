import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, serviceTemplates, vendors, type ServiceTemplateRecord } from '../../db/schema.js'

type Actor = { sub: string; name: string }

/** A template with the name of the garage it was saved from, when there is one. */
export type TemplateRow = ServiceTemplateRecord & { sourceVendorName: string | null }

/** What a template can change: its words and shape, and the switch. */
export type TemplatePatch = Partial<
  Pick<ServiceTemplateRecord, 'name' | 'category' | 'durationMins' | 'pricingType' | 'description' | 'isOn'>
>

export type NewTemplate = Pick<
  ServiceTemplateRecord,
  'name' | 'category' | 'durationMins' | 'pricingType' | 'description' | 'isOn'
> & { sourceVendorId: string | null }

/** What every audit row says about the template, so a deleted one is still named. */
function templateSummary(row: Pick<ServiceTemplateRecord, 'id' | 'name' | 'builtIn'>) {
  return { templateId: row.id, template: row.name, builtIn: row.builtIn }
}

const columns = {
  id: serviceTemplates.id,
  key: serviceTemplates.key,
  position: serviceTemplates.position,
  name: serviceTemplates.name,
  category: serviceTemplates.category,
  durationMins: serviceTemplates.durationMins,
  pricingType: serviceTemplates.pricingType,
  description: serviceTemplates.description,
  isOn: serviceTemplates.isOn,
  builtIn: serviceTemplates.builtIn,
  createdByAdmin: serviceTemplates.createdByAdmin,
  updatedByAdmin: serviceTemplates.updatedByAdmin,
  sourceVendorId: serviceTemplates.sourceVendorId,
  createdAt: serviceTemplates.createdAt,
  updatedAt: serviceTemplates.updatedAt,
  deletedAt: serviceTemplates.deletedAt,
  sourceVendorName: vendors.businessName,
}

export const serviceTemplatesRepository = {
  /**
   * Every template not deleted, in the list's order: the built-ins as the
   * code had them, then the team's own, oldest first. One read; a few dozen
   * rows at most. `onlyOn` leaves out the switched-off ones.
   */
  listTemplates(onlyOn = false): Promise<TemplateRow[]> {
    return db
      .select(columns)
      .from(serviceTemplates)
      .leftJoin(vendors, eq(vendors.id, serviceTemplates.sourceVendorId))
      .where(
        and(isNull(serviceTemplates.deletedAt), onlyOn ? eq(serviceTemplates.isOn, true) : undefined)
      )
      .orderBy(
        sql`${serviceTemplates.position} asc nulls last`,
        asc(serviceTemplates.createdAt),
        asc(serviceTemplates.id)
      )
  },

  async findTemplate(id: string): Promise<TemplateRow | undefined> {
    const [row] = await db
      .select(columns)
      .from(serviceTemplates)
      .leftJoin(vendors, eq(vendors.id, serviceTemplates.sourceVendorId))
      .where(and(eq(serviceTemplates.id, id), isNull(serviceTemplates.deletedAt)))
    return row
  },

  /** Whether a garage exists (in the Bin or not), for "Save as template". */
  async vendorExists(id: string): Promise<boolean> {
    const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, id))
    return row !== undefined
  },

  /** Adds a template and its audit row, together. */
  async createTemplate(values: NewTemplate, actor: Actor): Promise<ServiceTemplateRecord> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(serviceTemplates)
        .values({ ...values, builtIn: false, createdByAdmin: actor.name, updatedByAdmin: actor.name })
        .returning()
      await tx.insert(adminAuditLog).values({
        action: values.sourceVendorId ? 'service_template_saved_from_service' : 'service_template_added',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: templateSummary(row!),
        detail: {
          category: row!.category,
          durationMins: row!.durationMins,
          pricingType: row!.pricingType,
          description: row!.description,
          isOn: row!.isOn,
          sourceVendorId: row!.sourceVendorId,
        },
      })
      return row!
    })
  },

  /**
   * Changes a template under its row lock, with an audit row saying what
   * moved from what. The On/Off switch is its own action
   * (service_template_turned_on / _off), as the city switches are.
   * Undefined when it is gone.
   */
  async updateTemplate(id: string, patch: TemplatePatch, actor: Actor): Promise<ServiceTemplateRecord | undefined> {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(serviceTemplates)
        .where(and(eq(serviceTemplates.id, id), isNull(serviceTemplates.deletedAt)))
        .for('update')
      if (!before) return undefined
      const changed = (Object.keys(patch) as Array<keyof TemplatePatch>).filter(
        (key) => patch[key] !== undefined && patch[key] !== before[key]
      )
      if (changed.length === 0) return before
      const [after] = await tx
        .update(serviceTemplates)
        .set({ ...patch, updatedByAdmin: actor.name, updatedAt: sql`now()` })
        .where(eq(serviceTemplates.id, id))
        .returning()
      if (changed.includes('isOn')) {
        await tx.insert(adminAuditLog).values({
          action: after!.isOn ? 'service_template_turned_on' : 'service_template_turned_off',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: templateSummary(after!),
          detail: { isOn: after!.isOn },
        })
      }
      const edited = changed.filter((key) => key !== 'isOn')
      if (edited.length > 0) {
        await tx.insert(adminAuditLog).values({
          action: 'service_template_edited',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: templateSummary(after!),
          detail: Object.fromEntries(edited.map((key) => [key, { from: before[key], to: after![key] }])),
        })
      }
      return after
    })
  },

  /**
   * Deletes a template (soft: kept for the record, out of every list) and
   * writes its audit row with what it said. False when it was already gone.
   */
  async deleteTemplate(id: string, actor: Actor): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(serviceTemplates)
        .where(and(eq(serviceTemplates.id, id), isNull(serviceTemplates.deletedAt)))
        .for('update')
      if (!before) return false
      await tx
        .update(serviceTemplates)
        .set({ deletedAt: sql`now()`, isOn: false, updatedByAdmin: actor.name, updatedAt: sql`now()` })
        .where(eq(serviceTemplates.id, id))
      await tx.insert(adminAuditLog).values({
        action: 'service_template_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: templateSummary(before),
        detail: {
          key: before.key,
          category: before.category,
          durationMins: before.durationMins,
          pricingType: before.pricingType,
          description: before.description,
          isOn: before.isOn,
        },
      })
      return true
    })
  },
}
