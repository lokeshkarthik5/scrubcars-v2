import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { TEMPLATE_MAX_DURATION_MINS, TEMPLATE_NAME_MAX_CHARS } from '../../lib/service-templates.js'
import { plainServiceCategorySchema, servicePricingTypeSchema } from '../vendors/vendors.validation.js'

export const templateIdParamSchema = z.object({ id: z.string().uuid() })

/** `?on=true`: only the switched-on ones, as the garage editor's "Add from template" lists them. */
export const listTemplatesQuerySchema = z.object({ on: z.enum(['true']).optional() })

const nameSchema = z.string().trim().min(1, 'Give the template a name.').max(TEMPLATE_NAME_MAX_CHARS)
const durationSchema = z.number().int().min(1).max(TEMPLATE_MAX_DURATION_MINS)
// The words' own rules (no prices, times or claims) are the service's, so
// the refusal can say which one in plain words; here only the size.
const descriptionSchema = z.string().max(500)

/**
 * Add template, or Save as template (`fromVendorId`: the garage whose
 * service it was saved from, for "Saved from Kumar Auto Spa's service").
 * Never a price: there is no field for one, and `.strict()` refuses one sent.
 */
export const createTemplateSchema = z
  .object({
    actorName: signedActorName,
    name: nameSchema,
    category: plainServiceCategorySchema,
    durationMins: durationSchema,
    pricingType: servicePricingTypeSchema,
    description: descriptionSchema,
    isOn: z.boolean().optional(),
    fromVendorId: z.string().uuid().optional(),
  })
  .strict()

/** Edit: only what is sent changes. */
export const updateTemplateSchema = z
  .object({
    actorName: signedActorName,
    name: nameSchema.optional(),
    category: plainServiceCategorySchema.optional(),
    durationMins: durationSchema.optional(),
    pricingType: servicePricingTypeSchema.optional(),
    description: descriptionSchema.optional(),
    isOn: z.boolean().optional(),
  })
  .strict()

/** The list's On/Off switch. */
export const setTemplateOnSchema = z
  .object({
    actorName: signedActorName,
    on: z.boolean(),
  })
  .strict()

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>
export type SetTemplateOnInput = z.infer<typeof setTemplateOnSchema>
