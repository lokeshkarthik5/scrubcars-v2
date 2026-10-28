import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { TIERS } from '../../lib/tiers.js'

export const vendorIdParamSchema = z.object({ vendorId: z.uuid() })

/** Admin Settings → Tiers: one tier on or off for customers. */
export const tierSwitchSchema = z
  .object({ tier: z.enum(TIERS), shown: z.boolean(), actorName: signedActorName })
  .strict()

/** Hide this garage's medal from customers (during a complaint, say), or show it again. */
export const tierHiddenSchema = z.object({ hidden: z.boolean(), actorName: signedActorName }).strict()

export type TierSwitchInput = z.infer<typeof tierSwitchSchema>
export type TierHiddenInput = z.infer<typeof tierHiddenSchema>
