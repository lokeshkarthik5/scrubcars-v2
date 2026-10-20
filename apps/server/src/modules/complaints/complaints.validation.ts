import { z } from 'zod'
import {
  COMPLAINT_ADMIN_NOTE_MAX,
  COMPLAINT_CATEGORIES,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_MESSAGE_MIN,
  COMPLAINT_RESOLUTION_MAX,
} from '../../lib/complaints.js'

/**
 * A customer's complaint. The booking is optional (the Contact page has
 * none) and must be the customer's own, which the service checks; the
 * garage is never sent, it is the booking's. Strict, so nothing else (a
 * status, a garage, someone else's user id) can ride along.
 */
export const createComplaintSchema = z
  .object({
    category: z.enum(COMPLAINT_CATEGORIES),
    message: z
      .string()
      .trim()
      .min(COMPLAINT_MESSAGE_MIN, `Tell us a little more: at least ${COMPLAINT_MESSAGE_MIN} characters.`)
      .max(COMPLAINT_MESSAGE_MAX),
    bookingId: z.string().uuid().optional(),
  })
  .strict()

/** Admin's list: Open (waiting), Overdue, Resolved (resolved or closed), All. */
export const listComplaintsQuerySchema = z.object({
  show: z.enum(['open', 'overdue', 'resolved', 'all']).default('open'),
})

export const complaintIdParamSchema = z.object({ id: z.string().uuid() })

/** Resolving needs words the customer will read. */
export const resolveComplaintSchema = z
  .object({
    resolutionNote: z.string().trim().min(1, 'Write what you did, for the customer').max(COMPLAINT_RESOLUTION_MAX),
  })
  .strict()

/**
 * Closing may say why, to the customer ("A duplicate of C-000122"). Left
 * out, the note already there (from a resolution) stays.
 */
export const closeComplaintSchema = z
  .object({
    resolutionNote: z.string().trim().min(1).max(COMPLAINT_RESOLUTION_MAX).optional(),
  })
  .strict()

/** The team's own note. Empty clears it. Never sent to the customer. */
export const complaintAdminNoteSchema = z
  .object({
    adminNote: z.string().trim().max(COMPLAINT_ADMIN_NOTE_MAX),
  })
  .strict()

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>
export type ResolveComplaintInput = z.infer<typeof resolveComplaintSchema>
export type CloseComplaintInput = z.infer<typeof closeComplaintSchema>
export type ComplaintAdminNoteInput = z.infer<typeof complaintAdminNoteSchema>
