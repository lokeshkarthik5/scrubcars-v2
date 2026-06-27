import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  otpVerifications,
  refreshTokens,
  users,
  vendors,
} from '../../db/schema.js'
import type { otpPurposeEnum } from '../../db/schema.js'

type OtpPurpose = (typeof otpPurposeEnum.enumValues)[number]

export type UserRecord = typeof users.$inferSelect
export type VendorRecord = typeof vendors.$inferSelect

export const authRepository = {
  findUserByPhone(phone: string) {
    return db.query.users.findFirst({
      where: eq(users.phone, phone),
    })
  },

  findUserById(id: string) {
    return db.query.users.findFirst({
      where: eq(users.id, id),
    })
  },

  findVendorByOwnerId(ownerId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.ownerId, ownerId),
    })
  },

  createUser(data: {
    name: string
    phone: string
    isCustomer?: boolean
    isVendorOwner?: boolean
    phoneVerified?: boolean
  }) {
    return db
      .insert(users)
      .values({
        name: data.name,
        phone: data.phone,
        isCustomer: data.isCustomer ?? true,
        isVendorOwner: data.isVendorOwner ?? false,
        phoneVerified: data.phoneVerified ?? true,
      })
      .returning()
  },

  updateUser(
    id: string,
    data: Partial<{
      name: string
      phoneVerified: boolean
      isCustomer: boolean
      isVendorOwner: boolean
    }>
  ) {
    return db.update(users).set(data).where(eq(users.id, id)).returning()
  },

  incrementOtpAttempts(id: string) {
    return db
      .update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(eq(otpVerifications.id, id))
      .returning()
  },

  sumRecentOtpAttempts(phone: string, purpose: OtpPurpose, since: Date) {
    return db
      .select({
        value: sql<number>`coalesce(sum(${otpVerifications.attempts}), 0)`,
      })
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.phone, phone),
          eq(otpVerifications.purpose, purpose),
          gt(otpVerifications.createdAt, since)
        )
      )
  },

  createOtpVerification(data: {
    phone: string
    otpCode: string
    purpose: OtpPurpose
    expiresAt: Date
  }) {
    return db
      .insert(otpVerifications)
      .values({
        phone: data.phone,
        otpCode: data.otpCode,
        purpose: data.purpose,
        expiresAt: data.expiresAt,
      })
      .returning()
  },

  findLatestValidOtp(phone: string, purpose: OtpPurpose) {
    return db.query.otpVerifications.findFirst({
      where: and(
        eq(otpVerifications.phone, phone),
        eq(otpVerifications.purpose, purpose),
        eq(otpVerifications.verified, false),
        gt(otpVerifications.expiresAt, new Date())
      ),
      orderBy: desc(otpVerifications.createdAt),
    })
  },

  markOtpVerified(id: string) {
    return db
      .update(otpVerifications)
      .set({ verified: true })
      .where(eq(otpVerifications.id, id))
      .returning()
  },

  createRefreshToken(data: {
    userId: string
    tokenHash: string
    expiresAt: Date
  }) {
    return db
      .insert(refreshTokens)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning()
  },

  findActiveRefreshToken(tokenHash: string) {
    return db.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.tokenHash, tokenHash),
        eq(refreshTokens.revoked, false),
        gt(refreshTokens.expiresAt, new Date())
      ),
    })
  },

  revokeRefreshToken(id: string) {
    return db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.id, id))
      .returning()
  },

  revokeRefreshTokenByHash(tokenHash: string) {
    return db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .returning()
  },
}
