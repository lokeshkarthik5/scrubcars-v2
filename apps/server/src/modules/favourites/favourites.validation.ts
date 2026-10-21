import { z } from 'zod'

/** PUT and DELETE /users/me/favourites/:vendorId. The user is always the session's. */
export const favouriteVendorParamSchema = z.object({
  vendorId: z.string().uuid(),
})

export type FavouriteVendorParam = z.infer<typeof favouriteVendorParamSchema>
