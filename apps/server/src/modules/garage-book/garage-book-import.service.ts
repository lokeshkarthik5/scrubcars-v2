import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { AiUnavailableError, documentClientFor, type DocumentClient } from '../../lib/ai.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  BOOK_READING_INSTRUCTIONS,
  BOOK_READING_JSON_SCHEMA,
  FAKE_BOOK_READING,
  parseBookReading,
  rowsFromReading,
  rowsFromTable,
  type ImportRow,
} from '../../lib/garage-book-import.js'
import { GARAGE_BOOK_LIMITS, formatIndianPlate, plateKey } from '../../lib/garage-book.js'
import { parseCsv } from '../../lib/garage-import/tally.js'
import { istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { looksLikeXlsx, readXlsxRows } from '../../lib/xlsx-read.js'
import { checkFiles } from '../vendor-imports/vendor-imports.extract.js'
import { garageBookRepository as book, type Tx } from './garage-book.repository.js'
import type { ImportCommitInput, ImportExtractInput } from './garage-book.validation.js'
import { normalisePhoneSafe, type Viewer } from './garage-book.viewer.js'

const log = logger.child({ module: 'garage-book-import' })

/**
 * "Bring in your book" (0073; owner decision 12 Nov). Two steps, owner only:
 *
 *   1. extract: photos of the paper book (read by the AI, as the admin's
 *      garage import reads posters), or an Excel, CSV or Tally export (read
 *      by fixed rules). Rows come back for the owner to check; doubtful ones
 *      are marked. Nothing is stored, the files included: they live in this
 *      request's memory and are gone when it answers.
 *   2. commit: the rows the owner kept become customers, cars and opening
 *      balances owed. Safe to send twice: a row is matched to a customer by
 *      phone, then by plate, and an opening balance is written once per
 *      customer.
 */

const MAX_OUTPUT_TOKENS = 16_000

let reader: DocumentClient | null | undefined

function documentClient(): DocumentClient | null {
  if (reader === undefined) {
    reader = documentClientFor({
      apiKey: env.openaiApiKey,
      model: env.aiVisionModel,
      fake: env.aiFake,
      fakeAnswer: JSON.stringify(FAKE_BOOK_READING),
    })
  }
  return reader
}

const unreadable = (message: string) => new AppError(422, message, 'IMPORT_UNREADABLE')

/** Who already has each phone and plate in this garage's book, for "Same phone as a customer you have". */
async function matches(vendorId: string, rows: ImportRow[]) {
  const phones = Array.from(new Set(rows.flatMap((row) => (row.phone ? [row.phone] : []))))
  const plates = Array.from(new Set(rows.flatMap((row) => (row.plate ? [plateKey(row.plate)] : []))))
  const byPhone = new Map<string, { id: string; name: string }>()
  const byPlate = new Map<string, { id: string; name: string }>()
  if (phones.length > 0) {
    const found = await db.execute<{ id: string; name: string; phone: string }>(sql`
      SELECT id, name, phone FROM garage_customers
       WHERE vendor_id = ${vendorId} AND deleted_at IS NULL
         AND phone IN (${sql.join(phones.map((phone) => sql`${phone}`), sql`, `)})
    `)
    for (const row of Array.from(found)) byPhone.set(row.phone, { id: row.id, name: row.name })
  }
  if (plates.length > 0) {
    const found = await db.execute<{ id: string; name: string; plate_key: string }>(sql`
      SELECT c.id, c.name, regexp_replace(upper(car.plate), '[^A-Z0-9]', '', 'g') AS plate_key
        FROM garage_customer_cars car JOIN garage_customers c ON c.id = car.garage_customer_id
       WHERE car.vendor_id = ${vendorId} AND c.deleted_at IS NULL AND car.plate IS NOT NULL
         AND regexp_replace(upper(car.plate), '[^A-Z0-9]', '', 'g') IN (${sql.join(plates.map((plate) => sql`${plate}`), sql`, `)})
    `)
    for (const row of Array.from(found)) byPlate.set(row.plate_key, { id: row.id, name: row.name })
  }
  return { byPhone, byPlate }
}

async function customerByPlate(tx: Tx, vendorId: string, plate: string) {
  const rows = await tx.execute<{ id: string }>(sql`
    SELECT c.id FROM garage_customer_cars car JOIN garage_customers c ON c.id = car.garage_customer_id
     WHERE car.vendor_id = ${vendorId} AND c.deleted_at IS NULL
       AND regexp_replace(upper(coalesce(car.plate, '')), '[^A-Z0-9]', '', 'g') = ${plateKey(plate)}
     ORDER BY c.created_at LIMIT 1
  `)
  return Array.from(rows)[0]?.id ?? null
}

/** An opening balance from the paper book, once per customer (a unique index holds it). */
async function openingOwed(tx: Tx, data: { vendorId: string; customerId: string; amountPaise: number; createdBy: string }) {
  await tx.execute(sql`
    INSERT INTO garage_payments (vendor_id, garage_customer_id, kind, amount_paise, source, created_by)
    VALUES (${data.vendorId}, ${data.customerId}, 'owed', ${data.amountPaise}, 'import', ${data.createdBy})
    ON CONFLICT (garage_customer_id) WHERE source = 'import' DO NOTHING
  `)
}

function sourceNote(lastVisit: string | null | undefined) {
  if (!lastVisit) return 'From your book'
  const date = new Date(`${lastVisit}T00:00:00Z`)
  const label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `From your book · last visit ${label}`
}

export const importService = {
  async extract(viewer: Viewer, input: ImportExtractInput, now = new Date()) {
    const today = istDateKey(now)
    let rows: ImportRow[]
    if (input.source === 'sheet') {
      const bytes = Buffer.from(input.dataBase64, 'base64')
      let table: string[][]
      try {
        table = looksLikeXlsx(bytes) ? readXlsxRows(bytes) : parseCsv(bytes.toString('utf8'))
      } catch {
        throw unreadable('Couldn’t open that file. Save it from Excel as .xlsx or .csv and try again.')
      }
      const read = rowsFromTable(table, today)
      if (!read) {
        throw unreadable('Couldn’t find a Name or Phone column. Put the column names in the first row and try again.')
      }
      rows = read
      log.info({ vendorId: viewer.vendorId, source: 'sheet', rows: rows.length }, 'book_import:read')
    } else {
      checkFiles(input.files)
      const client = documentClient()
      if (!client) {
        throw new AppError(503, 'Reading photos is not set up. Upload an Excel file instead.', 'AI_UNAVAILABLE')
      }
      const started = Date.now()
      let answer: string
      try {
        answer = await client.read({
          instructions: BOOK_READING_INSTRUCTIONS,
          files: input.files,
          schemaName: 'book_reading',
          schema: BOOK_READING_JSON_SCHEMA as unknown as Record<string, unknown>,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        })
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          log.warn({ err: err.cause ?? err, files: input.files.length }, 'book_import:ai_unavailable')
          throw new AppError(503, 'Couldn’t reach the AI service. Try again in a minute.', 'AI_UNAVAILABLE')
        }
        throw err
      }
      const reading = parseBookReading(answer)
      // Sizes and timing only: never the photos, never the answer.
      const details = { vendorId: viewer.vendorId, source: 'photos', files: input.files.length, ms: Date.now() - started }
      if (!reading || !reading.readable) {
        log.warn({ ...details, problem: reading ? 'not_readable' : 'bad_answer' }, 'book_import:unreadable')
        throw unreadable('Couldn’t read customers from these photos. Try a clearer photo, in good light.')
      }
      rows = rowsFromReading(reading, today)
      log.info({ ...details, rows: rows.length }, 'book_import:read')
    }
    if (rows.length === 0) throw unreadable('No customers found in this file.')

    const { byPhone, byPlate } = await matches(viewer.vendorId, rows)
    const out = rows.map((row) => {
      const phoneMatch = row.phone ? byPhone.get(row.phone) : undefined
      const plateMatch = !phoneMatch && row.plate ? byPlate.get(plateKey(row.plate)) : undefined
      const match = phoneMatch
        ? { customerId: `own:${phoneMatch.id}`, name: phoneMatch.name, by: 'phone' as const }
        : plateMatch
          ? { customerId: `own:${plateMatch.id}`, name: plateMatch.name, by: 'plate' as const }
          : null
      return { ...row, match }
    })
    const people = new Set(out.map((row) => row.phone ?? row.name ?? row.plate))
    return {
      rows: out,
      counts: {
        customers: people.size,
        cars: new Set(out.flatMap((row) => (row.plate ? [plateKey(row.plate)] : []))).size,
        unsure: out.filter((row) => row.unsure.length > 0 || row.match).length,
      },
    }
  },

  async commit(viewer: Viewer, input: ImportCommitInput) {
    let added = 0
    let merged = 0
    let skipped = 0
    for (const row of input.rows) {
      const name = row.name?.trim().slice(0, GARAGE_BOOK_LIMITS.nameMax) || null
      const phone = normalisePhoneSafe(row.phone)
      const plate = row.plate?.trim() ? formatIndianPlate(row.plate) : null
      if (!name && !phone && !plate) {
        skipped += 1
        continue
      }
      const outcome = await book.transaction(async (tx) => {
        if (phone) await book.lockPhone(tx, viewer.vendorId, phone)
        let customerId = phone ? ((await book.ownCustomerByPhone(tx, viewer.vendorId, phone))?.id ?? null) : null
        if (!customerId && plate) customerId = await customerByPlate(tx, viewer.vendorId, plate)
        const wasThere = Boolean(customerId)
        if (!customerId) {
          customerId = (
            await book.insertCustomer(tx, {
              vendorId: viewer.vendorId,
              name: name ?? plate ?? 'Customer',
              phone,
              sourceNote: sourceNote(row.lastVisit),
            })
          ).id
        }
        const cars = (await book.cars([customerId], tx)).get(customerId) ?? []
        const hasCar = plate ? cars.some((car) => car.plate && plateKey(car.plate) === plateKey(plate)) : cars.length > 0
        if (!hasCar && (plate || row.car?.trim())) {
          const [make, ...rest] = (row.car?.trim() ?? '').split(/\s+/)
          await book.insertCar(tx, {
            vendorId: viewer.vendorId,
            garageCustomerId: customerId,
            plate,
            // "Creta" alone is a model; "Hyundai Creta" a make and model.
            make: rest.length > 0 ? (make ?? null) : null,
            model: rest.length > 0 ? rest.join(' ') : make || null,
          })
        }
        if (row.owesPaise && row.owesPaise > 0) {
          await openingOwed(tx, { vendorId: viewer.vendorId, customerId, amountPaise: row.owesPaise, createdBy: viewer.userId })
        }
        return wasThere ? 'merged' : 'added'
      })
      if (outcome === 'added') added += 1
      else merged += 1
    }
    log.info({ vendorId: viewer.vendorId, added, merged, skipped }, 'book_import:committed')
    return { added, merged, skipped }
  },
}
