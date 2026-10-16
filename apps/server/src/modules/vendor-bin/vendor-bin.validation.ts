import { z } from 'zod'

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

/**
 * The name the person typed. The admin panel signs in with one shared login,
 * so the session alone would make every Bin action 'admin'; the audit row
 * keeps both. Same rule as the test-data reset's.
 */
const actorName = z.string().trim().min(2, 'Type your name').max(100)

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
