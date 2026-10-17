import { timingSafeEqual } from 'node:crypto'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { signAdminToken } from '../../lib/jwt.js'
import { logger } from '../../lib/logger.js'
import {
  adminCancellationNote,
  bookingReference,
  checkNoShow,
  isAdminCancellable,
  istDateRange,
  noShowNote,
  parseBookingSearch,
  waitingMinutes,
} from '../../lib/booking-ops.js'
import { liveFinalBill, type FinalBillRecord } from '../../lib/final-bill.js'
import { bookingRefundTotals } from '../../lib/refunds.js'
import { toJobPhotoView } from '../../lib/job-records.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { summariseAcceptTime, summarisePilot } from '../../lib/pilot-stats.js'
import { resolveServicePricing } from '../../lib/pricing.js'
import { outsideServiceCity } from '../../lib/service-city.js'
import { todayDateKey } from '../../lib/slots.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import { membersRepository } from '../members/members.repository.js'
import { refundsService } from '../refunds/refunds.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { vendorsService } from '../vendors/vendors.service.js'
import { adminRepository } from './admin.repository.js'
import type {
  AdminCancelBookingInput,
  CreateBookingNoteInput,
  CreateVendorInput,
  GrantSuperAdminInput,
  ListBookingsQuery,
  MarkNoShowInput,
  LoginInput,
  MediaUrlInput,
  PauseVendorInput,
  PilotStatsQuery,
  SetServiceActiveInput,
  UpdateVendorInput,
  UploadUrlInput,
} from './admin.validation.js'

const log = logger.child({ module: 'admin' })

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Constant-time string compare to avoid leaking credential length/prefix via timing.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

async function assertVendor(vendorId: string) {
  const vendor = await adminRepository.findVendorById(vendorId)
  if (!vendor) {
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }
  return vendor
}

async function assertService(serviceId: string) {
  const service = await adminRepository.findServiceById(serviceId)
  if (!service) {
    throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
  }
  return service
}

// Only accept URLs that actually point at our bucket, so an admin can't
// register an arbitrary external image as vendor media.
function assertOwnBucketUrl(url: string, code: string): string {
  const storageKey = keyFromPublicUrl(url)
  if (!storageKey) {
    throw new AppError(400, 'Invalid image URL', code)
  }
  return storageKey
}

async function assertPhotoCapacity(vendorId: string) {
  const [{ count }] = await vendorsRepository.countPhotos(vendorId)
  if (count >= env.r2MaxPhotosPerVendor) {
    throw new AppError(
      409,
      `This garage can have at most ${env.r2MaxPhotosPerVendor} photos`,
      'PHOTO_LIMIT_REACHED'
    )
  }
}

async function assertServiceImageCapacity(serviceId: string) {
  const [{ count }] = await vendorsRepository.countServiceImages(serviceId)
  if (count >= env.r2MaxImagesPerService) {
    throw new AppError(
      409,
      `A service can have at most ${env.r2MaxImagesPerService} images`,
      'SERVICE_IMAGE_LIMIT_REACHED'
    )
  }
}

/**
 * A garage with no coordinates cannot be distance-sorted, cannot be found by a
 * customer browsing nearby, and cannot have its doorstep radius checked.
 *
 * Public listings already require `is_verified`, so refusing to verify without
 * a pin is what keeps pin-less garages out of customer-facing results — with no
 * special case in the listing query and no "location not set" tail to design.
 * The invariant is enforced at the one gate a human already stands at.
 */
function assertPinnedBeforeVerifying(vendor: {
  lat: number | null
  lng: number | null
}) {
  // Off by default while the pre-map-picker backlog is still unpinned — see
  // env.geoRequirePin. Verifying without a pin is survivable now that the
  // listing appends unlocated garages after the located ones; what it costs
  // them is distance sorting and doorstep coverage, not visibility.
  if (!env.geoRequirePin) return

  if (vendor.lat === null || vendor.lng === null) {
    throw new AppError(
      422,
      'Set the garage location on the map before verifying',
      'VENDOR_LOCATION_REQUIRED'
    )
  }
}

// ─── Bookings ────────────────────────────────────────────────────────────────

/** The subject of the env-credential break-glass login; see auth.middleware. */
const BREAK_GLASS_SUBJECT = 'admin'

type AdminBookingRecord = NonNullable<
  Awaited<ReturnType<typeof adminRepository.findBookingById>>
>
type BookingNoteRecord = NonNullable<
  Awaited<ReturnType<typeof adminRepository.findBookingDetail>>
>['notes'][number]

/** Someone else changed the booking between our read and our write. */
function stateChanged() {
  return new AppError(
    409,
    // The panel refetches the booking when an action is refused, so by the
    // time this is read the page already shows what changed.
    'This booking was just updated by someone else. Its latest status is shown now.',
    'BOOKING_STATE_CHANGED'
  )
}

function bookingNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

function toBookingNoteResponse(note: BookingNoteRecord) {
  return {
    id: note.id,
    author: note.author,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
  }
}

/**
 * One row of the admin bookings list: everything ops needs to answer a call
 * about a booking without opening it.
 *
 * The last three keys are the shape the panel read before this one existed.
 * The API and the panel deploy separately, so they stay until every deployed
 * panel reads `garage`, `customer` and `items` instead.
 */
