import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import {
  ZONE_NAME_MAX,
  ZONE_TARGET_MAX,
  ZONE_TARGET_MIN,
} from '../../lib/zone-edits.js'

const latitude = z.number().finite().min(-90).max(90)
const longitude = z.number().finite().min(-180).max(180)
const name = z.string().trim().min(1).max(ZONE_NAME_MAX)
const target = z.number().int().min(ZONE_TARGET_MIN).max(ZONE_TARGET_MAX)

/** POST /admin/coverage/zones: a new zone. */
export const createZoneSchema = z
  .object({
    actorName: signedActorName,
    name,
    lat: latitude,
    lng: longitude,
    priority: z.boolean().default(false),
    target: target.default(5),
  })
  .strict()

/** PATCH /admin/coverage/zones/:id: rename, priority, target, or move the centre (lat and lng together). */
export const updateZoneSchema = z
  .object({
    actorName: signedActorName,
    name: name.optional(),
    lat: latitude.optional(),
    lng: longitude.optional(),
    priority: z.boolean().optional(),
    target: target.optional(),
  })
  .strict()
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng go together',
    path: ['lat'],
  })

export type CreateZoneInput = z.infer<typeof createZoneSchema>
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>
