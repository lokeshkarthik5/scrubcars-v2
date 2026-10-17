/**
 * The rules for a service row in the admin garage forms (add and edit).
 *
 * Both forms used to filter out any row that had a name but not a complete
 * price before saving. On the edit form that was a silent data loss: the save
 * sends the garage's full list of services, and the server hides any live
 * service missing from it, so one switch from Flat to Per vehicle without
 * filling the tiers took that service off the garage page with no message.
 *
 * Nothing is dropped any more. A row that is not ready says what it needs, and
 * "Save changes" stays off with the reason until each one is fixed or removed
 * on purpose. Pure, so the rules are unit-tested here rather than in a page.
 */

export type PricingType = 'flat' | 'per_vehicle' | 'on_inspection'

/** The parts of a form row these rules read. Both forms' rows have them. */
export interface ServiceRowFields {
  /** Set once the service exists on the server. */
  id?: string
  name: string
  description: string
  pricingType: PricingType
  price: string
  priceHatchback: string
  priceSedan: string
  priceSuv: string
  durationValue: string
}

/** A field a row still needs, for marking that one input. */
export type ServiceRowField =
  | 'name'
  | 'price'
  | 'priceHatchback'
  | 'priceSedan'
  | 'priceSuv'

const TIERS = [
  { key: 'priceHatchback', label: 'hatchback' },
  { key: 'priceSedan', label: 'sedan' },
  { key: 'priceSuv', label: 'SUV' },
] as const

/** A price the server accepts: a number above zero. Blank reads as 0. */
const isPrice = (value: string) => Number(value) > 0

/**
 * A row the admin added and never typed into. Nothing exists for it on the
 * server, so leaving it out of a save loses nothing; flagging it would only
 * block the save over an empty card.
 */
export function isUntouchedNewRow(row: ServiceRowFields): boolean {
  return (
    !row.id &&
    !row.name.trim() &&
    !row.description.trim() &&
    !row.durationValue.trim() &&
    [row.price, row.priceHatchback, row.priceSedan, row.priceSuv].every(
      (value) => !value.trim()
    )
  )
}

/** The fields a row still needs before it can be saved, in form order. */
export function missingServiceFields(row: ServiceRowFields): ServiceRowField[] {
  if (isUntouchedNewRow(row)) return []

  const missing: ServiceRowField[] = []
  if (!row.name.trim()) missing.push('name')

  if (row.pricingType === 'per_vehicle') {
    // Every tier, matching the server: a gap would leave that car size
    // unable to book the service.
    for (const tier of TIERS) {
      if (!isPrice(row[tier.key])) missing.push(tier.key)
    }
  } else if (!isPrice(row.price)) {
    missing.push('price')
  }

  return missing
}

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * What a row needs, as one line to show on it — "Add the SUV price", "Add a
 * name and the price" — or null when it is ready to save.
 */
export function serviceRowProblem(row: ServiceRowFields): string | null {
  const missing = missingServiceFields(row)
  if (missing.length === 0) return null

  const parts: string[] = []
  if (missing.includes('name')) parts.push('a name')

  if (row.pricingType === 'per_vehicle') {
    const tiers = TIERS.filter((tier) => missing.includes(tier.key)).map(
      (tier) => tier.label
    )
    if (tiers.length > 0) {
      parts.push(`the ${joinAnd(tiers)} ${tiers.length === 1 ? 'price' : 'prices'}`)
    }
  } else if (missing.includes('price')) {
    parts.push(
      row.pricingType === 'on_inspection' ? 'the inspection fee' : 'the price'
    )
  }

  return `Add ${joinAnd(parts)}`
}

/**
 * Why the form cannot be saved because of its services — "2 services need a
 * price" — or null when every row is ready.
 */
export function servicesSaveBlock(rows: ServiceRowFields[]): string | null {
  const blocked = rows
    .map(missingServiceFields)
    .filter((missing) => missing.length > 0)
  if (blocked.length === 0) return null

  const needsName = blocked.some((missing) => missing.includes('name'))
  const needsPrice = blocked.some((missing) =>
    missing.some((field) => field !== 'name')
  )
  const what =
    needsName && needsPrice ? 'a name or price' : needsName ? 'a name' : 'a price'

  return blocked.length === 1
    ? `1 service needs ${what}`
    : `${blocked.length} services need ${what}`
}

