import { AppError, hasPgCode } from '../../lib/errors.js'
import {
  adminGoogleListing,
  GARAGE_GOOGLE_SEARCH_RADIUS_KM,
  garageGooglePlaces,
  googleLinkPlan,
  googleUnlinkPatch,
  type AdminGoogleListing,
  type GarageGooglePlace,
} from '../../lib/garage-google.js'
import { LEAD_NAME_MAX, leadDisplayName } from '../../lib/leads.js'
import { logger } from '../../lib/logger.js'
import { placesSources, type GooglePlaceDetails } from '../../lib/places/index.js'
import { leadZoneId } from '../../lib/zone-edits.js'
import { leadsRepository, type LeadPatch } from '../leads/leads.repository.js'
import { syncRecommendations } from '../leads/leads.service.js'
import { reviewsRepository } from '../reviews/reviews.repository.js'
import {
  GARAGE_GOOGLE_AUDIT,
  garageGoogleRepository,
} from './garage-google.repository.js'
import type {
  GarageGoogleLinkInput,
  GarageGoogleSearchInput,
} from './garage-google.validation.js'

const log = logger.child({ module: 'garage-google' })

type Actor = { sub: string; name: string }

const garageNotFound = () => new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
const inBin = () =>
  new AppError(409, 'That garage is in the Bin. Restore it first.', 'VENDOR_IN_BIN')
const googleOff = () =>
  new AppError(503, 'Google is not connected', 'PLACES_UNCONFIGURED')
const googleDown = () =>
  new AppError(502, "Google didn't answer. Try again in a minute.", 'GOOGLE_UNAVAILABLE')
const linkedMeanwhile = () =>
  new AppError(
    409,
    'Someone linked this listing or garage just now. Reload to see it.',
    'GOOGLE_LISTING_CHANGED'
  )

async function openGarage(vendorId: string) {
  const garage = await garageGoogleRepository.findGarage(vendorId)
  if (!garage || garage.purgedAt) throw garageNotFound()
  if (garage.deletedAt) throw inBin()
  return garage
}

/** What Google gave for the place, dated now: held apart on the lead (Google's 30 days). */
function googleFields(details: GooglePlaceDetails, now: Date) {
  return {
    googleName: details.name,
    googlePhone: details.phone,
    googleAddress: details.address,
    googleRating: details.rating === null ? null : details.rating.toFixed(1),
    googleReviewCount: details.reviewCount,
    googleFetchedAt: now,
  }
}

export interface GarageGoogleSearchResponse {
  places: GarageGooglePlace[]
}

