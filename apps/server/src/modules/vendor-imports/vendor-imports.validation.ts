import { z } from 'zod'

/**
 * Reading a garage from a document, for the admin's Add garage. Two kinds of
 * body: photos and PDFs (read by the AI), or a Tally responses file (read
 * by fixed rules). Strict, so nothing else rides along.
 */

/** Files in one import: the pages of one garage's form, a poster, a price list. */
export const MAX_IMPORT_FILES = 5

/**
 * All the files together, as base64 characters: about 3 MB of photos and
 * PDFs. The whole request must stay under Vercel's 4.5 MB body limit, and
 * base64 is a third larger than the bytes. The panel shrinks each photo to
 * 2000 px before sending, which is typically 300–800 KB.
 */
export const MAX_IMPORT_BASE64_CHARS = 4_000_000

/** A Tally responses file: hundreds of garages fit well inside this. */
export const MAX_TALLY_CSV_CHARS = 1_000_000

export const IMPORT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

const importFileSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mimeType: z.enum(IMPORT_MIME_TYPES),
    dataBase64: z.string().min(1).max(MAX_IMPORT_BASE64_CHARS),
  })
  .strict()

export const extractImportSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('files'),
      files: z.array(importFileSchema).min(1).max(MAX_IMPORT_FILES),
    })
    .strict(),
  z
    .object({
      source: z.literal('tally_csv'),
      csv: z.string().min(1).max(MAX_TALLY_CSV_CHARS),
    })
    .strict(),
])

export type ExtractImportInput = z.infer<typeof extractImportSchema>

// Who a typed owner phone already belongs to, for the Add garage form.
export const ownerAccountSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'Phone must be a 10-digit number'),
  })
  .strict()

export type OwnerAccountInput = z.infer<typeof ownerAccountSchema>
