import { apiClient } from './client'
import type { ApiMember } from './members'
import type { VendorRole } from './types'
import type { ServiceCategory, ServiceMedia } from '@repo/core/types'
import type { ComplaintCategory, ComplaintStatus } from '@repo/core/complaints'

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
  owner: {
    id: string
    name: string
    phone: string
  } | null
}

/** The edit page tab where a checklist item is fixed (its `?tab=`). */
export type ReadinessTab = 'details' | 'location' | 'operations' | 'services'

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
    durationMins: number
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
  durationMins?: number
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
  } | null
  /**
   * Marked "Test" by ops: left out of the pilot numbers, and deletable from
   * its page while the test-data reset is on. Optional for an older server.
   */
  markedTest?: { at: string; by: string | null } | null
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
  /** The garage's before/after photos, oldest first. */
  photos?: Array<{ id: string; stage: 'before' | 'after'; url: string; createdAt: string }>
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
   * previous page (see adminBookingsCursor).
   */
  cursor?: string
}

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
  services?: Array<{
    name: string
    description?: string
    category: ServiceCategory
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price?: number
    priceHatchback?: number
    priceSedan?: number
    priceSuv?: number
    durationMins?: number
  }>
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
  return apiClient<void>('/admin/logout', { method: 'POST', auth: false })
}

/** GET /admin/me — session check */
export async function getAdminMe() {
  return apiClient<{ isSuperAdmin: boolean }>('/admin/me')
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
export async function binAdminVendor(id: string, input: { actorName: string; reason?: string }) {
  return apiClient<AdminVendorBinResult>(`/admin/vendors/${id}/bin`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** POST /admin/vendors/:id/restore — back as it was, team access included. */
export async function restoreAdminVendor(id: string, input: { actorName: string }) {
  return apiClient<{ garage: AdminBinGarage; auditId: string }>(`/admin/vendors/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify(input),
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
  input: { actorName: string; confirmName: string; selectionHash: string }
) {
  return apiClient<AdminVendorDeleteResult>(`/admin/vendors/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(input),
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

// ─── AI helpers ──────────────────────────────────────────────────────────────

/** Which AI helpers the API has switched on. All off without an OpenAI key. */
export interface AdminAiConfig {
  /** "Write with AI" for service descriptions. */
  describe: boolean
  /** "Make a picture with AI" for a service with no real photo. */
  pictures: boolean
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

// ─── Media ───────────────────────────────────────────────────────────────────
//
// Presign → PUT straight to R2 → register the public URL, the same three steps
// the vendor panel uses. The admin variants name the vendor (or service)
// instead of resolving it from an owner token.

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

async function putToR2(uploadUrl: string, file: File) {
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
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/vendors/${vendorId}/logo/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type as UploadContentType }),
  })

  await putToR2(uploadUrl, file)

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
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/vendors/${vendorId}/photos/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type as UploadContentType }),
  })

  await putToR2(uploadUrl, file)

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
   * deletable. `complaints` is the one tick for a cutoff run's complaints.
   */
  only?: { chainIds: string[]; checkoutIds: string[]; complaints?: boolean }
  unknownIds?: string[]
}

export interface DataResetExecuteInput extends DataResetPreviewInput {
  selectionHash: string
  confirmText: string
  actorName: string
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
    body: JSON.stringify(input),
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
    /** Null once the account is deleted; name and phone are as they were. */
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
