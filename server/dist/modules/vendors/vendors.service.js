import { AppError } from "../../lib/errors.js";
import { createVendorPhotoUploadUrl } from "../../lib/gcs.js";
import { computeAvailableSlots, getDayOfWeekFromDate, } from "../../lib/slots.js";
import { vendorsRepository } from "./vendors.repository.js";
function toVendorResponse(vendor) {
    return {
        id: vendor.id,
        ownerId: vendor.ownerId,
        businessName: vendor.businessName,
        phone: vendor.phone,
        address: vendor.address,
        city: vendor.city,
        lat: vendor.lat,
        lng: vendor.lng,
        isVerified: vendor.isVerified,
        doorstepEnabled: vendor.doorstepEnabled,
        dropinEnabled: vendor.dropinEnabled,
        slotIntervalMins: vendor.slotIntervalMins,
        status: vendor.status,
        createdAt: vendor.createdAt.toISOString(),
    };
}
function toWorkingHoursResponse(hours) {
    return {
        id: hours.id,
        dayOfWeek: hours.dayOfWeek,
        openTime: hours.openTime,
        closeTime: hours.closeTime,
        isClosed: hours.isClosed,
    };
}
function toServiceAreaResponse(area) {
    return {
        id: area.id,
        areaName: area.areaName,
        pincode: area.pincode,
        radiusKm: area.radiusKm,
    };
}
function toPhotoResponse(photo) {
    return {
        id: photo.id,
        url: photo.url,
        sortOrder: photo.sortOrder,
        createdAt: photo.createdAt.toISOString(),
    };
}
function toServiceResponse(service) {
    return {
        id: service.id,
        name: service.name,
        description: service.description,
        category: service.category,
        price: service.price,
        durationMins: service.durationMins,
        isActive: service.isActive,
    };
}
async function getOwnedVendor(ownerId) {
    const vendor = await vendorsRepository.findVendorByOwnerId(ownerId);
    if (!vendor) {
        throw new AppError(404, "Vendor profile not found", "VENDOR_NOT_FOUND");
    }
    return vendor;
}
export const vendorsService = {
    async getPublicVendor(vendorId) {
        const vendor = await vendorsRepository.findPublicVendorById(vendorId);
        if (!vendor) {
            throw new AppError(404, "Vendor not found", "VENDOR_NOT_FOUND");
        }
        const [photos, services] = await Promise.all([
            vendorsRepository.listPhotos(vendor.id),
            vendorsRepository.listServices(vendor.id, true),
        ]);
        const { ownerId: _ownerId, ...publicVendor } = toVendorResponse(vendor);
        return {
            ...publicVendor,
            photos: photos.map(toPhotoResponse),
            services: services.map(toServiceResponse),
        };
    },
    async getMyVendor(ownerId) {
        const vendor = await getOwnedVendor(ownerId);
        return toVendorResponse(vendor);
    },
    async createVendor(ownerId, input) {
        const existing = await vendorsRepository.findVendorByOwnerId(ownerId);
        if (existing) {
            throw new AppError(409, "Vendor profile already exists for this user", "VENDOR_ALREADY_EXISTS");
        }
        const [vendor] = await vendorsRepository.createVendor({
            ownerId,
            ...input,
        });
        await vendorsRepository.setUserAsVendorOwner(ownerId);
        return toVendorResponse(vendor);
    },
    async updateVendor(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const [updated] = await vendorsRepository.updateVendor(vendor.id, input);
        return toVendorResponse(updated);
    },
    async updateJobTypes(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const [updated] = await vendorsRepository.updateVendor(vendor.id, input);
        return toVendorResponse(updated);
    },
    async updateSlotInterval(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const [updated] = await vendorsRepository.updateVendor(vendor.id, {
            slotIntervalMins: input.slotIntervalMins,
        });
        return toVendorResponse(updated);
    },
    async getWorkingHours(ownerId) {
        const vendor = await getOwnedVendor(ownerId);
        const hours = await vendorsRepository.listWorkingHours(vendor.id);
        return hours.map(toWorkingHoursResponse);
    },
    async setWorkingHours(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        for (const day of input.days) {
            if (!day.isClosed && day.openTime >= day.closeTime) {
                throw new AppError(400, `openTime must be before closeTime for day ${day.dayOfWeek}`, "INVALID_WORKING_HOURS");
            }
        }
        const hours = await vendorsRepository.upsertWorkingHours(vendor.id, input.days);
        return hours.map(toWorkingHoursResponse);
    },
    async listServiceAreas(ownerId) {
        const vendor = await getOwnedVendor(ownerId);
        const areas = await vendorsRepository.listServiceAreas(vendor.id);
        return areas.map(toServiceAreaResponse);
    },
    async createServiceArea(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const [area] = await vendorsRepository.createServiceArea(vendor.id, input);
        return toServiceAreaResponse(area);
    },
    async deleteServiceArea(ownerId, areaId) {
        const vendor = await getOwnedVendor(ownerId);
        const area = await vendorsRepository.findServiceAreaById(vendor.id, areaId);
        if (!area) {
            throw new AppError(404, "Service area not found", "SERVICE_AREA_NOT_FOUND");
        }
        const [deleted] = await vendorsRepository.deleteServiceArea(vendor.id, areaId);
        return toServiceAreaResponse(deleted);
    },
    async listPhotos(ownerId) {
        const vendor = await getOwnedVendor(ownerId);
        const photos = await vendorsRepository.listPhotos(vendor.id);
        return photos.map(toPhotoResponse);
    },
    async uploadPhoto(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const [{ maxOrder }] = await vendorsRepository.getNextPhotoSortOrder(vendor.id);
        const upload = await createVendorPhotoUploadUrl({
            vendorId: vendor.id,
            filename: input.filename,
            contentType: input.contentType,
        });
        const [photo] = await vendorsRepository.createPhoto(vendor.id, {
            url: upload.publicUrl,
            sortOrder: Number(maxOrder) + 1,
        });
        return {
            photo: toPhotoResponse(photo),
            uploadUrl: upload.uploadUrl,
            publicUrl: upload.publicUrl,
        };
    },
    async reorderPhotos(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const existing = await vendorsRepository.listPhotos(vendor.id);
        const existingIds = new Set(existing.map((photo) => photo.id));
        for (const photo of input.photos) {
            if (!existingIds.has(photo.id)) {
                throw new AppError(404, "Photo not found", "PHOTO_NOT_FOUND");
            }
        }
        const photos = await vendorsRepository.updatePhotoSortOrders(vendor.id, input.photos);
        return photos.map(toPhotoResponse);
    },
    async deletePhoto(ownerId, photoId) {
        const vendor = await getOwnedVendor(ownerId);
        const photo = await vendorsRepository.findPhotoById(vendor.id, photoId);
        if (!photo) {
            throw new AppError(404, "Photo not found", "PHOTO_NOT_FOUND");
        }
        const [deleted] = await vendorsRepository.deletePhoto(vendor.id, photoId);
        return toPhotoResponse(deleted);
    },
    async listPublicServices(vendorId) {
        const vendor = await vendorsRepository.findPublicVendorById(vendorId);
        if (!vendor) {
            throw new AppError(404, "Vendor not found", "VENDOR_NOT_FOUND");
        }
        const services = await vendorsRepository.listServices(vendor.id, true);
        return services.map(toServiceResponse);
    },
    async listMyServices(ownerId) {
        const vendor = await getOwnedVendor(ownerId);
        const services = await vendorsRepository.listServices(vendor.id);
        return services.map(toServiceResponse);
    },
    async createService(ownerId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const [service] = await vendorsRepository.createService(vendor.id, {
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            price: input.price.toFixed(2),
            durationMins: input.durationMins,
        });
        return toServiceResponse(service);
    },
    async updateService(ownerId, serviceId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const existing = await vendorsRepository.findServiceById(vendor.id, serviceId);
        if (!existing) {
            throw new AppError(404, "Service not found", "SERVICE_NOT_FOUND");
        }
        const [updated] = await vendorsRepository.updateService(vendor.id, serviceId, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
                ? { description: input.description }
                : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.price !== undefined
                ? { price: input.price.toFixed(2) }
                : {}),
            ...(input.durationMins !== undefined
                ? { durationMins: input.durationMins }
                : {}),
        });
        return toServiceResponse(updated);
    },
    async toggleServiceActive(ownerId, serviceId, input) {
        const vendor = await getOwnedVendor(ownerId);
        const existing = await vendorsRepository.findServiceById(vendor.id, serviceId);
        if (!existing) {
            throw new AppError(404, "Service not found", "SERVICE_NOT_FOUND");
        }
        const [updated] = await vendorsRepository.updateService(vendor.id, serviceId, { isActive: input.isActive });
        return toServiceResponse(updated);
    },
    async deleteService(ownerId, serviceId) {
        const vendor = await getOwnedVendor(ownerId);
        const existing = await vendorsRepository.findServiceById(vendor.id, serviceId);
        if (!existing) {
            throw new AppError(404, "Service not found", "SERVICE_NOT_FOUND");
        }
        const [deleted] = await vendorsRepository.deleteService(vendor.id, serviceId);
        return toServiceResponse(deleted);
    },
    async getAvailableSlots(vendorId, query) {
        const vendor = await vendorsRepository.findPublicVendorById(vendorId);
        if (!vendor) {
            throw new AppError(404, "Vendor not found", "VENDOR_NOT_FOUND");
        }
        const service = await vendorsRepository.findPublicService(vendor.id, query.service_id);
        if (!service) {
            throw new AppError(404, "Service not found", "SERVICE_NOT_FOUND");
        }
        const dayOfWeek = getDayOfWeekFromDate(query.date);
        const hours = await vendorsRepository.findWorkingHoursForDay(vendor.id, dayOfWeek);
        if (!hours) {
            return {
                date: query.date,
                serviceId: service.id,
                slotIntervalMins: vendor.slotIntervalMins,
                slots: [],
            };
        }
        const dayBookings = await vendorsRepository.listBookingsForDate(vendor.id, query.date);
        const bookedRanges = dayBookings.map((booking) => {
            const durationMins = booking.service?.durationMins ?? service.durationMins;
            const start = booking.scheduledAt;
            const end = new Date(start.getTime() + durationMins * 60 * 1000);
            return { start, end };
        });
        const slots = computeAvailableSlots({
            date: query.date,
            openTime: hours.openTime,
            closeTime: hours.closeTime,
            intervalMins: vendor.slotIntervalMins,
            isClosed: hours.isClosed,
            serviceDurationMins: service.durationMins,
            bookedRanges,
        });
        return {
            date: query.date,
            serviceId: service.id,
            slotIntervalMins: vendor.slotIntervalMins,
            slots,
        };
    },
};
