import type { Tier } from '@repo/core/tiers'
import { apiClient } from './client'
import { stripImageMetadata } from '@repo/core/image-upload'
import type { ApiMember } from './members'
import type { VendorRole } from './types'
import type { PhotoStandard, ServiceCategory, ServiceMedia } from '@repo/core/types'
import type {
  ComplaintCategory,
  ComplaintSource,
  ComplaintStatus,
  LoggedComplaintSource,
} from '@repo/core/complaints'
import type { OutsideServiceCity } from '@repo/core/service-city'
import type { MissingKey } from '@repo/core/onboarding-marks'
import type { ColourTag } from '@repo/core/garage-target'
import { setAdminSigner, signedBody } from './admin-signer'
import type { OnboardingMarkBrief } from './admin-marks'

export interface AdminVendor {
  id: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email: string | null
  whatsapp: string | null
  isVerified: boolean
  /** Null until someone pins the garage. Blocks verification while unset. */
  lat: number | null
  lng: number | null
  geoSource: 'unset' | 'gps' | 'map_pin' | 'geocoded' | 'admin'
  geoConfirmedAt: string | null
  status: string
  /** Set while the garage takes no new bookings. */
  bookingsPausedAt?: string | null
  createdAt: string
  serviceCount: number
  /**
   * Every booking the garage has ever had, in any state: the count that makes
   * a delete refused. Absent from a server older than this field.
   */
  bookingCount?: number
  dropinEnabled: boolean
  doorstepEnabled: boolean
  doorstepRadiusKm: number | null
  /** The garage drew its own doorstep area, which then replaces the radius. */
  hasDoorstepArea?: boolean
  /**
   * Offers pickup & drop: said yes with the responsibility terms on file.
   * Absent from a server older than pickup & drop.
   */
  pickupEnabled?: boolean
  pickupRadiusKm?: number | null
  /** The stored answer, and the last acceptance of the responsibility terms. */
  pickup?: 'yes' | 'nearby' | 'no' | null
  pickupTermsAcceptedAt?: string | null
  pickupTermsAcceptedBy?: string | null
  /**
   * Customers can find it: Active, verified, not paused and not in the Bin —
   * the customer lists' own rule, decided on the server so the two never
   * disagree. Absent from a server older than this field.
   */
  live?: boolean
  /**
   * In the Bin since then (see AdminVendorBin), or null. A garage in the Bin
   * is off the app for customers and its team until restored or deleted
   * forever. Absent from a server older than the Bin.
   */
  deletedAt?: string | null
  /** The name typed by whoever moved it to the Bin, and why, if they said. */
  deletedByName?: string | null
  deletedReason?: string | null
  /** What the garage still needs, blocking first (see ReadinessItem). */
  readiness?: ReadinessItem[]
  /**
   * Photo compliance (0045): of its jobs completed in the last 90 days (not
   * waived, not Test), how many had 2 before and 2 after photos of its own.
   * `percent` null with no such jobs. Absent from older servers.
   */
  photoCompliance?: { jobs: number; compliant: number; waived: number; percent: number | null }
  /**
   * Bypass reports (0052): confirmed reports from the last 180 days. 2 or
   * more are highlighted. Absent from older servers.
   */
  bypassStrikes?: number
  /**
   * Detlio Guarantee (0051): free redo claims approved against it in the
   * last 90 days. Null while the guarantee is off; absent from older servers.
   */
  redoClaims90d?: number | null
  /**
   * Its garage documents in short (0043): whether it has the badge, how
   * many required are approved, how many wait for review. Null while garage
   * documents are off; absent from older servers.
   */
  documents?: {
    verified: boolean
    approvedRequired: number
    required: number
    toReview: number
    missingRequired: number
    rejected: number
  } | null
  /**
   * Detlio Certified (0048), from the garage's last evaluation: certified
   * now, eligible then, the last day a certified garage falling short keeps
   * it (`keepsUntil`), and how the last one ended. Null when never evaluated
   * or certified; absent from older servers.
   */
  certification?: AdminVendorCertification | null
  /**
   * The tier the garage holds (0063): Bronze, Silver or Gold, whatever
   * customers are shown; null for none. Absent from older servers.
   */
  tier?: Tier | null
  /** Admin hid this garage's medal from customers (0063). Absent from older servers. */
  tierHidden?: boolean
  owner: {
    id: string
    name: string
    phone: string
  } | null
  /**
   * Set when the garage is pinned more than 50 km from the Chennai centre (or
   * is unpinned and its city names another town, with km null), the sign
   * customers see on it. Absent from an older API.
   */
  outsideServiceCity?: OutsideServiceCity | null
  /**
   * What the garage still owes us (0059), worked out from its own data in
   * MISSING_KEYS order: the Missing chips and the WhatsApp ask. Separate
   * from `readiness`. Absent from an older API.
   */
  missing?: MissingKey[]
  /** Its marks not yet Received, oldest first. Absent from an older API. */
  openMarks?: OnboardingMarkBrief[]
  /** Who on the team brought it in, set by hand (0059). Absent from an older API. */
  onboardedByName?: string | null
  /** Its open items on a collection list ("With Raga · due 29 Oct · 3/11"). */
  openCollection?: AdminVendorCollection | null
  /**
   * The team's colour for it on the Garages list (0064), or null; the
   * Call back day ("YYYY-MM-DD", blue only), and who set it when. Absent
   * from an older API.
   */
  colourTag?: ColourTag | null
  colourTagCallOn?: string | null
  colourTagSetBy?: string | null
  colourTagSetAt?: string | null
}

/**
 * A garage's place on an open collection list (0059): among the open lists
 * where this garage still has something to collect, the one due first (no
 * due date last; the newest on a tie). `done` and `total` are that list's
 * items for this garage only. Null once nothing is left for it anywhere.
 */
export interface AdminVendorCollection {
  listId: string
  assigneeName: string
  /** YYYY-MM-DD, or null with no due date. */
  dueOn: string | null
  /** Collected or cleared. */
  done: number
  total: number
}

export interface AdminVendorCertification {
  certified: boolean
  certifiedAt: string | null
  eligible: boolean
  lastEvaluatedAt: string | null
  /** IST date key; set while certified and falling short. */
  keepsUntil: string | null
  endedAt: string | null
  endedKind: 'revoked' | 'lapsed' | null
}

/** The edit page tab where a checklist item is fixed (its `?tab=`). */
export type ReadinessTab = 'details' | 'location' | 'operations' | 'services' | 'documents'

/**
 * One line of a garage's "what's missing" checklist, from the server's
 * lib/vendor-readiness.ts. `blocking`: customers can't book it until this is
 * done. `fix`: it works, but put it right soon. `optional`: nice to have.
 * Only blocking and fix count as needing fixing.
 */
export interface ReadinessItem {
  key: string
  severity: 'blocking' | 'fix' | 'optional'
  /** The checklist row: "No services". */
  label: string
  /** A quieter second line, when the label needs one. */
  detail?: string
  /** A word or two for the card's summary: "1 to fix: map pin". */
  short: string
  tab: ReadinessTab
}

export interface AdminPhoto {
  id: string
  url: string
  sortOrder: number
}

export interface AdminVendorDetail {
  id: string
  logoUrl: string | null
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email: string | null
  whatsapp: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  /** The stored answer; `pickupEnabled` says whether it is on. */
  pickup: 'yes' | 'nearby' | 'no' | null
  /** Null is the 10 km default. */
  pickupRadiusKm: number | null
  /** On: said yes with the responsibility terms on file. Optional for older servers. */
  pickupEnabled?: boolean
  /** When, and by whom, the responsibility terms were last accepted. */
  pickupTermsAcceptedAt?: string | null
  pickupTermsAcceptedBy?: string | null
  doorstepRadiusKm: number | null
  /**
   * The garage drew its own doorstep area in the garage app. Where it did,
   * the area decides who is covered and `doorstepRadiusKm` is not read.
   */
  hasDoorstepArea: boolean
  /** Null until someone pins the garage. A vendor cannot be verified without it. */
  lat: number | null
  lng: number | null
  geoSource: 'unset' | 'gps' | 'map_pin' | 'geocoded' | 'admin'
  geoConfirmedAt: string | null
  dropinEnabled: boolean
  doorstepEnabled: boolean
  slotIntervalMins: number
  bays: number | null
  jobsPerDay: number | null
  vehicleTypes: string[]
  notes: string | null
  isVerified: boolean
  status: string
  /** When the garage paused new bookings, and why. Null while it takes them. */
  bookingsPausedAt: string | null
  bookingsPausedReason: string | null
  /** In the Bin since then, by whom and why: the edit page opens read-only. */
  deletedAt?: string | null
  deletedByName?: string | null
  deletedReason?: string | null
  createdAt: string
  /** The garage list's checklist, for the editor's status panel (0059). Absent from an older API. */
  readiness?: ReadinessItem[]
  /** What the garage still owes us (0059), as on AdminVendor. Absent from an older API. */
  missing?: MissingKey[]
  /** Who on the team brought it in, set by hand (0059). Absent from an older API. */
  onboardedByName?: string | null
  owner: {
    id: string
    name: string
    phone: string
  } | null
  workingHours: AdminWorkingDay[]
  /** Holidays from today on, soonest first. */
  closures: Array<{ id: string; date: string; reason: string | null }>
  photos: AdminPhoto[]
  services: Array<{
    id: string
    name: string
    description: string | null
    category: ServiceCategory
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price: string
    priceHatchback: string | null
    priceSedan: string | null
    priceSuv: string | null
    /** Null: not set (0064), and 60 min is held in the calendar. */
    durationMins: number | null
    /**
     * Its own commission percent for Statistics ("6.50"), or null for its
     * category's rate (0064). Absent from an older server.
     */
    commissionRate?: string | null
    images: AdminPhoto[]
    /** Photos and the video, with each video's state. */
    media: ServiceMedia[]
  }>
}

/**
 * A plain service as the admin service routes return it: the editor's shape,
 * plus whether customers can see it.
 */
export type AdminService = AdminVendorDetail['services'][number] & {
  isActive: boolean
}

