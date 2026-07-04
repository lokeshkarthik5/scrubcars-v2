import { bookingsService } from './bookings.service.js';
function getAuth(c) {
    return c.get('auth');
}
export async function listMyBookings(c, query) {
    const bookings = await bookingsService.listMyBookings(getAuth(c).sub, query);
    return c.json({
        success: true,
        data: bookings,
    });
}
export async function getBookingDetail(c, bookingId) {
    const auth = getAuth(c);
    const booking = await bookingsService.getBookingDetail(auth.sub, auth.isVendorOwner, bookingId);
    return c.json({
        success: true,
        data: booking,
    });
}
export async function createBooking(c, input) {
    const booking = await bookingsService.createBooking(getAuth(c).sub, input);
    return c.json({
        success: true,
        data: booking,
    }, 201);
}
export async function cancelBooking(c, bookingId) {
    const booking = await bookingsService.cancelBooking(getAuth(c).sub, bookingId);
    return c.json({
        success: true,
        data: booking,
    });
}
export async function listVendorBookings(c, query) {
    const bookings = await bookingsService.listVendorBookings(getAuth(c).sub, query);
    return c.json({
        success: true,
        data: bookings,
    });
}
export async function acceptBooking(c, bookingId) {
    const booking = await bookingsService.acceptBooking(getAuth(c).sub, bookingId);
    return c.json({
        success: true,
        data: booking,
    });
}
export async function rejectBooking(c, bookingId) {
    const booking = await bookingsService.rejectBooking(getAuth(c).sub, bookingId);
    return c.json({
        success: true,
        data: booking,
    });
}
export async function markInProgress(c, bookingId) {
    const booking = await bookingsService.markInProgress(getAuth(c).sub, bookingId);
    return c.json({
        success: true,
        data: booking,
    });
}
export async function markCompleted(c, bookingId) {
    const booking = await bookingsService.markCompleted(getAuth(c).sub, bookingId);
    return c.json({
        success: true,
        data: booking,
    });
}
