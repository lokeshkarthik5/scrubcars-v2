import { createHash, randomUUID } from 'node:crypto'
import {
  AGREEMENT_CONTENT_TYPE,
  AGREEMENT_MAX_BYTES,
  AGREEMENT_TITLE,
  acceptRefusal,
  agreementKey,
  agreementKeyVersion,
  agreementStanding,
  ipHash,
  looksLikePdf,
  nextAgreementVersion,
  type AgreementStanding,
} from '../../lib/agreements.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  createPresignedPutForKey,
  deleteObject,
  headObject,
  isStorageConfigured,
  publicUrlForKey,
  readObject,
} from '../../lib/storage.js'
import { agreementsRepository, type AgreementVersionRecord } from './agreements.repository.js'
import type { AcceptAgreementInput, AgreementUploadUrlInput, PublishAgreementInput } from './agreements.validation.js'

const log = logger.child({ module: 'agreements' })

function storageOff() {
  return new AppError(503, 'File storage is not set up, so the agreement cannot be uploaded.', 'STORAGE_NOT_CONFIGURED')
}

/** A version as the garage and admin read it. */
function versionView(version: AgreementVersionRecord) {
  return {
    id: version.id,
    version: version.version,
    title: `${AGREEMENT_TITLE} v${version.version}`,
    url: version.fileUrl,
    sizeBytes: version.sizeBytes,
    note: version.note,
    publishedAt: version.publishedAt.toISOString(),
  }
}

/**
 * Where each of these garages stands with the agreement now (Bronze's one
 * fact). Two reads for any number of garages: the latest version, and each
 * one's highest accepted version.
 */
export async function agreementStandings(
  vendorIds: string[],
  now = new Date()
): Promise<Map<string, AgreementStanding>> {
  const latest = await agreementsRepository.latest()
  const accepted = latest ? await agreementsRepository.acceptedVersions(vendorIds) : new Map<string, number>()
  return new Map(
    vendorIds.map((id) => [
      id,
      agreementStanding(
        {
          latest: latest ? { version: latest.version, publishedAt: latest.publishedAt } : null,
          acceptedVersion: accepted.get(id) ?? null,
        },
        now
      ),
    ])
  )
}

/** Whether admin has published any agreement yet (the nightly tier run waits for the first). */
export async function agreementPublished(): Promise<boolean> {
  return (await agreementsRepository.latest()) !== undefined
}

async function garageView(vendorId: string, now = new Date()) {
  const latest = await agreementsRepository.latest()
  const standing = (await agreementStandings([vendorId], now)).get(vendorId)!
  const acceptances = await agreementsRepository.listAcceptances(vendorId)
  const latestAcceptance = latest ? acceptances.find((row) => row.version === latest.version) : undefined
  return {
    latest: latest ? versionView(latest) : null,
    standing,
    /** When the latest version was accepted, and by whom. */
    accepted: latestAcceptance
      ? { at: latestAcceptance.acceptedAt.toISOString(), by: latestAcceptance.acceptedByName }
      : null,
  }
}

export type GarageAgreementView = Awaited<ReturnType<typeof garageView>>

