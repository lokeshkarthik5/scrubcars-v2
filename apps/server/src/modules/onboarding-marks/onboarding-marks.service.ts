import { isDocumentStorageConfigured } from '../../lib/document-storage.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  summariesByVendor,
  summariseDocuments,
} from '../../lib/vendor-documents.js'
import {
  markLabel,
  payoutUsable,
  vendorMissing,
  type MarkKind,
  type MissingKey,
} from '../../lib/vendor-missing.js'
import {
  onboardingMarksRepository,
  type MarkRecord,
} from './onboarding-marks.repository.js'
import type {
  CreateMarkInput,
  MarkAskedInput,
  MarkStatus,
  UpdateMarkInput,
} from './onboarding-marks.validation.js'

const log = logger.child({ module: 'onboarding-marks' })

/** OnboardingMark (packages/core/src/api/admin-marks.ts). */
export function toMark(row: MarkRecord) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    kind: row.kind as MarkKind,
    label: markLabel(row.kind, row.label),
    note: row.note,
    status: row.status,
    askedAt: row.askedAt?.toISOString() ?? null,
    askedByName: row.askedByName,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type OnboardingMarkResponse = ReturnType<typeof toMark>

/** OnboardingMarkBrief: AdminVendor.openMarks. */
export type OnboardingMarkBrief = Pick<
  OnboardingMarkResponse,
  'id' | 'kind' | 'label' | 'status' | 'askedAt'
>

function vendorNotFound() {
  return new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
}

function markNotFound() {
  return new AppError(404, 'That mark does not exist', 'MARK_NOT_FOUND')
}

function markExists() {
  return new AppError(
    409,
    'This garage already has an open mark for that. Change that one instead.',
    'MARK_EXISTS'
  )
}

function inBin() {
  return new AppError(
    409,
    'This garage is in the Bin. Restore it to change it.',
    'VENDOR_IN_BIN'
  )
}

/** A garage that is not gone; `write` also refuses one in the Bin. */
async function assertGarage(vendorId: string, write: boolean) {
  const garage = await onboardingMarksRepository.findGarage(vendorId)
  if (!garage || garage.purgedAt) throw vendorNotFound()
  if (write && garage.deletedAt) throw inBin()
  return garage
}

/**
 * What a move to a status stamps: Asked says when and who, Received when;
 * back to To ask clears both. Staying where it is changes nothing.
 */
function statusPatch(
  from: MarkStatus | null,
  to: MarkStatus,
  actorName: string,
  now: Date
) {
  if (from === to) return {}
  switch (to) {
    case 'asked':
      return {
        status: to,
        askedAt: now,
        askedByName: actorName,
        receivedAt: null,
      }
    case 'received':
      return { status: to, receivedAt: now }
    case 'to_ask':
      return { status: to, askedAt: null, askedByName: null, receivedAt: null }
  }
}

