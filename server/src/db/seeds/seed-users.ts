import { eq } from 'drizzle-orm'
import { db } from '../index.js'
import { userAddresses, users, userVehicles } from '../schema.js'
import { SEED_CUSTOMERS, SEED_VENDOR_OWNERS } from './data.js'

async function upsertCustomer(customer: (typeof SEED_CUSTOMERS)[number]) {
  const existing = await db.query.users.findFirst({
    where: eq(users.phone, customer.phone),
  })

  const [user] = existing
    ? await db
        .update(users)
        .set({
          name: customer.name,
          email: customer.email ?? null,
          isCustomer: true,
          phoneVerified: true,
          status: 'active',
        })
        .where(eq(users.id, existing.id))
        .returning()
    : await db
        .insert(users)
        .values({
          name: customer.name,
          phone: customer.phone,
          email: customer.email ?? null,
          isCustomer: true,
          isVendorOwner: false,
          phoneVerified: true,
          status: 'active',
        })
        .returning()

  const existingAddresses = await db.query.userAddresses.findMany({
    where: eq(userAddresses.userId, user.id),
  })

  if (existingAddresses.length === 0) {
    await db.insert(userAddresses).values(
      customer.addresses.map((address) => ({
        userId: user.id,
        label: address.label,
        address: address.address,
        city: address.city,
        lat: address.lat,
        lng: address.lng,
        isDefault: address.isDefault,
      }))
    )
  }

  const existingVehicles = await db.query.userVehicles.findMany({
    where: eq(userVehicles.userId, user.id),
  })

  if (existingVehicles.length === 0) {
    await db.insert(userVehicles).values(
      customer.vehicles.map((vehicle) => ({
        userId: user.id,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color ?? null,
        licensePlate: vehicle.licensePlate ?? null,
        vehicleType: vehicle.vehicleType,
        isDefault: vehicle.isDefault,
      }))
    )
  }

  return user
}

async function upsertVendorOwner(owner: (typeof SEED_VENDOR_OWNERS)[number]) {
  const existing = await db.query.users.findFirst({
    where: eq(users.phone, owner.phone),
  })

  if (existing) {
    const [user] = await db
      .update(users)
      .set({
        name: owner.name,
        isVendorOwner: true,
        phoneVerified: true,
        status: 'active',
      })
      .where(eq(users.id, existing.id))
      .returning()
    return user
  }

  const [user] = await db
    .insert(users)
    .values({
      name: owner.name,
      phone: owner.phone,
      isCustomer: false,
      isVendorOwner: true,
      phoneVerified: true,
      status: 'active',
    })
    .returning()

  return user
}

export async function seedUsers() {
  const customers = []

  for (const customer of SEED_CUSTOMERS) {
    customers.push(await upsertCustomer(customer))
  }

  const vendorOwners = []

  for (const owner of SEED_VENDOR_OWNERS) {
    vendorOwners.push(await upsertVendorOwner(owner))
  }

  return { customers, vendorOwners }
}
