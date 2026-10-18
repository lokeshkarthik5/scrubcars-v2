import { z } from 'zod'
import { serviceCategoryEnum } from '../../db/schema.js'

/** GET /users/me/vehicles/:vehicleId/history. The user is always the session's. */
export const carHistoryParamSchema = z.object({
  vehicleId: z.string().uuid(),
})

/** `?category=` narrows the list and its totals to jobs that covered that category. */
export const carHistoryQuerySchema = z.object({
  category: z.enum(serviceCategoryEnum.enumValues).optional(),
})

/** POST /users/me/service-reminders/:reminderId/{dismiss,snooze}. */
export const reminderParamSchema = z.object({
  reminderId: z.string().uuid(),
})

export type CarHistoryParam = z.infer<typeof carHistoryParamSchema>
export type CarHistoryQuery = z.infer<typeof carHistoryQuerySchema>
export type ReminderParam = z.infer<typeof reminderParamSchema>
