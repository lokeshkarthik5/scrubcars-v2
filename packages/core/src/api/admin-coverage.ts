import { apiClient } from '@repo/core/api/client'
import type {
  LeadSource,
  LeadStatus,
  MatchReason,
  PlaceKind,
} from '@repo/core/leads'
import { signedBody } from './admin-signer'

/**
 * Coverage & leads (0064): Chennai's zones with the team's garages and
 * leads, the zone edits, the leads themselves and the zone finder.
 * Super-admin only. New with this release: the panel reads a 404 from an
 * older API as "not there yet".
 */

export interface CoverageZone {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
  priority: boolean
  target: number
  liveAt: string | null
  updatedAt: string
}

export type GarageStage =
  'live' | 'pending' | 'not_shown' | 'paused' | 'suspended' | 'archived'

export interface CoverageGarage {
  id: string
  name: string
  phone: string
  lat: number | null
  lng: number | null
  /** From its pin by the zones' rule (the server works it out); null with no pin or outside every zone. */
  zoneId: string | null
  live: boolean
  stage: GarageStage
}

export interface Lead {
  id: string
  /** What to call it: the team's name, else Google's while held. */
  name: string
  /** The name the team typed or confirmed; null while only Google's is known. */
  ownName: string | null
  phone: string | null
  ownPhone: string | null
  address: string | null
  mapsUrl: string | null
  lat: number | null
  lng: number | null
  pinSource: 'maps_link' | 'map' | 'google' | 'ola' | null
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
  /** What Google gave, while it is held (30 days, then read again or cleared). */
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

/** A zone's demand (part 3): what customers asked for there. */
export interface ZoneDemand {
  zoneId: string
  /** On the zone's free-wash list while it is not live yet. */
  waiting: number
  signups: number
  /** Sign-ups holding a free wash they have not used. */
  unusedFreeWashes: number
  /** Requests sent from the zone in the last `hotRule.requestDays` days. */
  requests: number
  openRequests: number
  /** Nobody accepted. */
  failedRequests: number
  recommendations: number
  newRecommendations: number
  /** waiting + failed requests: what Hot ranks by. */
  score: number
  hot: boolean
}

/** The Hot rule's numbers, as the API applies them. */
export interface HotRule {
  top: number
  minScore: number
  requestDays: number
}

export type RecommendationStatus = 'new' | 'contacted' | 'joined' | 'declined'

/** "Know a good garage here?": a customer's recommendation, never who made it. */
export interface CoverageRecommendation {
  id: string
  zoneId: string | null
  name: string
  phone: string | null
  mapsLink: string | null
  why: string | null
  /** new: in the zone's list; contacted: made into (or linked to) `leadId`; joined: that lead became `vendorId`. */
  status: RecommendationStatus
  leadId: string | null
  vendorId: string | null
  handledBy: string | null
  handledAt: string | null
  createdAt: string
}

export interface CoverageOverview {
  zones: CoverageZone[]
  garages: CoverageGarage[]
  leads: Lead[]
  finder: { google: boolean; ola: boolean }
  /** Part 3: absent from an API before it (the panel deploys first). */
  demand?: ZoneDemand[]
  hotRule?: HotRule
  recommendations?: CoverageRecommendation[]
  /** Dismissed recommendations (0065), latest first: the Dismissed filter. Absent before 0065. */
  dismissedRecommendations?: CoverageRecommendation[]
}

/** GET /admin/coverage */
export async function getCoverage() {
  return apiClient<CoverageOverview>('/admin/coverage')
}

export interface ZoneInput {
  name: string
  lat: number
  lng: number
  priority: boolean
  target: number
}

/** POST /admin/coverage/zones — 409 ZONE_NAME_TAKEN, 400 ZONE_INVALID (far from Chennai, bad target). */
export async function createZone(input: ZoneInput) {
  return apiClient<CoverageZone>('/admin/coverage/zones', {
    method: 'POST',
    body: signedBody(input),
  })
}

/** PATCH /admin/coverage/zones/:id — rename, priority, target, move (lat and lng together). */
export async function updateZone(id: string, input: Partial<ZoneInput>) {
  return apiClient<CoverageZone>(`/admin/coverage/zones/${id}`, {
    method: 'PATCH',
    body: signedBody(input),
  })
}

/** DELETE /admin/coverage/zones/:id — 409 ZONE_IN_USE while a lead, sign-up, request or recommendation points at it (the message says which). */
export async function removeZone(id: string) {
  return apiClient<{ removed: true }>(`/admin/coverage/zones/${id}`, {
    method: 'DELETE',
  })
}

export interface DuplicateMatch {
  kind: 'lead' | 'garage'
  id: string
  name: string
  status: LeadStatus | 'live' | 'not_live'
  zoneId: string | null
  reason: MatchReason
}

/** POST /admin/leads/resolve-pin — a Maps link's pin and the zone it is in. */
export async function resolveLeadPin(mapsUrl: string) {
  return apiClient<{
    lat: number | null
    lng: number | null
    warning: string | null
    zone: { id: string; name: string } | null
  }>('/admin/leads/resolve-pin', {
    method: 'POST',
    body: JSON.stringify({ mapsUrl }),
  })
}

/** POST /admin/leads/duplicates — what a lead about to be saved looks like. */
export async function findLeadDuplicates(input: {
  name?: string
  phone?: string | null
  lat?: number | null
  lng?: number | null
  zoneId?: string | null
  excludeLeadId?: string
}) {
  return apiClient<{ matches: DuplicateMatch[] }>('/admin/leads/duplicates', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface CreateLeadInput {
  name: string
  phone?: string | null
  mapsUrl?: string | null
  lat?: number | null
  lng?: number | null
  zoneId?: string | null
  status?: 'to_target' | 'not_interested'
  reason?: string
  retryAfter?: string | null
  assignedLoginId?: string | null
  note?: string
  allowDuplicate?: boolean
}

/** POST /admin/leads — 409 LEAD_DUPLICATE unless allowDuplicate. */
export async function createLead(input: CreateLeadInput) {
  return apiClient<Lead>('/admin/leads', {
    method: 'POST',
    body: signedBody(input),
  })
}

/** GET /admin/leads/:id */
export async function getLead(id: string) {
  return apiClient<Lead>(`/admin/leads/${id}`)
}

export interface UpdateLeadInput {
  name?: string
  phone?: string | null
  address?: string | null
  mapsUrl?: string | null
  lat?: number | null
  lng?: number | null
  zoneId?: string | null
  status?: LeadStatus
  reason?: string
  retryAfter?: string | null
  assignedLoginId?: string | null
  /** '' clears the note. */
  note?: string
  vendorId?: string | null
}

/** PATCH /admin/leads/:id */
export async function updateLead(id: string, input: UpdateLeadInput) {
  return apiClient<Lead>(`/admin/leads/${id}`, {
    method: 'PATCH',
    body: signedBody(input),
  })
}

/** DELETE /admin/leads/:id */
export async function removeLead(id: string) {
  return apiClient<{ removed: true }>(`/admin/leads/${id}`, {
    method: 'DELETE',
  })
}

export type PasteProblem =
  'no_name' | 'bad_phone' | 'name_too_long' | 'repeated'

export interface PastePreview {
  max: number
  tooMany: boolean
  lines: Array<{
    line: number
    name: string
    phone: string | null
    problem: PasteProblem | null
    problemText: string | null
    duplicates: DuplicateMatch[]
  }>
}

/** POST /admin/leads/paste/preview — nothing is saved. */
export async function previewPastedLeads(text: string, zoneId: string | null) {
  return apiClient<PastePreview>('/admin/leads/paste/preview', {
    method: 'POST',
    body: JSON.stringify({ text, zoneId }),
  })
}

/** POST /admin/leads/paste — the lines kept; 409 LEAD_DUPLICATE for a duplicate not allowed. */
export async function savePastedLeads(input: {
  zoneId: string | null
  assignedLoginId?: string | null
  rows: Array<{ name: string; phone: string | null; allowDuplicate?: boolean }>
}) {
  return apiClient<{ added: number; leads: Lead[] }>('/admin/leads/paste', {
    method: 'POST',
    body: signedBody(input),
  })
}

export interface PlaceSourcePart {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  lat: number
  lng: number
}

export interface FoundPlace {
  key: string
  name: string
  address: string | null
  lat: number
  lng: number
  phone: string | null
  rating: number | null
  reviewCount: number | null
  kinds: PlaceKind[]
  google: PlaceSourcePart | null
  ola: PlaceSourcePart | null
  distanceKm: number
  known: {
    kind: 'lead' | 'garage'
    id: string
    name: string
    status: LeadStatus | 'live' | 'not_live'
    assignedName: string | null
    notInterestedReason: string | null
    reason: MatchReason
  } | null
}

export type PlaceSourceState = 'ok' | 'off' | 'partial' | 'failed'

export interface PlacesSearchResult {
  zone: { id: string; name: string }
  sources: { google: PlaceSourceState; ola: PlaceSourceState }
  counts: {
    found: number
    google: number
    ola: number
    both: number
    known: number
    new: number
  }
  places: FoundPlace[]
}

/** POST /admin/places/search — 429 RATE_LIMIT_EXCEEDED past the hour's searches. */
export async function searchPlaces(input: {
  zoneId: string
  kinds: PlaceKind[]
  text?: string
}) {
  return apiClient<PlacesSearchResult>('/admin/places/search', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** POST /admin/leads/from-places — ticked results become leads in the zone. */
export async function addPlacesAsLeads(input: {
  zoneId: string
  assignedLoginId?: string | null
  places: Array<{ google: PlaceSourcePart | null; ola: PlaceSourcePart | null }>
}) {
  return apiClient<{ added: number; skipped: number; leads: Lead[] }>(
    '/admin/leads/from-places',
    {
      method: 'POST',
      body: signedBody(input),
    }
  )
}

/** POST /admin/coverage/recommendations/:id/duplicates — what a lead made of it looks like. */
export async function getRecommendationDuplicates(id: string) {
  return apiClient<{ matches: DuplicateMatch[] }>(
    `/admin/coverage/recommendations/${id}/duplicates`,
    { method: 'POST' }
  )
}

/**
 * POST /admin/coverage/recommendations/:id/lead — Make lead, or with
 * `leadId` link it to a lead the team has. 409 LEAD_DUPLICATE unless
 * `allowDuplicate`, RECOMMENDATION_HANDLED once it is not new,
 * LEAD_ALREADY_ONBOARDED for a lead that is a garage.
 */
export async function makeLeadFromRecommendation(
  id: string,
  input: { leadId?: string; allowDuplicate?: boolean } = {}
) {
  return apiClient<{ lead: Lead; recommendation: CoverageRecommendation }>(
    `/admin/coverage/recommendations/${id}/lead`,
    { method: 'POST', body: signedBody(input) }
  )
}

/** POST /admin/coverage/recommendations/:id/restore (0065): a dismissed one, back to new. */
export async function restoreRecommendation(id: string) {
  return apiClient<CoverageRecommendation>(
    `/admin/coverage/recommendations/${id}/restore`,
    { method: 'POST', body: signedBody({}) }
  )
}

/** POST /admin/coverage/recommendations/:id/dismiss */
export async function dismissRecommendation(id: string) {
  return apiClient<CoverageRecommendation>(
    `/admin/coverage/recommendations/${id}/dismiss`,
    { method: 'POST', body: signedBody({}) }
  )
}
