import { sql, type SQL } from 'drizzle-orm'

/**
 * A `Date` to put inside a Drizzle `sql` template.
 *
 * Drizzle's postgres-js driver switches postgres.js's own timestamp
 * serializer off (so Drizzle can pass its string values through), and with
 * `prepare: false` (src/db/index.ts) nothing else turns a raw `Date` into
 * text: the query fails with `The "string" argument must be of type string
 * or an instance of Buffer or ArrayBuffer. Received an instance of Date`.
 * Only a bare `Date` in a template is affected; `eq`/`gt`/`lt` on a column
 * and `.values()`/`.set()` already convert through the column.
 *
 * So bind the ISO string and cast it, which is how the rest of the server
 * writes it by hand (`${at.toISOString()}::timestamptz`). Never write
 * `${someDate}` in an `sql` template; `sql-dates.guard.test.ts` fails the
 * build if one appears.
 */
export function tstz(at: Date): SQL {
  return sql`${at.toISOString()}::timestamptz`
}
