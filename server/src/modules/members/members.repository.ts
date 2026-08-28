import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { userMemberMapping, users, vendors } from '../../db/schema.js'
import type { memberRoleEnum } from '../../db/schema.js'

export type MemberRole = (typeof memberRoleEnum.enumValues)[number]

/** The two roles that name a seat inside one company. */
export const VENDOR_SCOPED_ROLES = [
  'vendor_admin',
  'vendor_operator',
] as const satisfies readonly MemberRole[]

export type VendorScopedRole = (typeof VENDOR_SCOPED_ROLES)[number]

export type MemberMappingRecord = typeof userMemberMapping.$inferSelect

/**
 * Every read here filters on status = 'active'. A suspended row is treated
 * exactly like no row — miss the filter in one place and a suspended member
 * still has access, which is the same bug class as forgetting a tenant filter.
 */
export const membersRepository = {
  /** The caller's seats, one per company they can act as. */
  listActiveVendorSeats(userId: string) {
    return db
      .select({
        id: userMemberMapping.id,
        vendorId: userMemberMapping.vendorId,
        role: userMemberMapping.role,
        vendor: {
          id: vendors.id,
          businessName: vendors.businessName,
          logoUrl: vendors.logoUrl,
          phone: vendors.phone,
          status: vendors.status,
          isVerified: vendors.isVerified,
          ownerId: vendors.ownerId,
        },
      })
      .from(userMemberMapping)
      .innerJoin(vendors, eq(vendors.id, userMemberMapping.vendorId))
      .where(
        and(
          eq(userMemberMapping.userId, userId),
          eq(userMemberMapping.status, 'active'),
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES])
        )
      )
      .orderBy(asc(vendors.businessName))
  },

  /** The caller's seat in one specific company, if any. */
  findActiveVendorSeat(vendorId: string, userId: string) {
    return db.query.userMemberMapping.findFirst({
      where: and(
        eq(userMemberMapping.vendorId, vendorId),
        eq(userMemberMapping.userId, userId),
        eq(userMemberMapping.status, 'active'),
        inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES])
      ),
    })
  },

  /** The caller's platform-scoped row, if any. */
  findActivePlatformRow(userId: string) {
    return db.query.userMemberMapping.findFirst({
      where: and(
        eq(userMemberMapping.userId, userId),
        isNull(userMemberMapping.vendorId),
        eq(userMemberMapping.status, 'active')
      ),
    })
  },

  /**
   * The vendor-app login gate. Note the role filter: a bare EXISTS on user_id
   * would let a super_admin open the vendor app with no company, and tenant
   * resolution would then 404 them on every request.
   */
  async hasActiveVendorSeat(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ value: sql<number>`1` })
      .from(userMemberMapping)
      .where(
        and(
          eq(userMemberMapping.userId, userId),
          eq(userMemberMapping.status, 'active'),
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES])
        )
      )
      .limit(1)

    return Boolean(row)
  },

  /** Includes suspended rows — the member screen shows them as parked. */
  listMembersForVendor(vendorId: string) {
    return db
      .select({
        id: userMemberMapping.id,
        role: userMemberMapping.role,
        status: userMemberMapping.status,
        createdAt: userMemberMapping.createdAt,
        user: {
          id: users.id,
          name: users.name,
          phone: users.phone,
        },
      })
      .from(userMemberMapping)
      .innerJoin(users, eq(users.id, userMemberMapping.userId))
      // Platform rows never appear in a company's member list, so an owner
      // never sees Detlio staff in their own team screen.
      .where(
        and(
          eq(userMemberMapping.vendorId, vendorId),
          isNotNull(userMemberMapping.vendorId)
        )
      )
      .orderBy(asc(userMemberMapping.createdAt))
  },

  /** Any row for this pair, active or suspended — the re-add path needs it. */
  findMembership(vendorId: string, userId: string) {
    return db.query.userMemberMapping.findFirst({
      where: and(
        eq(userMemberMapping.vendorId, vendorId),
        eq(userMemberMapping.userId, userId)
      ),
    })
  },

  findMembershipById(id: string) {
    return db.query.userMemberMapping.findFirst({
      where: eq(userMemberMapping.id, id),
    })
  },

  createMembership(data: {
    vendorId: string | null
    userId: string
    role: MemberRole
    addedBy?: string | null
  }) {
    return db
      .insert(userMemberMapping)
      .values({
        vendorId: data.vendorId,
        userId: data.userId,
        role: data.role,
        addedBy: data.addedBy ?? null,
      })
      .returning()
  },

  /**
   * The owner's seat, written alongside every company-create path. Idempotent
   * so re-running a create flow cannot 409 on the mapping.
   */
  createOwnerMembership(vendorId: string, ownerId: string) {
    return db
      .insert(userMemberMapping)
      .values({ vendorId, userId: ownerId, role: 'vendor_admin' })
      .onConflictDoNothing({
        target: [userMemberMapping.vendorId, userMemberMapping.userId],
      })
      .returning()
  },

  updateMembership(
    id: string,
    data: Partial<{ role: MemberRole; status: 'active' | 'suspended' }>
  ) {
    return db
      .update(userMemberMapping)
      .set(data)
      .where(eq(userMemberMapping.id, id))
      .returning()
  },

  deleteMembership(id: string) {
    return db
      .delete(userMemberMapping)
      .where(eq(userMemberMapping.id, id))
      .returning()
  },

  countActiveVendorSeats(userId: string) {
    return db
      .select({ value: sql<number>`count(*)` })
      .from(userMemberMapping)
      .where(
        and(
          eq(userMemberMapping.userId, userId),
          eq(userMemberMapping.status, 'active'),
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES])
        )
      )
  },
}