/**
 * A final bill as ops sees it: everything the customer and the garage see,
 * plus the Razorpay ids to find the payment by, and when it last changed.
 */
function toAdminFinalBill(bill: FinalBillRecord) {
  return {
    id: bill.id,
    status: bill.status,
    lines: bill.lines.map((line) => ({ description: line.description, amount: line.amount })),
    totalAmount: bill.totalAmount,
    paidBefore: bill.paidBefore,
    amountDue: bill.amountDue,
    note: bill.note,
    gatewayOrderId: bill.gatewayOrderId,
    gatewayPaymentId: bill.gatewayPaymentId,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  }
}

/**
 * The balance a customer still has to pay on a final bill, for the list's
 * "Bill due" flag. Null when there is none — no bill, nothing left to pay, or
 * a booking that was cancelled (a cancelled job is not chased for money).
 */
function billDueOf(booking: AdminBookingRecord): string | null {
  if (booking.status === 'cancelled') return null
  const bill = liveFinalBill(booking.charges)
  return bill?.status === 'due' ? bill.amountDue : null
}

/**
 * What is still to give back on a booking, and what has gone back, for the
 * list's "Refund owed ₹X" / "Refunded" flag: its payment and any bills, by
 * the rules in lib/refunds.ts. `moved` is whether the customer moved it to a
 * new time, which took its payment with it.
 */
function refundFlagsOf(booking: AdminBookingRecord, moved: boolean) {
  const totals = bookingRefundTotals({
    status: booking.status,
    noShow: booking.noShow,
    moved,
    payment: booking.payment,
    charges: booking.charges,
  })
  return {
    refundOwed: Number(totals.owed) > 0 ? totals.owed : null,
    refunded: Number(totals.refunded) > 0 ? totals.refunded : null,
  }
}

function toAdminBookingRow(
  booking: AdminBookingRecord,
  notesCount: number,
  now: number,
  moved = false
) {
  return {
    id: booking.id,
    reference: bookingReference(booking.id),
    status: booking.status,
    bookingType: booking.bookingType,
    scheduledAt: booking.scheduledAt.toISOString(),
    createdAt: booking.createdAt.toISOString(),
    waitingMins: waitingMinutes(
      {
        status: booking.status,
        createdAt: booking.createdAt,
        paidAt: booking.payment?.paidAt,
      },
      now
    ),
    durationMins: booking.durationMins,
    amount: booking.amount,
    subtotalAmount: booking.subtotalAmount,
    discountAmount: booking.discountAmount,
    discountCode: booking.discountCode,
    discountFundedBy: booking.discountFundedBy,
    paymentMethod: booking.paymentMethod,
    payment: booking.payment
      ? {
          status: booking.payment.status,
          // The Razorpay payment id ops searches for in the dashboard to refund.
          gatewayTxnId: booking.payment.gatewayTxnId,
          paidAt: booking.payment.paidAt?.toISOString() ?? null,
        }
      : null,
    garage: booking.vendor
      ? {
          id: booking.vendor.id,
          name: booking.vendor.businessName,
          phone: booking.vendor.phone,
        }
      : null,
    customer: booking.user
      ? { id: booking.user.id, name: booking.user.name, phone: booking.user.phone }
      : null,
    // Only a doorstep job has a place to go; a drop-in happens at the garage.
    address: booking.bookingType === 'doorstep' ? booking.address : null,
    vehicle: booking.vehicle
      ? {
          id: booking.vehicle.id,
          make: booking.vehicle.make,
          model: booking.vehicle.model,
          plate: booking.vehicle.licensePlate,
        }
      : null,
    items: booking.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      name: item.name,
      amount: item.amount,
      durationMins: item.durationMins,
    })),
    cancelledBy: booking.cancelledBy,
    cancelledOnBehalfOf: booking.cancelledOnBehalfOf,
    cancellationReason: booking.cancellationReason,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    noShow: booking.noShow,
    noShowMarkedAt: booking.noShowMarkedAt?.toISOString() ?? null,
    // When the garage moved the job on. Null on jobs from before these were
    // recorded, even when the status says the step happened.
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    startedAt: booking.startedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    billDue: billDueOf(booking),
    ...refundFlagsOf(booking, moved),
    notesCount,
    rescheduledFromId: booking.rescheduledFromId,
    // Deprecated — see above.
    vendor: booking.vendor
      ? {
          id: booking.vendor.id,
          businessName: booking.vendor.businessName,
          phone: booking.vendor.phone,
        }
      : null,
    user: booking.user
      ? { id: booking.user.id, name: booking.user.name, phone: booking.user.phone }
      : null,
    service: booking.service
      ? {
          id: booking.service.id,
          name: booking.service.name,
          pricingType: booking.service.pricingType,
        }
      : null,
  }
}

