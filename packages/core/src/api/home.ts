import type { BookingType } from '@repo/core/types'
import type { PickupStage } from '@repo/core/pickup'
import type { ServiceReminderKind } from './car-history'
import { apiClient } from './client'

/**
 * The customer's Home hub and Updates feed, as the API sends them
 * (apps/server/src/modules/home). Typed here by hand, field for field, from
 * the server's own interfaces: apps/server does not share code with the
 * apps, so a change there must be made here too. Money is a decimal string
 * ("800.00") and every time an ISO string, as everywhere else in the API.
 */

/** Wash bar states (lib/wash-status.ts). */
export type WashState = 'none' | 'ok' | 'due_soon' | 'due_today' | 'overdue' | 'booked'

export interface WashStatus {
  /** The interval in force: the customer's, or today's default. */
  intervalDays: number
  /** True when the customer has not picked one. */
  isDefaultInterval: boolean
  lastWashAt: string | null
  /** Whole IST days since the last wash. Null with no wash. */
  daysSinceWash: number | null
  /** The IST date the next wash is due, "YYYY-MM-DD". */
  dueOn: string | null
  /** Days until due (0 is today), negative once overdue. */
  daysLeft: number | null
  state: WashState
  /** The upcoming paid booking that makes the car 'booked'. */
  bookedFor: { bookingId: string; scheduledAt: string } | null
}

/** The must-act and soft cards (lib/home-cards.ts ActionCard). */
export type HomeActionCard =
  | {
      /**
       * The garage can't do the booked time and suggested others (0041).
       * Unanswered by `expiresAt`, the booking is cancelled with a full refund.
       */
      kind: 'time_proposal'
      bookingId: string
      proposalId: string
      vendorName: string
      /** The time booked, which the garage can't do. */
      scheduledAt: string
      /** The times on offer, soonest first. */
      options: string[]
      expiresAt: string
    }
  | {
      /** Extra work waiting for "Approve & pay" (0041). */
      kind: 'extra_work_due'
      bookingId: string
      chargeId: string
      vendorName: string
      description: string
      amount: string
      raisedAt: string
      /** Further requests waiting beyond this one. */
      moreDue: number
    }
  | {
      kind: 'bill_due'
      bookingId: string
      chargeId: string
      vendorName: string
      serviceName: string
      amountDue: string
      raisedAt: string
      /** Further bills due beyond this one. */
      moreDue: number
    }
  | {
      kind: 'garage_closed'
      bookingId: string
      vendorId: string
      vendorName: string
      scheduledAt: string
      reason: 'holiday' | 'weekly_off'
      /** False once the booking can no longer be moved, or the garage is paused. */
      canChangeTime: boolean
    }
  | {
      kind: 'rate'
      bookingId: string
      vehicleName: string
      vendorName: string
      completedAt: string
    }
  | {
      /** One of their complaints, just resolved: a soft card, only when the place is free. */
      kind: 'complaint_resolved'
      complaintId: string
      /** "C-000123". */
      number: string
      resolvedAt: string
    }
  | {
      /**
       * A coating or detailing follow-up coming due on one of their cars
       * (API 0046): the softest card, only when the place is free.
       */
      kind: 'service_reminder'
      reminderId: string
      vehicleId: string
      vehicleName: string
      reminderKind: ServiceReminderKind
      /** "Maintenance wash for your coating". */
      title: string
      /** "3 months since your coating at Shine Studio". */
      reason: string
      /** The due date in force, "YYYY-MM-DD". */
      dueOn: string
      state: 'due_soon' | 'due' | 'overdue'
      daysLeft: number
      /** What "Book" searches for. */
      bookCategory: string
    }

export interface HomeTileNotice {
  noticeId: string
  title: string
  linkUrl: string | null
  linkLabel: string | null
}

/** The tile beside the wash bar (lib/home-cards.ts RightTile). */
export type HomeRightTile =
  | {
      kind: 'next_booking'
      bookingId: string
      status: string
      /** 'unpaid' is a pay-later booking: it holds no slot until paid. */
      paymentStatus: 'paid' | 'collected' | 'unpaid'
      scheduledAt: string
      bookingType: BookingType
      vendorId: string
      vendorName: string
      vehicleId: string
      /** A team notice about this booking, shown as one short line. */
      notice: HomeTileNotice | null
      /**
       * Pickup & drop only: the latest handover step reached. Null on other
       * types; absent from servers older than it.
       */
      pickupStage?: PickupStage | null
    }
  | { kind: 'photos'; bookingId: string; before: number; after: number; vendorName: string; at: string }
  | {
      kind: 'book_again'
      bookingId: string
      vendorId: string
      vendorName: string
      bookingType: BookingType
      serviceIds: string[]
      serviceLabel: string
      /** For this car's type; null when a line has no price for it. */
      price: string | null
      /** `price` is then only the inspection fee, never the price of the work. */
      pricedOnInspection: boolean
      available: boolean
    }
  | { kind: 'garage_unavailable'; vendorId: string; vendorName: string }
  | { kind: 'nothing_booked' }

export type HomeNextBooking = Extract<HomeRightTile, { kind: 'next_booking' }>

