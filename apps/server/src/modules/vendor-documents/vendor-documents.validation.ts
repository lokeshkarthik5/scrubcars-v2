import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { isCalendarDate } from '../../lib/booking-ops.js'
import {
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_SIDES,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_FILES_PER_DOCUMENT,
  MAX_REJECTION_REASON,
  type DocumentContentType,
} from '../../lib/vendor-documents.js'

const documentType = z.enum(DOCUMENT_TYPES)

const contentType = z.enum(Object.keys(DOCUMENT_CONTENT_TYPES) as [DocumentContentType, ...DocumentContentType[]], {
  message: 'Use a photo (JPEG, PNG or WebP) or a PDF',
})

/** The name the person typed, as the Bin and Payouts ask for it. */
const actorName = signedActorName

export const vendorIdParamSchema = z.object({ vendorId: z.uuid() })

export const documentParamSchema = z.object({ documentId: z.uuid() })

export const fileParamSchema = z.object({ documentId: z.uuid(), fileId: z.uuid() })

export const adminDocumentParamSchema = vendorIdParamSchema.extend({ documentId: z.uuid() })

export const adminFileParamSchema = adminDocumentParamSchema.extend({ fileId: z.uuid() })

/**
 * Asking for an upload link: what kind of document, and the file's type and
 * exact size (the link is signed for that size, so a bigger file is refused
 * by the bucket itself).
 */
export const documentUploadUrlSchema = z
  .object({
    type: documentType,
    contentType,
    sizeBytes: z
      .number()
      .int()
      .positive('That file is empty')
      .max(MAX_DOCUMENT_BYTES, 'Files can be up to 10 MB'),
  })
  .strict()

const fileSchema = z
  .object({
    side: z.enum(DOCUMENT_SIDES),
    // The key the upload link was made for. Checked against the garage's
    // own folder for this type in the service, never trusted as a path.
    key: z.string().min(1).max(512),
  })
  .strict()

const submitFields = {
  type: documentType,
  files: z.array(fileSchema).min(1, 'Add a file').max(MAX_FILES_PER_DOCUMENT, 'Two files at most: front and back'),
  // Trade licence only; the service refuses it on anything else.
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
    .refine(isCalendarDate, 'That date does not exist')
    .nullish(),
}

/** The garage sends the files it uploaded for one document, for review. */
export const submitDocumentSchema = z.object(submitFields).strict()

/**
 * Admin uploads on the garage's behalf (the signed agreement, mostly), with
 * their name, and may mark it approved at once: they are the one checking it.
 */
export const adminSubmitDocumentSchema = z
  .object({ ...submitFields, actorName, approve: z.boolean() })
  .strict()

/**
 * Approve or reject. `version` is the one the admin opened, so a garage
 * uploading again meanwhile is never approved unseen. A rejection says why,
 * in words the garage will read.
 */
export const reviewDocumentSchema = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('approve'), version: z.number().int().positive(), actorName }).strict(),
    z
      .object({
        action: z.literal('reject'),
        version: z.number().int().positive(),
        actorName,
        reason: z
          .string()
          .trim()
          .min(5, 'Say what the garage should fix')
          .max(MAX_REJECTION_REASON, `Keep it under ${MAX_REJECTION_REASON} characters`),
      })
      .strict(),
  ])

export type DocumentUploadUrlInput = z.infer<typeof documentUploadUrlSchema>
export type SubmitDocumentInput = z.infer<typeof submitDocumentSchema>
export type AdminSubmitDocumentInput = z.infer<typeof adminSubmitDocumentSchema>
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>