/** One day of a garage's week, as stored. */
export interface AdminWorkingDay {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

/** A service in an admin vendor update: `id` present = edit, absent = create. */
export interface UpdateVendorServiceInput {
  id?: string
  name: string
  description?: string
  category: ServiceCategory
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
  /** Left out or null: no duration (0064). */
  durationMins?: number | null
  /**
   * Its own commission percent (0–50) for Statistics, or null for the
   * category's rate (0064). Left out leaves it as it is.
   */
  commissionRate?: number | null
}

export interface UpdateVendorInput {
  ownerName?: string
  ownerPhone?: string
  businessName?: string
  phone?: string
  address?: string
  city?: string
  pincode?: string
  email?: string | null
  whatsapp?: string | null
  yearsInOperation?: string | null
  mapsUrl?: string | null
  /**
   * Pickup & drop, saved on its own by the edit page's card. Turning it on
   * needs `pickupAgreementSigned: true` (PICKUP_TERMS_ADMIN); off never does.
   * The legacy `pickup` answer is not sent any more.
   */
  pickupEnabled?: boolean
  pickupAgreementSigned?: boolean
  pickupRadiusKm?: number | null
  doorstepRadiusKm?: number | null
  /** Both or neither — the server rejects a half-set pair. */
  lat?: number
  lng?: number
  /**
   * "I looked at this pin and it is right." Stamps `geoConfirmedAt` without
   * moving anything — the only way to confirm a pin on an already-verified
   * vendor, since verification is the other writer and cannot run twice.
   */
  confirmLocation?: true
  dropinEnabled?: boolean
  doorstepEnabled?: boolean
  slotIntervalMins?: 30 | 45 | 60
  bays?: number | null
  jobsPerDay?: number | null
  vehicleTypes?: string[]
  /**
   * Per-day hours, set exactly as given. Send only when the admin changed the
   * schedule: leaving it out keeps the garage's hours as they are.
   */
  workingHours?: AdminWorkingDay[]
  /**
   * Older shape: one schedule for every open day, which rewrites the whole
   * week. Prefer `workingHours`.
   */
  workingDays?: number[]
  openTime?: string
  closeTime?: string
  status?: 'pending' | 'active' | 'suspended' | 'archived'
  isVerified?: boolean
  notes?: string | null
  /** Who on the team brought it in (0059): a login's name or free text; null clears it. */
  onboardedByName?: string | null
  services?: UpdateVendorServiceInput[]
}

export type BookingParty = 'customer' | 'garage'
export type CancelledOnBehalfOf = BookingParty | 'detlio'

/**
 * One row of the admin bookings list — what ops needs to answer a call about
 * a booking without opening it.
 */
export interface AdminBooking {
  id: string
  /** "3F2A9C1B": the number customers and garages read out. */
  reference: string
  status: string
  bookingType: string
  scheduledAt: string
  createdAt: string
  /**
   * Minutes a pending booking has waited for its garage, counted from the
   * later of creation and payment. Null for every other status.
   */
  waitingMins: number | null
  durationMins: number
  amount: string
  subtotalAmount: string
  discountAmount: string
  discountCode: string | null
  discountFundedBy: 'platform' | 'vendor' | null
  paymentMethod: string
  payment: {
    status: string
    /** The Razorpay payment id — what ops searches the dashboard for to refund. */
    gatewayTxnId: string | null
    /**
     * Which Razorpay mode the money was taken in. Null on payments from
     * before it was recorded; optional for an older server.
     */
    gatewayMode?: 'live' | 'test' | 'fake' | null
    paidAt: string | null
    /** Gift a wash (0049): what came through Razorpay. Optional for an older server. */
    amount?: string
    /** The part paid with Detlio credit, which goes back as credit, never through Refunds. */
    creditAmount?: string | null
    /** When that part went back to the customer's credit (ISO). */
    creditReturnedAt?: string | null
  } | null
  /**
   * Marked "Test" by ops: left out of the pilot numbers, and deletable from
   * its page while the test-data reset is on. Optional for an older server.
   */
  markedTest?: { at: string; by: string | null } | null
  /** A free redo of an earlier job (0051), and when Detlio approved a refund instead of a redo. */
  guaranteeRedo?: boolean
  guaranteeRefundAt?: string | null
  garage: { id: string; name: string; phone: string } | null
  customer: { id: string; name: string; phone: string } | null
  /**
   * Where a doorstep job happens, or where a pickup & drop car is collected
   * from. Null for a job at the garage.
   */
  address: string | null
  /** Pickup & drop's handover; null on other types. Optional for older servers. */
  pickup?: AdminBookingPickup | null
  vehicle: { id: string; make: string; model: string; plate: string | null } | null
  /** Every service on the booking, priced as sold. */
  items: Array<{
    id: string
    serviceId: string
    name: string
    amount: string
    durationMins: number
  }>
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  /** Only on a Detlio cancellation: whose call it was. */
  cancelledOnBehalfOf: CancelledOnBehalfOf | null
  cancellationReason: string | null
  cancelledAt: string | null
  noShow: BookingParty | null
  noShowMarkedAt: string | null
  /**
   * When the garage moved the job on. Optional for a server older than job
   * records; null on jobs from before they were kept.
   */
  acceptedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  /**
   * The garage's deadline to accept (0042); null on bookings without one.
   * Optional for a server older than 0042.
   */
  respondBy?: string | null
  /**
   * When the cron cancelled it because the garage did not accept in time
   * ("Not accepted in time", refunded in full); null otherwise.
   */
  notAcceptedInTime?: string | null
  /** The balance still to pay on a final bill ("Bill due ₹Z"); null when none. */
  billDue?: string | null
  /**
   * Money still owed back on the booking (its payment and any bills), for
   * "Refund owed ₹X"; null when none. Optional for a server older than refunds.
   */
  refundOwed?: string | null
  /** Money given back on it so far, for "Refunded"; null when none. */
  refunded?: string | null
  notesCount: number
  rescheduledFromId: string | null
}

/**
 * A pickup & drop job's handover as ops sees it: the steps, the tries left on
 * each code, and who at Detlio confirmed a step without the code. Never the
 * codes themselves.
 */
export interface AdminBookingPickup {
  pickedUpAt: string | null
  atGarageAt: string | null
  outForDeliveryAt: string | null
  deliveredAt: string | null
  pickupOverrideBy: string | null
  deliveryOverrideBy: string | null
  pickupCodeTriesLeft: number
  deliveryCodeTriesLeft: number
}

/** A final bill as ops sees it, with the Razorpay ids to find the payment by. */
export interface AdminFinalBill {
  id: string
  status: 'due' | 'paid' | 'cancelled' | 'not_needed'
  lines: Array<{ description: string; amount: string }>
  totalAmount: string
  paidBefore: string
  amountDue: string
  note: string | null
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

/** Extra work as ops sees it (0041): the customer's view plus the money trail. */
export interface AdminExtraWork {
  id: string
  description: string
  amount: string
  note: string | null
  photos: Array<{ url: string }>
  state: 'awaiting' | 'paid' | 'declined' | 'withdrawn' | 'closed'
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
  cancelReason: 'replaced' | 'withdrawn' | 'declined' | 'booking_closed' | null
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  refundedAmount: string | null
}

/** A time suggestion as ops sees it (0041): what was offered and how it ended. */
export interface AdminTimeProposal {
  id: string
  status: 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'closed'
  slots: string[]
  note: string | null
  expiresAt: string
  chosenSlot: string | null
  resultBookingId: string | null
  resolvedAt: string | null
  createdAt: string
}

/** An ops-team note. Never shown to customers or garages. */
export interface AdminBookingNote {
  id: string
  author: string
  body: string
  createdAt: string
}

export interface AdminBookingDetail extends AdminBooking {
  lat: number | null
  lng: number | null
  garageAddress: string | null
  /** Who at the garage accepted / completed it, when the garage recorded it. */
  acceptedByName: string | null
  completedByName: string | null
  originalBookingId: string | null
  /** The booking this one was moved to, when the customer rescheduled it. */
  rescheduledToId: string | null
  rescheduleCount: number
  /** Newest first. */
  notes: AdminBookingNote[]
  /** The final bill that stands, if the garage raised one. */
  finalBill?: AdminFinalBill | null
  /**
   * Unpaid bills the garage replaced, newest first. One with a payment id is
   * money taken for a bill that no longer stands: a refund to do.
   */
  replacedFinalBills?: AdminFinalBill[]
  /**
   * Every before/after photo of the job, oldest first: the garage's and,
   * since 0045, the customer's own, with the angle and who added it.
   */
  photos?: Array<{
    id: string
    stage: 'before' | 'after'
    url: string
    createdAt: string
    angle?: 'front' | 'back' | 'left' | 'right' | 'interior' | null
    by?: 'garage' | 'customer'
    /** The person's name; null once their account is gone. */
    uploadedByName?: string | null
  }>
  /** What Start and Complete wait for on this job (0045), as the garage sees it. */
  photoStandard?: PhotoStandard
  /** Detlio waived the photo standard on this booking (0045), by whom and why. */
  photosWaiver?: { at: string; by: string; reason: string } | null
  /** Extra work the garage asked for (0041), newest first. */
  extraWork?: AdminExtraWork[]
  /** Times the garage suggested instead of declining (0041), newest first. */
  timeProposals?: AdminTimeProposal[]
  /** Money owed back on this booking, or given back: its payment and any bills. */
  refunds?: AdminRefund[]
}

/** Where the money to give back was taken. */
export type RefundKind = 'booking' | 'checkout' | 'bill'

/**
 * One refund to do, or done (GET /admin/refunds). Money is decimal strings.
 * See apps/server/src/lib/refunds.ts for what is owed and why.
 */
export interface AdminRefund {
  kind: RefundKind
  /** The booking's id for its payment, the checkout's id, or the bill's. */
  id: string
  bookingId: string | null
  /** The booking's reference, or the checkout's own short id. */
  reference: string
  customer: { name: string; phone: string }
  garageName: string
  amountPaid: string
  amountRefunded: string
  amountOwed: string
  /** The Razorpay payment to refund in the dashboard. */
  razorpayPaymentId: string | null
  /** Why it is owed: who cancelled, a no-show, or why a checkout failed. */
  reason: string
  /** When it became owed, as ISO. */
  since: string | null
  refundedAt: string | null
  refundRef: string | null
  refundedBy: string | null
  refundNote: string | null
  /** Refunded, but not through Razorpay: the note says how. */
  outsideRazorpay: boolean
  /** For a bill: the final bill or extra work (0041). Absent from older servers. */
  chargeKind?: 'final_bill' | 'extra_work' | null
}

/** What POST /admin/refunds records. Exactly one of refundRef and outsideRazorpayNote. */
export interface RecordRefundInput {
  kind: RefundKind
  id: string
  /** Rupees, to the paisa. */
  amount: number
  refundRef?: string
  outsideRazorpayNote?: string
  note?: string
  /**
   * Rupees refunded already when the dialog opened. The server records only
   * while that still holds, so a retry of a refund that went through (its
   * answer lost) is refused with REFUND_STATE_CHANGED, not recorded twice.
   */
  expectedRefunded?: number
}

/**
 * What POST /admin/refunds/send takes: Refund now, through Razorpay. `amount`
 * from everything owed down to a part of it (never more); left out, all of
 * it. `expectedRefunded` is what the sheet showed as refunded: if that has
 * moved, nothing is sent (409 REFUND_STATE_CHANGED).
 */
export interface RefundNowInput {
  kind: RefundKind
  id: string
  /** Rupees, to the paisa. */
  amount?: number
  expectedRefunded?: number
  note?: string
}

export interface AdminBookingFilters {
  /** A booking reference, a customer phone or name, or a garage name. */
  q?: string
  status?: string
  vendorId?: string
  /** IST calendar dates (YYYY-MM-DD) on the scheduled time, both inclusive. */
  from?: string
  to?: string
  /** Bookings marked "Test": only those, or all but those. */
  test?: 'only' | 'hide'
  limit?: number
  /** Older paging; the panel uses `cursor`. */
  page?: number
  /**
   * Continue after this row: "<scheduledAt ISO>_<id>" of the last row of the
   * previous page (see adminBookingsCursor). Today and Upcoming sort soonest
   * first, so there the page continues forwards in time.
   */
  cursor?: string
  /** A saved view (0059); left out is All. Absent from an older API, which ignores it. */
  view?: Exclude<AdminBookingView, 'all'>
  /** How the car is served (0059 filters); an older API ignores it. */
  bookingType?: 'dropin' | 'doorstep' | 'pickup'
  /**
   * Payment (0059 filters): paid online, to pay at the garage, or a refund
   * owed ("Money owed" in the panel); an older API ignores it.
   */
  payment?: 'paid' | 'pay_later' | 'refund_owed'
}

/**
 * The bookings list's saved views (0059). `needs_action`: paid and waiting
 * for the garage (not Test), or a refund owed. `today` and `upcoming` sort
 * soonest first; the rest newest scheduled first.
 */
export type AdminBookingView = 'needs_action' | 'today' | 'upcoming' | 'completed' | 'cancelled' | 'all'

/** How many bookings each view holds, under the same search, garage and Test filters. */
export type AdminBookingViewCounts = Record<AdminBookingView, number>

/**
 * The filters the view counts are taken under: every one the list has but
 * the view itself and paging, so a view's count is the rows it lists. An
 * older API reads only q, vendorId and test, and ignores the rest.
 */
export type AdminBookingViewCountFilters = Omit<
  AdminBookingFilters,
  'view' | 'limit' | 'page' | 'cursor'
>

export interface CreateVendorInput {
  ownerName: string
  ownerPhone: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email?: string
  whatsapp?: string
  yearsInOperation?: string
  mapsUrl?: string
  /** Pickup & drop on, with the admin's tick that the garage signed the agreement. */
  pickupEnabled?: boolean
  pickupAgreementSigned?: boolean
  pickupRadiusKm?: number
  doorstepRadiusKm?: number
  lat?: number
  lng?: number
  dropinEnabled?: boolean
  doorstepEnabled?: boolean
  slotIntervalMins?: 30 | 45 | 60
  bays?: number
  jobsPerDay?: number
  vehicleTypes?: string[]
  workingDays?: number[]
  openTime?: string
  closeTime?: string
  status?: 'pending' | 'active' | 'suspended' | 'archived'
  isVerified?: boolean
  notes?: string
  /** Who on the team brought it in (0059). Left out or null: not set. */
  onboardedByName?: string | null
  services?: Array<{
    name: string
    description?: string
    category: ServiceCategory
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price?: number
    priceHatchback?: number
    priceSedan?: number
    priceSuv?: number
    /** Left out or null: no duration (0064). */
    durationMins?: number | null
    /** Its own commission percent for Statistics (0064); null: the category's. */
    commissionRate?: number | null
  }>
  /** The lead it was onboarded from (Coverage's Onboard, 0064): linked once created. */
  leadId?: string
}

/** POST /admin/login */
export async function adminLogin(username: string, password: string) {
  return apiClient<{ isSuperAdmin: boolean }>('/admin/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ username, password }),
  })
}

/** POST /admin/logout */
export async function adminLogout() {
  setAdminSigner(null)
  return apiClient<void>('/admin/logout', { method: 'POST', auth: false })
}

/**
 * Who is signed in to the panel (0058). 'shared' is the one env login (the
 * bootstrap, signs as "admin"); 'personal' a login of one's own
 * (admin_logins); 'member' a super-admin customer account.
 */
export type AdminMeKind = 'shared' | 'personal' | 'member'

export interface AdminMe {
  isSuperAdmin: true
  kind: AdminMeKind
  /** What every action is signed with. */
  name: string
  /** A personal login's username; null for the other two kinds. */
  username: string | null
  /** The owner's login: the only one that changes team logins. */
  isOwner: boolean
}

/**
 * GET /admin/me — the session check, and who every action is signed as. An
 * API from before 0058 answers only `{ isSuperAdmin }`, so the rest is filled
 * in as the shared login, which is what that API signs as. It also sets the
 * name the panel's writes carry for such an API (admin-signer.ts).
 */
export async function getAdminMe(): Promise<AdminMe> {
  // Any answer but 200 throws: a 200 is a super-admin session.
  const me = await apiClient<Partial<AdminMe>>('/admin/me')
  const full: AdminMe = {
    isSuperAdmin: true,
    kind: me.kind ?? 'shared',
    name: me.name?.trim() || 'admin',
    username: me.username ?? null,
    isOwner: me.isOwner ?? false,
  }
  setAdminSigner(full.name)
  return full
}

// ─── Team logins (0058) ──────────────────────────────────────────────────────

export type AdminLoginStatus = 'active' | 'off'

/** A personal admin login, as Settings → Team logins lists it. */
export interface AdminLogin {
  id: string
  username: string
  name: string
  status: AdminLoginStatus
  /** The owner's login (one at most). */
  isOwner: boolean
  lastLoginAt: string | null
  createdByName: string
  createdAt: string
  /**
   * Optional 10-digit mobile (0059), only for "Also send on WhatsApp" with a
   * collection list. Absent from an older API.
   */
  phone?: string | null
}

/** POST /admin/logins */
export interface CreateAdminLoginInput {
  username: string
  name: string
  password: string
  /** Optional (0059). */
  phone?: string | null
}

/** PATCH /admin/logins/:id (0059): today only the phone; null clears it. */
export interface UpdateAdminLoginInput {
  phone?: string | null
}

export interface AdminLoginList {
  logins: AdminLogin[]
  /** The signed-in person's own login; null on the shared login or a member. */
  youId: string | null
  /** Whether the team has an owner yet. */
  ownerExists: boolean
  /**
   * Whether you may add logins, reset passwords and turn logins on or off:
   * the owner, or the shared login while there is no owner (the first login
   * it adds becomes the owner). The server enforces it either way.
   */
  canManage: boolean
}

/** GET /admin/logins */
export async function listAdminLogins() {
  return apiClient<AdminLoginList>('/admin/logins')
}

/** POST /admin/logins — 409 ADMIN_USERNAME_TAKEN; 400 for a rule failure. */
export async function createAdminLogin(input: CreateAdminLoginInput) {
  return apiClient<AdminLogin>('/admin/logins', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** POST /admin/logins/:id/password — someone else's; ends their sessions. */
export async function resetAdminLoginPassword(id: string, password: string) {
  return apiClient<AdminLogin>(`/admin/logins/${id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

/**
 * PATCH /admin/logins/:id (0059) — the login's phone. Who may change it is
 * the server's rule (as for the other team-login changes).
 */
export async function updateAdminLogin(id: string, input: UpdateAdminLoginInput) {
  return apiClient<AdminLogin>(`/admin/logins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** POST /admin/logins/:id/status — 'off' ends their sessions. */
export async function setAdminLoginStatus(id: string, status: AdminLoginStatus) {
  return apiClient<AdminLogin>(`/admin/logins/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

/**
 * POST /admin/me/password — your own. 400 ADMIN_PASSWORD_WRONG; 409
 * ADMIN_LOGIN_SHARED on the shared login. This session stays signed in.
 */
export async function changeOwnAdminPassword(input: { currentPassword: string; newPassword: string }) {
  return apiClient<void>('/admin/me/password', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** GET /admin/vendors */
export async function listAdminVendors() {
  return apiClient<AdminVendor[]>('/admin/vendors')
}

/** One garage on the pilot leaderboard. */
export interface PilotGarage {
  vendorId: string
  name: string
  paidBookings: number
  revenue: number
}

/** GET /admin/stats/pilot — see apps/server/src/lib/pilot-stats.ts. */
export interface PilotStats {
  days: 7 | 30
  /** ISO start of the rolling window. */
  since: string
  checkoutsStarted: number
  paid: number
  paidNoBooking: number
  accepted: number
  completed: number
  cancelledByCustomer: number
  cancelledByGarage: number
  cancelledByDetlio: number
  customerNoShows: number
  garageNoShows: number
  revenue: number
  /**
   * Median minutes from payment to the garage accepting, over bookings
   * accepted in the window. Null under three of them (`acceptSamples`), and
   * absent from a server older than accept times.
   */
  medianAcceptMins?: number | null
  acceptSamples?: number
  /**
   * Refunds still to do (whenever they became owed) and those recorded in
   * the window. Absent from a server older than refunds.
   */
  refundsOwed?: number
  refundsOwedAmount?: number
  refunded?: number
  refundedAmount?: number
  rates: {
    paidOfStarted: number | null
    acceptedOfPaid: number | null
    completedOfAccepted: number | null
  }
  topGarages: PilotGarage[]
}

/** GET /admin/stats/pilot?days=7|30 */
export async function getPilotStats(days: 7 | 30) {
  return apiClient<PilotStats>('/admin/stats/pilot', { params: { days } })
}

// ─── Statistics ──────────────────────────────────────────────────────────────
// What each figure counts is in apps/server/src/lib/stats.ts and
// lib/commission.ts; the page's "How we count" says it in plain words.

/** IST calendar dates, both included. */
export interface StatsRange {
  from: string
  to: string
  days: number
}

/** The filters every Statistics read takes. */
export interface StatsFilters {
  from: string
  to: string
  /** One garage, or every garage when absent. */
  vendorId?: string
}

/** The Overview's six tiles, for one period. Rates are 0–1, or null with nothing to divide by. */
export interface StatsKpis {
  bookings: number
  collected: number
  commission: number
  averageBooking: number | null
  checkoutsStarted: number
  paidOfStarted: number | null
  cancelled: number
  cancellationRate: number | null
}

export interface StatsCollectedBar {
  start: string
  end: string
  days: number
  /** False for a week or month the range only partly covers. */
  full: boolean
  collected: number
}

/** GET /admin/stats/overview */
export interface StatsOverview {
  range: StatsRange
  /** The period compared with, when asked for. */
  previous: StatsRange | null
  kpis: StatsKpis
  previousKpis: StatsKpis | null
  perDay: Array<{ date: string; bookings: number }>
  previousPerDay: Array<{ date: string; bookings: number }> | null
  collected: { unit: 'week' | 'month'; bars: StatsCollectedBar[] }
}

export interface StatsFunnel {
  checkoutsStarted: number
  paid: number
  completed: number
  leftWithoutPaying: number
  paidNoBooking: number
  cancelled: number
  noShows: number
  /** Paid, and neither done nor cancelled yet, whenever its slot was. */
  notDone: number
  paidOfStarted: number | null
  completedOfPaid: number | null
}

export interface StatsGarageRow {
  vendorId: string
  name: string
  bookings: number
  collected: number
  rating: number | null
  reviews: number
  /**
   * Paid bookings it did not accept in time, cancelled and refunded by the
   * cron (0042). Absent from servers before 0042.
   */
  notAcceptedInTime?: number
}

export interface StatsServiceRow {
  category: ServiceCategory
  bookings: number
  collected: number
}

/** ISO weekday (1 = Monday) by IST hour of the slot. */
export interface StatsBusyHourCell {
  weekday: number
  hour: number
  bookings: number
}

/** GET /admin/stats/breakdown */
export interface StatsBreakdown {
  range: StatsRange
  funnel: StatsFunnel
  /** Every garage with a booking in the period, most collected first. */
  garages: StatsGarageRow[]
  /** Every service type, most collected first. */
  services: StatsServiceRow[]
  busyHours: {
    firstHour: number
    lastHour: number
    cells: StatsBusyHourCell[]
    total: number
  }
}

/** GET /admin/stats/commission */
export interface StatsCommission {
  range: StatsRange
  rules: {
    rates: Array<{ rate: number; categories: ServiceCategory[] }>
    freeBookings: number
  }
  commission: number
  collected: number
  bookings: number
  active: Array<{
    vendorId: string
    name: string
    bookings: number
    commission: number
    /** The day its 26th booking was made, when that was in the period. */
    activeSince: string | null
  }>
  free: Array<{ vendorId: string; name: string; used: number; left: number }>
}

/** The Funnel tab's booking type: every one, or one. */
export type StatsFunnelMode = 'all' | 'dropin' | 'doorstep' | 'pickup'

export type StatsFunnelStepKey = 'visits' | 'garage' | 'checkout' | 'slot' | 'pay' | 'paid'

/** GET /admin/stats/funnel — see apps/server/src/lib/analytics.ts. Rates are 0–1, or null. */
export interface StatsFunnelReport {
  range: StatsRange
  mode: StatsFunnelMode
  /** The IST day of the first usage event ever recorded; null before any. */
  eventsSince: string | null
  funnel: {
    steps: Array<{
      key: StatsFunnelStepKey
      label: string
      count: number
      ofPrevious: number | null
      ofVisits: number | null
    }>
    biggestDrop: { key: StatsFunnelStepKey; lost: number; ofPrevious: number | null } | null
  }
  /** Every category, most visits first. */
  categories: Array<{ category: ServiceCategory; visits: number }>
  /** The ten garages most looked at. */
  garages: Array<{
    vendorId: string
    /** Null for a garage deleted since. */
    name: string | null
    views: number
    bookings: number
    viewToBooking: number | null
  }>
  devices: Array<{ device: 'phone' | 'tablet' | 'desktop'; visits: number; share: number | null }>
  /** From bookings, every booking type. */
  returning: {
    customers: number
    windows: Array<{ days: number; eligible: number; returned: number; rate: number | null }>
  }
  weeks: Array<{ start: string; end: string; full: boolean; new: number; repeat: number }>
}

/** Statistics → Behaviour's Source filter (0061). */
export type StatsBehaviourSource = 'all' | 'instagram' | 'google' | 'direct' | 'other'

/** Statistics → Behaviour's Device filter. Desktop is 640px wide or more (tablets too). */
export type StatsBehaviourDevice = 'all' | 'phone' | 'desktop'

export type StatsBehaviourStepKey =
  | 'landed'
  | 'garageSeen'
  | 'area'
  | 'garage'
  | 'service'
  | 'booking'
  | 'number'
  | 'paid'

/**
 * GET /admin/stats/behaviour — see apps/server/src/lib/behaviour.ts.
 * Visits (one browser tab each) are the unit; rates are 0–1, or null.
 */
export interface StatsBehaviourReport {
  range: StatsRange
  source: StatsBehaviourSource
  device: StatsBehaviourDevice
  /** The IST day the first Behaviour step was recorded; null before any. */
  stepsSince: string | null
  /** Visits in the period and filters, the team's and Test ones left out. */
  visits: number
  leftOut: { team: number; test: number }
  funnel: {
    steps: Array<{
      key: StatsBehaviourStepKey
      label: string
      /** Null for a step nothing records yet. */
      count: number | null
      lost: number | null
      ofPrevious: number | null
      ofLanded: number | null
    }>
    biggestLeak: { key: StatsBehaviourStepKey; from: StatsBehaviourStepKey; lost: number } | null
  }
  lastSteps: {
    /** Visits that landed and did not pay. */
    leavers: number
    rows: Array<{ event: string; label: string; sessions: number; share: number | null }>
  }
}

export interface StatsBehaviourFilters {
  from: string
  to: string
  source: StatsBehaviourSource
  device: StatsBehaviourDevice
}

/** GET /admin/stats/behaviour?from&to&source&device */
export async function getStatsBehaviour(filters: StatsBehaviourFilters) {
  return apiClient<StatsBehaviourReport>('/admin/stats/behaviour', { params: { ...filters } })
}

/** GET /admin/stats/funnel?from&to&mode */
export async function getStatsFunnel(filters: { from: string; to: string; mode: StatsFunnelMode }) {
  return apiClient<StatsFunnelReport>('/admin/stats/funnel', { params: { ...filters } })
}

/** GET /admin/stats/overview?from&to&vendorId&compare */
export async function getStatsOverview(filters: StatsFilters & { compare: boolean }) {
  return apiClient<StatsOverview>('/admin/stats/overview', {
    params: { ...filters, compare: filters.compare ? 1 : 0 },
  })
}

/** GET /admin/stats/breakdown?from&to&vendorId */
export async function getStatsBreakdown(filters: StatsFilters) {
  return apiClient<StatsBreakdown>('/admin/stats/breakdown', { params: { ...filters } })
}

/** GET /admin/stats/commission?from&to&vendorId */
export async function getStatsCommission(filters: StatsFilters) {
  return apiClient<StatsCommission>('/admin/stats/commission', { params: { ...filters } })
}

export interface DemandSupplyCell {
  lat: number
  lng: number
  vendorCount: number
  bookingCount: number
  /** bookings − garages. Positive means demand this cell cannot serve locally. */
  gap: number
}

/** GET /admin/demand-supply */
export async function getDemandSupply() {
  return apiClient<DemandSupplyCell[]>('/admin/demand-supply')
}

/** POST /admin/vendors */
export async function createAdminVendor(input: CreateVendorInput) {
  return apiClient<AdminVendor>('/admin/vendors', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** GET /admin/vendors/:id — full detail for editing */
export async function getAdminVendor(id: string) {
  return apiClient<AdminVendorDetail>(`/admin/vendors/${id}`)
}

/** PATCH /admin/vendors/:id — update vendor details */
export async function updateAdminVendor(id: string, input: UpdateVendorInput) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/vendors/:id/verify */
export async function verifyAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/verify`, {
    method: 'PATCH',
  })
}

/** PATCH /admin/vendors/:id/archive — hide from customers, keep data */
export async function archiveAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/archive`, {
    method: 'PATCH',
  })
}

/** PATCH /admin/vendors/:id/unarchive — restore visibility */
export async function unarchiveAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/unarchive`, {
    method: 'PATCH',
  })
}

/** POST /admin/vendors/:id/pause — stop new bookings on the garage's behalf */
export async function pauseAdminVendor(id: string, reason?: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/pause`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  })
}

/** POST /admin/vendors/:id/resume */
export async function resumeAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/resume`, {
    method: 'POST',
  })
}

// ─── The Bin ─────────────────────────────────────────────────────────────────
//
// A garage being deleted goes to the Bin first: off the app for customers and
// for its team, with its bookings still to come cancelled by Detlio ("Garage
// removed"; a paid one becomes a refund owed). From the Bin it is restored as
// it was, or deleted forever. Every one of these writes is recorded with the
// name typed in the dialog.

/** A booking still to happen, which moving its garage to the Bin cancels. */
export interface AdminBinUpcomingBooking {
  id: string
  reference: string
  status: string
  scheduledAt: string
  amount: string
  customerName: string | null
  /** Paid: cancelling it makes a refund owed (Refunds page). */
  paid: boolean
}

/** The garage as the Bin's answers describe it. */
export interface AdminBinGarage {
  id: string
  businessName: string
  deletedAt: string | null
  deletedByName: string | null
  deletedReason: string | null
}

/** GET /admin/vendors/:id/bin-preview: what moving it to the Bin would cancel. */
export interface AdminVendorBinPreview {
  garage: AdminBinGarage
  inBin: boolean
  upcomingCount: number
  paidCount: number
  upcoming: AdminBinUpcomingBooking[]
}

/** POST /admin/vendors/:id/bin: what was done. */
export interface AdminVendorBinResult {
  garage: AdminBinGarage
  auditId: string
  cancelled: Array<{ id: string; reference: string; paid: boolean }>
  /** Cancelled bookings that were paid: each is a refund owed now. */
  refundsOwed: number
  /** Bookings that could not be cancelled (changed meanwhile): cancel them from their page. */
  notCancelled: Array<{ id: string; reference: string; message: string }>
}

/**
 * GET /admin/vendors/:id/delete-preview: what Delete forever would do now.
 * `hard_delete`: the garage goes entirely. `tombstone`: bookings with real
 * money are kept, and the garage's name and address with them, for their
 * receipts. `partial`: more bookings than one run deletes; it stays in the
 * Bin and Delete forever is pressed again.
 */
export interface AdminVendorDeletePreview {
  garage: AdminBinGarage
  inBin: boolean
  outcome: 'hard_delete' | 'tombstone' | 'partial'
  /** Customer bookings (one per reschedule chain): deleted, and kept for their money. */
  bookings: { deleted: number; kept: number }
  /** Checkouts that never became a booking. */
  checkouts: { deleted: number; kept: number }
  assets: {
    /** Logo and gallery photos. */
    photos: number
    servicePictures: number
    videos: number
    services: number
    teamLogins: number
    /** Garage documents (ID, bank proof…). Absent from older servers. */
    documents?: number
  }
  countLines: string[]
  receiptPlan: DataResetReceiptYear[]
  kept: Array<{
    kind: 'booking' | 'checkout'
    id: string
    reference: string
    moneyLabel: string
    label: string
    detail: string
  }>
  overCap: { chains: number; checkouts: number }
  selectionHash: string
}

export interface AdminVendorDeleteResult {
  garage: { id: string; businessName: string }
  outcome: AdminVendorDeletePreview['outcome']
  auditId: string
  countLines: string[]
  receiptPlan: DataResetReceiptYear[]
  keptBookings: number
  keptCheckouts: number
  remaining: { chains: number; checkouts: number }
}

export async function getAdminVendorBinPreview(id: string) {
  return apiClient<AdminVendorBinPreview>(`/admin/vendors/${id}/bin-preview`)
}

/** POST /admin/vendors/:id/bin */
export async function binAdminVendor(id: string, input: { reason?: string }) {
  return apiClient<AdminVendorBinResult>(`/admin/vendors/${id}/bin`, {
    method: 'POST',
    body: signedBody(input),
  })
}

/** POST /admin/vendors/:id/restore — back as it was, team access included. */
export async function restoreAdminVendor(id: string) {
  return apiClient<{ garage: AdminBinGarage; auditId: string }>(`/admin/vendors/${id}/restore`, {
    method: 'POST',
    body: signedBody({}),
  })
}

export async function getAdminVendorDeletePreview(id: string) {
  return apiClient<AdminVendorDeletePreview>(`/admin/vendors/${id}/delete-preview`)
}

/**
 * DELETE /admin/vendors/:id — delete forever, only for a garage in the Bin,
 * with its name typed out and the preview's fingerprint (409 PREVIEW_STALE
 * if anything moved since).
 */
export async function deleteAdminVendorForever(
  id: string,
  input: { confirmName: string; selectionHash: string }
) {
  return apiClient<AdminVendorDeleteResult>(`/admin/vendors/${id}`, {
    method: 'DELETE',
    body: signedBody(input),
  })
}

/**
 * GET /admin/vendors/:id/services/hidden — the garage's switched-off plain
 * services, which the editor (live services only) does not load.
 */
export async function listAdminHiddenServices(vendorId: string) {
  return apiClient<AdminService[]>(`/admin/vendors/${vendorId}/services/hidden`)
}

/**
 * PATCH /admin/vendors/:id/services/:serviceId/active — hide a service or show
 * it again, saved immediately. Hiding one that is inside a package is refused
 * (409 SERVICE_IN_PACKAGE).
 */
export async function setAdminServiceActive(
  vendorId: string,
  serviceId: string,
  isActive: boolean
) {
  return apiClient<AdminService>(
    `/admin/vendors/${vendorId}/services/${serviceId}/active`,
    { method: 'PATCH', body: JSON.stringify({ isActive }) }
  )
}

/**
 * DELETE /admin/vendors/:id/services/:serviceId — delete a service, live or
 * hidden, saved immediately. Past bookings keep it; it is listed nowhere
 * again. One inside a package is refused (409 SERVICE_IN_PACKAGE).
 */
export async function deleteAdminService(vendorId: string, serviceId: string) {
  return apiClient<AdminService>(
    `/admin/vendors/${vendorId}/services/${serviceId}`,
    { method: 'DELETE' }
  )
}

// ─── AI helpers ──────────────────────────────────────────────────────────────

/** Which AI helpers the API has switched on. All off without an OpenAI key. */
export interface AdminAiConfig {
  /** "Write with AI" for service descriptions. */
  describe: boolean
  /** "Make a picture with AI" for a service with no real photo. */
  pictures: boolean
  /**
   * Reading a poster, photo or PDF on Add garage. The Tally CSV import
   * needs no AI and is there either way. Absent from an API older than it.
   */
  import?: boolean
}

/** GET /admin/ai/config */
export async function getAdminAiConfig() {
  return apiClient<AdminAiConfig>('/admin/ai/config')
}

/**
 * What "Write with AI" is told about a service: the facts the garage page
 * shows and the garage's business name, never anything about a person.
 */
export interface DescribeServiceInput {
  name: string
  category: Exclude<ServiceCategory, 'package'>
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  durationMins?: number
  garageName?: string
  /**
   * 'points' (0064, the editor's Points mode): an intro line and "- "
   * points, kept in that shape. Left out is a paragraph; an API older than
   * this refuses the field (400).
   */
  format?: 'paragraph' | 'points'
}

/**
 * POST /admin/services/describe — a draft description for the form field.
 * Nothing is saved. 503 AI_UNAVAILABLE when OpenAI can't be reached (or no
 * key is set), 422 AI_NO_DESCRIPTION when no answer passed the copy rules.
 */
export async function describeAdminService(input: DescribeServiceInput) {
  return apiClient<{ description: string }>('/admin/services/describe', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ─── Garage import ───────────────────────────────────────────────────────────
//
// Add garage from a poster, photo, PDF or Tally file. The API reads the
// garage into a draft shaped like CreateVendorInput, with how sure it is of
// each field; the review screen fills the form from it, and the garage is
// created by createAdminVendor like any other — always as Pending.

/** sure: read cleanly · check: filled in, a person should look · missing: not found. */
export type ImportConfidence = 'sure' | 'check' | 'missing'

export interface ImportFieldNote {
  confidence: ImportConfidence
  reason?: string
}

export interface ImportDraftService {
  name: string
  description: string | null
  category: Exclude<ServiceCategory, 'package'>
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  price: number | null
  priceHatchback: number | null
  priceSedan: number | null
  priceSuv: number | null
  /** Never guessed: null when the document gives no time. */
  durationMins: number | null
}

export interface ImportDraft {
  businessName: string | null
  ownerName: string | null
  ownerPhone: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  yearsInOperation: string | null
  address: string | null
  city: string | null
  pincode: string | null
  mapsUrl: string | null
  dropinEnabled: boolean | null
  doorstepEnabled: boolean | null
  doorstepRadiusKm: number | null
  /** All seven days (0 = Sunday), HH:MM, or null when not found. */
  workingHours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }> | null
  vehicleTypes: string[]
  services: ImportDraftService[]
}

export interface ImportedGarage {
  /** What the pick list shows for a Tally row. */
  label: { businessName: string | null; ownerName: string | null; submittedAt: string | null }
  draft: ImportDraft
  /**
   * By path: `ownerPhone`, `bookingTypes`, `workingHours`,
   * `services.2.price`, `services.2.category`… Every garage-level field has
   * one.
   */
  fields: Record<string, ImportFieldNote>
}

export type GarageImportInput =
  | {
      source: 'files'
      /** Up to 5; photos already shrunk to 2000 px. About 3 MB in all. */
      files: Array<{
        name: string
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
        dataBase64: string
      }>
    }
  | { source: 'tally_csv'; csv: string }

/**
 * POST /admin/vendor-imports/extract — the garage(s) in the files: one from
 * photos and PDFs, one per row from a Tally file. Nothing is saved and the
 * files are not stored. 503 AI_UNAVAILABLE (AI off, or OpenAI not
 * answering), 422 IMPORT_UNREADABLE, 413 IMPORT_TOO_LARGE.
 */
export async function extractGarageImport(input: GarageImportInput) {
  return apiClient<{ garages: ImportedGarage[] }>('/admin/vendor-imports/extract', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface OwnerAccount {
  name: string
  isCustomer: boolean
  garages: Array<{ id: string; businessName: string; status: string }>
}

/**
 * POST /admin/vendor-imports/owner-account — who a 10-digit owner phone
 * already belongs to; Create attaches the garage to that account. A POST
 * so the number stays out of the URL, and so out of request logs.
 */
export async function getOwnerAccount(phone: string) {
  return apiClient<{ account: OwnerAccount | null }>('/admin/vendor-imports/owner-account', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

// ─── Media ───────────────────────────────────────────────────────────────────
//
// Presign → PUT straight to R2 → register the public URL, the same three steps
// the vendor panel uses. The admin variants name the vendor (or service)
// instead of resolving it from an owner token.

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

async function putToR2(uploadUrl: string, file: Blob) {
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }
}

/** Upload and set a garage logo. Returns the updated vendor row. */
export async function uploadAdminVendorLogo(vendorId: string, file: File) {
  // Presigned for the cleaned file's type, which is always the type picked.
  const clean = await stripImageMetadata(file)
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/vendors/${vendorId}/logo/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: clean.type as UploadContentType }),
  })

  await putToR2(uploadUrl, clean)

  return apiClient<{ logoUrl: string | null }>(
    `/admin/vendors/${vendorId}/logo`,
    { method: 'PUT', body: JSON.stringify({ url: publicUrl }) }
  )
}

/** DELETE /admin/vendors/:id/logo */
export async function deleteAdminVendorLogo(vendorId: string) {
  return apiClient<{ logoUrl: string | null }>(
    `/admin/vendors/${vendorId}/logo`,
    { method: 'DELETE' }
  )
}

/** Upload and register one gallery photo. Returns the created row. */
export async function uploadAdminVendorPhoto(vendorId: string, file: File) {
  // Presigned for the cleaned file's type, which is always the type picked.
  const clean = await stripImageMetadata(file)
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/vendors/${vendorId}/photos/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: clean.type as UploadContentType }),
  })

  await putToR2(uploadUrl, clean)

  return apiClient<AdminPhoto>(`/admin/vendors/${vendorId}/photos`, {
    method: 'POST',
    body: JSON.stringify({ url: publicUrl }),
  })
}