export const onboardingMarksService = {
  async list(vendorId: string) {
    await assertGarage(vendorId, false)
    return (await onboardingMarksRepository.list(vendorId)).map(toMark)
  },

  async create(vendorId: string, input: CreateMarkInput, now = new Date()) {
    await assertGarage(vendorId, true)
    const status = input.status ?? 'to_ask'
    const stamped = statusPatch(null, status, input.actorName, now)
    const row = await onboardingMarksRepository.insert({
      vendorId,
      kind: input.kind,
      label: input.label ?? null,
      note: input.note ?? null,
      status,
      askedAt: null,
      askedByName: null,
      receivedAt: null,
      ...stamped,
      createdByName: input.actorName,
      createdAt: now,
      updatedAt: now,
    })
    if (row === 'exists') throw markExists()
    log.info({ vendorId, markId: row.id, kind: row.kind }, 'marks:created')
    return toMark(row)
  },

  async update(
    vendorId: string,
    markId: string,
    input: UpdateMarkInput,
    now = new Date()
  ) {
    await assertGarage(vendorId, true)
    const current = await onboardingMarksRepository.find(vendorId, markId)
    if (!current) throw markNotFound()
    const row = await onboardingMarksRepository.update(vendorId, markId, {
      ...(input.status !== undefined &&
        statusPatch(current.status, input.status, input.actorName, now)),
      ...(input.note !== undefined && { note: input.note }),
      ...(input.label !== undefined && { label: input.label }),
      updatedByName: input.actorName,
      updatedAt: now,
    })
    if (row === 'exists') throw markExists()
    if (!row) throw markNotFound()
    return toMark(row)
  },

  async remove(vendorId: string, markId: string) {
    await assertGarage(vendorId, true)
    if (!(await onboardingMarksRepository.remove(vendorId, markId))) {
      throw markNotFound()
    }
    log.info({ vendorId, markId }, 'marks:deleted')
  },

  /**
   * After Ask on WhatsApp. A garage named twice is merged. Every garage must
   * exist and be out of the Bin, or nothing is marked.
   */
  async markAsked(input: MarkAskedInput, now = new Date()) {
    const merged = new Map<
      string,
      { kinds: Set<MissingKey>; markIds: Set<string> }
    >()
    for (const garage of input.garages) {
      const entry = merged.get(garage.vendorId) ?? {
        kinds: new Set<MissingKey>(),
        markIds: new Set<string>(),
      }
      for (const kind of garage.kinds) entry.kinds.add(kind)
      for (const id of garage.markIds ?? []) entry.markIds.add(id)
      merged.set(garage.vendorId, entry)
    }
    const ids = [...merged.keys()]
    const garages = new Map(
      (await onboardingMarksRepository.findGarages(ids)).map((g) => [g.id, g])
    )
    for (const id of ids) {
      const garage = garages.get(id)
      if (!garage || garage.purgedAt) throw vendorNotFound()
      if (garage.deletedAt) throw inBin()
    }
    const rows = await onboardingMarksRepository.markAsked(
      [...merged.entries()].map(([vendorId, entry]) => ({
        vendorId,
        kinds: [...entry.kinds],
        markIds: [...entry.markIds],
      })),
      input.actorName,
      now
    )
    // A mark both named and of a kind asked for comes back twice.
    const byId = new Map(rows.map((row) => [row.id, row]))
    log.info({ garages: ids.length, marks: byId.size }, 'marks:asked')
    return { marks: [...byId.values()].map(toMark) }
  },

  /** Every garage's open marks, oldest first, for the Garages list. */
  async openBriefsByVendor(): Promise<Map<string, OnboardingMarkBrief[]>> {
    const byVendor = new Map<string, OnboardingMarkBrief[]>()
    for (const row of await onboardingMarksRepository.listOpenBriefs()) {
      const list = byVendor.get(row.vendorId) ?? []
      list.push({
        id: row.id,
        kind: row.kind as MarkKind,
        label: markLabel(row.kind, row.label),
        status: row.status,
        askedAt: row.askedAt?.toISOString() ?? null,
      })
      byVendor.set(row.vendorId, list)
    }
    return byVendor
  },

  /** Every garage's usable payout account, as a set of garage ids. */
  async payoutVendorIds(vendorIds?: string[]): Promise<Set<string>> {
    const rows = await onboardingMarksRepository.listPayoutAccounts(vendorIds)
    return new Set(rows.filter(payoutUsable).map((row) => row.vendorId))
  },

  /**
   * The missing keys of a few garages (lib/vendor-missing.ts), read in a
   * handful of grouped queries. A garage that does not exist is absent.
   */
  async missingFor(vendorIds: string[]): Promise<Map<string, MissingKey[]>> {
    const ids = [...new Set(vendorIds)]
    if (ids.length === 0) return new Map()
    const documentsOn = isDocumentStorageConfigured()
    const [facts, drawn, payout, documents] = await Promise.all([
      onboardingMarksRepository.listMissingFacts(ids),
      onboardingMarksRepository.listDrawnAreaIds(ids),
      this.payoutVendorIds(ids),
      documentsOn
        ? onboardingMarksRepository.listDocumentStates(ids)
        : Promise.resolve([]),
    ])
    const drawnIds = new Set(drawn)
    const summaries = summariesByVendor(documents)
    return new Map(
      facts.map((v) => [
        v.id,
        vendorMissing({
          ...v,
          photoCount: v.photos.length,
          hasDoorstepArea: drawnIds.has(v.id),
          documents: documentsOn
            ? (summaries.get(v.id) ?? summariseDocuments([]))
            : null,
          hasPayout: payout.has(v.id),
        }),
      ])
    )
  },
}
