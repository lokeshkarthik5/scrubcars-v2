import type { PricingType, ServiceCategory } from '@repo/core/types'

/**
 * Service templates (0082): the ready-made services behind the admin garage
 * editor's "Add from template".
 *
 * Most pilot garages sell the same handful of services, and typing the same
 * description for each one was the slowest part of setting a garage up. A
 * template is a draft row — name, category, a usual time, how it is priced
 * and a plain description — with no prices: every garage charges its own,
 * so the row arrives asking for them and cannot be saved without.
 *
 * Until 0082 the list was a constant here. It is now Detlio's own list in
 * the database (service_templates), managed at Settings → Service templates
 * and added to with "Save as template" on any garage's service; the
 * migration's seed is the only copy of the ten-plus built-in ones, held to
 * the old constant by apps/server/src/db/service-templates-seed.test.ts.
 * The API holds every description to the description rules on save (no
 * prices, no times, no claims, never "ask the garage").
 *
 * Twin: apps/server/src/lib/service-templates.ts (serviceNameKey,
 * TEMPLATE_NEW_DAYS; service-templates.parity.test.ts). No imports beyond
 * types, so the server test can load this file directly.
 */
export interface ServiceTemplate {
  id: string
  /** The built-ins' stable key ("foam-wash"); null for the team's own. */
  key: string | null
  name: string
  category: Exclude<ServiceCategory, 'package'>
  /** What a typical garage takes; the admin changes it if theirs differs. */
  durationMins: number
  pricingType: PricingType
  description: string
  /** Off hides it from "Add from template" and keeps it. */
  isOn: boolean
  builtIn: boolean
  /** Added by the team in the last TEMPLATE_NEW_DAYS days (never a built-in). */
  isNew: boolean
  createdByName: string | null
  updatedByName: string | null
  /** The garage it was saved from ("Save as template"), while that garage exists. */
  sourceVendorId: string | null
  sourceVendorName: string | null
  createdAt: string
  updatedAt: string
}

/** What a row is filled from, and what the template sheet edits. */
export type ServiceTemplateShape = Pick<
  ServiceTemplate,
  'name' | 'category' | 'durationMins' | 'pricingType' | 'description'
>

/** A template the team added this long ago or less is marked "New" in the editor. */
export const TEMPLATE_NEW_DAYS = 14

/** A name as two services are compared: case, spacing and punctuation aside. */
export function serviceNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * The templates a garage does not already have, by name, in the list's
 * order. `names` should include its hidden services too: adding a second
 * "Foam wash" next to a hidden one is a duplicate, and Show again is the way
 * back for that one.
 */
export function templatesNotIn<T extends { name: string }>(templates: readonly T[], names: readonly string[]): T[] {
  const have = new Set(names.map(serviceNameKey).filter(Boolean))
  return templates.filter((template) => !have.has(serviceNameKey(template.name)))
}