/**
 * The rows a save sends: every row but the untouched new ones. Only called
 * once servicesSaveBlock is null, so nothing that was typed is ever left out.
 */
export function rowsToSave<T extends ServiceRowFields>(rows: T[]): T[] {
  return rows.filter((row) => !isUntouchedNewRow(row))
}

/**
 * The change to make when a row's pricing type is switched, so the admin
 * does not retype a price the row already has.
 *
 * Flat to Per vehicle fills each empty tier with the flat price — a garage
 * that charged one price charged it for every size — and the admin then edits
 * the sizes that differ. Per vehicle to Flat takes the cheapest tier, which is
 * also what the server stores as a per-vehicle service's base price. An
 * inspection fee is not a price for the work, so it is never copied into the
 * tiers, and the tiers never become an inspection fee.
 */
export function switchPricingType(
  row: ServiceRowFields,
  next: PricingType
): Partial<ServiceRowFields> {
  if (next === row.pricingType) return {}

  if (next === 'per_vehicle' && row.pricingType === 'flat' && isPrice(row.price)) {
    const fill = (tier: string) => (isPrice(tier) ? tier : row.price)
    return {
      pricingType: next,
      priceHatchback: fill(row.priceHatchback),
      priceSedan: fill(row.priceSedan),
      priceSuv: fill(row.priceSuv),
    }
  }

  if (next === 'flat' && row.pricingType === 'per_vehicle') {
    const tiers = [row.priceHatchback, row.priceSedan, row.priceSuv]
      .filter(isPrice)
      .map(Number)
    if (tiers.length > 0) {
      return { pricingType: next, price: String(Math.min(...tiers)) }
    }
  }

  return { pricingType: next }
}

/** The stored decimals of a service, as the admin API returns them. */
export interface StoredServicePricing {
  pricingType: PricingType
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
}

const rupees = (value: string) => `₹${Number(value)}`

/**
 * A one-line price for a service that is not in the editor (the hidden
 * list): "₹450", "₹299 inspection fee", "₹600–₹900 by car size". A missing
 * tier is named, since a gap is the likeliest reason it was hidden.
 */
export function storedPriceSummary(service: StoredServicePricing): string {
  if (service.pricingType === 'on_inspection') {
    return `${rupees(service.price)} inspection fee`
  }
  if (service.pricingType === 'flat') return rupees(service.price)

  const tiers = TIERS.map((tier) => ({
    label: tier.label,
    value: service[tier.key],
  }))
  const priced = tiers
    .filter((tier) => tier.value != null && Number(tier.value) > 0)
    .map((tier) => Number(tier.value))
  const unpriced = tiers
    .filter((tier) => tier.value == null || !(Number(tier.value) > 0))
    .map((tier) => tier.label)

  if (priced.length === 0) return 'No prices set'

  const low = Math.min(...priced)
  const high = Math.max(...priced)
  const range =
    low === high ? `₹${low} by car size` : `₹${low}–₹${high} by car size`

  if (unpriced.length === 0) return range
  return `${range} · no ${joinAnd(unpriced)} ${unpriced.length === 1 ? 'price' : 'prices'}`
}

// "an SUV" is said as a letter name; the other sizes take "a".
const withArticle = (label: string) => (label === 'SUV' ? `an ${label}` : `a ${label}`)

/**
 * What showing a hidden service again would leave unbookable, said beside its
 * Show again button before the tap — or null when every customer could book
 * it. Show again puts the stored prices back on sale as they are, and the
 * services the old editor hid were mostly per-vehicle ones with a size
 * missing: checkout refuses that size, so the admin should know before, not
 * after a customer finds out.
 */
export function showAgainWarning(service: StoredServicePricing): string | null {
  if (service.pricingType !== 'per_vehicle') return null

  const unpriced = TIERS.filter((tier) => {
    const value = service[tier.key]
    return value == null || !(Number(value) > 0)
  }).map((tier) => tier.label)

  if (unpriced.length === 0) return null
  if (unpriced.length === TIERS.length) {
    return 'No one can book this until it has a price for each car size.'
  }
  const who = joinAnd(unpriced)
  const sentence = `${who.charAt(0).toUpperCase()}${who.slice(1)} customers can't book this until it has`
  return unpriced.length === 1
    ? `${sentence} ${withArticle(unpriced[0])} price.`
    : `${sentence} those prices.`
}
