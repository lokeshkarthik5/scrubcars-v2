import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { otpVerifications, refreshTokens, users, vendors, } from '../../db/schema.js';
export const authRepository = {
    findUserByPhone(phone) {
        return db.query.users.findFirst({
            where: eq(users.phone, phone),
        });
    },
    findUserById(id) {
        return db.query.users.findFirst({
            where: eq(users.id, id),
        });
    },
    findVendorByOwnerId(ownerId) {
        return db.query.vendors.findFirst({
            where: eq(vendors.ownerId, ownerId),
        });
    },
    createUser(data) {
        return db
            .insert(users)
            .values({
            name: data.name,
            phone: data.phone,
            isCustomer: data.isCustomer ?? true,
            isVendorOwner: data.isVendorOwner ?? false,
            phoneVerified: data.phoneVerified ?? true,
        })
            .returning();
    },
    updateUser(id, data) {
        return db.update(users).set(data).where(eq(users.id, id)).returning();
    },
    incrementOtpAttempts(id) {
        return db
            .update(otpVerifications)
            .set({ attempts: sql `${otpVerifications.attempts} + 1` })
            .where(eq(otpVerifications.id, id))
            .returning();
    },
    sumRecentOtpAttempts(phone, purpose, since) {
        return db
            .select({
            value: sql `coalesce(sum(${otpVerifications.attempts}), 0)`,
        })
            .from(otpVerifications)
            .where(and(eq(otpVerifications.phone, phone), eq(otpVerifications.purpose, purpose), gt(otpVerifications.createdAt, since)));
    },
    createOtpVerification(data) {
        return db
            .insert(otpVerifications)
            .values({
            phone: data.phone,
            otpCode: data.otpCode,
            purpose: data.purpose,
            expiresAt: data.expiresAt,
        })
            .returning();
    },
    findLatestValidOtp(phone, purpose) {
        return db.query.otpVerifications.findFirst({
            where: and(eq(otpVerifications.phone, phone), eq(otpVerifications.purpose, purpose), eq(otpVerifications.verified, false), gt(otpVerifications.expiresAt, new Date())),
            orderBy: desc(otpVerifications.createdAt),
        });
    },
    markOtpVerified(id) {
        return db
            .update(otpVerifications)
            .set({ verified: true })
            .where(eq(otpVerifications.id, id))
            .returning();
    },
    createRefreshToken(data) {
        return db
            .insert(refreshTokens)
            .values({
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
        })
            .returning();
    },
    findActiveRefreshToken(tokenHash) {
        return db.query.refreshTokens.findFirst({
            where: and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.revoked, false), gt(refreshTokens.expiresAt, new Date())),
        });
    },
    revokeRefreshToken(id) {
        return db
            .update(refreshTokens)
            .set({ revoked: true })
            .where(eq(refreshTokens.id, id))
            .returning();
    },
    revokeRefreshTokenByHash(tokenHash) {
        return db
            .update(refreshTokens)
            .set({ revoked: true })
            .where(eq(refreshTokens.tokenHash, tokenHash))
            .returning();
    },
};