/** DELETE /admin/vendors/:id/photos/:photoId */
export async function deleteAdminVendorPhoto(
  vendorId: string,
  photoId: string
) {
  return apiClient<AdminPhoto>(
    `/admin/vendors/${vendorId}/photos/${photoId}`,
    { method: 'DELETE' }
  )
}

// Service photos and video: adminMediaApi in @repo/core/api/service-media,
// shared with the garage's app.

/** GET /admin/bookings — one page, newest scheduled first. */
export async function listAdminBookings(filters: AdminBookingFilters = {}) {
  return apiClient<AdminBooking[]>('/admin/bookings', {
    params: {
      q: filters.q || undefined,
      status: filters.status || undefined,
      vendorId: filters.vendorId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      test: filters.test || undefined,
      limit: filters.limit,
      page: filters.page,
      cursor: filters.cursor,
      view: filters.view || undefined,
      bookingType: filters.bookingType || undefined,
      payment: filters.payment || undefined,
    },
  })
}

/** GET /admin/bookings/views — 404 from an API older than 0059: show the views without counts. */
export async function getAdminBookingViewCounts(
  filters: AdminBookingViewCountFilters = {}
) {
  return apiClient<AdminBookingViewCounts>('/admin/bookings/views', {
    params: {
      q: filters.q || undefined,
      status: filters.status || undefined,
      vendorId: filters.vendorId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      test: filters.test || undefined,
      bookingType: filters.bookingType || undefined,
      payment: filters.payment || undefined,
    },
  })
}