export const agreementsService = {
  // ─── The garage's own (owner seat) ─────────────────────────────────────────

  /** GET /vendors/me/agreement: the latest version, its PDF and where the garage stands. */
  getForGarage(vendorId: string) {
    return garageView(vendorId)
  },

  /**
   * The owner seat ticked "I agree to the terms" and pressed Confirm on the
   * version it read. Records who, when and a hash of the IP. Pressing it
   * again (a double tap) records nothing more and answers the same.
   */
  async accept(
    vendorId: string,
    actor: { userId: string; viaSupport: boolean; ip: string | null },
    input: AcceptAgreementInput
  ) {
    const latest = await agreementsRepository.latest()
    const existing = latest ? await agreementsRepository.findAcceptance(vendorId, latest.id) : undefined
    const refusal = acceptRefusal({
      latestVersion: latest?.version ?? null,
      version: input.version,
      alreadyAccepted: existing !== undefined,
      viaSupport: actor.viaSupport,
    })
    switch (refusal) {
      case 'support_session':
        throw new AppError(
          403,
          'Only the garage can accept its agreement. A Detlio support session cannot accept it for them.',
          'AGREEMENT_GARAGE_ONLY'
        )
      case 'not_published':
        throw new AppError(404, 'There is no garage agreement to accept yet.', 'AGREEMENT_NOT_PUBLISHED')
      case 'stale_version':
        throw new AppError(
          409,
          'Detlio has published a newer version of the agreement. Read it before you accept.',
          'AGREEMENT_VERSION_CHANGED'
        )
      case 'already_accepted':
        return garageView(vendorId)
      case null:
        break
    }

    const user = await agreementsRepository.findUser(actor.userId)
    const name = user?.name?.trim() || user?.phone || 'Garage owner'
    await agreementsRepository.transaction((repo) =>
      repo.insertAcceptance({
        vendorId,
        versionId: latest!.id,
        version: latest!.version,
        userId: actor.userId,
        acceptedByName: name.slice(0, 120),
        ipHash: ipHash(actor.ip, env.jwtSecret),
      })
    )
    log.info({ vendorId, version: latest!.version }, 'agreements:accepted')
    return garageView(vendorId)
  },

  // ─── Admin (super-admin) ───────────────────────────────────────────────────

  /** Settings → Garage agreement: every version, newest first, with how many garages accepted it. */
  async listForAdmin() {
    const versions = await agreementsRepository.listVersions()
    return {
      storageReady: isStorageConfigured(),
      maxBytes: AGREEMENT_MAX_BYTES,
      versions: versions.map((row) => ({
        id: row.id,
        version: row.version,
        title: `${AGREEMENT_TITLE} v${row.version}`,
        url: row.fileUrl,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        note: row.note,
        publishedAt: row.publishedAt.toISOString(),
        publishedBy: row.publishedBy,
        acceptances: row.acceptances,
      })),
    }
  },

  /** A link to upload the next version's PDF, for that exact size, in `agreements/`. */
  async createUploadUrl(input: AgreementUploadUrlInput) {
    if (!isStorageConfigured()) throw storageOff()
    const latest = await agreementsRepository.latest()
    const version = nextAgreementVersion(latest?.version ?? null)
    const key = agreementKey(version, randomUUID())
    const { uploadUrl } = await createPresignedPutForKey(key, AGREEMENT_CONTENT_TYPE, input.sizeBytes)
    return { uploadUrl, key, version }
  },

  /**
   * Publishes the uploaded PDF as the next version. The key must be one this
   * API made for the next version (someone publishing meanwhile means upload
   * again), and the object must be there, a PDF by its first bytes, and at
   * most 10 MB; otherwise it is deleted and refused.
   */
  async publish(actorSub: string, input: PublishAgreementInput) {
    if (!isStorageConfigured()) throw storageOff()
    const keyVersion = agreementKeyVersion(input.key)
    if (keyVersion === null) {
      throw new AppError(400, 'That upload is not an agreement upload. Upload the PDF again.', 'AGREEMENT_KEY_INVALID')
    }
    const head = await headObject(input.key)
    if (!head) {
      throw new AppError(400, 'The PDF did not finish uploading. Upload it again.', 'AGREEMENT_FILE_MISSING')
    }
    // The whole file (10 MB at most) is read once: its first bytes must say
    // PDF, and its SHA-256 is recorded, so what each garage accepted can be
    // proved against the PDF later.
    const file = head.sizeBytes > 0 && head.sizeBytes <= AGREEMENT_MAX_BYTES ? await readObject(input.key) : null
    if (!file || file.body.length !== head.sizeBytes || !looksLikePdf(file.body)) {
      await deleteObject(input.key)
      throw new AppError(400, 'That file is not a PDF of up to 10 MB.', 'AGREEMENT_NOT_PDF')
    }
    const sha256 = createHash('sha256').update(file.body).digest('hex')

    const published = await agreementsRepository.transaction(async (repo) => {
      await repo.lockPublishing()
      const latest = await repo.latest()
      if (keyVersion !== nextAgreementVersion(latest?.version ?? null)) {
        throw new AppError(
          409,
          'Someone published a version while you were uploading. Upload the PDF again.',
          'AGREEMENT_VERSION_TAKEN'
        )
      }
      const row = await repo.insertVersion({
        version: keyVersion,
        fileKey: input.key,
        fileUrl: publicUrlForKey(input.key),
        sizeBytes: head.sizeBytes,
        sha256,
        note: input.note ? input.note : null,
        publishedBy: input.actorName,
        publishedBySub: actorSub,
      })
      await repo.insertAudit({
        action: 'agreement_published',
        actorSub,
        actorName: input.actorName,
        summary: { version: row.version },
        detail: { key: row.fileKey, sizeBytes: row.sizeBytes, sha256: row.sha256, note: row.note },
      })
      return row
    })
    log.info({ version: published.version }, 'agreements:published')
    return versionView(published)
  },

  /** A garage's acceptances, for its admin page: version, when and who. */
  async acceptancesForAdmin(vendorId: string) {
    const rows = await agreementsRepository.listAcceptances(vendorId)
    return rows.map((row) => ({
      version: row.version,
      acceptedAt: row.acceptedAt.toISOString(),
      acceptedBy: row.acceptedByName,
    }))
  },
}
