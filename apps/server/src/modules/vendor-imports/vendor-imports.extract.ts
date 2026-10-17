import { AiUnavailableError, type DocumentClient, type DocumentFile } from '../../lib/ai.js'
import { AppError } from '../../lib/errors.js'
import {
  DRAFT_FIELDS,
  NoteBook,
  servicePath,
  type GarageDraft,
  type GarageImport,
} from '../../lib/garage-import/draft.js'
import { garagesFromTallyCsv } from '../../lib/garage-import/tally.js'
import {
  READING_INSTRUCTIONS,
  READING_JSON_SCHEMA,
  importFromReading,
  parseReading,
} from '../../lib/garage-import/vision.js'
import { createVendorSchema, serviceInputSchema } from '../admin/admin.validation.js'
import { MAX_IMPORT_BASE64_CHARS, type ExtractImportInput } from './vendor-imports.validation.js'

/**
 * The garage import's decisions with the reader passed in: which files are
 * taken, how each way a read can end becomes a status the panel
 * understands, and the last check of every draft against what Create will
 * accept. Apart from vendor-imports.service.ts (which wires the env-built
 * reader and the logger), so the tests can drive every ending with a fake.
 *
 * The files live in this request's memory and nowhere else: not stored,
 * not logged (only their count and size are), gone when it answers.
 */

/** Where the outcome of a read goes. The service passes the logger. */
export interface ImportLog {
  info(details: Record<string, unknown>, message: string): void
  warn(details: Record<string, unknown>, message: string): void
}

/** One garage the panel can open on the review screen. */
export interface ImportedGarage extends GarageImport {
  label: { businessName: string | null; ownerName: string | null; submittedAt: string | null }
}

/**
 * Enough for a cut-off answer to be rare: a 50-service price list is about
 * 4,000 tokens of JSON, and on a reasoning model the ceiling also covers
 * its thinking.
 */
const MAX_OUTPUT_TOKENS = 16_000

const unreadable = (message: string) => new AppError(422, message, 'IMPORT_UNREADABLE')

/** The first bytes each accepted type starts with. */
function looksLike(mimeType: DocumentFile['mimeType'], bytes: Buffer): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    case 'image/webp':
      return bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP'
    case 'application/pdf':
      return bytes.subarray(0, 5).toString('latin1') === '%PDF-'
  }
}

/**
 * Each file is what it says it is. A HEIC renamed .jpg, a Word file, a
 * broken upload are refused here, with the file's name, rather than sent
 * to OpenAI to fail there.
 */
export function checkFiles(files: DocumentFile[]) {
  const total = files.reduce((sum, file) => sum + file.dataBase64.length, 0)
  if (total > MAX_IMPORT_BASE64_CHARS) {
    throw new AppError(
      413,
      'These files are too big to read together. Send fewer pages, or smaller photos.',
      'IMPORT_TOO_LARGE'
    )
  }
  for (const file of files) {
    const valid = /^[A-Za-z0-9+/]+={0,2}$/.test(file.dataBase64) && file.dataBase64.length % 4 === 0
    const head = valid ? Buffer.from(file.dataBase64.slice(0, 16), 'base64') : Buffer.alloc(0)
    if (!valid || !looksLike(file.mimeType, head)) {
      throw unreadable(
        `“${file.name}” isn't a JPEG, PNG, WebP or PDF file. Take a screenshot of it, or save it as a PDF, and try again.`
      )
    }
  }
}

const DESCRIPTIONS_MAX = 5000
const MAX_SERVICES = 50

