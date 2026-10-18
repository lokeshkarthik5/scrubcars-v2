import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  internalAccessLog,
  userMemberMapping,
  users,
  vendors,
} from '../../db/schema.js'
import type { memberRoleEnum } from '../../db/schema.js'
import { vendorNotInBin } from '../vendors/vendors.predicates.js'

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
 *
 * The seat reads also join the company and leave out one in the Bin
 * (vendorNotInBin): a seat at a garage in the Bin is no seat, so its team
 * cannot sign in to it, switch to it or reach it with X-Vendor-Id. The two
 * filters are on different tables — the seat's status, the garage's
 * deleted_at — and neither stands in for the other. The seat rows are kept,
 * so Restore gives everyone their access back as it was.
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
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES]),
          vendorNotInBin()
        )
      )
      .orderBy(asc(vendors.businessName))
  },

  /** The caller's seat in one specific company, if any, and not in the Bin. */
  async findActiveVendorSeat(vendorId: string, userId: string) {
    const [row] = await db
      .select({
        id: userMemberMapping.id,
        vendorId: userMemberMapping.vendorId,
        userId: userMemberMapping.userId,
        role: userMemberMapping.role,
        status: userMemberMapping.status,
      })
      .from(userMemberMapping)
      .innerJoin(vendors, eq(vendors.id, userMemberMapping.vendorId))
      .where(
        and(
          eq(userMemberMapping.vendorId, vendorId),
          eq(userMemberMapping.userId, userId),
          eq(userMemberMapping.status, 'active'),
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES]),
          vendorNotInBin()
        )
      )
      .limit(1)
    return row
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
      .innerJoin(vendors, eq(vendors.id, userMemberMapping.vendorId))
      .where(
        and(
          eq(userMemberMapping.userId, userId),
          eq(userMemberMapping.status, 'active'),
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES]),
          vendorNotInBin()
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

  findUserByPhone(phone: string) {
    return db.query.users.findFirst({ where: eq(users.phone, phone) })
  },

  findUserById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id) })
  },

  /**
   * A phone with no account yet. There is no invite-acceptance flow: the row
   * exists so the mapping has something to point at, and the person picks it up
   * on their first OTP login.
   */
  createStubUser(data: { name: string; phone: string }) {
    return db
      .insert(users)
      .values({
        name: data.name,
        phone: data.phone,
        isCustomer: false,
        isVendorOwner: true,
        phoneVerified: false,
      })
      .returning()
  },

  setVendorOwnerFlag(userId: string, value: boolean) {
    return db
      .update(users)
      .set({ isVendorOwner: value })
      .where(eq(users.id, userId))
      .returning()
  },

  findVendorById(vendorId: string) {
    return db.query.vendors.findFirst({ where: eq(vendors.id, vendorId) })
  },

  /**
   * Ownership moves in one transaction: the target is promoted to vendor_admin
   * if they were not one already, and `vendors.owner_id` swaps. The protection
   * in §5 is attached to owner_id, so it moves with it — there is never a
   * moment where two rows are protected or none are.
   */
  transferOwnership(vendorId: string, membershipId: string, newOwnerId: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(userMemberMapping)
        .set({ role: 'vendor_admin', status: 'active' })
        .where(eq(userMemberMapping.id, membershipId))

      const [vendor] = await tx
        .update(vendors)
        .set({ ownerId: newOwnerId })
        .where(eq(vendors.id, vendorId))
        .returning()

      return vendor
    })
  },

  /** Every platform-scoped grant, for the admin portal's list screen. */
  listPlatformRows() {
    return db
      .select({
        id: userMemberMapping.id,
        role: userMemberMapping.role,
        status: userMemberMapping.status,
        createdAt: userMemberMapping.createdAt,
        addedBy: userMemberMapping.addedBy,
        user: {
          id: users.id,
          name: users.name,
          phone: users.phone,
        },
      })
      .from(userMemberMapping)
      .innerJoin(users, eq(users.id, userMemberMapping.userId))
      .where(isNull(userMemberMapping.vendorId))
      .orderBy(asc(userMemberMapping.createdAt))
  },

  /**
   * Companies this person owns, toward the cap on new ones. A garage in the
   * Bin still counts (it can come back); one deleted forever and kept only
   * as a tombstone for its receipts does not.
   */
  countOwnedVendors(userId: string) {
    return db
      .select({ value: sql<number>`count(*)` })
      .from(vendors)
      .where(and(eq(vendors.ownerId, userId), isNull(vendors.purgedAt)))
  },

  /** Does this person own any company? A super_admin may not (§10). */
  async ownsAnyVendor(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.ownerId, userId))
      .limit(1)

    return Boolean(row)
  },

  /** Append-only. Never updated, never deleted from. */
  logInternalAccess(data: {
    userId: string
    vendorId: string
    method: string
    endpoint: string
  }) {
    return db.insert(internalAccessLog).values(data)
  },

  /** Seats that open the garage app: active, in a garage not in the Bin. */
  countActiveVendorSeats(userId: string) {
    return db
      .select({ value: sql<number>`count(*)` })
      .from(userMemberMapping)
      .innerJoin(vendors, eq(vendors.id, userMemberMapping.vendorId))
      .where(
        and(
          eq(userMemberMapping.userId, userId),
          eq(userMemberMapping.status, 'active'),
          inArray(userMemberMapping.role, [...VENDOR_SCOPED_ROLES]),
          vendorNotInBin()
        )
      )
  },

  /**
   * The company a support session asks for, if it exists and is not in the
   * Bin. Ids only: the support path needs to know it may go in, not what is
   * inside.
   */
  async findVendorForSupport(vendorId: string) {
    const [row] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), vendorNotInBin()))
      .limit(1)
    return row
  },
}