export interface HomeCar {
  id: string
  make: string
  model: string
  color: string | null
  licensePlate: string | null
  vehicleType: 'hatchback' | 'sedan' | 'suv'
  isDefault: boolean
  washIntervalDays: number | null
  wash: WashStatus
  rightTile: HomeRightTile
}

/** An offer card (lib/offers.ts HomeOffer). */
export interface HomeOffer {
  id: string
  code: string
  title: string
  /** "Up to ₹300 · Min ₹1,000 · Code DETAIL20 · Till Sat 17 Oct", generated from the code's columns. */
  metaLine: string
  /** "Ends today" / "Ends Sun" once three days or fewer are left. */
  endsSoon: string | null
  endsAt: string
  priority: number
  /** Null for a Detlio-wide code. */
  vendorId: string | null
  vendorName: string | null
  discountType: 'percentage' | 'fixed'
  percentOff: string | null
  amountOff: string | null
  maxDiscountAmount: string | null
  minOrderAmount: string | null
}

export interface HomeNotice {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  startsAt: string
  endsAt: string
}

export type UpdateKind =
  | 'notice'
  | 'accepted'
  | 'reminder'
  | 'started'
  | 'completed'
  | 'photos'
  | 'bill_due'
  | 'bill_not_needed'
  | 'bill_paid'
  | 'receipt_ready'
  | 'declined'
  | 'cancelled'
  | 'refunded'
  | 'moved'
  | 'garage_paused'
  | 'complaint_acknowledged'
  | 'complaint_resolved'
  | 'complaint_closed'
  | 'picked_up'
  | 'at_garage'
  | 'out_for_delivery'
  | 'time_proposal'
  | 'extra_work_due'
  | 'extra_work_paid'
  | 'extra_work_declined'
  | 'extra_work_withdrawn'
  | 'service_reminder'
  | 'slot_opened'

/** One row of Updates (lib/home-updates.ts UpdateItem). */
export interface UpdateItem {
  id: string
  kind: UpdateKind
  at: string
  unread: boolean
  title: string
  body: string | null
  bookingId: string | null
  vendorId: string | null
  vendorName: string | null
  amount: string | null
  noticeId: string | null
  linkUrl: string | null
  linkLabel: string | null
  chargeId: string | null
}

export interface CarTip {
  id: string
  category: string
  season: 'all_year' | 'summer' | 'pre_monsoon' | 'monsoon'
  text: string
}

export interface HomeData {
  /** The server's clock when it answered. */
  now: string
  header: { firstName: string; avatarUrl: string | null; hasUnread: boolean }
  /** Bill due, or the garage shut on a booking's day: above the offers. */
  mustAct: HomeActionCard | null
  /** Up to three, ranked. Null when the offers could not be read. */
  offers: HomeOffer[] | null
  /**
   * "Rate your wash", only when there is no must-act card; else a resolved
   * complaint, else a service reminder coming due, each only in a free place.
   */
  softCard: HomeActionCard | null
  /** Default car first; empty means "Add your car". */
  cars: HomeCar[]
  /** A live booking for a car since removed, when no car is left. */
  nextBooking: HomeNextBooking | null
  updates: { pinnedNotice: HomeNotice | null; items: UpdateItem[]; total: number } | null
  nearby: { count: number; closestKm: number | null; radiusKm: number } | null
  tip: CarTip
}

export interface UpdatesData {
  /** Everything still waiting on the customer: bills, closed days, ratings. */
  todo: HomeActionCard[]
  pinnedNotice: (HomeNotice & { unread: boolean }) | null
  /** The last 30 days, newest first. */
  items: UpdateItem[]
  seenAt: string
  /** The server's clock, sent back as the read marker. */
  now: string
}

/**
 * GET /users/me/home. `origin` is the customer's rounded location (see
 * `coarse` in the location store), for the Nearby card; without it the card
 * asks for location instead.
 */
export async function getHome(origin?: { lat: number; lng: number } | null): Promise<HomeData> {
  return apiClient<HomeData>('/users/me/home', {
    params: origin ? { lat: origin.lat, lng: origin.lng } : undefined,
  })
}

/** GET /users/me/updates */
export async function getUpdates(): Promise<UpdatesData> {
  return apiClient<UpdatesData>('/users/me/updates')
}

/**
 * POST /users/me/updates/seen. `at` should be the `now` the server sent with
 * the feed, not the phone's clock: a phone running slow would leave the
 * newest rows unread. The server never moves the marker back.
 */
export async function markUpdatesSeen(at: string): Promise<void> {
  await apiClient('/users/me/updates/seen', {
    method: 'POST',
    body: JSON.stringify({ at }),
  })
}

/** POST /users/me/notices/:id/dismiss — gone for this customer on every device. */
export async function dismissNotice(noticeId: string): Promise<void> {
  await apiClient(`/users/me/notices/${noticeId}/dismiss`, { method: 'POST' })
}

/**
 * POST /users/me/offers/:id/dismiss — off this customer's Home for good. The
 * code itself still works if they type it at checkout.
 */
export async function dismissOffer(discountId: string): Promise<void> {
  await apiClient(`/users/me/offers/${discountId}/dismiss`, { method: 'POST' })
}
