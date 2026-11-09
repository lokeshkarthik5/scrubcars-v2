import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'

export const customerIdParamSchema = z.object({ id: z.string().uuid() })

/**
 * The Customers page's search: a phone number (any part of it, digits only
 * once +91 and spaces are dropped) or a name. Empty lists the newest.
 */
export const customerSearchQuerySchema = z.object({
  q: z.string().trim().max(60).optional().default(''),
})

/** Delete customer account: the customer's phone number, typed. */
export const deleteCustomerSchema = z
  .object({
    actorName: signedActorName,
    confirmText: z.string().max(40),
  })
  .strict()

export type CustomerSearchQuery = z.infer<typeof customerSearchQuerySchema>
export type DeleteCustomerInput = z.infer<typeof deleteCustomerSchema>
