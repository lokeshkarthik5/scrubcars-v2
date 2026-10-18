import { toCsv } from '@repo/core/csv'
import type { AdminGaragePullRow } from '@repo/core/api/garage'
import { decodeImage, encodeImage, fitWithin } from '@repo/core/image-upload'
import { GARAGE_LIMITS, GARAGE_RARITIES, type GarageSettings } from '@repo/core/garage'

/**
 * Admin → Rewards → Garage (0057): the form's checks, the CSV and the
 * upload's re-encoding, pure where they can be (garage.test.ts).
 */

/** What the rarity odds add up to (must be 100). */
export function oddsTotal(weights: GarageSettings['rarityWeights']): number {
  return GARAGE_RARITIES.reduce((sum, r) => sum + (Number.isFinite(weights[r]) ? weights[r] : 0), 0)
}

/** The form's own problems, before the API checks them again. */
export function garageFormProblems(g: GarageSettings): string[] {
  const problems: string[] = []
  const total = oddsTotal(g.rarityWeights)
  if (total !== 100) problems.push(`The odds add up to ${total}, not 100`)
  const L = GARAGE_LIMITS
  const range = (label: string, value: number, limit: { min: number; max: number }) => {
    if (!Number.isInteger(value) || value < limit.min || value > limit.max) problems.push(`${label}: ${limit.min} to ${limit.max}`)
  }
  range('Chance of a new car (%)', g.unownedBiasPercent, L.unownedBiasPercent)
  range('Rare-or-better within', g.pityRare, L.pityRare)
  range('Legendary within', g.pityLegendary, L.pityLegendary)
  if (g.pityLegendary <= g.pityRare) problems.push('Legendary pity must be more cards than Rare pity')
  range('Duplicates per bonus stamp', g.duplicatesPerStar, L.duplicatesPerStar)
  range('Row reward (₹)', g.rowVoucher, L.rowVoucher)
  range('Stamps instead, past the budget', g.rowFallbackStamps, L.rowFallbackStamps)
  range('Scratch card chance (%)', g.scratchCardWeight, L.scratchCardWeight)
  range('Cards per badge', g.badgeBonusCards, L.badgeBonusCards)
  return problems
}

/** The month's pulls as a CSV file's text (phones already masked by the API). */
export function pullsCsv(rows: AdminGaragePullRow[]): string {
  return toCsv(
    ['When (IST)', 'Phone', 'Series', 'Card', 'Name', 'Rarity', 'From', 'Duplicate', 'Pity'],
    rows.map((r) => [
      new Date(new Date(r.at).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' '),
      r.phone,
      r.series,
      r.number,
      r.name,
      r.rarity,
      r.source,
      r.duplicate ? 'yes' : 'no',
      r.pity ?? '',
    ])
  )
}

/**
 * A picture as a WebP at most 1600 px wide, re-encoded in the browser (which
 * also drops its metadata, as every Detlio upload does). Null when this
 * browser cannot write WebP (Safari): the admin is asked to use a .webp file
 * or another browser.
 */
export async function toCardWebp(file: File): Promise<Blob | null> {
  const decoded = await decodeImage(file)
  try {
    const blob = await encodeImage(decoded, fitWithin(decoded.width, decoded.height, 1600), 'image/webp', 0.9)
    return blob && blob.type === 'image/webp' && blob.size > 0 ? blob : null
  } finally {
    decoded.close()
  }
}
