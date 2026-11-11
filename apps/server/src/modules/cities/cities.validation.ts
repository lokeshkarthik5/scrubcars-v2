import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import {
  CITY_NAME_MAX,
  CITY_NAME_MIN,
  CITY_REACH_MAX_KM,
  CITY_REACH_MIN_KM,
  DEFAULT_CITY_REACH_KM,
} from '../../lib/cities.js'

export const cityIdParamSchema = z.object({ id: z.uuid() })

const nameSchema = z
  .string()
  .trim()
  .min(CITY_NAME_MIN, `A city's name needs at least ${CITY_NAME_MIN} letters`)
  .max(CITY_NAME_MAX)
const latSchema = z.number().finite().min(-90).max(90)
const lngSchema = z.number().finite().min(-180).max(180)
// Whole km: the reach is a city's size, never a decimal anyone measures.
const reachSchema = z
  .number()
  .int('Enter the reach in whole km')
  .min(CITY_REACH_MIN_KM)
  .max(CITY_REACH_MAX_KM, `A city reaches at most ${CITY_REACH_MAX_KM} km`)

/** Admin → Cities → Add a city: its name, centre and reach; on for customers unless said. */
export const createCitySchema = z
  .object({
    name: nameSchema,
    lat: latSchema,
    lng: lngSchema,
    reachKm: reachSchema.default(DEFAULT_CITY_REACH_KM),
    customersSee: z.boolean().default(true),
    actorName: signedActorName,
  })
  .strict()

/** Edit a city, or flip "Customers see garages here". Only what is sent changes. */
export const updateCitySchema = z
  .object({
    name: nameSchema.optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
    reachKm: reachSchema.optional(),
    customersSee: z.boolean().optional(),
    actorName: signedActorName,
  })
  .strict()
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng must be provided together',
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.lat !== undefined ||
      data.reachKm !== undefined ||
      data.customersSee !== undefined,
    { message: 'Nothing to change' }
  )

/** The Other towns switch: garages in no city shown to customers, or not. */
export const otherTownsSchema = z.object({ visible: z.boolean(), actorName: signedActorName }).strict()

export type CreateCityInput = z.infer<typeof createCitySchema>
export type UpdateCityInput = z.infer<typeof updateCitySchema>
export type OtherTownsInput = z.infer<typeof otherTownsSchema>
