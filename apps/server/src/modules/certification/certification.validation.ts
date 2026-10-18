import { z } from 'zod'
import { isCalendarDate } from '../../lib/booking-ops.js'
import { QUALITY_CHECK_KINDS, QUALITY_CHECK_RESULTS } from '../../lib/certification.js'

/** The name the person typed, as the Bin and Payouts ask for it. */
const actorName = z.string().trim().min(2, 'Type your name').max(100)

export const vendorIdParamSchema = z.object({ vendorId: z.uuid() })

/**
 * Recording a quality check: the IST date of the visit (not in the future,
 * at most a year back; the service checks against today), what kind, who
 * checked, pass or fail, and notes, which a fail must have.
 */
export const recordCheckSchema = z
  .object({
    checkedOn: z.string().refine(isCalendarDate, 'Use a date like 2026-10-18'),
    kind: z.enum(QUALITY_CHECK_KINDS),
    checkerName: z.string().trim().min(2, "Type the checker's name").max(100),
    result: z.enum(QUALITY_CHECK_RESULTS),
    notes: z.string().trim().max(1000, 'Notes can be up to 1000 characters').nullish(),
    actorName,
  })
  .strict()
  .refine((input) => input.result === 'pass' || (input.notes ?? '').length >= 5, {
    message: 'Say what was wrong',
    path: ['notes'],
  })

export const certifySchema = z.object({ actorName }).strict()

export const revokeSchema = z
  .object({
    actorName,
    reason: z.string().trim().min(5, 'Say why').max(300, 'Up to 300 characters'),
  })
  .strict()

export type RecordCheckInput = z.infer<typeof recordCheckSchema>
export type CertifyInput = z.infer<typeof certifySchema>
export type RevokeInput = z.infer<typeof revokeSchema>
