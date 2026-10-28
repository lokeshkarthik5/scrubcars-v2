import { z } from 'zod'

// "Write with AI" for one service's description. Only the facts the garage
// page already shows, and the garage's business name: nothing about a person
// can reach the model through this schema. Strict, so a stray field (an
// owner's phone pasted into the wrong place by a future caller) is refused
// rather than quietly ignored.
export const describeServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    category: z.enum(['car_wash', 'detailing', 'coating', 'scratch_removal', 'others']),
    pricingType: z.enum(['flat', 'per_vehicle', 'on_inspection']),
    durationMins: z.number().int().positive().max(10_080).optional(),
    garageName: z.string().trim().max(255).optional(),
    // The editor's Points mode (0061) asks for an intro line and "- "
    // points, which keep their shape; left out is a paragraph.
    format: z.enum(['paragraph', 'points']).optional(),
  })
  .strict()

export type DescribeServiceInput = z.infer<typeof describeServiceSchema>
