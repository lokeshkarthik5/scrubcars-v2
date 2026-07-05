import { vendorsService } from './vendors.service.js';
function getOwnerId(c) {
    return c.get('auth').sub;
}
export async function listPublicVendors(c, query) {
    const vendors = await vendorsService.listPublicVendors(query);
    return c.json({
        success: true,
        data: vendors,
    });
}
export async function getPublicVendor(c, vendorId) {
    const vendor = await vendorsService.getPublicVendor(vendorId);
    return c.json({
        success: true,
        data: vendor,
    });
}
export async function getMyVendor(c) {
    const vendor = await vendorsService.getMyVendor(getOwnerId(c));
    return c.json({
        success: true,
        data: vendor,
    });
}
export async function createVendor(c, input) {
    const vendor = await vendorsService.createVendor(getOwnerId(c), input);
    return c.json({
        success: true,
        data: vendor,
    }, 201);
}
export async function updateVendor(c, input) {
    const vendor = await vendorsService.updateVendor(getOwnerId(c), input);
    return c.json({
        success: true,
        data: vendor,
    });
}
export async function updateJobTypes(c, input) {
    const vendor = await vendorsService.updateJobTypes(getOwnerId(c), input);
    return c.json({
        success: true,
        data: vendor,
    });
}
export async function updateSlotInterval(c, input) {
    const vendor = await vendorsService.updateSlotInterval(getOwnerId(c), input);
    return c.json({
        success: true,
        data: vendor,
    });
}
export async function getWorkingHours(c) {
    const hours = await vendorsService.getWorkingHours(getOwnerId(c));
    return c.json({
        success: true,
        data: hours,
    });
}
export async function setWorkingHours(c, input) {
    const hours = await vendorsService.setWorkingHours(getOwnerId(c), input);
    return c.json({
        success: true,
        data: hours,
    });
}
export async function listServiceAreas(c) {
    const areas = await vendorsService.listServiceAreas(getOwnerId(c));
    return c.json({
        success: true,
        data: areas,
    });
}
export async function createServiceArea(c, input) {
    const area = await vendorsService.createServiceArea(getOwnerId(c), input);
    return c.json({
        success: true,
        data: area,
    }, 201);
}
export async function deleteServiceArea(c, areaId) {
    const area = await vendorsService.deleteServiceArea(getOwnerId(c), areaId);
    return c.json({
        success: true,
        data: area,
    });
}
export async function listPhotos(c) {
    const photos = await vendorsService.listPhotos(getOwnerId(c));
    return c.json({
        success: true,
        data: photos,
    });
}
export async function reorderPhotos(c, input) {
    const photos = await vendorsService.reorderPhotos(getOwnerId(c), input);
    return c.json({
        success: true,
        data: photos,
    });
}
export async function deletePhoto(c, photoId) {
    const photo = await vendorsService.deletePhoto(getOwnerId(c), photoId);
    return c.json({
        success: true,
        data: photo,
    });
}
export async function listPublicServices(c, vendorId) {
    const services = await vendorsService.listPublicServices(vendorId);
    return c.json({
        success: true,
        data: services,
    });
}
export async function listMyServices(c) {
    const services = await vendorsService.listMyServices(getOwnerId(c));
    return c.json({
        success: true,
        data: services,
    });
}
export async function createService(c, input) {
    const service = await vendorsService.createService(getOwnerId(c), input);
    return c.json({
        success: true,
        data: service,
    }, 201);
}
export async function updateService(c, serviceId, input) {
    const service = await vendorsService.updateService(getOwnerId(c), serviceId, input);
    return c.json({
        success: true,
        data: service,
    });
}
export async function toggleServiceActive(c, serviceId, input) {
    const service = await vendorsService.toggleServiceActive(getOwnerId(c), serviceId, input);
    return c.json({
        success: true,
        data: service,
    });
}
export async function deleteService(c, serviceId) {
    const service = await vendorsService.deleteService(getOwnerId(c), serviceId);
    return c.json({
        success: true,
        data: service,
    });
}
export async function getAvailableSlots(c, vendorId, query) {
    const slots = await vendorsService.getAvailableSlots(vendorId, query);
    return c.json({
        success: true,
        data: slots,
    });
}
