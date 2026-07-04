import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, reviews, vendors } from '../../db/schema.js'

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

  findPublicVendorById(vendorId: string) {
    return db.query.vendors.findFirst({
      where: and(
        eq(vendors.id, vendorId),
        eq(vendors.status, 'active'),
        eq(vendors.isVerified, true)
      ),
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
          },
        },
        vendor: true,
      },
      orderBy: [desc(reviews.createdAt)],
    })
  },

  listReviewsForVendor(vendorId: string) {
    return db.query.reviews.findMany({
      where: eq(reviews.vendorId, vendorId),
      with: {
        user: true,
        booking: {
          with: {
            service: true,
          },
        },
      },
      orderBy: [desc(reviews.createdAt)],
    })
  },
}
