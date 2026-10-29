/**
 * The Detlio garage agreement, click to agree (0063). Pure, unit-tested
 * (agreements.test.ts). modules/agreements stores and serves; every rule is
 * here:
 *
 *   - **Versions**: admin uploads a PDF (Settings → Garage agreement); each
 *     upload is the next version, and the highest is the one garages are
 *     asked to accept. The file sits in the public R2 bucket under
 *     `agreements/` (the agreement is not secret, and the private documents
 *     bucket, R2_DOCS_BUCKET, is not set in production).
 *   - **Accepting**: the garage's owner seat ticks "I agree to the terms" and
 *     presses Confirm. We record the garage, the version, who (user and name),
 *     when, and a keyed hash of the IP address, never the address.
 *   - **Standing** (`agreementStanding`): accepted the latest version, or
 *     accepted an earlier one and the latest came out under 30 days ago
 *     (TIER_RULES.bronze.agreementGraceDays). Either way the garage holds
 *     Bronze (lib/tiers.ts). It has no SQL twin: no list filters on it,
 *     and modules/agreements reads it for a batch of garages at once.
 *
 * The garage's words are twinned in packages/core/src/agreements.ts
 * (agreements.parity.test.ts).
 */
import { createHmac } from 'node:crypto'
import { istDateKey } from './ist.js'
import { TIER_RULES } from './tiers.js'

/** The one kind of file an agreement is. */
export const AGREEMENT_CONTENT_TYPE = 'application/pdf'

/** 10 MB: a long contract as a PDF fits easily. */
export const AGREEMENT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Days a garage that accepted an earlier version keeps Bronze after a new
 * one comes out. The number lives in TIER_RULES with every other tier
 * threshold.
 */
export const AGREEMENT_GRACE_DAYS = TIER_RULES.bronze.agreementGraceDays

/** The longest "what changed" note. */
export const AGREEMENT_NOTE_MAX = 300

/** What a garage owner reads on the screen. */
export const AGREEMENT_TITLE = 'Detlio garage agreement'

/** The tick's words, recorded with the acceptance. */
export const AGREEMENT_TICK = 'I agree to the terms'

// ─── The file ────────────────────────────────────────────────────────────────

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const KEY_RE = new RegExp(`^agreements/v([1-9][0-9]{0,5})-${UUID}\\.pdf$`)

/** Where version `version`'s PDF goes in the public bucket. */
export function agreementKey(version: number, uuid: string): string {
  return `agreements/v${version}-${uuid}.pdf`
}

/**
 * The version a key this API minted was made for, or null when the key is
 * not one (another folder, a `..`, any other name). Publishing checks it is
 * still the next version, so two admins uploading at once cannot both
 * publish the same number.
 */
export function agreementKeyVersion(key: string): number | null {
  const match = KEY_RE.exec(key)
  return match ? Number(match[1]) : null
}

export type AgreementUploadRefusal = 'not_pdf' | 'empty' | 'too_large'

/** Why a file may not be uploaded as the agreement, before any link is made, or null. */
export function agreementUploadRefusal(contentType: string, sizeBytes: number): AgreementUploadRefusal | null {
  if (contentType !== AGREEMENT_CONTENT_TYPE) return 'not_pdf'
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return 'empty'
  if (sizeBytes > AGREEMENT_MAX_BYTES) return 'too_large'
  return null
}

/** Whether the first bytes of a file are a PDF's ("%PDF-"), whatever its name or type says. */
export function looksLikePdf(head: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]
  return head.length >= magic.length && magic.every((byte, i) => head[i] === byte)
}

/** The version a new upload gets: one after the latest, or 1. */
export function nextAgreementVersion(latest: number | null): number {
  return (latest ?? 0) + 1
}

// ─── The acceptance ──────────────────────────────────────────────────────────

/**
 * A keyed hash of the address the acceptance came from: enough to show two
 * acceptances came from the same place, never the address itself. Keyed
 * from JWT_SECRET with its own purpose, so it cannot be reversed by hashing
 * every IPv4 address. Null without an address.
 */
export function ipHash(ip: string | null | undefined, secret: string): string | null {
  const address = ip?.trim()
  if (!address || address === 'unknown') return null
  const key = createHmac('sha256', secret).update('detlio-agreement-ip-v1').digest()
  return createHmac('sha256', key).update(address).digest('hex')
}

// ─── Standing ────────────────────────────────────────────────────────────────

export type AgreementStatus = 'not_published' | 'accepted' | 'grace' | 'not_accepted'

export interface AgreementFacts {
  /** The latest version admin published, or null before the first. */
  latest: { version: number; publishedAt: Date } | null
  /** The highest version this garage accepted, or null. */
  acceptedVersion: number | null
}

export interface AgreementStanding {
  status: AgreementStatus
  /** Holds Bronze on it: accepted, or within the 30 days of a new version. */
  bronze: boolean
  latestVersion: number | null
  acceptedVersion: number | null
  /** While in the 30 days: the IST date by which to accept the new version. */
  acceptBy: string | null
}

/** When a version's 30 days run out. */
export function graceEndsAt(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + AGREEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Where a garage stands with the agreement now. Accepted the latest: done.
 * Accepted an earlier version and the latest came out under 30 days ago: it
 * keeps Bronze until then, and is asked to accept. Otherwise not accepted
 * (or, before admin publishes anything, nothing to accept).
 */
export function agreementStanding(facts: AgreementFacts, now: Date): AgreementStanding {
  const base = {
    latestVersion: facts.latest?.version ?? null,
    acceptedVersion: facts.acceptedVersion,
  }
  if (!facts.latest) return { ...base, status: 'not_published', bronze: false, acceptBy: null }
  if (facts.acceptedVersion !== null && facts.acceptedVersion >= facts.latest.version) {
    return { ...base, status: 'accepted', bronze: true, acceptBy: null }
  }
  const ends = graceEndsAt(facts.latest.publishedAt)
  if (facts.acceptedVersion !== null && now.getTime() < ends.getTime()) {
    // The last whole IST day before it runs out.
    return {
      ...base,
      status: 'grace',
      bronze: true,
      acceptBy: istDateKey(new Date(ends.getTime() - 1)),
    }
  }
  return { ...base, status: 'not_accepted', bronze: false, acceptBy: null }
}

export type AcceptRefusal = 'not_published' | 'stale_version' | 'already_accepted' | 'support_session'

/**
 * Why an acceptance can't be recorded, or null. The garage names the version
 * it read: a newer one published meanwhile must be read first. A Detlio
 * support session can never agree for the garage.
 */
export function acceptRefusal(input: {
  latestVersion: number | null
  version: number
  alreadyAccepted: boolean
  viaSupport: boolean
}): AcceptRefusal | null {
  if (input.viaSupport) return 'support_session'
  if (input.latestVersion === null) return 'not_published'
  if (input.version !== input.latestVersion) return 'stale_version'
  if (input.alreadyAccepted) return 'already_accepted'
  return null
}
