import { and, desc, eq, gt, lt, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { otpVerifications, refreshTokens, users } from '../../db/schema.js'
import type { otpPurposeEnum } from '../../db/schema.js'

type OtpPurpose = (typeof otpPurposeEnum.enumValues)[number]

export type UserRecord = typeof users.$inferSelect

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

  /**
   * Counts one guess against a code, unless the code has already had `cap`.
   *
   * One statement, so two guesses arriving together cannot both read "2 of 3
   * used" and both go on to compare: the second waits on the first's row
   * lock, re-checks the condition against the updated row, and finds no room.
   * No row back means no attempt was granted.
   */
  claimOtpAttempt(id: string, cap: number) {
    return db
      .update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(and(eq(otpVerifications.id, id), lt(otpVerifications.attempts, cap)))
      .returning({ attempts: otpVerifications.attempts })
  },

  /**
   * Failed attempts in the window across this phone's codes. `excludeId`
   * leaves one code out — the one being guessed at — so the total is made of
   * rows that can no longer change.
   */
  sumRecentOtpAttempts(phone: string, purpose: OtpPurpose, since: Date, excludeId?: string) {
    return db
      .select({
        value: sql<number>`coalesce(sum(${otpVerifications.attempts}), 0)`,
      })
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.phone, phone),
          eq(otpVerifications.purpose, purpose),
          gt(otpVerifications.createdAt, since),
          excludeId ? ne(otpVerifications.id, excludeId) : undefined
        )
      )
  },

  /** When each code for this phone went out since `since`, any purpose. */
  listOtpSendTimes(phone: string, since: Date) {
    return db
      .select({ createdAt: otpVerifications.createdAt })
      .from(otpVerifications)
      .where(and(eq(otpVerifications.phone, phone), gt(otpVerifications.createdAt, since)))
      .orderBy(desc(otpVerifications.createdAt))
  },

  deleteOtpVerification(id: string) {
    return db.delete(otpVerifications).where(eq(otpVerifications.id, id))
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

  /**
   * Uses the code up, once. The guess that got it right was claimed as an
   * attempt like any other; it is handed back here so `attempts` keeps
   * meaning what the window rule counts — wrong guesses. The `verified =
   * false` condition makes a second, simultaneous correct guess find nothing,
   * so one code can never open two sessions.
   */
  markOtpVerified(id: string) {
    return db
      .update(otpVerifications)
      .set({
        verified: true,
        attempts: sql`greatest(${otpVerifications.attempts} - 1, 0)`,
      })
      .where(and(eq(otpVerifications.id, id), eq(otpVerifications.verified, false)))
      .returning({ id: otpVerifications.id })
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
