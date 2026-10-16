import { z } from 'zod'

// The customer's location, for the Nearby card (and, only while offer
// targeting is on, "near this garage" offers). Optional and all-or-nothing,
// like an address pin. The app rounds it before sending: Home needs a
// neighbourhood, not a doorstep.
//
// An empty parameter (`?lat=&lng=`, what an app sends while it has no fix)
// is no location: z.coerce alone would read Number('') as 0 and put the
// customer in the Gulf of Guinea, with "no garages nearby" where the app
// should say "Turn on location".
const blankAsMissing = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

export const homeQuerySchema = z
  .object({
    lat: z.preprocess(blankAsMissing, z.coerce.number().finite().min(-90).max(90).optional()),
    lng: z.preprocess(blankAsMissing, z.coerce.number().finite().min(-180).max(180).optional()),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng must be provided together',
  })

// The moment the customer looked at Updates, as the app saw it. The server
// never moves the marker past its own clock, so a phone set to next year
// cannot hide what has not happened yet.
export const markUpdatesSeenSchema = z.object({
  at: z
    .string()
    .trim()
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date'),
})

export const homeIdParamSchema = z.object({ id: z.string().uuid() })

export type HomeQuery = z.infer<typeof homeQuerySchema>
export type MarkUpdatesSeenInput = z.infer<typeof markUpdatesSeenSchema>
