/**
 * A booking row from the Home read, as the pure Home and Updates code takes
 * it (lib/home-updates.ts HubBooking). No database here, so the mapping is
 * unit-tested with the exact shapes the relational read returns.
 */
import { serviceLabelOf } from '../../lib/home-cards.js'
import type { HubBooking } from '../../lib/home-updates.js'
import type { HubBookingRecord } from './home.repository.js'

/**
 * Money as the rest of the API sends it, "800.00". The nested rows of a
 * relational read (payment, charges, refund records) arrive through
 * json_build_array, so postgres-js parses numeric(10,2) 800.00 as the number
 * 800 and Drizzle hands back "800" (timestamps are rebuilt as Dates, money is
 * not). Flat selects keep the text and are untouched by this.
 */
export function money(value: string | number): string {
  return Number(value).toFixed(2)
}

function moneyOrNull(value: string | number | null): string | null {
  return value === null ? null : money(value)
}

export function toHubBooking(row: HubBookingRecord, moved: Set<string>): HubBooking {
  const names = row.items.length > 0 ? row.items.map((item) => item.name) : row.service ? [row.service.name] : []
  const photoTimes = row.photos.map((photo) => photo.createdAt.getTime())
  return {
    id: row.id,
    status: row.status,
    bookingType: row.bookingType,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    cancelledOnBehalfOf: row.cancelledOnBehalfOf,
    noShow: row.noShow,
    rescheduledFromId: row.rescheduledFromId,
    rescheduleCount: row.rescheduleCount,
    moved: moved.has(row.id),
    reviewPromptDismissedAt: row.reviewPromptDismissedAt,
    hasReview: row.review !== null,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}` : 'Your car',
    vendorId: row.vendorId,
    vendorName: row.vendor.businessName,
    vendorPausedAt: row.vendor.bookingsPausedAt,
    serviceLabel: serviceLabelOf(names),
    payment: row.payment
      ? {
          ...row.payment,
          amount: money(row.payment.amount),
          refundedAmount: moneyOrNull(row.payment.refundedAmount),
        }
      : null,
    charges: row.charges.map((charge) => ({
      ...charge,
      amountDue: money(charge.amountDue),
      refundedAmount: moneyOrNull(charge.refundedAmount),
    })),
    photos: {
      count: row.photos.length,
      before: row.photos.filter((photo) => photo.stage === 'before').length,
      after: row.photos.filter((photo) => photo.stage === 'after').length,
      lastAt: photoTimes.length > 0 ? new Date(Math.max(...photoTimes)) : null,
    },
    refunds: row.refundRecords.map((refund) => ({ ...refund, amount: money(refund.amount) })),
    pickup:
      row.bookingType === 'pickup'
        ? {
            pickedUpAt: row.pickedUpAt,
            atGarageAt: row.atGarageAt,
            outForDeliveryAt: row.outForDeliveryAt,
            deliveredAt: row.deliveredAt,
          }
        : null,
  }
}
