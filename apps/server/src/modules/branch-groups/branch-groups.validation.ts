import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { CHANGE_FIELDS } from '../../lib/branch-groups.js'
import { serviceInputSchema } from '../admin/admin.validation.js'

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

/** "Link an existing garage" and "Remove from group": the other garage. */
export const groupMemberSchema = z
  .object({
    vendorId: z.string().uuid(),
    actorName: signedActorName,
  })
  .strict()

export type GroupMemberInput = z.infer<typeof groupMemberSchema>

/**
 * "All N branches" (0081): the services editor's changes, as its own Save
 * would send them, with the fields each saved service changed. Each service
 * is held to the editor's own schema (prices included), so a branch can
 * never be given a service its own Save would refuse.
 */
const changeBody = {
  changed: z
    .array(
      z
        .object({
          serviceId: z.string().uuid(),
          // None: only its category hint changed, which stays this garage's own.
          fields: z.array(z.enum(CHANGE_FIELDS)).max(CHANGE_FIELDS.length),
          service: serviceInputSchema,
        })
        .strict()
    )
    .max(50)
    .default([]),
  added: z.array(serviceInputSchema).max(50).default([]),
}

const saveChange = z.object({ kind: z.literal('save'), ...changeBody }).strict()
const deleteChange = z.object({ kind: z.literal('delete'), serviceId: z.string().uuid() }).strict()

export const branchServicesPreviewSchema = z
  .object({ change: z.discriminatedUnion('kind', [saveChange, deleteChange]) })
  .strict()
  .refine((body) => body.change.kind === 'delete' || body.change.changed.length + body.change.added.length > 0, {
    message: 'Nothing to change',
  })

export const branchServicesApplySchema = z
  .object({
    change: z.discriminatedUnion('kind', [saveChange, deleteChange]),
    /** The preview's key: refused when the branches changed since (preview = save). */
    key: z.string().regex(/^[0-9a-f]{32}$/),
    actorName: signedActorName,
  })
  .strict()
  .refine((body) => body.change.kind === 'delete' || body.change.changed.length + body.change.added.length > 0, {
    message: 'Nothing to change',
  })

export type BranchServicesPreviewInput = z.infer<typeof branchServicesPreviewSchema>
export type BranchServicesApplyInput = z.infer<typeof branchServicesApplySchema>
