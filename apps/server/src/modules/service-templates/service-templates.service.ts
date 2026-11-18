import { AppError, hasPgCode } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  serviceNameKey,
  templateDescriptionProblem,
  templateIsNew,
  templateNameProblem,
} from '../../lib/service-templates.js'
import { serviceTemplatesRepository, type TemplatePatch, type TemplateRow } from './service-templates.repository.js'
import type { CreateTemplateInput, UpdateTemplateInput } from './service-templates.validation.js'

const log = logger.child({ module: 'service-templates' })

type Actor = { sub: string; name: string }

/** A template as the panel reads it. Never a price: a template has none. */
export interface ServiceTemplateView {
  id: string
  /** The built-ins' stable key ("foam-wash"); null for the team's own. */
  key: string | null
  name: string
  category: TemplateRow['category']
  durationMins: number
  pricingType: TemplateRow['pricingType']
  description: string
  isOn: boolean
  builtIn: boolean
  /** Added by the team in the last 14 days: marked "New" in the editor. */
  isNew: boolean
  createdByName: string | null
  updatedByName: string | null
  /** "Saved from Kumar Auto Spa's service": the garage, while it exists. */
  sourceVendorId: string | null
  sourceVendorName: string | null
  createdAt: string
  updatedAt: string
}

function toView(row: TemplateRow, now: Date): ServiceTemplateView {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    durationMins: row.durationMins,
    pricingType: row.pricingType,
    description: row.description,
    isOn: row.isOn,
    builtIn: row.builtIn,
    isNew: templateIsNew(row, now),
    createdByName: row.createdByAdmin,
    updatedByName: row.updatedByAdmin,
    sourceVendorId: row.sourceVendorId,
    sourceVendorName: row.sourceVendorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function notFound() {
  return new AppError(404, 'Template not found. Someone may have deleted it; reload the page.', 'TEMPLATE_NOT_FOUND')
}

function nameTaken(name: string) {
  return new AppError(409, `There is already a template called “${name}”. Pick another name.`, 'TEMPLATE_NAME_TAKEN')
}

/** The words' rules, as a plain 400 the sheet shows under its fields. */
function checkWords(input: { name?: string; description?: string }) {
  const problem =
    (input.name !== undefined ? templateNameProblem(input.name) : null) ??
    (input.description !== undefined ? templateDescriptionProblem(input.description) : null)
  if (problem) throw new AppError(400, problem, 'TEMPLATE_INVALID')
}

/**
 * Another template not deleted with the same name, case, spacing and
 * punctuation aside (the editor hides a template a garage has by the same
 * rule). The database's unique index (lower and trimmed) is the backstop
 * for two saves at once.
 */
async function checkNameFree(name: string, exceptId: string | null) {
  const wanted = serviceNameKey(name)
  const rows = await serviceTemplatesRepository.listTemplates()
  const clash = rows.find((row) => row.id !== exceptId && serviceNameKey(row.name) === wanted)
  if (clash) throw nameTaken(clash.name)
}

/**
 * Service templates (0082): Settings → Service templates, "Save as template"
 * in a garage's editor, and the editor's "Add from template" (the
 * switched-on ones). Admin only; garages don't see these yet (owner, 18 Nov
 * 2026). Every change is signed and audited by the repository.
 */
export const serviceTemplatesService = {
  async list(onlyOn: boolean, now: Date = new Date()) {
    const rows = await serviceTemplatesRepository.listTemplates(onlyOn)
    return { templates: rows.map((row) => toView(row, now)) }
  },

  async create(input: CreateTemplateInput, actor: Actor) {
    const name = input.name.trim()
    const description = input.description.trim()
    checkWords({ name, description })
    await checkNameFree(name, null)
    if (input.fromVendorId && !(await serviceTemplatesRepository.vendorExists(input.fromVendorId))) {
      throw new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
    }
    let created
    try {
      created = await serviceTemplatesRepository.createTemplate(
        {
          name,
          category: input.category,
          durationMins: input.durationMins,
          pricingType: input.pricingType,
          description,
          isOn: input.isOn ?? true,
          sourceVendorId: input.fromVendorId ?? null,
        },
        actor
      )
    } catch (err) {
      if (hasPgCode(err, '23505')) throw nameTaken(name)
      throw err
    }
    log.info({ templateId: created.id, fromVendorId: input.fromVendorId ?? null, by: actor.name }, 'service_templates:added')
    return this.view(created.id)
  },

  async update(id: string, input: UpdateTemplateInput, actor: Actor) {
    const existing = await serviceTemplatesRepository.findTemplate(id)
    if (!existing) throw notFound()
    const patch: TemplatePatch = {
      name: input.name?.trim(),
      category: input.category,
      durationMins: input.durationMins,
      pricingType: input.pricingType,
      description: input.description?.trim(),
      isOn: input.isOn,
    }
    checkWords({ name: patch.name, description: patch.description })
    if (patch.name !== undefined && serviceNameKey(patch.name) !== serviceNameKey(existing.name)) {
      await checkNameFree(patch.name, id)
    }
    let updated
    try {
      updated = await serviceTemplatesRepository.updateTemplate(id, patch, actor)
    } catch (err) {
      if (hasPgCode(err, '23505')) throw nameTaken(patch.name ?? existing.name)
      throw err
    }
    if (!updated) throw notFound()
    log.info({ templateId: id, by: actor.name }, 'service_templates:edited')
    return this.view(id)
  },

  async setOn(id: string, on: boolean, actor: Actor) {
    const updated = await serviceTemplatesRepository.updateTemplate(id, { isOn: on }, actor)
    if (!updated) throw notFound()
    log.info({ templateId: id, on, by: actor.name }, 'service_templates:switched')
    return this.view(id)
  },

  async remove(id: string, actor: Actor) {
    const deleted = await serviceTemplatesRepository.deleteTemplate(id, actor)
    if (!deleted) throw notFound()
    log.info({ templateId: id, by: actor.name }, 'service_templates:deleted')
    return { id, deleted: true }
  },

  /** One template as the panel reads it, after a change. */
  async view(id: string, now: Date = new Date()) {
    const row = await serviceTemplatesRepository.findTemplate(id)
    if (!row) throw notFound()
    return toView(row, now)
  },
}
