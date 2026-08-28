import type { Context } from 'hono'
import { geoService } from './geo.service.js'
import type {
  AutocompleteQuery,
  GeocodeQuery,
  ResolveQuery,
  ReverseQuery,
  RouteQuery,
  MapsLinkQuery,
} from './geo.validation.js'

export async function autocomplete(c: Context, query: AutocompleteQuery) {
  const places = await geoService.autocomplete(query)
  return c.json({ success: true, data: places })
}

export async function reverse(c: Context, query: ReverseQuery) {
  const place = await geoService.reverse(query)
  return c.json({ success: true, data: place })
}

export async function geocode(c: Context, query: GeocodeQuery) {
  const places = await geoService.geocode(query)
  return c.json({ success: true, data: places })
}

export async function mapsLink(c: Context, query: MapsLinkQuery) {
  const result = await geoService.resolveMapsLink(query)
  return c.json({ success: true, data: result })
}

export async function route(c: Context, query: RouteQuery) {
  const result = await geoService.route(query)
  return c.json({ success: true, data: result })
}

export async function resolve(c: Context, query: ResolveQuery) {
  const place = await geoService.resolve(query)
  return c.json({ success: true, data: place })
}
