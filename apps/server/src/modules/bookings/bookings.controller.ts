import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { bookingsService } from './bookings.service.js'
import type {
  CancelBookingInput,
  CreateBookingInput,
  ListMyBookingsQuery,
  ListVendorBookingsQuery,
  RescheduleBookingInput,
} from './bookings.validation.js'

type BookingsContext = Context<{ Variables: TenantVariables }>

function getAuth(c: BookingsContext) {
  return c.get('auth')
}

/** The active company. Produced by resolveTenant, never by a request param. */
function getVendorId(c: BookingsContext): string {
  return getTenant(c).vendorId
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
  const booking = await bookingsService.getBookingDetail(
    getAuth(c).sub,
    bookingId
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function getReceipt(c: BookingsContext, bookingId: string) {
  const receipt = await bookingsService.getReceipt(getAuth(c).sub, bookingId)

  return c.json({
    success: true,
    data: receipt,
  })
}

export async function dismissReviewPrompt(c: BookingsContext, bookingId: string) {
  await bookingsService.dismissReviewPrompt(getAuth(c).sub, bookingId)
  return c.body(null, 204)
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

export async function cancelBooking(
  c: BookingsContext,
  bookingId: string,
  input?: CancelBookingInput
) {
  const booking = await bookingsService.cancelBooking(
    getAuth(c).sub,
    bookingId,
    input?.reason
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function rescheduleBooking(
  c: BookingsContext,
  bookingId: string,
  input: RescheduleBookingInput
) {
  const booking = await bookingsService.rescheduleBooking(
    getAuth(c).sub,
    bookingId,
    input.scheduledAt,
    input.reason
  )

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
    getVendorId(c),
    query
  )

  return c.json({
    success: true,
    data: bookings,
  })
}

export async function acceptBooking(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.acceptBooking(
    getVendorId(c),
    getAuth(c).sub,
    bookingId
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function rejectBooking(
  c: BookingsContext,
  bookingId: string,
  input?: CancelBookingInput
) {
  const booking = await bookingsService.rejectBooking(
    getVendorId(c),
    getAuth(c).sub,
    bookingId,
    input?.reason
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function markInProgress(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.markInProgress(
    getVendorId(c),
    getAuth(c).sub,
    bookingId
  )

  return c.json({
    success: true,
    data: booking,
  })
}

export async function markCompleted(c: BookingsContext, bookingId: string) {
  const booking = await bookingsService.markCompleted(
    getVendorId(c),
    getAuth(c).sub,
    bookingId
  )

  return c.json({
    success: true,
    data: booking,
  })
}
