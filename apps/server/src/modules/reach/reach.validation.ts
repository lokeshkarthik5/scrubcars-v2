import { z } from 'zod'

/**
 * `GET /zones` takes no parameters. Unknown ones are ignored rather than
 * refused (a cache-busting `?v=` from a CDN or an app must not 400 a public
 * read).
 */
export const listZonesQuerySchema = z.object({})

export type ListZonesQuery = z.infer<typeof listZonesQuerySchema>