/** GET /admin/bookings/:id */
export async function getAdminBooking(id: string) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}`)
}

/** POST /admin/bookings/:id/cancel — returns the updated booking. */
export async function cancelAdminBooking(
  id: string,
  input: { onBehalfOf: CancelledOnBehalfOf; reason: string }
) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/bookings/:id/no-show — returns the updated booking. Refused with
 * 400 NO_SHOW_TOO_EARLY before the start time.
 */
export async function markAdminBookingNoShow(
  id: string,
  input: { party: BookingParty; note?: string }
) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/no-show`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/bookings/:id/pickup-step — Detlio confirms Picked up or
 * Delivered (which completes the job) for a customer who cannot give the
 * code, with why. Refused out of the job's order like the garage's steps.
 */
export async function overrideAdminPickupStep(
  id: string,
  input: { step: 'picked_up' | 'delivered'; note: string }
) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/pickup-step`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/bookings/:id/photos-waiver — Detlio waives the photo standard
 * on one booking (0045), with why; signed with the admin's name. Once only.
 */
export async function waiveAdminJobPhotos(id: string, input: { reason: string }) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/photos-waiver`, {
    method: 'POST',
    body: signedBody(input),
  })
}

/** GET /admin/refunds?status=owed|done — owed oldest first, done newest first. */
export async function listAdminRefunds(status: 'owed' | 'done') {
  return apiClient<AdminRefund[]>('/admin/refunds', { params: { status } })
}

