import { z } from 'zod'
import { isAllowedNoticeLink } from '../../lib/notices.js'

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')

// Lengths match the columns (0031). The body is short on purpose: a notice
// is one line on a booking tile and two in Updates.
const noticeBaseSchema = z.object({
  title: z.string().trim().min(3).max(60),
  body: z.string().trim().min(3).max(200),
  // https://<host>, or a path inside the app. Never //host, which would leave
  // the app looking like an app link.
  linkUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(isAllowedNoticeLink, 'Use an https:// link or a path in the app, like /bookings')
    .nullable()
    .optional(),
  linkLabel: z.string().trim().min(1).max(30).nullable().optional(),
  audience: z.enum(['all', 'with_booking_between']),
  vendorId: z.string().uuid().nullable().optional(),
  bookingFrom: isoDateSchema.nullable().optional(),
  bookingTo: isoDateSchema.nullable().optional(),
  startsAt: isoDateSchema.optional(),
  endsAt: isoDateSchema,
  isActive: z.boolean(),
})

// No .default() on the base, for the reason discounts.validation.ts gives:
// Zod 4 applies defaults through .partial(), so a PATCH would quietly switch
// a notice back on.
export const createNoticeSchema = noticeBaseSchema.extend({
  isActive: z.boolean().default(true),
})

// The whole-notice rules (both ends of a window, link with its label, end
// after start) are checked on the merged row in notices.service, so a PATCH
// of one field is judged with the rest.
export const updateNoticeSchema = noticeBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required')

export const listNoticesQuerySchema = z.object({
  status: z.enum(['live', 'scheduled', 'ended']).optional(),
})

// "Reaches 14 customers": who a notice would reach, before it is saved.
export const audienceCountQuerySchema = z
  .object({
    audience: z.enum(['all', 'with_booking_between']),
    vendorId: z.string().uuid().optional(),
    bookingFrom: isoDateSchema.optional(),
    bookingTo: isoDateSchema.optional(),
  })
  .refine(
    (data) => data.audience === 'all' || (data.bookingFrom !== undefined && data.bookingTo !== undefined),
    { message: 'A booking window needs both ends', path: ['bookingTo'] }
  )

export const noticeIdParamSchema = z.object({ id: z.string().uuid() })

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>
export type ListNoticesQuery = z.infer<typeof listNoticesQuerySchema>
export type AudienceCountQuery = z.infer<typeof audienceCountQuerySchema>