async function loadBookingDetail(id: string, now: number) {
  const booking = await adminRepository.findBookingDetail(id)
  if (!booking) throw bookingNotFound()

  const staffIds = [booking.acceptedBy, booking.completedBy].filter(
    (staffId): staffId is string => staffId !== null
  )
  const [rescheduledToId, names, refunds] = await Promise.all([
    adminRepository.findRescheduledToId(id),
    adminRepository.findUserNames(staffIds),
    refundsService.listForBooking(id),
  ])

  const { notes, photos, ...row } = booking
  const finalBill = liveFinalBill(booking.charges)
  return {
    ...toAdminBookingRow(row, notes.length, now, rescheduledToId !== null),
    // Money owed back on this booking, or given back: its payment and any
    // bills, each with what ops needs to refund it and mark it done.
    refunds,
    // The bill that stands, and the unpaid ones it replaced, newest first. A
    // replaced bill with a payment id on it is money taken for a bill that no
    // longer stands — a refund to do.
    finalBill: finalBill ? toAdminFinalBill(finalBill) : null,
    replacedFinalBills: booking.charges
      .filter((charge) => charge.kind === 'final_bill' && charge.status === 'cancelled')
      .map(toAdminFinalBill),
    photos: photos.map(toJobPhotoView),
    lat: booking.lat,
    lng: booking.lng,
    garageAddress: booking.vendor
      ? `${booking.vendor.address}, ${booking.vendor.city}`
      : null,
    // Who at the garage moved the job on. Null on bookings from before the
    // team model, and on any the garage never touched.
    acceptedByName: booking.acceptedBy ? (names.get(booking.acceptedBy) ?? null) : null,
    completedByName: booking.completedBy ? (names.get(booking.completedBy) ?? null) : null,
    originalBookingId: booking.originalBookingId,
    rescheduledToId,
    rescheduleCount: booking.rescheduleCount,
    notes: notes.map(toBookingNoteResponse),
  }
}

/**
 * Who wrote a note, as a name. The break-glass login is the shared admin
 * account and has no users row, so it signs as 'admin'; a named super-admin
 * signs as themselves.
 */