/** A Maps link as people paste it: "maps.app.goo.gl/x" is given its https://. */
function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, '')}`
}

/**
 * The draft held to Create's own rules (POST /admin/vendors), so what the
 * review screen shows is what can be saved: a value Create would refuse is
 * taken out and marked, with what was read in the reason, rather than left
 * to fail on the admin's Create.
 */
export function holdToCreateRules({ draft: source, fields }: GarageImport): GarageImport {
  const draft: GarageDraft = { ...source, services: source.services.map((s) => ({ ...s })) }
  const notes = new NoteBook()
  Object.assign(notes.fields, fields)
  const shape = createVendorSchema.shape

  const capped = (field: 'businessName' | 'ownerName' | 'city' | 'address', max: number) => {
    const value = draft[field]
    if (value && value.length > max) {
      draft[field] = value.slice(0, max).trimEnd()
      notes.flag(field, `Shortened to ${max} characters.`)
    }
  }
  capped('businessName', 255)
  capped('ownerName', 255)
  capped('city', 100)
  capped('address', 2000)

  if (draft.email && !shape.email.safeParse(draft.email).success) {
    notes.missing('email', `“${draft.email.slice(0, 60)}” is not an email address.`)
    draft.email = null
  }
  if (draft.yearsInOperation && !shape.yearsInOperation.safeParse(draft.yearsInOperation).success) {
    notes.missing('yearsInOperation', `Written as “${draft.yearsInOperation.slice(0, 60)}”, longer than the form takes.`)
    draft.yearsInOperation = null
  }
  if (draft.mapsUrl) {
    const url = withScheme(draft.mapsUrl)
    if (shape.mapsUrl.safeParse(url).success) draft.mapsUrl = url
    else {
      notes.missing('mapsUrl', `Couldn't use “${draft.mapsUrl.slice(0, 60)}” as a link.`)
      draft.mapsUrl = null
    }
  }
  for (const field of ['ownerPhone', 'phone', 'whatsapp'] as const) {
    if (draft[field] && !shape[field].safeParse(draft[field]).success) {
      notes.missing(field, 'Not a 10-digit number.')
      draft[field] = null
    }
  }
  if (draft.pincode && !shape.pincode.safeParse(draft.pincode).success) {
    notes.missing('pincode')
    draft.pincode = null
  }

  // The editor's range, stricter than Create's 100: what the garage app
  // itself allows. Outside it, the 10 km default stands, and it is said.
  if (draft.doorstepRadiusKm !== null && (draft.doorstepRadiusKm < 1 || draft.doorstepRadiusKm > 30)) {
    notes.check(
      'doorstepRadiusKm',
      `Written as ${draft.doorstepRadiusKm} km. Detlio takes 1 to 30 km, so the 10 km default is used.`
    )
    draft.doorstepRadiusKm = null
  }

  if (draft.services.length > MAX_SERVICES) {
    notes.check('services', `The document lists ${draft.services.length} services; the first ${MAX_SERVICES} are here.`)
    for (const key of Object.keys(notes.fields)) {
      const index = Number(key.split('.')[1])
      if (key.startsWith('services.') && index >= MAX_SERVICES) delete notes.fields[key]
    }
    draft.services = draft.services.slice(0, MAX_SERVICES)
  }

  draft.services.forEach((service, index) => {
    if (service.description && service.description.length > DESCRIPTIONS_MAX) {
      service.description = service.description.slice(0, DESCRIPTIONS_MAX)
    }
    // Exactly what Create takes for this row. Missing prices are expected —
    // they are marked already, and the admin fills them in; anything else
    // Create would refuse is marked here.
    const result = serviceInputSchema.safeParse({
      name: service.name,
      description: service.description ?? undefined,
      category: service.category,
      pricingType: service.pricingType,
      price: service.price ?? undefined,
      priceHatchback: service.priceHatchback ?? undefined,
      priceSedan: service.priceSedan ?? undefined,
      priceSuv: service.priceSuv ?? undefined,
      durationMins: service.durationMins ?? undefined,
    })
    if (result.success) return
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key.startsWith('price')) {
        if (notes.fields[servicePath(index, 'price')]?.confidence !== 'missing') {
          notes.missing(servicePath(index, 'price'))
        }
      } else if (key === 'durationMins') {
        service.durationMins = null
        notes.missing(servicePath(index, 'durationMins'))
      } else if (key === 'name') {
        notes.flag(servicePath(index, 'name'), 'Check the name.')
      }
    }
  })

  // Every garage-level field says something, so the screen can count them.
  for (const field of DRAFT_FIELDS) {
    if (!notes.fields[field]) notes.missing(field)
  }

  return { draft, fields: notes.fields }
}

/**
 * The garages in an import: one from photos and PDFs, one per row from a
 * Tally file. Or the AppError the panel shows: 503 AI_UNAVAILABLE when AI
 * is off or OpenAI can't answer, 422 IMPORT_UNREADABLE when nothing usable
 * came out, 413 IMPORT_TOO_LARGE.
 */
export async function extractGarages(
  reader: DocumentClient | null,
  input: ExtractImportInput,
  log: ImportLog
): Promise<{ garages: ImportedGarage[] }> {
  if (input.source === 'tally_csv') {
    const rows = garagesFromTallyCsv(input.csv)
    log.info({ source: 'tally_csv', chars: input.csv.length, garages: rows.length }, 'vendor-import:read')
    if (rows.length === 0) {
      throw unreadable(
        'No garages found in this file. Download the responses from Tally as CSV (Responses → Download) and try again.'
      )
    }
    return {
      garages: rows.map((row) => ({ label: row.label, ...holdToCreateRules(row.import) })),
    }
  }

  checkFiles(input.files)
  if (!reader) {
    throw new AppError(
      503,
      'Reading photos and PDFs is not set up. Upload the Tally file, or fill in by hand.',
      'AI_UNAVAILABLE'
    )
  }

  const started = Date.now()
  let answer: string
  try {
    answer = await reader.read({
      instructions: READING_INSTRUCTIONS,
      files: input.files,
      schemaName: 'garage_reading',
      schema: READING_JSON_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      log.warn({ err: err.cause ?? err, files: input.files.length }, 'ai unavailable')
      throw new AppError(
        503,
        "Couldn't reach the AI service. Try again in a minute, or fill in by hand.",
        'AI_UNAVAILABLE'
      )
    }
    throw err
  }

  // Sizes and timing only: never the files, never the answer.
  const details = {
    source: 'files',
    files: input.files.length,
    chars: input.files.reduce((sum, file) => sum + file.dataBase64.length, 0),
    ms: Date.now() - started,
  }
  const reading = parseReading(answer)
  if (!reading || !reading.readable) {
    log.warn({ ...details, problem: reading ? 'not_readable' : 'bad_answer' }, 'vendor-import:unreadable')
    throw unreadable("Couldn't read a garage from this file. Try a clearer photo, or fill in by hand.")
  }
  log.info({ ...details, services: reading.services.length }, 'vendor-import:read')

  const garage = holdToCreateRules(importFromReading(reading))
  return {
    garages: [
      {
        label: { businessName: garage.draft.businessName, ownerName: garage.draft.ownerName, submittedAt: null },
        ...garage,
      },
    ],
  }
}
