import { AppError, hasPgCode } from '../../lib/errors.js'
import { coordsInLink } from '../../lib/geo/maps-link.js'
import { istDateKey } from '../../lib/ist.js'
import { findDuplicates, type MatchReason } from '../../lib/lead-match.js'
import {
  parsePastedLeads,
  PASTE_PROBLEM_TEXT,
  type PasteProblem,
} from '../../lib/lead-paste.js'
import {
  LEAD_DUPLICATE_RADIUS_M,
  LEAD_NAME_MAX,
  LEAD_PASTE_MAX,
  leadDisplayName,
  leadDisplayPhone,
  statusColumns,
  type LeadPinSource,
  type LeadSource,
  type LeadStatus,
} from '../../lib/leads.js'
import { logger } from '../../lib/logger.js'
import {
  placesSources,
  type GooglePlaceDetails,
} from '../../lib/places/index.js'
import type { KnownPlace } from '../../lib/places/merge.js'
import {
  GOOGLE_REFRESH_AFTER_DAYS,
  GOOGLE_REFRESH_BATCH,
  googleRefreshOutcome,
  isGoogleRefreshHour,
} from '../../lib/places/refresh.js'
import {
  leadFromRecommendation,
  recommendationGarageChanges,
} from '../../lib/recommendations.js'
import { leadZoneId } from '../../lib/zone-edits.js'
import { zoneFor } from '../../lib/zones.js'
import { geoService } from '../geo/geo.service.js'
import { isListedToCustomers } from '../vendors/vendors.predicates.js'
import {
  leadsRepository,
  type Conn,
  type LeadPatch,
  type LeadRecord,
  type NewLead,
  type RecommendationRecord,
} from './leads.repository.js'
import type {
  CreateLeadInput,
  DuplicatesInput,
  FromRecommendationInput,
  FromPlacesInput,
  PastePreviewInput,
  PasteSaveInput,
  ResolvePinInput,
  UpdateLeadInput,
} from './leads.validation.js'

const log = logger.child({ module: 'leads' })

/** The nightly refresh's time budget a run. */
const REFRESH_BUDGET_MS = 10_000
const DAY_MS = 24 * 60 * 60 * 1000

