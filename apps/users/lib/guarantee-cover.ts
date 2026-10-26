/**
 * Whether a booking of these services would be covered by the Detlio
 * Guarantee, by the server's own rule (canBeRedone in
 * apps/server/src/lib/guarantee.ts): every line is a wash or detailing, or a
 * package made only of those, and none is priced on inspection. A package
 * whose members are unknown here is not counted as covered, so checkout
 * never promises a redo the claim screen would refuse.
 */
export interface CoverLine {
  category: string
  pricingType: string | null
  /** A package's members, when this line is a package. */
  items?: ReadonlyArray<{ serviceId: string }>
}

/** The server's GUARANTEE_RULES.redoCategories; change both together. */
const REDO_CATEGORIES: readonly string[] = ['car_wash', 'detailing']

export function guaranteeCovers(
  lines: readonly CoverLine[],
  categoryOf: (serviceId: string) => string | undefined
): boolean {
  if (lines.length === 0) return false
  return lines.every((line) => {
    if (line.pricingType === 'on_inspection') return false
    if (REDO_CATEGORIES.includes(line.category)) return true
    if (line.category !== 'package') return false
    const members = (line.items ?? []).map((item) => categoryOf(item.serviceId))
    return (
      members.length > 0 &&
      members.every(
        (category) =>
          category !== undefined && REDO_CATEGORIES.includes(category)
      )
    )
  })
}
