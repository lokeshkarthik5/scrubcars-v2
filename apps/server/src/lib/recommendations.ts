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
 * A number as ten digits when it is an Indian mobile, else null: +91, 0,
 * 091 and 0091 in front are dropped however it was typed (the customer
 * apps' own `normaliseIndianMobile`, packages/core/src/phone.ts). A
 * landline (044…) is never one, so it can never match.
 */
export function tenDigitMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D+/g, '')
  while (digits.length > 10) {
    if (digits.startsWith('0')) digits = digits.slice(1)
    else if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(2)
    else break
  }
  return isIndianMobile(digits) ? digits : null
}

/**
 * The numbers a new garage can be matched on: its business phone, its
 * WhatsApp and its owner's login phone, each as ten digits and kept only
 * when it is an Indian mobile, which is all a recommendation's phone can
 * be (its CHECK).
 */
export function garageMatchPhones(garage: {
  phone: string | null | undefined
  whatsapp?: string | null
  ownerPhone?: string | null
}): string[] {
  const phones = new Set<string>()
  for (const raw of [garage.phone, garage.whatsapp, garage.ownerPhone]) {
    const phone = tenDigitMobile(raw)
    if (phone) phones.add(phone)
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
 * decided, whose phone is one of the garage's numbers. Every customer who
 * recommended that number is linked, each earning once per garage when
 * they book it (`referralCredit`; the partial unique index on customer and
 * garage). A recommendation already following a lead to a garage is the
 * team's link and is never moved here.
 *
 * Never a false match: a number another garage already has (`sharedPhones`:
 * its phone, WhatsApp or owner login — an owner's second company, a family
 * number) says nothing about which garage the customer meant, so it is left
 * for the team; and the garage's own owner recommending their own number
 * (`ownerId`) brings nobody in.
 */
export function recommendationsMatchingGarage(
  candidates: readonly RecommendationPhoneCandidate[],
  garagePhones: readonly string[],
  guard: { ownerId?: string | null; sharedPhones?: readonly string[] } = {}
): string[] {
  const shared = new Set(guard.sharedPhones ?? [])
  const phones = new Set(garagePhones.filter((phone) => !shared.has(phone)))
  if (phones.size === 0) return []
  return candidates
    .filter(
      (rec) =>
        (rec.status === 'new' || rec.status === 'contacted') &&
        rec.vendorId === null &&
        rec.creditStatus === null &&
        rec.phone !== null &&
        (guard.ownerId == null || rec.userId !== guard.ownerId) &&
        phones.has(tenDigitMobile(rec.phone) ?? '')
    )
    .map((rec) => rec.id)
}

/** Who a garage-sign-up link is recorded as (`handled_by`), when nobody on the team handled it before. */
export const GARAGE_SIGN_UP_HANDLER = 'Garage sign-up'

// ─── "<Garage> joined Detlio thanks to you": once it is shown to customers ──

/**
 * When the customer is told a garage they recommended joined (owner, 21 Nov
 * 2026): only once the garage is first shown to customers (listed), never
 * while it is still pending and invisible. Once per recommendation, claimed
 * before it is sent (areaSignupsRepository.claimJoinedNotices). Only for a
 * garage made on or after `since` (the feature's day, so recommendations
 * that joined before it are not told weeks later) and at most
 * `garageAgeDays` old (a bounded read; a garage that took longer to go live
 * is not news any more). `batch` claimed a run.
 */
export const JOINED_NOTICE_RULES = {
  since: new Date('2026-11-21T00:00:00+05:30'),
  garageAgeDays: 90,
  batch: 50,
} as const

/** The oldest a garage may have been made for its recommenders still to be told it joined. */
export function joinedNoticeFrom(now: Date): Date {
  const window = new Date(now.getTime() - JOINED_NOTICE_RULES.garageAgeDays * 24 * 60 * 60 * 1000)
  return window > JOINED_NOTICE_RULES.since ? window : JOINED_NOTICE_RULES.since
}

/**
 * The claimed recommendations as messages: one per customer and garage
 * (a customer who recommended the same garage twice hears it once), the
 * first recommendation's id as the message's tag.
 */
export function joinedNoticeSends(
  claimed: ReadonlyArray<{ id: string; userId: string; vendorId: string; businessName: string }>
): Array<{ recommendationId: string; userId: string; vendorId: string; businessName: string }> {
  const seen = new Set<string>()
  const sends: Array<{ recommendationId: string; userId: string; vendorId: string; businessName: string }> = []
  for (const rec of claimed) {
    const key = `${rec.userId}|${rec.vendorId}`
    if (seen.has(key)) continue
    seen.add(key)
    sends.push({ recommendationId: rec.id, userId: rec.userId, vendorId: rec.vendorId, businessName: rec.businessName })
  }
  return sends
}
