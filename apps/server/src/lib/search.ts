/**
 * Text search: turning what someone typed into a LIKE pattern, and saying
 * which service a garage was found by.
 *
 * Pure, so both rules are unit-tested without a database.
 */

/**
 * A LIKE pattern that matches `text` anywhere, with its own wildcards made
 * literal.
 *
 * Without this, "100%" would be "100 followed by anything" and "a_b" would
 * match "axb" — and a lone "%" or "_" would match every row. Postgres reads a
 * backslash as LIKE's escape character by default, so a backslash in the text
 * is escaped too.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

/** What a public garage search needs to know about one garage. */
export interface SearchableGarage {
  businessName: string
  city: string | null
  /** Its services on sale. Packages count: they book like any other service. */
  services: Array<{ name: string }>
}

/**
 * The service a garage turned up for, when its name and city did not match.
 *
 * Mirrors the `q` clause of vendorsRepository.listPublicVendorPage (name, city,
 * or any active service): a garage found by its name needs no explanation, and
 * one found by a service is easier to trust when the card says which. Null
 * when the name or city matched, or when nothing here does — the SQL decides
 * what is listed, this only labels it, so a case where the two disagree (a
 * letter Postgres and JavaScript lowercase differently) shows no label rather
 * than a wrong one.
 *
 * Alphabetical when several services match, so the same search labels the
 * same garage the same way every time.
 */
export function matchedServiceName(q: string, garage: SearchableGarage): string | null {
  const needle = q.trim().toLowerCase()
  if (!needle) return null

  const has = (text: string | null) => (text ?? '').toLowerCase().includes(needle)
  if (has(garage.businessName) || has(garage.city)) return null

  const names = garage.services
    .map((service) => service.name)
    .filter((name) => has(name))
    .sort((a, b) => a.localeCompare(b))
  return names[0] ?? null
}
