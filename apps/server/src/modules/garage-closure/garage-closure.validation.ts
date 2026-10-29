import { z } from 'zod'

/** "Close my garage" (0066): why, in the owner's words (3–500 characters, as the CHECK). */
export const requestClosureSchema = z
  .object({
    reason: z.string().trim().min(3, 'Say why you want to close the garage').max(500),
  })
  .strict()

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

export type RequestClosureInput = z.infer<typeof requestClosureSchema>
