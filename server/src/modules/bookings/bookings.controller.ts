import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { bookingsService } from './bookings.service.js'
import type {
  CreateBookingInput,
  ListMyBookingsQuery,
  ListVendorBookingsQuery,
} from './bookings.validation.js'

type BookingsContext = Context<{ Variables: AuthVariables }>

function getAuth(c: BookingsContext) {
  return c.get('auth')
}

export async function listMyBookings(
  c: BookingsContext,
  query: ListMyBookingsQuery
) {
  const bookings = await bookingsService.listMyBookings(getAuth(c).sub, query)

  return c.json({
    success: true,
    data: bookings,
  })
}

export async function getBookingDetail(c: BookingsContext, bookingId: string) {
  const auth = getAuth(c)
  const booking = await bookingsService.getBookingDetail(
    auth.sub,
    auth.isVendorOwner,
    bookingId
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function createBooking(
  c: BookingsContext,
  input: CreateBookingInput
) {
  const booking = await bookingsService.createBooking(getAuth(c).sub, input)

  return c.json(
    {
      success: true,
      data: booking,
    },
    201
  )
}

export async function cancelBooking(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.cancelBooking(getAuth(c).sub, bookingId)

  return c.json({
    success: true,
    data: booking,
  })
}

export async function listVendorBookings(
  c: BookingsContext,
  query: ListVendorBookingsQuery
) {
  const bookings = await bookingsService.listVendorBookings(
    getAuth(c).sub,
    query
  )

  return c.json({
    success: true,
    data: bookings,
  })
}

export async function acceptBooking(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.acceptBooking(getAuth(c).sub, bookingId)

  return c.json({
    success: true,
    data: booking,
  })
}

export async function rejectBooking(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.rejectBooking(getAuth(c).sub, bookingId)

  return c.json({
    success: true,
    data: booking,
  })
}

export async function markInProgress(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.markInProgress(
    getAuth(c).sub,
    bookingId
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function markCompleted(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.markCompleted(getAuth(c).sub, bookingId)

  return c.json({
    success: true,
    data: booking,
  })
}
