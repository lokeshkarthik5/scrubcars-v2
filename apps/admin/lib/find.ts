/**
 * Where "Find anything" sends what was typed. Bookings first: their search
 * already takes a reference, a receipt number, a phone, a customer or a
 * garage's name. The garage list second, for "open that garage".
 */
export interface FindTarget {
  label: string
  href: string
}

export function findTargets(text: string): FindTarget[] {
  const q = text.trim()
  if (!q) return []
  const query = encodeURIComponent(q)
  return [
    { label: `Bookings matching “${q}”`, href: `/bookings?q=${query}` },
    { label: `Garages matching “${q}”`, href: `/vendors?show=all&q=${query}` },
  ]
}
