import { usersService } from './users.service.js';
function getUserId(c) {
    return c.get('auth').sub;
}
export async function getProfile(c) {
    const profile = await usersService.getProfile(getUserId(c));
    return c.json({
        success: true,
        data: profile,
    });
}
export async function updateProfile(c, input) {
    const profile = await usersService.updateProfile(getUserId(c), input);
    return c.json({
        success: true,
        data: profile,
    });
}
export async function deleteAccount(c) {
    await usersService.deleteAccount(getUserId(c));
    return c.json({
        success: true,
        message: 'Account deleted successfully',
    });
}
export async function listAddresses(c) {
    const addresses = await usersService.listAddresses(getUserId(c));
    return c.json({
        success: true,
        data: addresses,
    });
}
export async function createAddress(c, input) {
    const address = await usersService.createAddress(getUserId(c), input);
    return c.json({
        success: true,
        data: address,
    }, 201);
}
export async function updateAddress(c, addressId, input) {
    const address = await usersService.updateAddress(getUserId(c), addressId, input);
    return c.json({
        success: true,
        data: address,
    });
}
export async function deleteAddress(c, addressId) {
    const address = await usersService.deleteAddress(getUserId(c), addressId);
    return c.json({
        success: true,
        data: address,
    });
}
export async function setDefaultAddress(c, addressId) {
    const address = await usersService.setDefaultAddress(getUserId(c), addressId);
    return c.json({
        success: true,
        data: address,
    });
}
export async function listVehicles(c) {
    const vehicles = await usersService.listVehicles(getUserId(c));
    return c.json({
        success: true,
        data: vehicles,
    });
}
export async function createVehicle(c, input) {
    const vehicle = await usersService.createVehicle(getUserId(c), input);
    return c.json({
        success: true,
        data: vehicle,
    }, 201);
}
export async function updateVehicle(c, vehicleId, input) {
    const vehicle = await usersService.updateVehicle(getUserId(c), vehicleId, input);
    return c.json({
        success: true,
        data: vehicle,
    });
}
export async function deleteVehicle(c, vehicleId) {
    const vehicle = await usersService.deleteVehicle(getUserId(c), vehicleId);
    return c.json({
        success: true,
        data: vehicle,
    });
}
export async function setDefaultVehicle(c, vehicleId) {
    const vehicle = await usersService.setDefaultVehicle(getUserId(c), vehicleId);
    return c.json({
        success: true,
        data: vehicle,
    });
}
