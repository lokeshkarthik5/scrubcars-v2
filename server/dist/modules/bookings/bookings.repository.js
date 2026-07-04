import { and, desc, eq, gte, lt, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bookings, payments, services, userAddresses, userVehicles, vendors, } from '../../db/schema.js';
export const bookingsRepository = {
    findBookingById(id) {
        return db.query.bookings.findFirst({
            where: eq(bookings.id, id),
            with: {
                user: true,
                vendor: true,
                service: true,
                vehicle: true,
                payment: true,
            },
        });
    },
    listBookingsForUser(userId, filters) {
        const conditions = [eq(bookings.userId, userId)];
        if (filters.status) {
            conditions.push(eq(bookings.status, filters.status));
        }
        if (filters.bookingType) {
            conditions.push(eq(bookings.bookingType, filters.bookingType));
        }
        return db.query.bookings.findMany({
            where: and(...conditions),
            with: {
                vendor: true,
                service: true,
                vehicle: true,
                payment: true,
            },
            orderBy: [desc(bookings.scheduledAt)],
        });
    },
    listBookingsForVendor(vendorId, status) {
        const conditions = [eq(bookings.vendorId, vendorId)];
        if (status) {
            conditions.push(eq(bookings.status, status));
        }
        return db.query.bookings.findMany({
            where: and(...conditions),
            with: {
                user: true,
                service: true,
                vehicle: true,
                payment: true,
            },
            orderBy: [desc(bookings.scheduledAt)],
        });
    },
    createBookingWithPayment(data) {
        return db.transaction(async (tx) => {
            const [booking] = await tx
                .insert(bookings)
                .values({
                userId: data.userId,
                vendorId: data.vendorId,
                serviceId: data.serviceId,
                vehicleId: data.vehicleId,
                bookingType: data.bookingType,
                scheduledAt: data.scheduledAt,
                amount: data.amount,
                paymentMethod: data.paymentMethod,
                lat: data.lat ?? null,
                lng: data.lng ?? null,
                address: data.address ?? null,
            })
                .returning();
            const [payment] = await tx
                .insert(payments)
                .values({
                bookingId: booking.id,
                gateway: 'razorpay',
                amount: data.amount,
                status: 'pending',
            })
                .returning();
            return { booking, payment };
        });
    },
    updateBookingStatus(bookingId, status) {
        return db
            .update(bookings)
            .set({ status })
            .where(eq(bookings.id, bookingId))
            .returning();
    },
    updatePaymentStatus(bookingId, status, paidAt) {
        return db
            .update(payments)
            .set({
            status,
            ...(paidAt !== undefined ? { paidAt } : {}),
        })
            .where(eq(payments.bookingId, bookingId))
            .returning();
    },
    findVehicleForUser(userId, vehicleId) {
        return db.query.userVehicles.findFirst({
            where: and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)),
        });
    },
    findAddressForUser(userId, addressId) {
        return db.query.userAddresses.findFirst({
            where: and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)),
        });
    },
    findVendorById(id) {
        return db.query.vendors.findFirst({
            where: eq(vendors.id, id),
        });
    },
    findPublicVendorById(id) {
        return db.query.vendors.findFirst({
            where: and(eq(vendors.id, id), eq(vendors.status, 'active'), eq(vendors.isVerified, true)),
        });
    },
    findServiceForVendor(vendorId, serviceId) {
        return db.query.services.findFirst({
            where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId)),
        });
    },
    listBookingsForDate(vendorId, date) {
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        return db.query.bookings.findMany({
            where: and(eq(bookings.vendorId, vendorId), gte(bookings.scheduledAt, dayStart), lt(bookings.scheduledAt, dayEnd), ne(bookings.status, 'cancelled')),
            with: {
                service: true,
            },
        });
    },
};
