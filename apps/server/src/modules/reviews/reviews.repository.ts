import { asc, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookingItems, bookings, reviews, vendors } from '../../db/schema.js'

export type ReviewRecord = typeof reviews.$inferSelect

export const reviewsRepository = {
  findBookingById(bookingId: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        service: true,
        vendor: true,
        review: true,
      },
    })
  },

  findVendorById(vendorId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, vendorId),
    })
  },

  createReview(data: {
    bookingId: string
    userId: string
    vendorId: string
    rating: number
    comment?: string | null
  }) {
    return db
      .insert(reviews)
      .values({
        bookingId: data.bookingId,
        userId: data.userId,
        vendorId: data.vendorId,
        rating: data.rating,
        comment: data.comment ?? null,
      })
      .returning()
  },

  listReviewsForUser(userId: string) {
    return db.query.reviews.findMany({
      where: eq(reviews.userId, userId),
      with: {
        booking: {
          with: {
            service: true,
            items: { orderBy: [asc(bookingItems.sortOrder)] },
          },
        },
        vendor: true,
      },
      orderBy: [desc(reviews.createdAt)],
    })
  },

  /**
   * Feeds the public review list, so it loads only what that list shows: the
   * reviewer's name (never their phone) and the services' names.
   */
  listReviewsForVendor(vendorId: string) {
    return db.query.reviews.findMany({
      where: eq(reviews.vendorId, vendorId),
      with: {
        user: { columns: { name: true } },
        booking: {
          columns: { id: true },
          with: {
            service: { columns: { id: true, name: true } },
            items: {
              columns: { name: true },
              orderBy: [asc(bookingItems.sortOrder)],
            },
          },
        },
      },
      orderBy: [desc(reviews.createdAt)],
    })
  },
}
