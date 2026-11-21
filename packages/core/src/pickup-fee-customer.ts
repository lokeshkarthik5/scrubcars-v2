/**
 * The pickup fee (0079) on the customer's screens: the list chip, the
 * garage page, checkout, Ask for pickup and the booking. The maths is
 * pickup-fee-maths.ts (the server charges the same); the shared words are
 * pickup-fee.ts. These are the customer apps' own (web and native).
 */

// Relative imports, as the rest of core's pure helpers.
import { msg, t } from './i18n/translate'
import { straightLineKm } from './map'
import { askMaxFee, tripFee, type PickupFeePlan, type PickupFeeSettings } from './pickup-fee-maths'
import { kmFigure, pickupChipLabel, rupees } from './pickup-fee'

type Pin = { lat: number | null | undefined; lng: number | null | undefined }

/**
 * The fee a Pickup & drop card's chip shows, from the card's distance, or
 * null for no chip: the garage doesn't collect, or a By distance fee with no
 * distance to work it on. A collecting garage on an API without the fee
 * (no `pickupFee`) is Free, as before 0079.
 */
export function cardPickupFee(vendor: {
  pickupEnabled?: boolean
  pickupFee?: PickupFeePlan | null
  distanceKm?: number | null
}): number | null {
  if (!vendor.pickupEnabled) return null
  const plan = vendor.pickupFee
  if (!plan || plan.mode === 'free') return 0
  if (plan.mode === 'fixed') return Math.max(0, Math.round(plan.fixed))
  if (vendor.distanceKm == null) return null
  return tripFee(plan, vendor.distanceKm).fee
}

/** The chip's words, or null for none: "Pickup ₹99" / "Free pickup". */
export function cardPickupChip(vendor: Parameters<typeof cardPickupFee>[0]): string | null {
  const fee = cardPickupFee(vendor)
  return fee === null ? null : pickupChipLabel(fee)
}

/**
 * The fee for one address: the garage's plan on the straight line from its
 * pin, never more than the services (`servicePrice`, null when not known).
 * Null when either pin is missing. Free (₹0, no km) for a garage on an API
 * without the fee.
 */
export function addressPickupFee(
  plan: PickupFeePlan | null | undefined,
  garage: Pin,
  point: Pin,
  servicePrice: number | null = null
): { fee: number; roadKm: number } | null {
  if (garage.lat == null || garage.lng == null || point.lat == null || point.lng == null) return null
  const km = straightLineKm({ lat: garage.lat, lng: garage.lng }, { lat: point.lat, lng: point.lng })
  if (!plan) return { fee: 0, roadKm: Math.round(km * 13) / 10 }
  return tripFee(plan, km, servicePrice)
}

/**
 * Ask for pickup's suggestion for an address: Detlio's fee for the road km
 * and the most the garage may ask (+25%, within the caps and the services).
 */
export function askSuggestion(
  config: { suggested: PickupFeePlan; askRaisePct: number; maxCharge: number },
  garage: Pin,
  point: Pin,
  servicePrice: number | null = null
): { suggested: number; max: number; roadKm: number } | null {
  if (garage.lat == null || garage.lng == null || point.lat == null || point.lng == null) return null
  const km = straightLineKm({ lat: garage.lat, lng: garage.lng }, { lat: point.lat, lng: point.lng })
  const trip = tripFee(config.suggested, km, servicePrice)
  // askMaxFee reads the rounding step and the limits from settings: these are the ones it uses.
  const settings = {
    suggested: { ...config.suggested },
    limits: { askRaisePct: config.askRaisePct, maxCharge: config.maxCharge },
  } as unknown as PickupFeeSettings
  return { suggested: trip.fee, max: askMaxFee(trip.fee, settings, servicePrice), roadKm: trip.roadKm }
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** Checkout's line under the pickup row. */
export function fromAndBackLine(address: string): string {
  return t('From and back to {address}', { address })
}

/** The garage page's card for a garage that doesn't collect cars. */
export function noPickupTitle(garage: string): string {
  return t("{garage} doesn't collect cars yet", { garage })
}

/** The Ask for pickup sheet's title. */
export function askSheetTitle(garage: string): string {
  return t('Ask {garage} for pickup', { garage })
}

/** Under the sheet's title. */
export function askSheetSubtitle(roadKm: number | null): string {
  return roadKm === null
    ? t('They collect your car and bring it back')
    : t('They collect your car and bring it back · {km} km by road', { km: kmFigure(roadKm) })
}

/** The sheet's Pickup fee part: "About ₹120" / "at most ₹150". */
export function aboutFee(fee: number): string {
  return fee > 0 ? t('About {fee}', { fee: rupees(fee) }) : t('Free')
}

export function atMostFee(max: number): string {
  return t('at most {max}', { max: rupees(max) })
}

/** The note under the sheet's Pickup fee part. */
export function askFeeNote(roadKm: number, raisePct: number): string {
  return t("Detlio's suggestion for {km} km by road. The garage confirms the fee, up to {pct}% more. You see it before you pay.", {
    km: kmFigure(roadKm),
    pct: raisePct,
  })
}

export const ASK_PICKUP_FOOTER = msg('Ask for pickup: free to ask, no payment until they say yes.')
export const PICKUP_FEE_SECTION = msg('Pickup fee')

/** The booking page's quiet report line (it covers extra money too, 0079). */
export const REPORT_EXTRA_LINE = msg('Did the garage ask you to book directly or pay extra?')

/**
 * The receipt's line for the trip fee, in the receipt's plain English (it
 * is a record, never translated): "Pickup & drop · 6.2 km" on a pickup
 * booking, "Travel fee" otherwise.
 */
export function receiptTripLabel(bookingType: string, roadKm: number | null | undefined): string {
  if (bookingType !== 'pickup') return 'Travel fee'
  return roadKm != null && roadKm > 0 ? `Pickup & drop · ${kmFigure(roadKm)} km` : 'Pickup & drop'
}

/** The receipt's line for Detlio's own fee (plain English, as the rest of the receipt). */
export const RECEIPT_CONVENIENCE_LABEL = 'Detlio convenience fee'
