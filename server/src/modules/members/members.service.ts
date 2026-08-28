import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { membersRepository, type VendorScopedRole } from './members.repository.js'
import type {
  AddMemberInput,
  TransferOwnershipInput,
  UpdateMemberInput,
} from './members.validation.js'

const log = logger.child({ module: 'members' })

export type MemberResponse = {
  id: string
  userId: string
  name: string
  phone: string
  role: VendorScopedRole
  status: 'active' | 'suspended'
  isOwner: boolean
  createdAt: string
}

/**
 * The owner's row is the one nobody can touch — not another admin, not the
 * owner themselves. That is what guarantees at least one active vendor_admin
 * always exists, by construction rather than by a count query, and it is why
 * removing, demoting *and* suspending all check it. Suspension is the easy one
 * to miss: without this, an admin could park the owner and orphan the company
 * exactly as removal would.
 *
 * Ownership moves only by explicit transfer, which is owner-only.
 */
function assertNotOwner(ownerId: string, targetUserId: string) {
  if (ownerId === targetUserId) {
    throw new AppError(
      403,
      'The owner cannot be removed, demoted or suspended. Transfer ownership first.',
      'OWNER_IMMUTABLE'
    )
  }
}

async function getVendorOrThrow(vendorId: string) {
  const vendor = await membersRepository.findVendorById(vendorId)

  if (!vendor) {
    throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  }

  return vendor
}

/** Loads a membership and proves it belongs to the company being acted on. */
async function getMembershipInVendor(vendorId: string, membershipId: string) {
  const membership = await membersRepository.findMembershipById(membershipId)

  if (!membership || membership.vendorId !== vendorId) {
    throw new AppError(404, 'Member not found', 'MEMBER_NOT_FOUND')
  }

  return membership
}

/**
 * `users.is_vendor_owner` still gates the vendor-audience OTP login for as long
 * as it exists, so a member who cannot log in is a member in name only. It is
 * set on the way in and cleared on the way out — but only when the person has
 * no seats left anywhere, or removing them from one company would lock them out
 * of the others.
 */
async function syncVendorOwnerFlag(userId: string) {
  const [{ value }] = await membersRepository.countActiveVendorSeats(userId)
  await membersRepository.setVendorOwnerFlag(userId, Number(value) > 0)
}

