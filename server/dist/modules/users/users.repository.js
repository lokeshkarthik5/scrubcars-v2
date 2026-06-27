import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userAddresses, users, userVehicles } from "../../db/schema.js";
export const usersRepository = {
    findUserById(id) {
        return db.query.users.findFirst({
            where: eq(users.id, id),
        });
    },
    updateUser(id, data) {
        return db.update(users).set(data).where(eq(users.id, id)).returning();
    },
    deleteUser(id) {
        return db.delete(users).where(eq(users.id, id)).returning();
    },
    listAddresses(userId) {
        return db.query.userAddresses.findMany({
            where: eq(userAddresses.userId, userId),
            orderBy: [asc(userAddresses.createdAt)],
        });
    },
    countAddresses(userId) {
        return db.query.userAddresses.findMany({
            where: eq(userAddresses.userId, userId),
            columns: { id: true },
        });
    },
    findAddressById(userId, addressId) {
        return db.query.userAddresses.findFirst({
            where: and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)),
        });
    },
    createAddress(data) {
        return db.insert(userAddresses).values(data).returning();
    },
    updateAddress(userId, addressId, data) {
        return db
            .update(userAddresses)
            .set(data)
            .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)))
            .returning();
    },
    deleteAddress(userId, addressId) {
        return db
            .delete(userAddresses)
            .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)))
            .returning();
    },
    clearDefaultAddresses(userId) {
        return db
            .update(userAddresses)
            .set({ isDefault: false })
            .where(eq(userAddresses.userId, userId));
    },
    setDefaultAddress(userId, addressId) {
        return db.transaction(async (tx) => {
            await tx
                .update(userAddresses)
                .set({ isDefault: false })
                .where(eq(userAddresses.userId, userId));
            return tx
                .update(userAddresses)
                .set({ isDefault: true })
                .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)))
                .returning();
        });
    },
    listVehicles(userId) {
        return db.query.userVehicles.findMany({
            where: eq(userVehicles.userId, userId),
            orderBy: [asc(userVehicles.make), asc(userVehicles.model)],
        });
    },
    countVehicles(userId) {
        return db.query.userVehicles.findMany({
            where: eq(userVehicles.userId, userId),
            columns: { id: true },
        });
    },
    findVehicleById(userId, vehicleId) {
        return db.query.userVehicles.findFirst({
            where: and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)),
        });
    },
    createVehicle(data) {
        return db.insert(userVehicles).values(data).returning();
    },
    updateVehicle(userId, vehicleId, data) {
        return db
            .update(userVehicles)
            .set(data)
            .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)))
            .returning();
    },
    deleteVehicle(userId, vehicleId) {
        return db
            .delete(userVehicles)
            .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)))
            .returning();
    },
    clearDefaultVehicles(userId) {
        return db
            .update(userVehicles)
            .set({ isDefault: false })
            .where(eq(userVehicles.userId, userId));
    },
    setDefaultVehicle(userId, vehicleId) {
        return db.transaction(async (tx) => {
            await tx
                .update(userVehicles)
                .set({ isDefault: false })
                .where(eq(userVehicles.userId, userId));
            return tx
                .update(userVehicles)
                .set({ isDefault: true })
                .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)))
                .returning();
        });
    },
};
