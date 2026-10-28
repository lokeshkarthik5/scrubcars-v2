import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { AGREEMENT_CONTENT_TYPE, AGREEMENT_MAX_BYTES, AGREEMENT_NOTE_MAX } from '../../lib/agreements.js'

/** Admin asks for a link to upload the next version's PDF: its exact size. */
export const agreementUploadUrlSchema = z
  .object({
    contentType: z.literal(AGREEMENT_CONTENT_TYPE, { message: 'The agreement must be a PDF' }),
    sizeBytes: z
      .number()
      .int()
      .positive('That file is empty')
      .max(AGREEMENT_MAX_BYTES, 'The PDF can be up to 10 MB'),
  })
  .strict()

/**
 * Publishing the uploaded PDF as the next version: the key the link was
 * made for (checked in the service, never trusted as a path) and what
 * changed, for the team and the garages.
 */
export const publishAgreementSchema = z
  .object({
    key: z.string().min(1).max(300),
    note: z
      .string()
      .trim()
      .max(AGREEMENT_NOTE_MAX, `Keep it under ${AGREEMENT_NOTE_MAX} characters`)
      .nullish(),
    actorName: signedActorName,
  })
  .strict()

/**
 * The garage's owner seat agrees: the version it read, and the tick. The
 * tick must be true; anything else is not agreeing.
 */
export const acceptAgreementSchema = z
  .object({
    version: z.number().int().positive(),
    agreed: z.literal(true, { message: 'Tick “I agree to the terms” first' }),
  })
  .strict()

export type AgreementUploadUrlInput = z.infer<typeof agreementUploadUrlSchema>
export type PublishAgreementInput = z.infer<typeof publishAgreementSchema>
export type AcceptAgreementInput = z.infer<typeof acceptAgreementSchema>