/**
 * POST /admin/refunds — records a refund done in Razorpay (or outside it).
 * 409 ALREADY_REFUNDED once nothing is left, 409 REFUND_STATE_CHANGED when
 * a refund was recorded since `expectedRefunded` (someone else's, or this
 * one on an earlier try), 409 REFUND_REF_USED for a refund id already
 * recorded, 400 REFUND_TOO_MUCH above what is owed.
 */
export async function recordAdminRefund(input: RecordRefundInput) {
  return apiClient<AdminRefund>('/admin/refunds', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/refunds/send — Refund now: sends the refund through Razorpay
 * and records it. It checks Razorpay first, so a refund already done in the
 * dashboard is recorded rather than sent again. 409 REFUND_BUSY while
 * another refund of the payment is under way, 409 REFUND_STATE_CHANGED when
 * the figures moved, 400 REFUND_TOO_MUCH above what is owed, 502
 * RAZORPAY_REFUND_FAILED when Razorpay refuses it, 503 when Razorpay can't
 * be reached or didn't answer (pressing again never sends twice).
 */
export async function sendAdminRefund(input: RefundNowInput) {
  return apiClient<AdminRefund>('/admin/refunds/send', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST (mark) or DELETE (unmark) /admin/bookings/:id/mark-test — the whole
 * reschedule chain, with a note. Returns the updated booking.
 */
export async function setAdminBookingTestMark(id: string, marked: boolean) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/mark-test`, {
    method: marked ? 'POST' : 'DELETE',
  })
}

// ─── Start pilot clean (the test-data reset) ─────────────────────────────────
//
// Behind ADMIN_DATA_RESET on the API: while it is off every route is a 404,
// which is how the panel knows to hide it. See
// apps/server/src/lib/data-reset.ts for the rules.

export interface DataResetConfig {
  enabled: boolean
  /** The Razorpay keys the API holds, which decides what a check can tell. */
  keyMode: 'live' | 'test' | 'fake' | 'none'
  maxChainsPerRun: number
  maxCheckoutsPerRun: number
  /** The server's clock, ISO: the default cutoff. */
  now: string
}

export type DataResetScope =
  | { kind: 'before_cutoff'; cutoff: string }
  | { kind: 'marked_test' }
  | { kind: 'chains'; bookingIds: string[] }

export type DataResetMoney =
  | 'live'
  | 'cash'
  | 'unknown'
  | 'unchecked'
  | 'test'
  | 'fake'
  | 'no_money'

/** Why a row is kept whatever is ticked. */
export interface DataResetKept {
  code: string
  /** "Real payment — kept". */
  label: string
  detail: string
}

/** One customer booking (a reschedule chain) in the dry run. */
export interface DataResetChain {
  rootId: string
  reference: string
  bookingIds: string[]
  createdAt: string
  scheduledAt: string
  status: string
  garage: { id: string; name: string }
  customer: { id: string; name: string; phone: string | null }
  amount: string
  paymentStatus: string | null
  razorpayIds: string[]
  money: DataResetMoney
  moneyLabel: string
  receiptNumber: string | null
  refunded: string
  markedTest: boolean
  kept: DataResetKept | null
  selected: boolean
}

/** A checkout that never became a booking, in the dry run. */
export interface DataResetCheckout {
  id: string
  reference: string
  createdAt: string
  status: string
  customer: { id: string; name: string }
  garageName: string
  amount: string
  paymentRef: string | null
  money: DataResetMoney
  moneyLabel: string
  refunded: string
  kept: DataResetKept | null
  selected: boolean
}

export interface DataResetCounts {
  bookings: number
  bookingRows: number
  bookingItems: number
  payments: number
  finalBills: number
  refundRecords: number
  photos: number
  notes: number
  reviews: number
  promoUses: number
  reschedules: number
  checkouts: number
  checkoutItems: number
  receiptNumbers: number
  /** Customer complaints made before the cutoff. */
  complaints: number
  /** Usage events recorded before the cutoff (absent from older servers). */
  analyticsEvents?: number
  /** Garage payouts that paid only deleted bookings (absent from older servers). */
  payouts?: number
}

export interface DataResetReceiptYear {
  financialYear: string
  mode: 'restart' | 'void'
  numbers: string[]
  nextNumber: string
  voidsCleared: number
  /** "Numbering restarts at DTL/26-27/000001". */
  words: string
}

export interface DataResetPreview {
  scope: { kind: DataResetScope['kind']; cutoff?: string; bookingIds?: string[] }
  generatedAt: string
  chains: DataResetChain[]
  checkouts: DataResetCheckout[]
  /**
   * A cutoff run's complaints made before the cutoff, as one row with one
   * tick. `count` 0 (and no row) in any other scope.
   */
  complaints: {
    count: number
    firstNumber: string | null
    lastNumber: string | null
    selected: boolean
  }
  /**
   * A cutoff run's usage events recorded before the cutoff, as one row with
   * one tick. Absent from older servers; `count` 0 in any other scope.
   */
  analyticsEvents?: { count: number; selected: boolean }
  counts: DataResetCounts
  /** The counts in plain words, zeros left out. */
  countLines: string[]
  receiptPlan: DataResetReceiptYear[]
  /** Deletable rows left unticked because the run is over its cap. */
  overCap: { chains: number; checkouts: number }
  /** What to type: "DELETE 143 BOOKINGS". */
  confirmPhrase: string
  selectionHash: string
  lookups: {
    keyMode: DataResetConfig['keyMode']
    checkedNow: number
    /** Old payments still to check with Razorpay; call again until 0. */
    remaining: number
    /** Send back on the next call: Razorpay could not answer for these. */
    unknownIds: string[]
  }
}

export interface DataResetPreviewInput {
  scope: DataResetScope
  /**
   * The ticked rows; leave out on the first look to tick everything
   * deletable. `complaints` is the one tick for a cutoff run's complaints,
   * `analytics` for its usage events.
   */
  only?: { chainIds: string[]; checkoutIds: string[]; complaints?: boolean; analytics?: boolean }
  unknownIds?: string[]
}

export interface DataResetExecuteInput extends DataResetPreviewInput {
  selectionHash: string
  confirmText: string
  backupConfirmed: true
}

export interface DataResetResult {
  auditId: string
  at: string
  by: string
  counts: DataResetCounts
  countLines: string[]
  receiptPlan: DataResetReceiptYear[]
  photosRemoved: number
}

/** GET /admin/data-reset/config — 404 while the reset is switched off. */
export async function getDataResetConfig() {
  return apiClient<DataResetConfig>('/admin/data-reset/config')
}

/** POST /admin/data-reset/preview — the dry run. Deletes nothing. */
export async function previewDataReset(input: DataResetPreviewInput) {
  return apiClient<DataResetPreview>('/admin/data-reset/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/data-reset/execute — 409 PREVIEW_STALE when anything moved
 * since the dry run, 400 CONFIRM_PHRASE_MISMATCH for a wrong phrase, 503
 * RESET_BUSY when a row was busy. Nothing is deleted on any of them.
 */
export async function executeDataReset(input: DataResetExecuteInput) {
  return apiClient<DataResetResult>('/admin/data-reset/execute', {
    method: 'POST',
    body: signedBody(input),
  })
}

/**
 * POST /admin/bookings/:id/test-delete/preview — the dry run for deleting
 * one test booking with its whole chain (0064). Works with the reset
 * switched off. 404 when there is no such booking.
 */
export async function previewTestBookingDelete(bookingId: string, input: { unknownIds?: string[] }) {
  return apiClient<DataResetPreview>(`/admin/bookings/${bookingId}/test-delete/preview`, {
    method: 'POST',
    body: JSON.stringify({ unknownIds: input.unknownIds ?? [] }),
  })
}

/**
 * POST /admin/bookings/:id/test-delete — deletes it. 409 TEST_BOOKING_KEPT
 * (with the reason) when it is not marked Test or real money is on it, 409
 * PREVIEW_STALE when it changed since the dry run, 400
 * CONFIRM_PHRASE_MISMATCH for a wrong phrase.
 */
export async function deleteTestBooking(
  bookingId: string,
  input: { unknownIds: string[]; selectionHash: string; confirmText: string }
) {
  return apiClient<DataResetResult>(`/admin/bookings/${bookingId}/test-delete`, {
    method: 'POST',
    body: signedBody(input),
  })
}

/** POST /admin/bookings/:id/notes */
export async function addAdminBookingNote(id: string, body: string) {
  return apiClient<AdminBookingNote>(`/admin/bookings/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

// ─── Discounts ───────────────────────────────────────────────────────────────
//
// Mounted under /admin/* because the admin session cookie is scoped to
// path=/api/v1/admin — a discount route anywhere else never receives it.

export type DiscountType = 'percentage' | 'fixed'
export type DiscountFundedBy = 'platform' | 'vendor'

/** Who sees an offer on Home, as the server lists them (HOME_AUDIENCES). */
export type HomeAudience =
  | 'everyone'
  | 'new_customers'
  | 'booked_this_garage'
  | 'near_this_garage'
  | 'wash_due'
  | 'car_type'

/** 0 Normal, 1 High, 2 Top. */
export type HomePriority = 0 | 1 | 2

export type HomeCarType = 'hatchback' | 'sedan' | 'suv'

/** GET /admin/discounts/home-config: what the Show on Home section offers. */
export interface HomeConfig {
  /** HOME_OFFER_TARGETING: false means only "Everyone" can be saved. */
  targetingEnabled: boolean
  /** Shown under the audiences while targeting is off; null when on. */
  targetingNote: string | null
  maxOffersOnHome: number
  priorities: { value: HomePriority; label: string }[]
  audiences: { value: HomeAudience; label: string; enabled: boolean }[]
  defaultNearRadiusKm: number
  maxNearRadiusKm: number
}

/** GET /admin/discounts/home-reach: "Estimated reach" for unsaved settings. */
export interface HomeReach {
  count: number
  /** Null for a Detlio-wide code; false when the garage is not live, so nobody sees it. */
  garagePublic: boolean | null
  /** "Near this garage" is counted from saved addresses, not live location. */
  measuredFrom: 'saved_addresses' | null
}

export interface HomeReachParams {
  audience: HomeAudience
  vendorId?: string
  radiusKm?: number
  vehicleTypes?: HomeCarType[]
}

export interface AdminDiscount {
  id: string
  code: string
  description: string | null
  discountType: DiscountType
  /** Decimal strings as stored; null when the other effect applies. */
  percentOff: string | null
  amountOff: string | null
  maxDiscountAmount: string | null
  minOrderAmount: string | null
  perUserLimit: number | null
  totalUsageLimit: number | null
  vendorId: string | null
  vendorName: string | null
  fundedBy: DiscountFundedBy
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  /** Shown as a card on the customer's Home while live (0031). */
  showOnHome: boolean
  /** The card's title; required (3–60) while shown. */
  homeTitle: string | null
  homePriority: HomePriority
  /** Who sees the card. Display only: never who may use the code. */
  homeAudience: HomeAudience
  /** "Near this garage" only. */
  homeAudienceRadiusKm: number | null
  /** "By car type" only. */
  homeAudienceVehicleTypes: HomeCarType[] | null
  createdAt: string
  /** Audit rows — any at all blocks deletion. */
  redemptionCount: number
  /** Live uses, paid or not — this is what the usage limits compare against. */
  heldCount: number
  /** Uses whose money actually landed. */
  realizedCount: number
  /** Rupees saved, realized only. */
  totalSaved: string
}

/** Numbers here are plain units: 20 = 20%, 500 = ₹500. Null = unlimited/none. */
export interface DiscountInput {
  code: string
  description?: string | null
  discountType: DiscountType
  percentOff?: number
  amountOff?: number
  maxDiscountAmount?: number | null
  minOrderAmount?: number | null
  perUserLimit?: number | null
  totalUsageLimit?: number | null
  vendorId?: string | null
  fundedBy: DiscountFundedBy
  startsAt?: string | null
  endsAt?: string | null
  isActive: boolean
  showOnHome?: boolean
  homeTitle?: string | null
  homePriority?: HomePriority
  homeAudience?: HomeAudience
  homeAudienceRadiusKm?: number | null
  homeAudienceVehicleTypes?: HomeCarType[] | null
}

export interface DiscountVendorOption {
  id: string
  businessName: string
}

/** GET /admin/discounts */
export async function listAdminDiscounts(params?: {
  q?: string
  active?: boolean
}): Promise<AdminDiscount[]> {
  return apiClient<AdminDiscount[]>('/admin/discounts', {
    params: {
      q: params?.q || undefined,
      active: params?.active === undefined ? undefined : String(params.active),
    },
  })
}

/** GET /admin/discounts/:id */
export async function getAdminDiscount(id: string): Promise<AdminDiscount> {
  return apiClient<AdminDiscount>(`/admin/discounts/${id}`)
}

/** POST /admin/discounts */
export async function createAdminDiscount(
  input: DiscountInput
): Promise<AdminDiscount> {
  return apiClient<AdminDiscount>('/admin/discounts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/discounts/:id — also the activate/deactivate path. */
export async function updateAdminDiscount(
  id: string,
  input: Partial<DiscountInput>
): Promise<AdminDiscount> {
  return apiClient<AdminDiscount>(`/admin/discounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** DELETE /admin/discounts/:id — 409 DISCOUNT_IN_USE once redeemed. */
export async function deleteAdminDiscount(id: string): Promise<void> {
  await apiClient(`/admin/discounts/${id}`, { method: 'DELETE' })
}

/** GET /admin/discounts/vendors — the garage picker for vendor-scoped codes. */
export async function listDiscountVendorOptions(): Promise<
  DiscountVendorOption[]
> {
  return apiClient<DiscountVendorOption[]>('/admin/discounts/vendors')
}

/** GET /admin/discounts/home-config */
export async function getDiscountHomeConfig(): Promise<HomeConfig> {
  return apiClient<HomeConfig>('/admin/discounts/home-config')
}

/**
 * GET /admin/discounts/home-reach — 409 TARGETING_DISABLED for a targeted
 * audience while targeting is off, as a save would be.
 */
export async function getDiscountHomeReach(
  params: HomeReachParams
): Promise<HomeReach> {
  return apiClient<HomeReach>('/admin/discounts/home-reach', {
    params: {
      audience: params.audience,
      vendorId: params.vendorId || undefined,
      radiusKm: params.radiusKm,
      vehicleTypes: params.vehicleTypes?.length
        ? params.vehicleTypes.join(',')
        : undefined,
    },
  })
}

// ─── Complaints ──────────────────────────────────────────────────────────────
//
// Customers' complaints with their numbers and the clock: acknowledge within
// 24 hours, resolve within 7 days (packages/core/src/complaints.ts). Mounted
// under /admin for the session cookie, like notices.

export type AdminComplaintFilter = 'open' | 'overdue' | 'resolved' | 'all'

export interface AdminComplaint {
  id: string
  /** "C-000123". */
  number: string
  status: ComplaintStatus
  category: ComplaintCategory
  message: string
  customer: {
    /**
     * Null once the account is deleted, or for a logged complaint whose
     * phone had no account; name and phone are as they were.
     */
    id: string | null
    name: string
    phone: string
    accountDeleted: boolean
  }
  /** The booking it came from, if any. `id` is null once the booking itself is gone. */
  booking: {
    id: string | null
    reference: string
    scheduledAt: string | null
    status: string | null
  } | null
  garage: { id: string | null; name: string } | null
  /** What the customer reads, once resolved or closed. */
  resolutionNote: string | null
  /** The team's own note; never shown to the customer. */
  adminNote: string | null
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  closedAt: string | null
  closedBy: string | null
  /** 'app' when the customer raised it; otherwise how the team heard it. */
  source: ComplaintSource
  /** Who in the team logged it (the signed-in admin's name); null for 'app'. */
  loggedBy: string | null
  /** When Detlio received it: the clock runs from here. */
  receivedAt: string
  /** When the row was written (the same moment, for an app complaint). */
  createdAt: string
  updatedAt: string
  acknowledgeBy: string
  resolveBy: string
  /** Which promise it has missed, as of the server's clock when read. */
  overdue: 'acknowledge' | 'resolve' | null
}

export interface AdminComplaintList {
  complaints: AdminComplaint[]
  counts: Record<AdminComplaintFilter, number>
  /** The server's clock when the list was read. */
  now: string
}

/** GET /admin/complaints?show= */
export async function listAdminComplaints(show: AdminComplaintFilter): Promise<AdminComplaintList> {
  return apiClient<AdminComplaintList>('/admin/complaints', { params: { show } })
}

/** What the team types to log a complaint that came by phone, WhatsApp, email or in person. */
export interface LogComplaintInput {
  /** Ten digits, or any way of writing them (+91, spaces). */
  phone: string
  /** Used only when no account has this phone. */
  customerName?: string
  source: LoggedComplaintSource
  category: ComplaintCategory
  message: string
  /** The booking's 8-character reference, with or without #. */
  bookingRef?: string
  /** When Detlio received it (ISO); up to 7 days back. Left out, now. */
  receivedAt?: string
}

/** POST /admin/complaints — answers with the complaint as admin sees it. */
export async function logAdminComplaint(input: LogComplaintInput): Promise<AdminComplaint> {
  return apiClient<AdminComplaint>('/admin/complaints', {
    method: 'POST',
    body: signedBody(input, 'loggedBy'),
  })
}

/** What the log form's look-ups found. A key is absent when it was not asked. */
export interface ComplaintLookup {
  /** The account with this phone (its name only), or null when there is none. */
  customer?: { name: string } | null
  booking?:
    | { found: true; reference: string; garageName: string | null; scheduledAt: string; status: string }
    | { found: false; refusal: 'not_found' | 'not_theirs' | 'ambiguous' }
    | null
}

/** GET /admin/complaints/lookup?phone=&bookingRef= */
export async function lookupForComplaint(params: { phone?: string; bookingRef?: string }): Promise<ComplaintLookup> {
  const query: Record<string, string> = {}
  if (params.phone) query.phone = params.phone
  if (params.bookingRef) query.bookingRef = params.bookingRef
  return apiClient<ComplaintLookup>('/admin/complaints/lookup', { params: query })
}

/** GET /admin/complaints/:id */
export async function getAdminComplaint(id: string): Promise<AdminComplaint> {
  return apiClient<AdminComplaint>(`/admin/complaints/${id}`)
}

/** POST /admin/complaints/:id/acknowledge */
export async function acknowledgeAdminComplaint(id: string): Promise<AdminComplaint> {
  return apiClient<AdminComplaint>(`/admin/complaints/${id}/acknowledge`, { method: 'POST' })
}

/** POST /admin/complaints/:id/resolve — the note is what the customer reads. */
export async function resolveAdminComplaint(id: string, resolutionNote: string): Promise<AdminComplaint> {
  return apiClient<AdminComplaint>(`/admin/complaints/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolutionNote }),
  })
}

/** POST /admin/complaints/:id/close — optionally saying why, to the customer. */
export async function closeAdminComplaint(id: string, resolutionNote?: string): Promise<AdminComplaint> {
  return apiClient<AdminComplaint>(`/admin/complaints/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(resolutionNote ? { resolutionNote } : {}),
  })
}

/** PUT /admin/complaints/:id/note — the team's own note; empty clears it. */
export async function setAdminComplaintNote(id: string, adminNote: string): Promise<AdminComplaint> {
  return apiClient<AdminComplaint>(`/admin/complaints/${id}/note`, {
    method: 'PUT',
    body: JSON.stringify({ adminNote }),
  })
}

// ─── Notices ─────────────────────────────────────────────────────────────────
//
// Team messages on the customer's Home and in Updates. Under /admin/* for the
// cookie, like discounts. There is no delete: a notice is ended, and kept.

export type NoticeAudience = 'all' | 'with_booking_between'
export type NoticeState = 'scheduled' | 'live' | 'ended'

export interface AdminNotice {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  audience: NoticeAudience
  /** Booking-window notices only, and optional there. */
  vendorId: string | null
  vendorName: string | null
  bookingFrom: string | null
  bookingTo: string | null
  startsAt: string
  endsAt: string
  isActive: boolean
  /** Worked out by the server at read time. */
  state: NoticeState
  /** How many customers closed it with ×. */
  dismissals: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface NoticeInput {
  title: string
  body: string
  linkUrl?: string | null
  linkLabel?: string | null
  audience: NoticeAudience
  vendorId?: string | null
  bookingFrom?: string | null
  bookingTo?: string | null
  /** Absent on create = now. */
  startsAt?: string
  endsAt: string
  isActive: boolean
}

export interface NoticeAudienceParams {
  audience: NoticeAudience
  vendorId?: string
  bookingFrom?: string
  bookingTo?: string
}

/** GET /admin/notices — newest first; optionally one state. */
export async function listAdminNotices(
  status?: NoticeState
): Promise<AdminNotice[]> {
  return apiClient<AdminNotice[]>('/admin/notices', { params: { status } })
}

/** GET /admin/notices/:id */
export async function getAdminNotice(id: string): Promise<AdminNotice> {
  return apiClient<AdminNotice>(`/admin/notices/${id}`)
}

/** POST /admin/notices */
export async function createAdminNotice(
  input: NoticeInput
): Promise<AdminNotice> {
  return apiClient<AdminNotice>('/admin/notices', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/notices/:id */
export async function updateAdminNotice(
  id: string,
  input: Partial<NoticeInput>
): Promise<AdminNotice> {
  return apiClient<AdminNotice>(`/admin/notices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/notices/:id/end — "End now": a live notice ends at this
 * moment, a scheduled one is switched off.
 */
export async function endAdminNotice(id: string): Promise<AdminNotice> {
  return apiClient<AdminNotice>(`/admin/notices/${id}/end`, { method: 'POST' })
}

/** GET /admin/notices/audience-count — "Reaches 14 customers". */
export async function getNoticeAudienceCount(
  params: NoticeAudienceParams
): Promise<{ count: number }> {
  return apiClient<{ count: number }>('/admin/notices/audience-count', {
    params: {
      audience: params.audience,
      vendorId: params.vendorId || undefined,
      bookingFrom: params.bookingFrom,
      bookingTo: params.bookingTo,
    },
  })
}

// ─── Vendor team ─────────────────────────────────────────────────────────────
//
// The admin panel edits a *named* vendor's team, so these take an explicit
// vendorId — unlike the vendor-facing `/lib/api/members`, where the company is
// whichever one the caller is acting as. Same service behind both, so the
// owner-immutability rules are identical.

/** GET /admin/vendors/:id/members */
export async function listAdminVendorMembers(
  vendorId: string
): Promise<ApiMember[]> {
  return apiClient<ApiMember[]>(`/admin/vendors/${vendorId}/members`)
}

/** POST /admin/vendors/:id/members */
export async function addAdminVendorMember(
  vendorId: string,
  input: { phone: string; name?: string; role: VendorRole }
): Promise<void> {
  await apiClient(`/admin/vendors/${vendorId}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/vendors/:id/members/:memberId */
export async function updateAdminVendorMember(
  vendorId: string,
  memberId: string,
  input: { role?: VendorRole; status?: 'active' | 'suspended' }
): Promise<void> {
  await apiClient(`/admin/vendors/${vendorId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** DELETE /admin/vendors/:id/members/:memberId */
export async function removeAdminVendorMember(
  vendorId: string,
  memberId: string
): Promise<void> {
  await apiClient(`/admin/vendors/${vendorId}/members/${memberId}`, {
    method: 'DELETE',
  })
}

// ─── Garage payouts (0038) ───────────────────────────────────────────────────

/** Where a booking stands with Detlio (lib/payouts.ts BalanceStatus). */
export type PayoutLineStatus = 'due' | 'owed_back' | 'paid' | 'nothing_due'

export type PayoutMethod = 'bank' | 'upi' | 'other'

/**
 * One booking on a garage's statement. Shared by the garage's Earnings and
 * admin's Payouts; the customer is a first name only. Rupees.
 */
export interface PayoutLine {
  bookingId: string
  reference: string
  /** When it became payable: the job completed, or the no-show recorded. */
  payableFrom: string
  scheduledAt: string | null
  customerFirstName: string
  services: string[]
  bookingType: string | null
  /** 'job', 'customer_no_show', or null when it earns nothing any more (money owed back). */
  kind: 'job' | 'customer_no_show' | null
  price: number
  /** A promo Detlio paid for: Detlio's cost. */
  detlioPromo: number
  /** A promo the garage funded: comes off its share. */
  garagePromo: number
  /** The garage's part of refunds. */
  refunds: number
  commission: {
    /** 0.08, 0.05; empty inside the free 25. */
    rates: number[]
    amount: number
    /** Its place in the garage's first 25, or null. */
    freePosition: number | null
    freeOf: number
  }
  share: number
  /** Cash the garage collected itself. */
  heldByGarage: number
  /** What Detlio owes on it in all; what was paid; what is still to settle. */
  due: number
  paid: number
  balance: number
  status: PayoutLineStatus
  payouts: Array<{ payoutId: string; reference: string; paidAt: string; amount: number }>
}

export interface PayoutBalance {
  /** Net owed to the garage now; negative when the garage owes Detlio. */
  balanceDue: number
  bookingsDue: number
  oldestUnpaidAt: string | null
  /** Unpaid past the 24-hour cycle. */
  overdue: boolean
}

export interface PayoutGarage {
  id: string
  name: string
  inBin: boolean
  /** Deleted forever, kept for its money. */
  deleted: boolean
}

export interface AdminPayoutsList {
  cycleHours: number
  totals: { garagesDue: number; totalDue: number; overdueGarages: number; oldestUnpaidAt: string | null }
  garages: Array<
    PayoutBalance & {
      garage: PayoutGarage
      lastPayout: { amount: number; paidAt: string } | null
      account: { method: 'bank' | 'upi'; masked: string } | null
    }
  >
}

export interface AdminPayout {
  id: string
  amount: number
  method: PayoutMethod
  reference: string
  paidAt: string
  coversFrom: string
  coversUpTo: string
  note: string | null
  recordedBy: string
  recordedAt: string
  items: Array<{
    bookingId: string
    reference: string
    kind: 'job' | 'customer_no_show' | 'none'
    payableFrom: string
    price: number
    detlioPromo: number
    garagePromo: number
    refunds: number
    commission: number
    freePosition: number | null
    share: number
    heldByGarage: number
    amount: number
  }>
}

/** A garage's payout details, in full: admin only. */
export interface PayoutAccount {
  accountName: string | null
  accountNumber: string | null
  ifsc: string | null
  upiId: string | null
  updatedBy: string
  updatedAt: string
}

export interface AdminGaragePayouts {
  garage: PayoutGarage
  cycleHours: number
  /** The moment the figures were worked out at: Record payout sends it back. */
  upTo: string
  summary: PayoutBalance
  freeBookings: { used: number; of: number }
  /** What Record payout would pay now, or why it can't. */
  payable: { amount: number; bookings: number; refusal: 'nothing_due' | 'owed_back' | null }
  /** The bookings it would settle. */
  due: PayoutLine[]
  /** Every booking on the statement. */
  lines: PayoutLine[]
  payouts: AdminPayout[]
  account: PayoutAccount | null
}

export interface RecordPayoutInput {
  amount: number
  upTo: string
  method: PayoutMethod
  reference: string
  paidAt: string
  note?: string
}

export interface PayoutAccountInput {
  accountName: string | null
  accountNumber: string | null
  ifsc: string | null
  upiId: string | null
}

/** GET /admin/payouts */
export async function listAdminPayouts(): Promise<AdminPayoutsList> {
  return apiClient<AdminPayoutsList>('/admin/payouts')
}

/** GET /admin/payouts/vendors/:id */
export async function getAdminGaragePayouts(vendorId: string): Promise<AdminGaragePayouts> {
  return apiClient<AdminGaragePayouts>(`/admin/payouts/vendors/${vendorId}`)
}

/** POST /admin/payouts/vendors/:id — settles every booking payable by `upTo`. */
export async function recordAdminPayout(vendorId: string, input: RecordPayoutInput): Promise<AdminPayout> {
  return apiClient<AdminPayout>(`/admin/payouts/vendors/${vendorId}`, {
    method: 'POST',
    body: signedBody(input),
  })
}

/** GET /admin/payouts/vendors/:id/account — null when none are saved. */
export async function getAdminPayoutAccount(vendorId: string): Promise<PayoutAccount | null> {
  return apiClient<PayoutAccount | null>(`/admin/payouts/vendors/${vendorId}/account`)
}

/** PUT /admin/payouts/vendors/:id/account */
export async function saveAdminPayoutAccount(vendorId: string, input: PayoutAccountInput): Promise<PayoutAccount> {
  return apiClient<PayoutAccount>(`/admin/payouts/vendors/${vendorId}/account`, {
    method: 'PUT',
    body: signedBody(input),
  })
}

/** DELETE /admin/payouts/vendors/:id/account */
export async function removeAdminPayoutAccount(vendorId: string): Promise<void> {
  await apiClient(`/admin/payouts/vendors/${vendorId}/account`, { method: 'DELETE' })
}

// ─── Alerts (Telegram) ───────────────────────────────────────────────────────

/** Whether the team's Telegram alerts are set up; never the token or the chat. */
export interface TelegramAlertStatus {
  /** TELEGRAM_BOT_TOKEN and TELEGRAM_OPS_CHAT_ID are both set on the API. */
  configured: boolean
  /** Booking alerts go out from this deployment (Production only). */
  liveHere: boolean
}

/** GET /admin/alerts/telegram */
export async function getTelegramAlertStatus() {
  return apiClient<TelegramAlertStatus>('/admin/alerts/telegram')
}

/**
 * POST /admin/alerts/telegram/test: posts "✅ Detlio test alert from <name>"
 * to the team's chat, whatever the Production-only rule says. Rate limited.
 */
export async function sendTelegramTestAlert() {
  return apiClient<{ sent: boolean; sentAt: string }>('/admin/alerts/telegram/test', {
    method: 'POST',
    body: signedBody({}),
  })
}