/** A lead as the panel reads it. Google's details are apart, with the day they were read. */
export interface LeadResponse {
  id: string
  /** What to call it: the team's name, else Google's while held (lib/leads.ts leadDisplayName). */
  name: string
  /** The name the team typed or confirmed; null while only Google's is known. */
  ownName: string | null
  /** The phone to call: the team's, else Google's while held. */
  phone: string | null
  ownPhone: string | null
  address: string | null
  mapsUrl: string | null
  lat: number | null
  lng: number | null
  pinSource: LeadPinSource | null
  zoneId: string | null
  source: LeadSource
  status: LeadStatus
  notInterestedReason: string | null
  notInterestedOn: string | null
  retryAfter: string | null
  assignedLoginId: string | null
  assignedName: string | null
  lastNote: string | null
  lastNoteBy: string | null
  lastNoteAt: string | null
  vendorId: string | null
  onboardedAt: string | null
  googlePlaceId: string | null
  olaPlaceId: string | null
  google: {
    name: string | null
    phone: string | null
    address: string | null
    rating: number | null
    reviewCount: number | null
    fetchedAt: string
  } | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

export function toLeadResponse(row: LeadRecord): LeadResponse {
  return {
    id: row.id,
    name: leadDisplayName(row),
    ownName: row.name,
    phone: leadDisplayPhone(row),
    ownPhone: row.phone,
    address: row.address ?? row.googleAddress ?? null,
    mapsUrl: row.mapsUrl,
    lat: row.lat,
    lng: row.lng,
    pinSource: row.pinSource,
    zoneId: row.zoneId,
    source: row.source,
    status: row.status,
    notInterestedReason: row.notInterestedReason,
    notInterestedOn: row.notInterestedOn,
    retryAfter: row.retryAfter,
    assignedLoginId: row.assignedLoginId,
    assignedName: row.assignedName,
    lastNote: row.lastNote,
    lastNoteBy: row.lastNoteBy,
    lastNoteAt: row.lastNoteAt?.toISOString() ?? null,
    vendorId: row.vendorId,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    googlePlaceId: row.googlePlaceId,
    olaPlaceId: row.olaPlaceId,
    google: row.googleFetchedAt
      ? {
          name: row.googleName,
          phone: row.googlePhone,
          address: row.googleAddress,
          rating: row.googleRating === null ? null : Number(row.googleRating),
          reviewCount: row.googleReviewCount,
          fetchedAt: row.googleFetchedAt.toISOString(),
        }
      : null,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** A place the team already has that something looks like. */
export interface DuplicateMatch {
  kind: 'lead' | 'garage'
  id: string
  name: string
  status: KnownPlace['status']
  zoneId: string | null
  reason: MatchReason
}

function toMatch({
  match,
  reason,
}: {
  match: KnownPlace
  reason: MatchReason
}): DuplicateMatch {
  return {
    kind: match.kind,
    id: match.id,
    name: match.label,
    status: match.status,
    zoneId: match.zoneId ?? null,
    reason,
  }
}

const leadNotFound = () => new AppError(404, 'Lead not found', 'LEAD_NOT_FOUND')
const zoneNotFound = () => new AppError(404, 'Zone not found', 'ZONE_NOT_FOUND')
const garageTaken = () =>
  new AppError(409, 'Another lead is already that garage.', 'LEAD_GARAGE_TAKEN')

function duplicateError(matches: DuplicateMatch[]) {
  const first = matches[0]!
  const what = first.kind === 'garage' ? 'a garage' : 'a lead'
  return new AppError(
    409,
    `This looks like ${first.name}, already ${what}. Check it, or save anyway.`,
    'LEAD_DUPLICATE'
  )
}

async function assignee(loginId: string | null | undefined): Promise<{
  assignedLoginId: string | null
  assignedName: string | null
} | null> {
  if (loginId === undefined) return null
  if (loginId === null) return { assignedLoginId: null, assignedName: null }
  const login = await leadsRepository.findActiveLogin(loginId)
  if (!login)
    throw new AppError(
      400,
      'Pick someone on the team who can sign in',
      'LEAD_ASSIGNEE_UNKNOWN'
    )
  return { assignedLoginId: login.id, assignedName: login.name }
}

/**
 * The recommendations made into a lead follow its garage (joined, or back
 * to contacted when it has none), until their referral credit is decided:
 * lib/recommendations.ts recommendationGarageChanges, under the rows' lock.
 */
async function syncRecommendations(
  conn: Conn,
  leadId: string,
  vendorId: string | null,
  now: Date
): Promise<number> {
  const recommendations = await leadsRepository.lockRecommendationsOfLead(
    leadId,
    conn
  )
  const changes = recommendationGarageChanges(recommendations, vendorId)
  return leadsRepository.setRecommendationGarages(changes, now, conn)
}

/** A customer recommendation as Coverage lists it: never who recommended it. */
export interface RecommendationResponse {
  id: string
  zoneId: string | null
  name: string
  phone: string | null
  mapsLink: string | null
  why: string | null
  status: RecommendationRecord['status']
  leadId: string | null
  vendorId: string | null
  handledBy: string | null
  handledAt: string | null
  createdAt: string
}

export function toRecommendationResponse(
  row: RecommendationRecord
): RecommendationResponse {
  return {
    id: row.id,
    zoneId: row.zoneId,
    name: row.name,
    phone: row.phone,
    mapsLink: row.mapsLink,
    why: row.why,
    status: row.status,
    leadId: row.leadId,
    vendorId: row.vendorId,
    handledBy: row.handledBy,
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

const recommendationNotFound = () =>
  new AppError(404, 'Recommendation not found', 'RECOMMENDATION_NOT_FOUND')
const recommendationHandled = () =>
  new AppError(
    409,
    'Someone has already made this a lead or dismissed it. Reload to see it.',
    'RECOMMENDATION_HANDLED'
  )

/** A pin's source from how it came: a Maps link, else typed or clicked on the map. */
const pinSourceFor = (mapsUrl: string | null | undefined): LeadPinSource =>
  mapsUrl ? 'maps_link' : 'map'

type Zones = Awaited<ReturnType<typeof leadsRepository.listZones>>

export const leadsService = {
  /**
   * Every lead and every garage not in the Bin, as places to match against
   * (the duplicate warning, Paste a list's preview, the finder's "known").
   * A garage's zone is worked out from its pin by the zones' one rule.
   */
  async knownPlaces(zones?: Zones): Promise<KnownPlace[]> {
    const [allZones, leadRows, garages] = await Promise.all([
      zones ? Promise.resolve(zones) : leadsRepository.listZones(),
      leadsRepository.listAll(),
      leadsRepository.listGaragesForMatch(),
    ])
    return [
      ...leadRows.map((lead): KnownPlace => ({
        kind: 'lead',
        id: lead.id,
        label: leadDisplayName(lead),
        name: leadDisplayName(lead),
        phones: [lead.phone, lead.googlePhone],
        lat: lead.lat,
        lng: lead.lng,
        zoneId: lead.zoneId,
        googlePlaceId: lead.googlePlaceId,
        olaPlaceId: lead.olaPlaceId,
        status: lead.status,
        assignedName: lead.assignedName,
        notInterestedReason: lead.notInterestedReason,
      })),
      ...garages.map((garage): KnownPlace => ({
        kind: 'garage',
        id: garage.id,
        label: garage.businessName,
        name: garage.businessName,
        phones: [garage.phone, garage.whatsapp],
        lat: garage.lat,
        lng: garage.lng,
        zoneId: zoneFor(garage, allZones)?.id ?? null,
        status: isListedToCustomers(garage) ? 'live' : 'not_live',
        assignedName: null,
        notInterestedReason: null,
      })),
    ]
  },

  async get(id: string): Promise<LeadResponse> {
    const lead = await leadsRepository.findById(id)
    if (!lead) throw leadNotFound()
    return toLeadResponse(lead)
  },

  /**
   * The pin and zone for Add lead's Maps link: read from the link itself
   * when it carries coordinates (no request at all), else through the
   * address search's own link resolver (lib/geo/maps-link.ts, which may
   * geocode). Never an error for a bad link: a warning, and the pin can be
   * set by hand.
   */
  async resolvePin(input: ResolvePinInput) {
    let pin = coordsInLink(input.mapsUrl)
    let warning: string | null = null
    if (!pin) {
      try {
        const link = await geoService.resolveMapsLink({ url: input.mapsUrl })
        pin =
          link.lat !== null && link.lng !== null
            ? { lat: link.lat, lng: link.lng }
            : null
        warning = link.warning ?? null
      } catch {
        warning = 'unreachable'
      }
    }
    const zones = await leadsRepository.listZones()
    const zone = pin ? zoneFor(pin, zones) : null
    return {
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      warning: pin ? null : (warning ?? 'no_location_found'),
      zone: zone ? { id: zone.id, name: zone.name } : null,
    }
  },

  /** What a lead about to be saved looks like among the leads and garages there are. */
  async duplicates(
    input: DuplicatesInput
  ): Promise<{ matches: DuplicateMatch[] }> {
    const zones = await leadsRepository.listZones()
    const pin = { lat: input.lat ?? null, lng: input.lng ?? null }
    const zoneId = leadZoneId(pin, input.zoneId ?? null, zones)
    const known = (await this.knownPlaces(zones)).filter(
      (place) => !(place.kind === 'lead' && place.id === input.excludeLeadId)
    )
    const matches = findDuplicates(
      {
        name: input.name || null,
        phones: [input.phone],
        lat: pin.lat,
        lng: pin.lng,
        zoneId,
      },
      known,
      LEAD_DUPLICATE_RADIUS_M
    )
    return { matches: matches.slice(0, 5).map(toMatch) }
  },

  async create(
    input: CreateLeadInput,
    now = new Date()
  ): Promise<LeadResponse> {
    const zones = await leadsRepository.listZones()
    if (input.zoneId && !zones.some((zone) => zone.id === input.zoneId))
      throw zoneNotFound()
    const pin = { lat: input.lat ?? null, lng: input.lng ?? null }
    const zoneId = leadZoneId(pin, input.zoneId ?? null, zones)
    const phone = input.phone ?? null

    if (!input.allowDuplicate) {
      const known = await this.knownPlaces(zones)
      const matches = findDuplicates(
        {
          name: input.name,
          phones: [phone],
          lat: pin.lat,
          lng: pin.lng,
          zoneId,
        },
        known,
        LEAD_DUPLICATE_RADIUS_M
      )
      if (matches.length > 0) throw duplicateError(matches.map(toMatch))
    }

    const assigned = (await assignee(input.assignedLoginId)) ?? {
      assignedLoginId: null,
      assignedName: null,
    }
    const status = statusColumns(
      {
        status: input.status,
        reason: input.reason,
        retryAfter: input.retryAfter,
      },
      istDateKey(now),
      now
    )
    const [row] = await leadsRepository.insert([
      {
        name: input.name,
        phone,
        mapsUrl: input.mapsUrl ?? null,
        lat: pin.lat,
        lng: pin.lng,
        pinSource: pin.lat !== null ? pinSourceFor(input.mapsUrl) : null,
        zoneId,
        source: 'manual',
        ...status,
        onboardedAt: null,
        ...assigned,
        ...(input.note
          ? {
              lastNote: input.note,
              lastNoteBy: input.actorName,
              lastNoteAt: now,
            }
          : {}),
        createdByName: input.actorName,
        createdAt: now,
        updatedAt: now,
      },
    ])
    log.info(
      { leads: 1, source: 'manual', pinned: pin.lat !== null },
      'leads:added'
    )
    return toLeadResponse(row!)
  },

  async update(
    id: string,
    input: UpdateLeadInput,
    now = new Date()
  ): Promise<LeadResponse> {
    const lead = await leadsRepository.findById(id)
    if (!lead) throw leadNotFound()
    const patch: LeadPatch = { updatedAt: now }

    if (input.name !== undefined) patch.name = input.name
    if (input.phone !== undefined) patch.phone = input.phone
    if (input.address !== undefined) patch.address = input.address || null
    if (input.mapsUrl !== undefined) patch.mapsUrl = input.mapsUrl

    // The pin decides the zone; a lead with no pin keeps the zone it is put in.
    const pinChanged = input.lat !== undefined
    const pin = pinChanged
      ? { lat: input.lat ?? null, lng: input.lng ?? null }
      : { lat: lead.lat, lng: lead.lng }
    if (input.zoneId !== undefined && pin.lat !== null) {
      throw new AppError(
        400,
        "A pinned lead's zone comes from its pin. Move the pin instead.",
        'LEAD_ZONE_FROM_PIN'
      )
    }
    if (pinChanged || input.zoneId !== undefined) {
      const zones = await leadsRepository.listZones()
      if (input.zoneId && !zones.some((zone) => zone.id === input.zoneId))
        throw zoneNotFound()
      patch.lat = pin.lat
      patch.lng = pin.lng
      patch.pinSource =
        pin.lat === null
          ? null
          : pinChanged
            ? pinSourceFor(
                input.mapsUrl !== undefined ? input.mapsUrl : lead.mapsUrl
              )
            : lead.pinSource
      patch.zoneId = leadZoneId(
        pin,
        input.zoneId !== undefined ? input.zoneId : lead.zoneId,
        zones
      )
    }

    // The garage it became, and its status.
    if (input.vendorId !== undefined && input.vendorId !== null) {
      const garage = await leadsRepository.findGarage(input.vendorId)
      if (!garage || garage.purgedAt)
        throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      if (garage.deletedAt) {
        throw new AppError(
          409,
          'That garage is in the Bin. Restore it first.',
          'VENDOR_IN_BIN'
        )
      }
      const other = await leadsRepository.findByVendor(input.vendorId)
      if (other && other.id !== lead.id) throw garageTaken()
      Object.assign(patch, {
        vendorId: input.vendorId,
        ...statusColumns({ status: 'onboarded' }, istDateKey(now), now),
      })
      if (lead.status === 'onboarded' && lead.onboardedAt)
        patch.onboardedAt = lead.onboardedAt
    } else if (input.status !== undefined) {
      if (
        input.status === 'onboarded' &&
        !(input.vendorId === undefined ? lead.vendorId : null)
      ) {
        throw new AppError(
          400,
          'Onboarded means a garage: use Onboard, or link the garage it became.',
          'LEAD_NEEDS_GARAGE'
        )
      }
      if (!(input.status === 'onboarded' && lead.status === 'onboarded')) {
        Object.assign(
          patch,
          statusColumns(
            {
              status: input.status,
              reason: input.reason,
              retryAfter: input.retryAfter,
            },
            istDateKey(now),
            now
          )
        )
      }
      // Back to To target or Not interested: no longer that garage.
      if (input.status !== 'onboarded') patch.vendorId = null
    } else if (input.vendorId === null) {
      Object.assign(patch, {
        vendorId: null,
        ...statusColumns({ status: 'to_target' }, istDateKey(now), now),
      })
    }

    const assigned = await assignee(input.assignedLoginId)
    if (assigned) Object.assign(patch, assigned)

    if (input.note !== undefined) {
      Object.assign(
        patch,
        input.note === ''
          ? { lastNote: null, lastNoteBy: null, lastNoteAt: null }
          : {
              lastNote: input.note,
              lastNoteBy: input.actorName,
              lastNoteAt: now,
            }
      )
    }

    // The garage link was written: the recommendations made into it follow
    // the row as saved, in the same transaction. Whenever it is written, not
    // only when it differs from the lead read above: that read may be stale
    // (linked meanwhile), and the rule changes only what differs.
    const garageChanged = patch.vendorId !== undefined
    const { row, synced } = await leadsRepository
      .transaction(async (tx) => {
        const row = await leadsRepository.update(id, patch, tx)
        if (!row) throw leadNotFound()
        const synced = garageChanged
          ? await syncRecommendations(tx, id, row.vendorId, now)
          : 0
        return { row, synced }
      })
      .catch((err: unknown) => {
        // Another lead linked to the same garage meanwhile (leads_vendor_id_key).
        if (hasPgCode(err, '23505')) throw garageTaken()
        throw err
      })
    log.info(
      { fields: Object.keys(patch).length - 1, recommendations: synced },
      'leads:updated'
    )
    return toLeadResponse(row)
  },

  /**
   * The lead Add garage was opened from is now that garage (POST
   * /admin/vendors { leadId }): Onboarded and linked, only while it has no
   * garage yet, and the recommendations made into it are linked to the
   * garage too (customer reach pays the referral credit on that link).
   * False when it was linked already (a second Create, or a double press).
   */
  async linkOnboardedGarage(
    leadId: string,
    vendorId: string,
    now = new Date()
  ): Promise<boolean> {
    const { linked, synced } = await leadsRepository.transaction(async (tx) => {
      const linked = await leadsRepository.markOnboarded(
        leadId,
        vendorId,
        now,
        tx
      )
      const synced = linked
        ? await syncRecommendations(tx, leadId, vendorId, now)
        : 0
      return { linked, synced }
    })
    log.info({ linked, recommendations: synced }, 'leads:onboarded')
    return linked
  },

  /**
   * Removes a lead. Recommendations made into it that never reached a
   * garage go back to their zone's list, in the same transaction.
   */
  async remove(id: string, now = new Date()): Promise<{ removed: true }> {
    const { removed, reopened } = await leadsRepository.transaction(
      async (tx) => {
        const reopened = await leadsRepository.reopenRecommendationsOfLead(
          id,
          now,
          tx
        )
        const removed = await leadsRepository.remove(id, tx)
        if (!removed) throw leadNotFound()
        return { removed, reopened }
      }
    )
    log.info({ leads: removed ? 1 : 0, reopened }, 'leads:removed')
    return { removed: true }
  },

  // ─── Customer recommendations (Coverage, 0064) ───────────────────────────

  /** What a lead made from this recommendation would look like among the leads and garages there are. */
  async recommendationDuplicates(
    recommendationId: string
  ): Promise<{ matches: DuplicateMatch[] }> {
    const rec = await leadsRepository.findRecommendation(recommendationId)
    if (!rec) throw recommendationNotFound()
    const zones = await leadsRepository.listZones()
    const made = leadFromRecommendation(rec, zones)
    return this.duplicates({
      name: made.name,
      phone: made.phone,
      lat: made.lat,
      lng: made.lng,
      zoneId: made.zoneId,
    })
  },

  /**
   * "Make lead" on a customer's recommendation: a new lead (source
   * `customer`; its name, phone and Maps link, the pin when the link
   * carries one), or, with `leadId`, linked to a lead the team already has
   * (not one already a garage). Either way the recommendation is taken on
   * (`contacted`) and points at the lead, so when that lead becomes a garage
   * the recommendation follows it. 409 LEAD_DUPLICATE for a lookalike unless
   * `allowDuplicate`; 409 RECOMMENDATION_HANDLED when it was not new.
   */
  async fromRecommendation(
    recommendationId: string,
    input: FromRecommendationInput,
    now = new Date()
  ): Promise<{ lead: LeadResponse; recommendation: RecommendationResponse }> {
    const rec = await leadsRepository.findRecommendation(recommendationId)
    if (!rec) throw recommendationNotFound()
    if (rec.status !== 'new') throw recommendationHandled()

    if (input.leadId) {
      const leadId = input.leadId
      // Under the lead's lock: a lead that became a garage meanwhile is
      // refused here, or (made one just after) finds this recommendation
      // and takes it to the garage (syncRecommendations), never leaving it
      // on a garage's lead with no garage, which would lose its credit.
      const { lead, handled } = await leadsRepository.transaction(
        async (tx) => {
          const lead = await leadsRepository.lockById(leadId, tx)
          if (!lead) throw leadNotFound()
          if (lead.vendorId) {
            throw new AppError(
              409,
              'That lead is already a garage. Make a new lead, or dismiss this one.',
              'LEAD_ALREADY_ONBOARDED'
            )
          }
          const handled = await leadsRepository.handleRecommendation(
            rec.id,
            {
              status: 'contacted',
              leadId: lead.id,
              handledBy: input.actorName,
              now,
            },
            tx
          )
          if (!handled) throw recommendationHandled()
          return { lead, handled }
        }
      )
      log.info({ linked: true }, 'leads:recommendation_taken')
      return {
        lead: toLeadResponse(lead),
        recommendation: toRecommendationResponse(handled),
      }
    }

    const zones = await leadsRepository.listZones()
    const made = leadFromRecommendation(rec, zones)
    if (!input.allowDuplicate) {
      const known = await this.knownPlaces(zones)
      const matches = findDuplicates(
        {
          name: made.name,
          phones: [made.phone],
          lat: made.lat,
          lng: made.lng,
          zoneId: made.zoneId,
        },
        known,
        LEAD_DUPLICATE_RADIUS_M
      )
      if (matches.length > 0) throw duplicateError(matches.map(toMatch))
    }
    const { lead, handled } = await leadsRepository.transaction(async (tx) => {
      const [lead] = await leadsRepository.insert(
        [
          {
            ...made,
            source: 'customer',
            status: 'to_target',
            createdByName: input.actorName,
            createdAt: now,
            updatedAt: now,
          },
        ],
        tx
      )
      const handled = await leadsRepository.handleRecommendation(
        rec.id,
        {
          status: 'contacted',
          leadId: lead!.id,
          handledBy: input.actorName,
          now,
        },
        tx
      )
      // Taken meanwhile: the lead goes too (the transaction rolls back).
      if (!handled) throw recommendationHandled()
      return { lead: lead!, handled }
    })
    log.info(
      { leads: 1, source: 'customer', pinned: made.lat !== null },
      'leads:added'
    )
    return {
      lead: toLeadResponse(lead),
      recommendation: toRecommendationResponse(handled),
    }
  },

  /** "Dismiss": the recommendation leaves the zone's list (declined), by whom. */
  async dismissRecommendation(
    recommendationId: string,
    actorName: string,
    now = new Date()
  ): Promise<RecommendationResponse> {
    const rec = await leadsRepository.findRecommendation(recommendationId)
    if (!rec) throw recommendationNotFound()
    const handled = await leadsRepository.handleRecommendation(rec.id, {
      status: 'declined',
      leadId: null,
      handledBy: actorName,
      now,
    })
    if (!handled) throw recommendationHandled()
    log.info({ dismissed: 1 }, 'leads:recommendation_dismissed')
    return toRecommendationResponse(handled)
  },

  /**
   * Restore a dismissed recommendation (0065): back in its zone's list to
   * act on. Who dismissed it is cleared with it; the log says who restored.
   */
  async restoreRecommendation(recommendationId: string, actorName: string, now = new Date()): Promise<RecommendationResponse> {
    const rec = await leadsRepository.findRecommendation(recommendationId)
    if (!rec) throw recommendationNotFound()
    const restored = await leadsRepository.restoreRecommendation(rec.id, now)
    if (!restored) {
      throw new AppError(409, 'This recommendation is not dismissed. Reload to see it as it is now.', 'RECOMMENDATION_NOT_DISMISSED')
    }
    log.info({ restored: 1, by: actorName }, 'leads:recommendation_restored')
    return toRecommendationResponse(restored)
  },

  /** Paste a list's preview: each line, its problem, and the places it looks like. Nothing is saved. */
  async pastePreview(input: PastePreviewInput) {
    const zones = await leadsRepository.listZones()
    if (input.zoneId && !zones.some((zone) => zone.id === input.zoneId))
      throw zoneNotFound()
    const { lines, tooMany } = parsePastedLeads(input.text)
    const known = await this.knownPlaces(zones)
    const seenAbove: Array<{ name: string; phone: string | null }> = []
    return {
      max: LEAD_PASTE_MAX,
      tooMany,
      lines: lines.map((line) => {
        const duplicates = line.problem
          ? []
          : findDuplicates(
              {
                name: line.name,
                phones: [line.phone],
                lat: null,
                lng: null,
                zoneId: input.zoneId ?? null,
              },
              known,
              LEAD_DUPLICATE_RADIUS_M
            )
              .slice(0, 3)
              .map(toMatch)
        // The same phone on two lines is one place twice.
        const repeatedPhone =
          !line.problem &&
          line.phone !== null &&
          seenAbove.some((above) => above.phone === line.phone)
        const problem: PasteProblem | null =
          line.problem ?? (repeatedPhone ? 'repeated' : null)
        if (!problem) seenAbove.push({ name: line.name, phone: line.phone })
        return {
          ...line,
          problem,
          problemText: problem ? PASTE_PROBLEM_TEXT[problem] : null,
          duplicates,
        }
      }),
    }
  },

  /** Paste a list's Save: the lines kept become leads, To target, in the zone. */
  async pasteSave(input: PasteSaveInput, now = new Date()) {
    const zones = await leadsRepository.listZones()
    if (input.zoneId && !zones.some((zone) => zone.id === input.zoneId))
      throw zoneNotFound()
    const known = await this.knownPlaces(zones)
    const blocked = input.rows.filter(
      (row) =>
        !row.allowDuplicate &&
        findDuplicates(
          {
            name: row.name,
            phones: [row.phone],
            lat: null,
            lng: null,
            zoneId: input.zoneId,
          },
          known,
          LEAD_DUPLICATE_RADIUS_M
        ).length > 0
    )
    if (blocked.length > 0) {
      throw new AppError(
        409,
        `${blocked.length === 1 ? '1 line looks' : `${blocked.length} lines look`} like places you already have. Untick ${blocked.length === 1 ? 'it' : 'them'}, or tick Save anyway.`,
        'LEAD_DUPLICATE'
      )
    }
    const assigned = (await assignee(input.assignedLoginId)) ?? {
      assignedLoginId: null,
      assignedName: null,
    }
    const rows = await leadsRepository.insert(
      input.rows.map((row): NewLead => ({
        name: row.name,
        phone: row.phone,
        zoneId: input.zoneId,
        source: 'paste',
        status: 'to_target',
        ...assigned,
        createdByName: input.actorName,
        createdAt: now,
        updatedAt: now,
      }))
    )
    log.info({ leads: rows.length, source: 'paste' }, 'leads:added')
    return { added: rows.length, leads: rows.map(toLeadResponse) }
  },

  /**
   * "Add N as leads" from the zone finder. Each keeps its place ids; what
   * Ola gave is the lead's own name, phone and address (Ola's terms set no
   * time limit), what Google gave is held apart and dated (Google's: 30
   * days, then refreshed or cleared). The pin is Ola's when Ola found it,
   * else Google's (and then it is Google's content too). A place already
   * a lead by its place id is skipped.
   */
  async fromPlaces(input: FromPlacesInput, now = new Date()) {
    const zones = await leadsRepository.listZones()
    if (!zones.some((zone) => zone.id === input.zoneId)) throw zoneNotFound()

    const googleIds = input.places.flatMap((place) =>
      place.google ? [place.google.placeId] : []
    )
    const olaIds = input.places.flatMap((place) =>
      place.ola ? [place.ola.placeId] : []
    )
    const existing = await leadsRepository.listByPlaceIds(googleIds, olaIds)
    const takenGoogle = new Set(
      existing.flatMap((row) => (row.googlePlaceId ? [row.googlePlaceId] : []))
    )
    const takenOla = new Set(
      existing.flatMap((row) => (row.olaPlaceId ? [row.olaPlaceId] : []))
    )

    const assigned = (await assignee(input.assignedLoginId)) ?? {
      assignedLoginId: null,
      assignedName: null,
    }
    const rows: NewLead[] = []
    let skipped = 0
    for (const { google, ola } of input.places) {
      if (
        (google && takenGoogle.has(google.placeId)) ||
        (ola && takenOla.has(ola.placeId))
      ) {
        skipped++
        continue
      }
      if (google) takenGoogle.add(google.placeId)
      if (ola) takenOla.add(ola.placeId)
      const pinFrom = ola ?? google!
      const pin = { lat: pinFrom.lat, lng: pinFrom.lng }
      rows.push({
        // Ola names run to 200; ours are 120.
        name: ola ? ola.name.slice(0, LEAD_NAME_MAX).trim() : null,
        phone: ola?.phone ?? null,
        address: ola?.address ?? null,
        lat: pin.lat,
        lng: pin.lng,
        pinSource: ola ? 'ola' : 'google',
        zoneId: zoneFor(pin, zones)?.id ?? input.zoneId,
        source: google ? 'google' : 'ola',
        status: 'to_target',
        ...assigned,
        olaPlaceId: ola?.placeId ?? null,
        ...(google
          ? {
              googlePlaceId: google.placeId,
              googleName: google.name,
              googlePhone: google.phone,
              googleAddress: google.address,
              googleRating:
                google.rating === null ? null : google.rating.toFixed(1),
              googleReviewCount: google.reviewCount,
              googleFetchedAt: now,
            }
          : {}),
        createdByName: input.actorName,
        createdAt: now,
        updatedAt: now,
      })
    }
    const added = await leadsRepository.insert(rows).catch((err: unknown) => {
      // The same place added by someone else (or a second press) since the
      // check above: the place id is unique. Nothing of this batch is saved.
      if (hasPgCode(err, '23505')) {
        throw new AppError(
          409,
          'Some of these were just added as leads. Search again to see them.',
          'LEAD_PLACE_TAKEN'
        )
      }
      throw err
    })
    log.info({ leads: added.length, skipped }, 'leads:added_from_places')
    return { added: added.length, skipped, leads: added.map(toLeadResponse) }
  },

  /**
   * The nightly refresh of what Google gave (Google's terms, 30 days): in
   * the 01:00–04:59 IST cron runs, leads whose Google details are 29 days
   * old or more, the oldest first, 20 a run within 10 seconds. Each is read
   * again from Google and updated, or cleared when Google no longer has the
   * place or (past 30 days) cannot be asked, Google not connected included.
   * The team's own name, phone, notes and status are never touched. Logs
   * counts only.
   */
  async refreshGoogle(options: { dryRun: boolean }, now = new Date()) {
    if (!isGoogleRefreshHour(now)) return { ran: false as const }
    const due = await leadsRepository.listGoogleDue(
      new Date(now.getTime() - GOOGLE_REFRESH_AFTER_DAYS * DAY_MS),
      GOOGLE_REFRESH_BATCH
    )
    if (options.dryRun) return { ran: true as const, due: due.length }

    const google = placesSources().google
    const zones = due.some((lead) => lead.pinSource === 'google')
      ? await leadsRepository.listZones()
      : []
    const started = Date.now()
    const counts = { refreshed: 0, cleared: 0, kept: 0, failed: 0 }
    for (const lead of due) {
      if (Date.now() - started > REFRESH_BUDGET_MS) break
      let details: GooglePlaceDetails | null | undefined
      if (!lead.googlePlaceId) {
        details = null
      } else if (google) {
        try {
          details = await google.details(lead.googlePlaceId)
        } catch {
          counts.failed++
          details = undefined
        }
      }
      const outcome = googleRefreshOutcome(lead, details, now)
      if (outcome.kind === 'kept') {
        counts.kept++
        continue
      }
      const { pin, googleRating, ...fields } = outcome.patch
      const patch: LeadPatch = { ...fields, googleRating, updatedAt: now }
      if (pin === null)
        Object.assign(patch, { lat: null, lng: null, pinSource: null })
      if (pin)
        Object.assign(patch, {
          lat: pin.lat,
          lng: pin.lng,
          zoneId: zoneFor(pin, zones)?.id ?? lead.zoneId,
        })
      const applied = await leadsRepository.applyGoogleRefresh(
        lead.id,
        lead.googleFetchedAt!,
        patch
      )
      if (applied) counts[outcome.kind]++
    }
    log.info({ due: due.length, ...counts }, 'leads:google_refresh')
    return { ran: true as const, due: due.length, ...counts }
  },
}
