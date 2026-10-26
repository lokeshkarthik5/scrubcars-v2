import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

/**
 * Who did it: the signed-in admin's name, filled in by adminSignedJson
 * (0058); a typed name is ignored. The audit row keeps it and the session.
 */
const actorName = signedActorName

/** Moving a garage to the Bin: who, and why if they say (optional, like the pause reason). */
export const binVendorSchema = z
  .object({
    actorName,
    reason: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict()

export const restoreVendorSchema = z.object({ actorName }).strict()

/**
 * Delete forever: who, the garage's name typed out (checked against the row
 * in the service, where the row is), and the fingerprint of the preview the
 * dialog showed, so what is deleted is exactly what was shown.
 */
export const deleteVendorForeverSchema = z
  .object({
    actorName,
    confirmName: z.string().max(255),
    selectionHash: z.string().regex(/^[0-9a-f]{64}$/, 'Open Delete forever again'),
  })
  .strict()

export type BinVendorInput = z.infer<typeof binVendorSchema>
export type RestoreVendorInput = z.infer<typeof restoreVendorSchema>
export type DeleteVendorForeverInput = z.infer<typeof deleteVendorForeverSchema>
