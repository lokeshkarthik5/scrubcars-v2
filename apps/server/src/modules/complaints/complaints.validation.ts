import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import {
  COMPLAINT_ADMIN_NOTE_MAX,
  COMPLAINT_CATEGORIES,
  LOGGED_COMPLAINT_SOURCES,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_MESSAGE_MIN,
  COMPLAINT_RESOLUTION_MAX,
  COMPLAINT_ERROR_REASON_MAX,
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

/**
 * The ten national digits of an Indian mobile, however it was typed or
 * pasted ("+91 98765 43210", "098765 43210"): the shape users.phone holds.
 * The country code and trunk prefix are peeled off only while more than ten
 * digits remain, so a number that starts with 91 is never eaten.
 */
export function nationalMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  while (digits.length > 10) {
    if (digits.startsWith('0')) digits = digits.slice(1)
    else if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(2)
    else break
  }
  return digits
}

const mobileSchema = z
  .string()
  .max(30)
  .transform(nationalMobileDigits)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'))

/** "#C0A10001", "c0a10001": a booking's 8-character reference, as lowercase hex. */
const bookingRefSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^#/, '').toLowerCase())
  .pipe(z.string().regex(/^[0-9a-f]{8}$/, 'A booking reference is 8 letters and numbers, like #3F2A9C1B'))

/**
 * A complaint the team logs from a call, a WhatsApp message, an email or a
 * visit. Strict, like the customer's: no status, user id or garage can ride
 * along. The account is found by the phone, and the garage by the booking,
 * on the server; `customerName` is only used when no account has this phone.
 * `receivedAt` is when Detlio got it (the clock starts there), up to 7 days
 * back; left out, it is now. `loggedBy` is the signed-in admin's
 * name (adminSignedJson, 0058).
 */
export const logComplaintSchema = z
  .object({
    phone: mobileSchema,
    customerName: z.string().trim().min(1).max(255).optional(),
    source: z.enum(LOGGED_COMPLAINT_SOURCES),
    category: z.enum(COMPLAINT_CATEGORIES),
    message: z
      .string()
      .trim()
      .min(COMPLAINT_MESSAGE_MIN, `Write a little more: at least ${COMPLAINT_MESSAGE_MIN} characters.`)
      .max(COMPLAINT_MESSAGE_MAX),
    bookingRef: bookingRefSchema.optional(),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    loggedBy: signedActorName,
  })
  .strict()

/** The log form's look-ups, as the team types: who has this phone, which booking is this. */
export const complaintLookupQuerySchema = z
  .object({
    phone: mobileSchema.optional(),
    bookingRef: bookingRefSchema.optional(),
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

/** "Logged in error" (0065): why, signed by the session. */
export const loggedInErrorSchema = z
  .object({
    reason: z.string().trim().min(3, 'Say in a few words why').max(COMPLAINT_ERROR_REASON_MAX),
    actorName: signedActorName,
  })
  .strict()

/** Undo "Logged in error": signed by the session. */
export const undoLoggedInErrorSchema = z.object({ actorName: signedActorName }).strict()

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>
export type LoggedInErrorInput = z.infer<typeof loggedInErrorSchema>
export type LogComplaintInput = z.infer<typeof logComplaintSchema>
export type ComplaintLookupQuery = z.infer<typeof complaintLookupQuerySchema>
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>
export type ResolveComplaintInput = z.infer<typeof resolveComplaintSchema>
export type CloseComplaintInput = z.infer<typeof closeComplaintSchema>
export type ComplaintAdminNoteInput = z.infer<typeof complaintAdminNoteSchema>
