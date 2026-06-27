import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings, services, users, vendorPhotos, vendors, vendorServiceAreas, vendorWorkingHours, } from "../../db/schema.js";
function normalizeTime(time) {
    return time.length === 5 ? `${time}:00` : time;
}
export const vendorsRepository = {
    findVendorById(id) {
        return db.query.vendors.findFirst({
            where: eq(vendors.id, id),
        });
    },
    findVendorByOwnerId(ownerId) {
        return db.query.vendors.findFirst({
            where: eq(vendors.ownerId, ownerId),
        });
    },
    findPublicVendorById(id) {
        return db.query.vendors.findFirst({
            where: and(eq(vendors.id, id), eq(vendors.status, "active"), eq(vendors.isVerified, true)),
        });
    },
    createVendor(data) {
        return db
            .insert(vendors)
            .values({
            ownerId: data.ownerId,
            businessName: data.businessName,
            phone: data.phone,
            address: data.address,
            city: data.city,
            lat: data.lat,
            lng: data.lng,
        })
            .returning();
    },
    updateVendor(vendorId, data) {
        return db
            .update(vendors)
            .set(data)
            .where(eq(vendors.id, vendorId))
            .returning();
    },
    setUserAsVendorOwner(userId) {
        return db
            .update(users)
            .set({ isVendorOwner: true })
            .where(eq(users.id, userId))
            .returning();
    },
    listWorkingHours(vendorId) {
        return db.query.vendorWorkingHours.findMany({
            where: eq(vendorWorkingHours.vendorId, vendorId),
            orderBy: [asc(vendorWorkingHours.dayOfWeek)],
        });
    },
    findWorkingHoursForDay(vendorId, dayOfWeek) {
        return db.query.vendorWorkingHours.findFirst({
            where: and(eq(vendorWorkingHours.vendorId, vendorId), eq(vendorWorkingHours.dayOfWeek, dayOfWeek)),
        });
    },
    upsertWorkingHours(vendorId, days) {
        return db.transaction(async (tx) => {
            const results = [];
            for (const day of days) {
                const [row] = await tx
                    .insert(vendorWorkingHours)
                    .values({
                    vendorId,
                    dayOfWeek: day.dayOfWeek,
                    openTime: normalizeTime(day.openTime),
                    closeTime: normalizeTime(day.closeTime),
                    isClosed: day.isClosed,
                })
                    .onConflictDoUpdate({
                    target: [
                        vendorWorkingHours.vendorId,
                        vendorWorkingHours.dayOfWeek,
                    ],
                    set: {
                        openTime: normalizeTime(day.openTime),
                        closeTime: normalizeTime(day.closeTime),
                        isClosed: day.isClosed,
                    },
                })
                    .returning();
                results.push(row);
            }
            return results.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
        });
    },
    listServiceAreas(vendorId) {
        return db.query.vendorServiceAreas.findMany({
            where: eq(vendorServiceAreas.vendorId, vendorId),
            orderBy: [asc(vendorServiceAreas.areaName)],
        });
    },
    createServiceArea(vendorId, data) {
        return db
            .insert(vendorServiceAreas)
            .values({
            vendorId,
            areaName: data.areaName,
            pincode: data.pincode,
            radiusKm: data.radiusKm ?? null,
        })
            .returning();
    },
    findServiceAreaById(vendorId, areaId) {
        return db.query.vendorServiceAreas.findFirst({
            where: and(eq(vendorServiceAreas.id, areaId), eq(vendorServiceAreas.vendorId, vendorId)),
        });
    },
    deleteServiceArea(vendorId, areaId) {
        return db
            .delete(vendorServiceAreas)
            .where(and(eq(vendorServiceAreas.id, areaId), eq(vendorServiceAreas.vendorId, vendorId)))
            .returning();
    },
    listPhotos(vendorId) {
        return db.query.vendorPhotos.findMany({
            where: eq(vendorPhotos.vendorId, vendorId),
            orderBy: [asc(vendorPhotos.sortOrder), asc(vendorPhotos.createdAt)],
        });
    },
    getNextPhotoSortOrder(vendorId) {
        return db
            .select({
            maxOrder: sql `coalesce(max(${vendorPhotos.sortOrder}), -1)`,
        })
            .from(vendorPhotos)
            .where(eq(vendorPhotos.vendorId, vendorId));
    },
    createPhoto(vendorId, data) {
        return db
            .insert(vendorPhotos)
            .values({
            vendorId,
            url: data.url,
            sortOrder: data.sortOrder,
        })
            .returning();
    },
    findPhotoById(vendorId, photoId) {
        return db.query.vendorPhotos.findFirst({
            where: and(eq(vendorPhotos.id, photoId), eq(vendorPhotos.vendorId, vendorId)),
        });
    },
    deletePhoto(vendorId, photoId) {
        return db
            .delete(vendorPhotos)
            .where(and(eq(vendorPhotos.id, photoId), eq(vendorPhotos.vendorId, vendorId)))
            .returning();
    },
    updatePhotoSortOrders(vendorId, updates) {
        return db.transaction(async (tx) => {
            const results = [];
            for (const update of updates) {
                const [row] = await tx
                    .update(vendorPhotos)
                    .set({ sortOrder: update.sortOrder })
                    .where(and(eq(vendorPhotos.id, update.id), eq(vendorPhotos.vendorId, vendorId)))
                    .returning();
                if (row) {
                    results.push(row);
                }
            }
            return results.sort((a, b) => a.sortOrder - b.sortOrder);
        });
    },
    listServices(vendorId, activeOnly = false) {
        return db.query.services.findMany({
            where: activeOnly
                ? and(eq(services.vendorId, vendorId), eq(services.isActive, true))
                : eq(services.vendorId, vendorId),
            orderBy: [asc(services.name)],
        });
    },
    findServiceById(vendorId, serviceId) {
        return db.query.services.findFirst({
            where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId)),
        });
    },
    findPublicService(vendorId, serviceId) {
        return db.query.services.findFirst({
            where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId), eq(services.isActive, true)),
        });
    },
    createService(vendorId, data) {
        return db
            .insert(services)
            .values({
            vendorId,
            name: data.name,
            description: data.description ?? null,
            category: data.category,
            price: data.price,
            durationMins: data.durationMins,
        })
            .returning();
    },
    updateService(vendorId, serviceId, data) {
        return db
            .update(services)
            .set(data)
            .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId)))
            .returning();
    },
    deleteService(vendorId, serviceId) {
        return db
            .delete(services)
            .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId)))
            .returning();
    },
    listBookingsForDate(vendorId, date) {
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        return db.query.bookings.findMany({
            where: and(eq(bookings.vendorId, vendorId), gte(bookings.scheduledAt, dayStart), lt(bookings.scheduledAt, dayEnd), ne(bookings.status, "cancelled")),
            with: {
                service: true,
            },
        });
    },
};