export const membersService = {
  async listMembers(vendorId: string): Promise<MemberResponse[]> {
    const vendor = await getVendorOrThrow(vendorId)
    const rows = await membersRepository.listMembersForVendor(vendorId)

    return rows.map((row) => ({
      id: row.id,
      userId: row.user.id,
      name: row.user.name,
      phone: row.user.phone,
      role: row.role as VendorScopedRole,
      status: row.status,
      isOwner: row.user.id === vendor.ownerId,
      createdAt: row.createdAt.toISOString(),
    }))
  },

  async addMember(
    vendorId: string,
    actorId: string | null,
    input: AddMemberInput
  ) {
    await getVendorOrThrow(vendorId)

    // A phone with no account yet gets a stub row rather than an invite. There
    // is no consent step in v1: being added grants access on first login.
    const existingUser = await membersRepository.findUserByPhone(input.phone)
    const user =
      existingUser ??
      (
        await membersRepository.createStubUser({
          name: input.name ?? 'Team member',
          phone: input.phone,
        })
      )[0]

    // Re-adding must reactivate rather than insert: the unique index would
    // otherwise 409 with "already a member" for someone the UI shows as
    // removed, which is a confusing thing to tell an admin.
    const existing = await membersRepository.findMembership(vendorId, user.id)

    if (existing) {
      const [updated] = await membersRepository.updateMembership(existing.id, {
        role: input.role,
        status: 'active',
      })
      await syncVendorOwnerFlag(user.id)
      log.info(
        { vendorId, actorId, userId: user.id, role: input.role },
        'member:reactivated'
      )
      return updated
    }

    const [created] = await membersRepository.createMembership({
      vendorId,
      userId: user.id,
      role: input.role,
      addedBy: actorId,
    })

    await syncVendorOwnerFlag(user.id)
    log.info(
      { vendorId, actorId, userId: user.id, role: input.role },
      'member:added'
    )

    return created
  },

  async updateMember(
    vendorId: string,
    actorId: string | null,
    membershipId: string,
    input: UpdateMemberInput
  ) {
    const vendor = await getVendorOrThrow(vendorId)
    const membership = await getMembershipInVendor(vendorId, membershipId)

    assertNotOwner(vendor.ownerId, membership.userId)

    const [updated] = await membersRepository.updateMembership(membershipId, {
      ...(input.role !== undefined && { role: input.role }),
      ...(input.status !== undefined && { status: input.status }),
    })

    // Suspension takes effect on the member's next request — tenant resolution
    // reads the mapping per request, never from their token.
    await syncVendorOwnerFlag(membership.userId)
    log.info(
      {
        vendorId,
        actorId,
        userId: membership.userId,
        role: input.role,
        status: input.status,
      },
      'member:updated'
    )

    return updated
  },

  async removeMember(
    vendorId: string,
    actorId: string | null,
    membershipId: string
  ) {
    const vendor = await getVendorOrThrow(vendorId)
    const membership = await getMembershipInVendor(vendorId, membershipId)

    assertNotOwner(vendor.ownerId, membership.userId)

    await membersRepository.deleteMembership(membershipId)
    await syncVendorOwnerFlag(membership.userId)
    log.info(
      { vendorId, actorId, userId: membership.userId },
      'member:removed'
    )
  },

  /** Leaving a company. Same rule as removal: the owner cannot (G13). */
  async leaveCompany(vendorId: string, actorId: string) {
    const vendor = await getVendorOrThrow(vendorId)

    assertNotOwner(vendor.ownerId, actorId)

    const membership = await membersRepository.findMembership(vendorId, actorId)

    if (!membership) {
      throw new AppError(404, 'Member not found', 'MEMBER_NOT_FOUND')
    }

    await membersRepository.deleteMembership(membership.id)
    await syncVendorOwnerFlag(actorId)
    log.info({ vendorId, userId: actorId }, 'member:left')
  },

  /**
   * Owner-only, and the only way `vendors.owner_id` ever moves. The old owner
   * stays a vendor_admin — losing the company entirely is a removal, and that
   * is a separate decision for whoever holds it next.
   */
  async transferOwnership(
    vendorId: string,
    actorId: string,
    input: TransferOwnershipInput
  ) {
    const vendor = await getVendorOrThrow(vendorId)

    if (vendor.ownerId !== actorId) {
      throw new AppError(
        403,
        'Only the owner can transfer ownership',
        'OWNER_REQUIRED'
      )
    }

    if (input.userId === actorId) {
      throw new AppError(
        400,
        'You already own this company',
        'ALREADY_OWNER'
      )
    }

    const membership = await membersRepository.findMembership(
      vendorId,
      input.userId
    )

    if (!membership) {
      throw new AppError(
        404,
        'That person is not a member of this company',
        'MEMBER_NOT_FOUND'
      )
    }

    const updated = await membersRepository.transferOwnership(
      vendorId,
      membership.id,
      input.userId
    )

    await syncVendorOwnerFlag(input.userId)
    log.info(
      { vendorId, from: actorId, to: input.userId },
      'member:ownership_transferred'
    )

    return updated
  },

  /** The company switcher's data source, and the session's `vendors[]`. */
  async listMyVendors(userId: string) {
    const seats = await membersRepository.listActiveVendorSeats(userId)

    return seats.map((seat) => ({
      id: seat.vendor.id,
      businessName: seat.vendor.businessName,
      logoUrl: seat.vendor.logoUrl,
      phone: seat.vendor.phone,
      status: seat.vendor.status,
      isVerified: seat.vendor.isVerified,
      role: seat.role as VendorScopedRole,
      isOwner: seat.vendor.ownerId === userId,
    }))
  },
}
