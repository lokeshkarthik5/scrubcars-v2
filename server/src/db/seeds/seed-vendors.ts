import { eq } from 'drizzle-orm'
import { db } from '../index.js'
import {
  services,
  userMemberMapping,
  users,
  vendorServiceAreas,
  vendorWorkingHours,
  vendors,
} from '../schema.js'
import {
  DEFAULT_WORKING_HOURS,
  SEED_VENDORS,
  type SeedVendor,
} from './data.js'

async function upsertWorkingHours(vendorId: string) {
  const existing = await db.query.vendorWorkingHours.findMany({
    where: eq(vendorWorkingHours.vendorId, vendorId),
  })

  if (existing.length > 0) {
    return existing
  }

  return db
    .insert(vendorWorkingHours)
    .values(
      DEFAULT_WORKING_HOURS.map((day) => ({
        vendorId,
        dayOfWeek: day.dayOfWeek,
        openTime: day.openTime,
        closeTime: day.closeTime,
        isClosed: day.isClosed,
      }))
    )
    .returning()
}

async function upsertServiceAreas(
  vendorId: string,
  areas: SeedVendor['serviceAreas']
) {
  const existing = await db.query.vendorServiceAreas.findMany({
    where: eq(vendorServiceAreas.vendorId, vendorId),
  })

  if (existing.length > 0) {
    return existing
  }

  return db
    .insert(vendorServiceAreas)
    .values(
      areas.map((area) => ({
        vendorId,
        areaName: area.areaName,
        pincode: area.pincode,
      }))
    )
    .returning()
}

async function upsertServices(
  vendorId: string,
  seedServices: SeedVendor['services']
) {
  const existing = await db.query.services.findMany({
    where: eq(services.vendorId, vendorId),
  })

  if (existing.length > 0) {
    return existing
  }

  return db
    .insert(services)
    .values(
      seedServices.map((service) => ({
        vendorId,
        name: service.name,
        description: service.description ?? null,
        category: service.category,
        price: service.price,
        durationMins: service.durationMins,
        isActive: true,
      }))
    )
    .returning()
}

async function upsertVendor(seed: SeedVendor) {
  const owner = await db.query.users.findFirst({
    where: eq(users.phone, seed.ownerPhone),
  })

  if (!owner) {
    throw new Error(
      `Vendor owner not found for phone ${seed.ownerPhone}. Run user seeds first.`
    )
  }

  const existing = await db.query.vendors.findFirst({
    where: eq(vendors.ownerId, owner.id),
  })

  const [vendor] = existing
    ? await db
        .update(vendors)
        .set({
          businessName: seed.businessName,
          phone: seed.phone,
          address: seed.address,
          city: seed.city,
          lat: seed.lat,
          lng: seed.lng,
          // Seeded pins are hand-placed fixtures, so they count as admin-set
          // and confirmed. Without this they would read as 'unset' and land in
          // the admin's "needs a pin" queue on every fresh seed.
          geoSource: 'admin',
          geoConfirmedAt: new Date(),
          doorstepRadiusKm: seed.doorstepEnabled ? 8 : null,
          isVerified: seed.isVerified,
          status: seed.status,
          doorstepEnabled: seed.doorstepEnabled,
          dropinEnabled: seed.dropinEnabled,
          slotIntervalMins: seed.slotIntervalMins,
        })
        .where(eq(vendors.id, existing.id))
        .returning()
    : await db
        .insert(vendors)
        .values({
          ownerId: owner.id,
          businessName: seed.businessName,
          phone: seed.phone,
          address: seed.address,
          city: seed.city,
          lat: seed.lat,
          lng: seed.lng,
          // Seeded pins are hand-placed fixtures, so they count as admin-set
          // and confirmed. Without this they would read as 'unset' and land in
          // the admin's "needs a pin" queue on every fresh seed.
          geoSource: 'admin',
          geoConfirmedAt: new Date(),
          doorstepRadiusKm: seed.doorstepEnabled ? 8 : null,
          isVerified: seed.isVerified,
          status: seed.status,
          doorstepEnabled: seed.doorstepEnabled,
          dropinEnabled: seed.dropinEnabled,
          slotIntervalMins: seed.slotIntervalMins,
        })
        .returning()

  if (!owner.isVendorOwner) {
    await db
      .update(users)
      .set({ isVendorOwner: true })
      .where(eq(users.id, owner.id))
  }

  // The owner's seat. Seeded companies go through the same invariant as real
  // ones: owner_id's user always has an active vendor_admin row.
  await db
    .insert(userMemberMapping)
    .values({ vendorId: vendor.id, userId: owner.id, role: 'vendor_admin' })
    .onConflictDoNothing({
      target: [userMemberMapping.vendorId, userMemberMapping.userId],
    })

  await upsertWorkingHours(vendor.id)
  await upsertServiceAreas(vendor.id, seed.serviceAreas)
  await upsertServices(vendor.id, seed.services)

  return vendor
}

export async function seedVendors() {
  const created = []

  for (const seed of SEED_VENDORS) {
    created.push(await upsertVendor(seed))
  }

  return created
}

export async function seedVendorByOwnerPhone(ownerPhone: string) {
  const seed = SEED_VENDORS.find((item) => item.ownerPhone === ownerPhone)

  if (!seed) {
    throw new Error(`No vendor seed defined for owner phone ${ownerPhone}`)
  }

  return upsertVendor(seed)
}
