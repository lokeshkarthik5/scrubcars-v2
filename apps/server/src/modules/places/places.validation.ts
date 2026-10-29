import { z } from 'zod'
import { PLACE_KINDS, PLACE_TEXT_MAX } from '../../lib/places/kinds.js'

/**
 * POST /admin/places/search: the kinds ticked and/or the team's own words,
 * inside one zone. At least one of the two.
 */
export const placesSearchSchema = z
  .object({
    zoneId: z.string().uuid(),
    kinds: z
      .array(z.enum(PLACE_KINDS))
      .max(PLACE_KINDS.length)
      .default([])
      .transform((kinds) => [...new Set(kinds)]),
    text: z.string().trim().min(2).max(PLACE_TEXT_MAX).optional(),
  })
  .strict()
  .refine((input) => input.kinds.length > 0 || (input.text?.length ?? 0) >= 2, {
    message: 'Tick a kind or type what to look for',
    path: ['kinds'],
  })

export type PlacesSearchInput = z.infer<typeof placesSearchSchema>
