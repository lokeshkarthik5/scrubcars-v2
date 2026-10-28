import { z } from 'zod'

const zoneSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'An area').max(60)

/** `POST /users/me/area/signups`: the area (pre-filled from the zone), and the two opt-ins. */
export const signUpSchema = z
  .object({
    zoneSlug,
    pushOptIn: z.boolean().default(false),
    whatsappOptIn: z.boolean().default(false),
  })
  .strict()

export const zoneSlugParamSchema = z.object({ zoneSlug })

/**
 * The hosts a "Google Maps link" may be on: a link the team will open, so
 * nothing else is stored.
 */
const MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com', 'www.google.co.in', 'google.co.in'])

export function isMapsLink(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !MAPS_HOSTS.has(url.hostname)) return false
    if (url.hostname === 'goo.gl') return url.pathname.startsWith('/maps')
    if (url.hostname.endsWith('google.com') || url.hostname.endsWith('google.co.in')) {
      return url.hostname.startsWith('maps.') || url.pathname.startsWith('/maps')
    }
    return true
  } catch {
    return false
  }
}

/** `POST /users/me/area/recommendations`: a garage's name and a way to find it. */
export const recommendSchema = z
  .object({
    zoneSlug: zoneSlug.optional(),
    name: z.string().trim().min(2, 'Give the garage’s name').max(100),
    mapsLink: z
      .string()
      .trim()
      .max(500)
      .refine(isMapsLink, 'Paste a Google Maps link (https://maps.app.goo.gl/…)')
      .optional(),
    phone: z
      .string()
      .transform((value) => value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))
      .pipe(z.string().regex(/^[6-9]\d{9}$/, 'A 10-digit mobile number'))
      .optional(),
    why: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((input) => input.mapsLink !== undefined || input.phone !== undefined, {
    message: 'Add a Google Maps link or a phone number',
    path: ['mapsLink'],
  })

export type SignUpInput = z.infer<typeof signUpSchema>
export type RecommendInput = z.infer<typeof recommendSchema>
