import { z } from 'zod'

/** GET /admin/today takes no options: the inbox is always "now", in Chennai. */
export const todayQuerySchema = z.object({}).strict()

export type TodayQuery = z.infer<typeof todayQuerySchema>
