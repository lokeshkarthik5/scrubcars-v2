import { timingSafeEqual } from 'node:crypto'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { signAdminToken } from '../../lib/jwt.js'
import { logger } from '../../lib/logger.js'
import { adminRepository } from './admin.repository.js'
import type {
  CreateVendorInput,
  ListBookingsQuery,
  LoginInput,
} from './admin.validation.js'

const log = logger.child({ module: 'admin' })

// Constant-time string compare to avoid leaking credential length/prefix via timing.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export const adminService = {
  async login(input: LoginInput): Promise<{ accessToken: string }> {
    const validUser = safeEqual(input.username, env.adminUsername)
    const validPass = safeEqual(input.password, env.adminPassword)

    if (!validUser || !validPass) {
      throw new AppError(401, 'Invalid username or password', 'INVALID_CREDENTIALS')
    }

    const accessToken = await signAdminToken()
    log.info('admin:login')
    return { accessToken }
  },

  async listVendors() {
    return adminRepository.listVendors()
  },

  async verifyVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [updated] = await adminRepository.verifyVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-verified')
    return updated
  },

  async createVendor(input: CreateVendorInput) {
    // Resolve (or create) the owner user for this vendor.
    let owner = await adminRepository.findUserByPhone(input.ownerPhone)

    if (owner) {
      if (!owner.isVendorOwner) {
        ;[owner] = await adminRepository.setUserAsVendorOwner(owner.id)
      }
      const existingVendor = await adminRepository.findVendorByOwnerId(owner.id)
      if (existingVendor) {
        throw new AppError(
          409,
          'A vendor profile already exists for this owner',
          'VENDOR_ALREADY_EXISTS'
        )
      }
    } else {
      ;[owner] = await adminRepository.createOwner({
        name: input.ownerName,
        phone: input.ownerPhone,
      })
    }

    const [vendor] = await adminRepository.createVendor({
      ownerId: owner.id,
      businessName: input.businessName,
      phone: input.phone,
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      lat: input.lat,
      lng: input.lng,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
    })

    log.info({ vendorId: vendor.id, ownerId: owner.id }, 'admin:vendor-created')
    return vendor
  },

  async listBookings(query: ListBookingsQuery) {
    return adminRepository.listBookings(query.status)
  },
}
