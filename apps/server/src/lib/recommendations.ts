/**
 * Customer recommendations in Coverage (admin round part 3, 0064): "Know a
 * good garage here?" (customer reach part 2, `garage_recommendations`)
 * becomes a lead the team calls, and the garage that lead becomes is the
 * recommendation's `vendor_id`, which is what customer reach's referral
 * credit pays on (area-signups.service sweepReferrals). Pure, unit-tested
 * in recommendations.test.ts.
 *
 * Status, as the team moves it: `new` (in the zone's list) → `contacted`
 * (a lead was made from it, or it was linked to a lead the team had) →
 * `joined` (that lead became a garage) or `declined` (dismissed).
 *
 * Bring your garage (21 Nov 2026): a garage that signs up itself (the
 * garage app's onboarding, or the team's Add garage) with the phone a
 * customer gave is that recommendation's garage too, `joined` at once:
 * `recommendationsMatchingGarage`.
 */
import { coordsInLink } from './geo/maps-link.js'
import { isIndianMobile, LEAD_NAME_MAX, normalisePhone } from './leads.js'
import { leadZoneId } from './zone-edits.js'

export type RecommendationStatus = 'new' | 'contacted' | 'joined' | 'declined'

/** A recommendation as the link rule reads it. */
export interface RecommendationLink {
  id: string
  status: RecommendationStatus
  vendorId: string | null
  /** Set once customer reach's credit is decided (owed or granted): its garage is settled. */
  creditStatus: 'owed' | 'granted' | null
}

/**
 * What a lead's garage link does to the recommendations made into it: each
 * follows the lead (the garage, `joined`; unlinked, back to `contacted`),
 * until its referral credit is decided. From then on nothing moves it, so a
 * credit is paid for one garage, once (the credit itself is once per
 * customer and garage: `referralCredit`, and a partial unique index). A
 * dismissed one is never touched. Only the rows that change.
 */
export function recommendationGarageChanges(
  recommendations: readonly RecommendationLink[],
  vendorId: string | null
): Array<{
  id: string
  vendorId: string | null
  status: RecommendationStatus
}> {
  const status: RecommendationStatus = vendorId ? 'joined' : 'contacted'
  return recommendations
    .filter(
      (rec) =>
        rec.creditStatus === null &&
        rec.status !== 'declined' &&
        rec.status !== 'new' &&
        (rec.vendorId !== vendorId || rec.status !== status)
    )
    .map((rec) => ({ id: rec.id, vendorId, status }))
}

/**
 * A lead made from a recommendation: its name, phone and Maps link, the
 * pin when the link carries one (read from the link itself, no request),
 * and the zone from that pin, else the zone it was recommended in.
 */
export function leadFromRecommendation(
  rec: {
    name: string
    phone: string | null
    mapsLink: string | null
    zoneId: string | null
  },
  zones: ReadonlyArray<{ id: string; lat: number; lng: number }>
): {
  name: string
  phone: string | null
  mapsUrl: string | null
  lat: number | null
  lng: number | null
  pinSource: 'maps_link' | null
  zoneId: string | null
} {
  const pin = rec.mapsLink ? coordsInLink(rec.mapsLink) : null
  return {
    name: rec.name.trim().slice(0, LEAD_NAME_MAX),
    phone: normalisePhone(rec.phone),
    mapsUrl: rec.mapsLink,
    lat: pin?.lat ?? null,
    lng: pin?.lng ?? null,
    pinSource: pin ? 'maps_link' : null,
    zoneId: leadZoneId(
      { lat: pin?.lat ?? null, lng: pin?.lng ?? null },
      rec.zoneId,
      zones
    ),
  }
}

// ─── Bring your garage: a garage that signs up itself (21 Nov 2026) ─────────

/**
 * The numbers a new garage can be matched on: its business phone, its
 * WhatsApp and its owner's login phone, each normalised to ten digits
 * (`normalisePhone`: +91 / 0 dropped) and kept only when it is an Indian
 * mobile, which is all a recommendation's phone can be (its CHECK).
 */
export function garageMatchPhones(garage: {
  phone: string | null | undefined
  whatsapp?: string | null
  ownerPhone?: string | null
}): string[] {
  const phones = new Set<string>()
  for (const raw of [garage.phone, garage.whatsapp, garage.ownerPhone]) {
    const phone = normalisePhone(raw)
    if (phone && isIndianMobile(phone)) phones.add(phone)
  }
  return [...phones]
}

/** A recommendation as the phone match reads it. */
export interface RecommendationPhoneCandidate extends RecommendationLink {
  phone: string | null
  userId: string | null
}

/**
 * Which recommendations a garage that has just been made is the garage
 * for, by phone: a recommendation still open (`new` or `contacted`, so
 * neither dismissed nor joined), linked to no garage yet and with no credit
 * decided, whose phone (normalised) is one of the garage's numbers. Every
 * customer who recommended that number is linked, each earning once per
 * garage when they book it (`referralCredit`; the partial unique index on
 * customer and garage). A recommendation already following a lead to a
 * garage is the team's link and is never moved here.
 */
export function recommendationsMatchingGarage(
  candidates: readonly RecommendationPhoneCandidate[],
  garagePhones: readonly string[]
): string[] {
  const phones = new Set(garagePhones)
  if (phones.size === 0) return []
  return candidates
    .filter(
      (rec) =>
        (rec.status === 'new' || rec.status === 'contacted') &&
        rec.vendorId === null &&
        rec.creditStatus === null &&
        rec.phone !== null &&
        phones.has(normalisePhone(rec.phone) ?? '')
    )
    .map((rec) => rec.id)
}

/** Who a garage-sign-up link is recorded as (`handled_by`), when nobody on the team handled it before. */
export const GARAGE_SIGN_UP_HANDLER = 'Garage sign-up'