export const garageGoogleService = {
  /**
   * "Link to Google listing": Google's places for the garage's name (or the
   * team's words) inside 10 km of its pin, nearest first, each with who
   * holds it already. Nothing is stored. Logs counts only.
   */
  async search(vendorId: string, input: GarageGoogleSearchInput): Promise<GarageGoogleSearchResponse> {
    const garage = await openGarage(vendorId)
    if (garage.lat === null || garage.lng === null) {
      throw new AppError(400, 'Pin the garage on the map first.', 'GARAGE_NO_PIN')
    }
    const google = placesSources().google
    if (!google) throw googleOff()
    const pin = { lat: garage.lat, lng: garage.lng }
    let found
    try {
      found = await google.search({
        text: input.text ?? garage.businessName,
        kind: null,
        centre: pin,
        radiusKm: GARAGE_GOOGLE_SEARCH_RADIUS_KM,
      })
    } catch {
      throw googleDown()
    }
    const holders = await garageGoogleRepository.listPlaceHolders(found.map((place) => place.placeId))
    const places = garageGooglePlaces(
      pin,
      found,
      vendorId,
      holders.map((row) => ({
        leadId: row.leadId,
        leadName: leadDisplayName(row),
        placeId: row.placeId,
        vendorId: row.vendorId,
        garageName: row.garageName,
      }))
    )
    log.info({ found: found.length, shown: places.length, words: Boolean(input.text) }, 'garage-google:search')
    return { places }
  },

  /**
   * Links the garage to the place picked: reads the place from Google once
   * (one Place Details call, the refresh's own field mask), then, under the
   * rows' locks, the garage's lead takes it, or a lead not yet a garage that
   * holds it becomes this garage's (its recommendations follow, as on
   * Onboard), or a lead is made for the garage. Audited with place ids only
   * (Google's terms: nothing else of Google's is kept past 30 days).
   */
  async link(
    vendorId: string,
    input: GarageGoogleLinkInput,
    actor: Actor,
    now = new Date()
  ): Promise<{ listing: AdminGoogleListing }> {
    const garage = await openGarage(vendorId)
    const google = placesSources().google
    if (!google) throw googleOff()
    let details: GooglePlaceDetails | null
    try {
      details = await google.details(input.placeId)
    } catch {
      throw googleDown()
    }
    if (!details) {
      throw new AppError(404, 'Google no longer has this place. Search again.', 'GOOGLE_PLACE_GONE')
    }
    const fields = googleFields(details, now)
    const zones = await leadsRepository.listZones()

    type Tx = Parameters<Parameters<typeof garageGoogleRepository.transaction>[0]>[0]
    const applyLink = async (tx: Tx) => {
      const garageLead = (await garageGoogleRepository.lockLeadOfGarage(vendorId, tx)) ?? null
      const placeLead = (await garageGoogleRepository.lockLeadOfPlace(input.placeId, tx)) ?? null
      const plan = googleLinkPlan(vendorId, garageLead, placeLead)
      if (plan.kind === 'taken') {
        throw new AppError(
          409,
          'Another garage is already linked to this Google listing.',
          'GOOGLE_LISTING_TAKEN'
        )
      }
      if (plan.kind === 'on_other_lead') {
        throw new AppError(
          409,
          `This listing is on the lead “${leadDisplayName(placeLead!)}” in Coverage. Remove that lead (it is this garage again), then link.`,
          'GOOGLE_LISTING_ON_LEAD'
        )
      }
      if (plan.kind === 'update') {
        const previousPlaceId = (garageLead ?? placeLead!).googlePlaceId
        const row = await garageGoogleRepository.updateLead(
          plan.leadId,
          { googlePlaceId: input.placeId, ...fields, updatedAt: now },
          tx
        )
        return { lead: row!, how: plan.kind, previousPlaceId, synced: 0 }
      }
      if (plan.kind === 'link_lead') {
        const patch: LeadPatch = {
          vendorId,
          status: 'onboarded',
          onboardedAt: now,
          notInterestedReason: null,
          notInterestedOn: null,
          retryAfter: null,
          ...fields,
          updatedAt: now,
        }
        const row = await garageGoogleRepository.updateLead(plan.leadId, patch, tx)
        const synced = await syncRecommendations(tx, plan.leadId, vendorId, now)
        return { lead: row!, how: plan.kind, previousPlaceId: null, synced }
      }
      const pin = { lat: garage.lat, lng: garage.lng }
      const [row] = await garageGoogleRepository.insertLead(
        {
          name: garage.businessName.slice(0, LEAD_NAME_MAX).trim(),
          phone: null,
          // The garage's own pin (ours, not Google's).
          lat: pin.lat,
          lng: pin.lng,
          pinSource: pin.lat !== null ? 'map' : null,
          zoneId: leadZoneId(pin, null, zones),
          source: 'google',
          status: 'onboarded',
          vendorId,
          onboardedAt: now,
          googlePlaceId: input.placeId,
          ...fields,
          createdByName: actor.name,
          createdAt: now,
          updatedAt: now,
        },
        tx
      )
      return { lead: row!, how: plan.kind, previousPlaceId: null, synced: 0 }
    }

    const { lead, how, previousPlaceId, synced } = await garageGoogleRepository
      .transaction(async (tx) => {
        const result = await applyLink(tx)
        await garageGoogleRepository.audit(tx, {
          action: GARAGE_GOOGLE_AUDIT.linked,
          actor,
          summary: { vendorId, leadId: result.lead.id },
          detail: { placeId: input.placeId, previousPlaceId: result.previousPlaceId, how: result.how },
        })
        return result
      })
      .catch((err: unknown) => {
        // A garage or a place linked by someone else between the locks and
        // the write (leads_vendor_id_key, leads_google_place_id_key).
        if (hasPgCode(err, '23505')) throw linkedMeanwhile()
        throw err
      })
    log.info({ how, recommendations: synced, changed: previousPlaceId !== null && previousPlaceId !== input.placeId }, 'garage-google:linked')
    const counted = await reviewsRepository.ratingAggregates([vendorId])
    return {
      listing: adminGoogleListing(
        { ...lead, googlePlaceId: input.placeId },
        counted[0]?.count ?? 0,
        { by: actor.name, at: now },
        now
      ),
    }
  },

  /**
   * Unlink: the garage's lead keeps the garage but loses the listing and
   * everything Google gave (and a pin from Google), so customers stop
   * seeing Google's rating at once. Audited.
   */
  async unlink(vendorId: string, actor: Actor, now = new Date()): Promise<{ unlinked: true }> {
    const garage = await openGarage(vendorId)
    await garageGoogleRepository.transaction(async (tx) => {
      const lead = await garageGoogleRepository.lockLeadOfGarage(vendorId, tx)
      if (!lead || !lead.googlePlaceId) {
        throw new AppError(404, 'This garage has no Google listing.', 'GOOGLE_LISTING_NOT_FOUND')
      }
      const placeId = lead.googlePlaceId
      await garageGoogleRepository.updateLead(
        lead.id,
        { ...googleUnlinkPatch(lead, garage.businessName, LEAD_NAME_MAX), updatedAt: now },
        tx
      )
      await garageGoogleRepository.audit(tx, {
        action: GARAGE_GOOGLE_AUDIT.unlinked,
        actor,
        summary: { vendorId, leadId: lead.id },
        detail: { placeId },
      })
    })
    log.info('garage-google:unlinked')
    return { unlinked: true }
  },

  /**
   * Every garage's Google listing for the Garages list and its side panel
   * (and the "No Google listing" chip): three grouped reads, one after
   * another (one connection), never one a garage.
   */
  async listingsByVendor(now = new Date()): Promise<Map<string, AdminGoogleListing>> {
    const listings = await garageGoogleRepository.listListings()
    if (listings.length === 0) return new Map()
    const counted = await reviewsRepository.ratingAggregates(listings.map((row) => row.vendorId))
    const links = await garageGoogleRepository.listLatestLinks()
    const countByVendor = new Map(counted.map((row) => [row.vendorId, row.count]))
    const linkByVendor = new Map(links.map((row) => [row.vendorId, { by: row.actorName, at: row.createdAt }]))
    return new Map(
      listings.map((row) => [
        row.vendorId,
        adminGoogleListing(row, countByVendor.get(row.vendorId) ?? 0, linkByVendor.get(row.vendorId) ?? null, now),
      ])
    )
  },
}
