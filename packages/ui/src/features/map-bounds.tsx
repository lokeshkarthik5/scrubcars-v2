/**
 * A map viewport as plain numbers, and how it goes on a URL.
 *
 * Its own module, away from map-controller: that one imports the map and so
 * MapLibre (about 260 kB compressed), and a page that only needs to turn a
 * viewport into a query string would otherwise load all of it up front.
 */
export interface MapBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/** The order PostGIS's ST_MakeEnvelope takes, so nothing reshuffles it later. */
export function boundsToParam(bounds: MapBounds): string {
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
    .map((n) => n.toFixed(5))
    .join(',')
}