async function resolveNoteAuthor(sub: string): Promise<string> {
  if (sub === BREAK_GLASS_SUBJECT) return 'admin'
  const user = await adminRepository.findUserById(sub)
  return (user?.name.trim() || user?.phone || sub).slice(0, 100)
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
    const vendors = await adminRepository.listVendors()
    // One grouped count for every garage rather than a query per card. It
    // counts what deleteVendor counts — every booking in any state — so "Has
    // N bookings" on a card is exactly the reason a delete would be refused.
    const bookingCounts = new Map(
      (await adminRepository.countBookingsByVendor()).map((row) => [
        row.vendorId,
        row.value,
      ])
    )
    // Flatten the active-services relation into a plain count for the list table.
    return vendors.map(({ services, ...vendor }) => ({
      ...vendor,
      serviceCount: services.length,
      // The same sign customers see, so ops knows which garages carry it. A
      // garage whose city says Chennai but shows it is usually pinned wrong.
      outsideServiceCity: outsideServiceCity(vendor),
      bookingCount: bookingCounts.get(vendor.id) ?? 0,
    }))
  },

  async getVendor(id: string) {
    // Holidays from today on: past ones are history nobody acts on here.
    const vendor = await adminRepository.findVendorDetailById(id, todayDateKey())
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }
    return vendor
  },

  async updateVendor(id: string, input: UpdateVendorInput) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    // Checked before anything is written. The owner, the vendor row and the
    // hours are separate writes, so a bad Saturday found after the first two
    // would return an error for a save that had in fact half happened — and
    // the admin reads an error as "nothing saved".
    for (const day of input.workingHours ?? []) {
      if (!day.isClosed && day.openTime >= day.closeTime) {
        throw new AppError(
          400,
          `Opening time must be before closing time on ${DAY_NAMES[day.dayOfWeek]}`,
          'INVALID_WORKING_HOURS'
        )
      }
    }

    // Owner name/phone live on the linked user row. Guard against moving the
    // owner phone onto a number that already belongs to another account.
    if (input.ownerPhone !== undefined || input.ownerName !== undefined) {
      if (input.ownerPhone !== undefined) {
        const existing = await adminRepository.findUserByPhone(input.ownerPhone)
        if (existing && existing.id !== vendor.ownerId) {
          throw new AppError(
            409,
            'Another account already uses this owner phone',
            'PHONE_IN_USE'
          )
        }
      }
      await adminRepository.updateUser(vendor.ownerId, {
        ...(input.ownerName !== undefined && { name: input.ownerName }),
        ...(input.ownerPhone !== undefined && { phone: input.ownerPhone }),
      })
    }

    // Flipping isVerified through the general update has the same requirement
    // as the dedicated verify endpoint, and must check against the pin the row
    // will have *after* this patch — an admin can legitimately set the
    // coordinates and verify in one submit.
    if (input.isVerified) {
      assertPinnedBeforeVerifying({
        lat: input.lat ?? vendor.lat,
        lng: input.lng ?? vendor.lng,
      })
    }

    const pinMoved =
      input.lat !== undefined &&
      input.lng !== undefined &&
      (input.lat !== vendor.lat || input.lng !== vendor.lng)

    if (input.confirmLocation === true && !pinMoved && vendor.lat === null) {
      throw new AppError(
        422,
        'Set the garage location before confirming it',
        'VENDOR_LOCATION_REQUIRED'
      )
    }

    // Only forward vendor-table columns that were actually provided. `null`
    // clears a nullable column; `undefined` leaves it untouched.
    const patch: Parameters<typeof adminRepository.updateVendor>[1] = {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.whatsapp !== undefined && { whatsapp: input.whatsapp }),
      ...(input.yearsInOperation !== undefined && {
        yearsInOperation: input.yearsInOperation,
      }),
      ...(input.mapsUrl !== undefined && { mapsUrl: input.mapsUrl }),
      ...(input.pickup !== undefined && { pickup: input.pickup }),
      ...(input.pickupRadiusKm !== undefined && {
        pickupRadiusKm: input.pickupRadiusKm,
      }),
      ...(input.doorstepRadiusKm !== undefined && {
        doorstepRadiusKm: input.doorstepRadiusKm,
      }),
      // Staff placing a pin by hand is its own provenance, and it supersedes
      // whatever the vendor originally set. Moving it also counts as confirming
      // it — an admin who just dragged a marker onto a garage has done exactly
      // the checking that `geoConfirmedAt` records.
      //
      // Compared against the stored value rather than merely being present: the
      // edit form round-trips the current coordinates on every save, so keying
      // off presence alone would let someone confirm a pin by editing a phone
      // number.
      ...(pinMoved && {
        lat: input.lat,
        lng: input.lng,
        geoSource: 'admin' as const,
        geoConfirmedAt: new Date(),
      }),
      // An explicit "this pin is already right" from the admin screen, for the
      // common case where nothing needs moving. Without it there was no way to
      // confirm a pin at all once a vendor was verified — `verifyVendor` was the
      // only writer, and it cannot run twice.
      ...(input.confirmLocation === true && { geoConfirmedAt: new Date() }),
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && {
        doorstepEnabled: input.doorstepEnabled,
      }),
      ...(input.slotIntervalMins !== undefined && {
        slotIntervalMins: input.slotIntervalMins,
      }),
      ...(input.bays !== undefined && { bays: input.bays }),
      ...(input.jobsPerDay !== undefined && { jobsPerDay: input.jobsPerDay }),
      ...(input.vehicleTypes !== undefined && { vehicleTypes: input.vehicleTypes }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.isVerified !== undefined && { isVerified: input.isVerified }),
    }

    const [updated] = Object.keys(patch).length
      ? await adminRepository.updateVendor(id, patch)
      : [vendor]

    // Per-day hours, exactly as given, for only the days given. The panel
    // sends them only when the admin touched the schedule, so saving any other
    // field leaves the garage's hours as they were.
    if (input.workingHours !== undefined) {
      await vendorsRepository.upsertWorkingHours(id, input.workingHours)
    } else if (input.workingDays !== undefined) {
      // The older shape: one schedule for every open day. Still honoured for
      // a caller that sends it, but it rewrites the whole week.
      await adminRepository.deleteWorkingHours(id)
      if (input.workingDays.length > 0) {
        const open = new Set(input.workingDays)
        const openTime = input.openTime ?? '09:00'
        const closeTime = input.closeTime ?? '18:00'
        await adminRepository.insertWorkingHours(
          Array.from({ length: 7 }, (_, dayOfWeek) => ({
            vendorId: id,
            dayOfWeek,
            openTime,
            closeTime,
            isClosed: !open.has(dayOfWeek),
          }))
        )
      }
    }

    // Reconcile the services list when provided. Rows with an `id` (that belong
    // to this vendor) are updated in place; rows without an `id` are inserted;
    // existing active services missing from the payload are soft-deleted. We
    // never hard-delete because bookings reference services with a restrict FK.
    if (input.services !== undefined) {
      const existingIds = new Set(
        await adminRepository.listActiveServiceIds(id)
      )
      const keptIds = new Set<string>()
      const toInsert: Parameters<typeof adminRepository.insertServices>[0] = []
      // Default duration for services left blank: one slot on this vendor.
      const defaultDuration = input.slotIntervalMins ?? vendor.slotIntervalMins

      for (const s of input.services) {
        const columns = {
          name: s.name,
          description: s.description ?? null,
          category: s.category,
          ...resolveServicePricing(s),
          durationMins: s.durationMins ?? defaultDuration,
        }
        if (s.id && existingIds.has(s.id)) {
          keptIds.add(s.id)
          await adminRepository.updateService(s.id, {
            ...columns,
            isActive: true,
          })
        } else {
          toInsert.push({
            vendorId: id,
            ...columns,
          })
        }
      }

      if (toInsert.length > 0) {
        await adminRepository.insertServices(toInsert)
      }

      const removedIds = [...existingIds].filter((sid) => !keptIds.has(sid))
      if (removedIds.length > 0) {
        await adminRepository.deactivateServices(removedIds)
      }
    }

    log.info({ vendorId: id }, 'admin:vendor-updated')
    return updated
  },

  /**
   * The garage's hidden services: plain services switched off, by the garage
   * in its app or from here. Packages are left out, as everywhere in admin.
   * The editor loads only live services, so this list is the only way back to
   * a hidden one.
   */
  async listHiddenServices(vendorId: string) {
    await assertVendor(vendorId)
    const services = await vendorsService.listMyServices(vendorId)
    return services.filter((service) => !service.isActive)
  },

  /**
   * Hides a service from customers, or shows a hidden one again — the same
   * switch the garage has in its app, so a hidden service keeps its bookings
   * and its history and is never deleted.
   *
   * Two refusals the garage's switch does not have. A package is a 404 here:
   * admin cannot see or edit packages, so it should not be able to switch one
   * off blind. And a service inside a package cannot be hidden: the package
   * would still list it as included while customers could no longer find it
   * on its own.
   */
  async setServiceActive(
    vendorId: string,
    serviceId: string,
    input: SetServiceActiveInput
  ) {
    await assertVendor(vendorId)

    // findServiceById excludes packages, and a service of another garage is
    // as unknown here as a made-up id.
    const service = await vendorsRepository.findServiceById(vendorId, serviceId)
    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    if (!input.isActive) {
      const containing = await vendorsRepository.findPackagesContaining(
        vendorId,
        serviceId
      )
      if (containing.length > 0) {
        const names = containing.map((p) => `"${p.name}"`).join(', ')
        const one = containing.length === 1
        throw new AppError(
          409,
          `This service is part of the ${one ? 'package' : 'packages'} ${names}. Take it out of ${one ? 'that package' : 'those packages'} in the garage app first, then hide it.`,
          'SERVICE_IN_PACKAGE'
        )
      }
    }

    const updated = await vendorsService.toggleServiceActive(
      vendorId,
      serviceId,
      input
    )
    log.info(
      { vendorId, serviceId, isActive: input.isActive },
      'admin:service-visibility-changed'
    )
    return updated
  },

  /**
   * Where demand outruns supply.
   *
   * Each cell reports how many live garages and how many doorstep bookings it
   * contains. `gap` is the ops signal: bookings with no garage in the cell means
   * customers are being served from further away than they should be, which is
   * where the next garage is worth recruiting.
   */
  async getDemandSupply() {
    const cells = await adminRepository.getDemandSupplyCells()

    return cells.map((cell) => ({
      ...cell,
      // Positive when a cell has demand it cannot serve locally. Kept as a raw
      // difference rather than a ratio so a cell with 3 bookings and 0 garages
      // is not indistinguishable from one with 30 and 0.
      gap: cell.bookingCount - cell.vendorCount,
    }))
  },

  /**
   * The pilot's numbers over the last 7 or 30 days, rolling from now: the
   * checkout funnel, how bookings ended, the money, the busiest garages, the
   * median minutes from payment to the garage accepting, and refunds (all
   * still owed, and those recorded in the window). Definitions live in
   * lib/pilot-stats.ts.
   *
   * The accept time reads `accepted_at`, which only bookings accepted since
   * migration 0028 have; under three accepts in the window it says so rather
   * than showing a median of one or two.
   */
  async getPilotStats(query: PilotStatsQuery, now = Date.now()) {
    const since = new Date(now - query.days * 24 * 60 * 60 * 1000)
    const [intents, bookingRows, accepts, refunds] = await Promise.all([
      adminRepository.listIntentsCreatedSince(since),
      adminRepository.listBookingsCreatedSince(since),
      adminRepository.listAcceptsSince(since),
      refundsService.pilotRefunds(since),
    ])

    return {
      days: query.days,
      since: since.toISOString(),
      ...summarisePilot(intents, bookingRows),
      ...summariseAcceptTime(accepts, since),
      ...refunds,
    }
  },

  async verifyVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    assertPinnedBeforeVerifying(vendor)

    // Verifying is the moment a human looked at this garage, so it is also the
    // moment its pin becomes confirmed.
    const [updated] = await adminRepository.verifyVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-verified')
    return updated
  },

  async archiveVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [updated] = await adminRepository.archiveVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-archived')
    return updated
  },

  async unarchiveVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    const [updated] = await adminRepository.unarchiveVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-unarchived')
    return updated
  },

  async deleteVendor(id: string) {
    const vendor = await adminRepository.findVendorById(id)
    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    // Deleting cascades to every booking, payment and review the garage has —
    // the record of money taken and work done. A garage that has ever been
    // booked is archived instead, which takes it out of circulation and keeps
    // that history.
    if ((await adminRepository.countBookingsForVendor(id)) > 0) {
      throw new AppError(
        409,
        'This garage has bookings. Archive it instead.',
        'VENDOR_HAS_BOOKINGS'
      )
    }

    await adminRepository.deleteVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-deleted')
  },

  /**
   * Stops a garage taking new bookings on its behalf. Same effect as the
   * owner's own switch: out of the lists, checkout refused, existing bookings
   * untouched. Pausing a paused garage only changes the reason.
   */
  async pauseVendor(id: string, input: PauseVendorInput) {
    const vendor = await assertVendor(id)
    const [updated] = await vendorsRepository.updateVendor(id, {
      bookingsPausedAt: vendor.bookingsPausedAt ?? new Date(),
      bookingsPausedReason: input.reason || null,
    })
    log.info({ vendorId: id }, 'admin:vendor-paused')
    return updated
  },

  async resumeVendor(id: string) {
    await assertVendor(id)
    const [updated] = await vendorsRepository.updateVendor(id, {
      bookingsPausedAt: null,
      bookingsPausedReason: null,
    })
    log.info({ vendorId: id }, 'admin:vendor-resumed')
    return updated
  },

  async createVendor(input: CreateVendorInput) {
    // Resolve (or create) the owner user for this vendor.
    let owner = await adminRepository.findUserByPhone(input.ownerPhone)

    if (owner) {
      if (!owner.isVendorOwner) {
        ;[owner] = await adminRepository.setUserAsVendorOwner(owner.id)
      }
      // No "already a vendor" block: one person owning several garages is the
      // point of the team model, and refusing it here would leave admins unable
      // to onboard the exact operators this feature exists for.
    } else {
      ;[owner] = await adminRepository.createOwner({
        name: input.ownerName,
        phone: input.ownerPhone,
      })
    }

    if (input.isVerified) {
      assertPinnedBeforeVerifying({
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      })
    }

    const [vendor] = await adminRepository.createVendor({
      ownerId: owner.id,
      businessName: input.businessName,
      phone: input.phone,
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      yearsInOperation: input.yearsInOperation ?? null,
      mapsUrl: input.mapsUrl ?? null,
      pickup: input.pickup ?? null,
      pickupRadiusKm: input.pickupRadiusKm ?? null,
      doorstepRadiusKm: input.doorstepRadiusKm ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      ...(input.lat !== undefined && { geoSource: 'admin' as const }),
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && { doorstepEnabled: input.doorstepEnabled }),
      ...(input.slotIntervalMins !== undefined && { slotIntervalMins: input.slotIntervalMins }),
      bays: input.bays ?? null,
      jobsPerDay: input.jobsPerDay ?? null,
      ...(input.vehicleTypes !== undefined && { vehicleTypes: input.vehicleTypes }),
      notes: input.notes ?? null,
      ...(input.status !== undefined && { status: input.status }),
      ...(input.isVerified !== undefined && { isVerified: input.isVerified }),
    })

    // The owner's seat. Same write as the self-serve path — both company-create
    // paths dual-write, so no company is ever left with zero members.
    await membersRepository.createOwnerMembership(vendor.id, owner.id)

    // Working hours: open on the selected days, closed on the rest. Only written
    // when the admin picked days, so a bare vendor keeps the defaults (none).
    if (input.workingDays && input.workingDays.length > 0) {
      const open = new Set(input.workingDays)
      const openTime = input.openTime ?? '09:00'
      const closeTime = input.closeTime ?? '18:00'
      await adminRepository.insertWorkingHours(
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
          vendorId: vendor.id,
          dayOfWeek,
          openTime,
          closeTime,
          isClosed: !open.has(dayOfWeek),
        }))
      )
    }

    if (input.services && input.services.length > 0) {
      await adminRepository.insertServices(
        input.services.map((s) => ({
          vendorId: vendor.id,
          name: s.name,
          description: s.description ?? null,
          category: s.category,
          // Resolve pricing type + tiers into the columns to persist.
          ...resolveServicePricing(s),
          // Fall back to one slot when no explicit duration was given.
          durationMins: s.durationMins ?? vendor.slotIntervalMins,
        }))
      )
    }

    log.info({ vendorId: vendor.id, ownerId: owner.id }, 'admin:vendor-created')
    return vendor
  },

  async listBookings(query: ListBookingsQuery, now = Date.now()) {
    const { start, end } = istDateRange(query.from, query.to)
    const ids = await adminRepository.searchBookingIds({
      status: query.status,
      vendorId: query.vendorId,
      search: parseBookingSearch(query.q),
      start,
      end,
      after: query.cursor ?? null,
      limit: query.limit,
      offset: query.cursor ? 0 : (query.page - 1) * query.limit,
    })

    const [rows, notesCounts, movedIds] = await Promise.all([
      adminRepository.findBookingsByIds(ids),
      adminRepository.countNotesByBooking(ids),
      adminRepository.findMovedBookingIds(ids),
    ])

    // The rows come back unordered; the id query decided the order.
    const byId = new Map(rows.map((row) => [row.id, row]))
    return ids.flatMap((id) => {
      const booking = byId.get(id)
      return booking
        ? [toAdminBookingRow(booking, notesCounts.get(id) ?? 0, now, movedIds.has(id))]
        : []
    })
  },

  async getBooking(id: string, now = Date.now()) {
    return loadBookingDetail(id, now)
  },

  /**
   * Cancels a booking as Detlio, on behalf of whoever's call it was.
   *
   * Allowed from any state the booking is still live in — unlike the
   * customer's cancel, there is no 2-hour cutoff: ops cancels because
   * something has already gone wrong, often at the last minute. The money is
   * not touched here; refunds are done by hand in Razorpay, and a paid one
   * goes on the Refunds page (and gets the alert below) until ops records it.
   */
  async cancelBooking(id: string, sub: string, input: AdminCancelBookingInput) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    if (!isAdminCancellable(booking.status)) {
      throw new AppError(
        400,
        'Only pending, confirmed or in-progress bookings can be cancelled',
        'INVALID_BOOKING_STATUS'
      )
    }

    const author = await resolveNoteAuthor(sub)
    const cancelled = await adminRepository.cancelBookingAsAdmin(
      id,
      booking.status,
      {
        onBehalfOf: input.onBehalfOf,
        reason: input.reason,
        noShow: null,
        at: new Date(),
      },
      { author, body: adminCancellationNote(input.onBehalfOf, input.reason) }
    )
    if (!cancelled) throw stateChanged()

    log.info(
      { bookingId: id, from: booking.status, onBehalfOf: input.onBehalfOf, author },
      'admin:booking-cancelled'
    )

    // Only a paid booking leaves anything to do: an unpaid one has no money
    // to return.
    if (booking.payment?.status === 'paid') {
      const updated = await adminRepository.findBookingById(id)
      alertOps({
        kind: 'admin_cancelled',
        booking: updated!,
        onBehalfOf: input.onBehalfOf,
        reason: input.reason,
      })
    }

    return loadBookingDetail(id, Date.now())
  },

  /**
   * Records who didn't turn up for an accepted booking, and cancels it.
   *
   * The party decides the money, per the published policy: a customer
   * no-show keeps the payment (the garage held the slot), so the payment row
   * is deliberately left as it is; a garage no-show is always refunded in
   * full, which is a manual Razorpay refund the alert asks for.
   */
  async markNoShow(id: string, sub: string, input: MarkNoShowInput, now = Date.now()) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    const check = checkNoShow(booking, now)
    if (check === 'wrong_status') {
      throw new AppError(
        400,
        'Only an accepted booking (confirmed or in progress) can be marked as a no-show',
        'INVALID_BOOKING_STATUS'
      )
    }
    if (check === 'too_early') {
      throw new AppError(
        400,
        "A no-show can only be marked once the booking's start time has passed",
        'NO_SHOW_TOO_EARLY'
      )
    }

    const author = await resolveNoteAuthor(sub)
    const cancelled = await adminRepository.cancelBookingAsAdmin(
      id,
      booking.status,
      {
        // Ops is recording what happened, not passing on anyone's request.
        onBehalfOf: 'detlio',
        reason: null,
        noShow: input.party,
        at: new Date(now),
      },
      { author, body: noShowNote(input.party, input.note) }
    )
    if (!cancelled) throw stateChanged()

    log.info(
      { bookingId: id, from: booking.status, party: input.party, author },
      'admin:booking-no-show'
    )

    if (input.party === 'garage') {
      const updated = await adminRepository.findBookingById(id)
      alertOps({ kind: 'garage_no_show', booking: updated! })
    }

    return loadBookingDetail(id, now)
  },

  async addBookingNote(id: string, sub: string, input: CreateBookingNoteInput) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    const author = await resolveNoteAuthor(sub)
    const [note] = await adminRepository.createBookingNote({
      bookingId: id,
      author,
      body: input.body,
    })

    log.info({ bookingId: id, noteId: note.id, author }, 'admin:booking-note-added')
    return toBookingNoteResponse(note)
  },

  // ─── Media ─────────────────────────────────────────────────────────────────
  //
  // The same logo / gallery / service-image capabilities the vendor panel has,
  // reachable by an admin on any vendor's behalf. The vendor module owns the
  // storage-backed queries, so these reuse vendorsRepository rather than
  // restating them; what differs is only how the caller is authorized — an
  // admin names the vendor, an owner is resolved from their token.

  async createVendorLogoUploadUrl(vendorId: string, input: UploadUrlInput) {
    const vendor = await assertVendor(vendorId)
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      'logo'
    )
    return { uploadUrl, publicUrl }
  },

  async setVendorLogo(vendorId: string, input: MediaUrlInput) {
    const vendor = await assertVendor(vendorId)

    const storageKey = assertOwnBucketUrl(input.url, 'INVALID_LOGO_URL')
    const previousKey = vendor.logoStorageKey

    const [updated] = await adminRepository.updateVendor(vendor.id, {
      logoUrl: input.url,
      logoStorageKey: storageKey,
    })

    if (previousKey && previousKey !== storageKey) {
      await deleteObject(previousKey)
    }

    log.info({ vendorId: vendor.id }, 'admin:vendor-logo-updated')
    return updated
  },

  async deleteVendorLogo(vendorId: string) {
    const vendor = await assertVendor(vendorId)

    const [updated] = await adminRepository.updateVendor(vendor.id, {
      logoUrl: null,
      logoStorageKey: null,
    })

    const key = vendor.logoStorageKey ?? keyFromPublicUrl(vendor.logoUrl ?? '')
    if (key) {
      await deleteObject(key)
    }

    log.info({ vendorId: vendor.id }, 'admin:vendor-logo-removed')
    return updated
  },

  async createVendorPhotoUploadUrl(vendorId: string, input: UploadUrlInput) {
    const vendor = await assertVendor(vendorId)
    await assertPhotoCapacity(vendor.id)

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType
    )
    return { uploadUrl, publicUrl }
  },

  async addVendorPhoto(vendorId: string, input: MediaUrlInput) {
    const vendor = await assertVendor(vendorId)
    const storageKey = assertOwnBucketUrl(input.url, 'INVALID_PHOTO_URL')

    // Re-checked after the presign: that URL stays usable for its whole TTL,
    // so this is the check that actually holds the cap.
    await assertPhotoCapacity(vendor.id)

    const [{ maxOrder }] = await vendorsRepository.getNextPhotoSortOrder(
      vendor.id
    )
    const [created] = await vendorsRepository.createPhoto(vendor.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: vendor.id, photoId: created.id },
      'admin:vendor-photo-added'
    )
    return created
  },

  async deleteVendorPhoto(vendorId: string, photoId: string) {
    const vendor = await assertVendor(vendorId)
    const photo = await vendorsRepository.findPhotoById(vendor.id, photoId)

    if (!photo) {
      throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deletePhoto(vendor.id, photoId)

    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return deleted
  },

  async createServiceImageUploadUrl(serviceId: string, input: UploadUrlInput) {
    const service = await assertService(serviceId)
    await assertServiceImageCapacity(service.id)

    // Keyed under the owning vendor, so a service's images sit beside the rest
    // of that vendor's objects regardless of who uploaded them.
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      service.vendorId,
      input.contentType,
      `services/${service.id}`
    )
    return { uploadUrl, publicUrl }
  },

  async addServiceImage(serviceId: string, input: MediaUrlInput) {
    const service = await assertService(serviceId)
    const storageKey = assertOwnBucketUrl(
      input.url,
      'INVALID_SERVICE_IMAGE_URL'
    )

    await assertServiceImageCapacity(service.id)

    const [{ maxOrder }] =
      await vendorsRepository.getNextServiceImageSortOrder(service.id)
    await vendorsRepository.createServiceImage(service.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: service.vendorId, serviceId },
      'admin:service-image-added'
    )
    return vendorsRepository.listServiceImages(service.id)
  },

  async deleteServiceImage(serviceId: string, imageId: string) {
    const service = await assertService(serviceId)
    const image = await vendorsRepository.findServiceImageById(
      service.id,
      imageId
    )

    if (!image) {
      throw new AppError(404, 'Image not found', 'SERVICE_IMAGE_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deleteServiceImage(
      service.id,
      imageId
    )

    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return vendorsRepository.listServiceImages(service.id)
  },

  // ─── Platform admins ───────────────────────────────────────────────────────

  async listSuperAdmins() {
    const rows = await membersRepository.listPlatformRows()

    return rows
      .filter((row) => row.role === 'super_admin')
      .map((row) => ({
        id: row.id,
        userId: row.user.id,
        name: row.user.name,
        phone: row.user.phone,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      }))
  },

  /**
   * Grant platform admin to a real, named person.
   *
   * This is the trade the design makes on purpose: folding platform roles into
   * the mapping table means an OTP session *can* be super-admin, which an
   * env-only admin password could not. What it buys is named admins with an
   * `added_by` and an immediate revocation path, instead of a shared secret.
   *
   * Two refusals keep the blast radius bounded, and both are checks here rather
   * than conventions:
   *
   *  - never to a company owner. The two grants compose into "owns a garage, and
   *    can silently act on its competitors" — and worse, tenant resolution
   *    prefers their own seat, so the request that matters is not even logged as
   *    support access.
   *  - never to an account that can authenticate without a one-time code. Today
   *    OTP is the only login path for a `users` row, so this holds by
   *    construction; if a password or social login is ever added, this is the
   *    check that has to grow with it.
   */
  async grantSuperAdmin(input: GrantSuperAdminInput, grantedBy: string | null) {
    const user = await membersRepository.findUserByPhone(input.phone)

    if (!user) {
      throw new AppError(
        404,
        'No account found for this phone number',
        'USER_NOT_FOUND'
      )
    }

    if (await membersRepository.ownsAnyVendor(user.id)) {
      throw new AppError(
        409,
        'A company owner cannot be granted platform admin',
        'OWNER_CANNOT_BE_SUPER_ADMIN'
      )
    }

    const existing = await membersRepository.findActivePlatformRow(user.id)

    if (existing?.role === 'super_admin') {
      return { id: existing.id, userId: user.id }
    }

    const [created] = await membersRepository.createMembership({
      vendorId: null,
      userId: user.id,
      role: 'super_admin',
      // The break-glass subject has no users row, so there is nobody to
      // attribute the grant to. Null is the honest answer.
      addedBy: grantedBy,
    })

    log.info({ userId: user.id, grantedBy }, 'admin:super_admin_granted')
    return { id: created.id, userId: user.id }
  },

  /**
   * Revocation is a delete, and it takes effect on the next request — every
   * check reads the table, never a token.
   */
  async revokeSuperAdmin(membershipId: string) {
    const row = await membersRepository.findMembershipById(membershipId)

    if (!row || row.vendorId !== null || row.role !== 'super_admin') {
      throw new AppError(404, 'Grant not found', 'GRANT_NOT_FOUND')
    }

    await membersRepository.deleteMembership(membershipId)
    log.info({ userId: row.userId }, 'admin:super_admin_revoked')
  },
}
