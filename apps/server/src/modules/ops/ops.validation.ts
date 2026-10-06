import { z } from 'zod'

// `?dryRun=1` works out the digest without posting it: for checking the
// scheduler and the secret without messaging the team.
export const pendingDigestQuerySchema = z.object({
  dryRun: z.literal('1').optional(),
})

export type PendingDigestQuery = z.infer<typeof pendingDigestQuerySchema>
