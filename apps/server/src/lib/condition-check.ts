/**
 * The car condition check at handover (0075, behind CONDITION_CHECK_ENABLED;
 * owner-approved screens, mockup ai-round/3-condition-check). Pure and
 * clock-free, so each rule is a one-line test; the module that uses it is
 * modules/condition-check, and Detlio's AI reading is condition-check-ai.ts.
 *
 *  - **The walk-round.** Eight angles (front, back, both sides, the four
 *    corners), taken by the garage. Required for pickup & drop (before
 *    Picked up) and doorstep jobs (before Start job), where the car leaves
 *    the customer's sight; optional at the garage, with the same nudge the
 *    job photos have. Detlio's photo waiver on a booking waives it too. It
 *    replaces the 5-slot before checklist while it is on, so the garage
 *    takes one set of photos, not two.
 *  - **Marks are a draft.** Detlio's AI marks scratches, dents, cracks and
 *    paint chips already there; the garage removes a wrong one (Undo) or
 *    adds one it missed, then sends. Once sent, the before car-check photos
 *    and their marks are fixed: they are the record.
 *  - **The customer** answers "Looks right" or "Something's wrong" (a note
 *    the garage and the team read). No answer is no hold on the job.
 *  - **After the job** each after photo is compared with the before photo of
 *    the same angle. A possible new mark warns the garage above Complete
 *    (never blocks) and is shown to the customer, who can raise a complaint
 *    through the ordinary complaints flow. Nothing blames anyone.
 *
 * Words and numbers the apps print are twinned in
 * packages/core/src/condition-check.ts (condition-check.parity.test.ts).
 */

import { CORNER_ANGLE_LABELS, PHOTO_ANGLE_LABELS, type JobPhotoAngle } from './job-photo-standards.js'
import type { JobPhotoStage, PhotoLink } from './job-records.js'
import { toJobPhotoView } from './job-records.js'

// ─── Angles, kinds, words ────────────────────────────────────────────────────

/** The walk-round, in the order the garage goes round the car. */
export const CAR_CHECK_ANGLES = [
  'front',
  'back',
  'left',
  'right',
  'front_left',
  'front_right',
  'back_left',
  'back_right',
] as const
export type CarCheckAngle = (typeof CAR_CHECK_ANGLES)[number]

export const CAR_CHECK_ANGLE_LABELS: Record<CarCheckAngle, string> = {
  front: PHOTO_ANGLE_LABELS.front,
  back: PHOTO_ANGLE_LABELS.back,
  left: PHOTO_ANGLE_LABELS.left,
  right: PHOTO_ANGLE_LABELS.right,
  ...CORNER_ANGLE_LABELS,
}

export function isCarCheckAngle(value: unknown): value is CarCheckAngle {
  return typeof value === 'string' && (CAR_CHECK_ANGLES as readonly string[]).includes(value)
}

/** What a mark can be. Text + CHECK in 0075. */
export const DAMAGE_KINDS = ['scratch', 'dent', 'crack', 'paint_chip', 'other'] as const
export type DamageKind = (typeof DAMAGE_KINDS)[number]

export const DAMAGE_KIND_LABELS: Record<DamageKind, string> = {
  scratch: 'Scratch',
  dent: 'Dent',
  crack: 'Crack',
  paint_chip: 'Paint chip',
  other: 'Mark',
}

export type MarkSource = 'ai' | 'garage'
export type ConditionAnswer = 'looks_right' | 'something_wrong'
export type ConditionRead = 'done' | 'failed'

/** Where on the car, in a few words. Also the column's length (0075). */
export const MARK_PART_MAX = 60

/** The customer's "Something's wrong" note. Also the column's length. */
export const CONDITION_NOTE_MAX = 500

/** Marks kept from one photo: a car with more is photographed close up. */
export const MAX_MARKS_PER_PHOTO = 8

/**
 * The garage's photos per stage while the check is on: the eight angles,
 * and room for four more (the interior, a close-up). 0045's cap of six is
 * for the five-slot checklist.
 */
export const CAR_CHECK_PHOTO_CAP = 12

/** "Scratch – rear left door". */
export function markLabel(kind: DamageKind, part: string): string {
  return `${DAMAGE_KIND_LABELS[kind]} – ${part}`
}

/**
 * Where on the car, cleaned: one line, letters and a few marks only (never
 * a digit, so nothing like a number plate can ride along), lower case,
 * at most MARK_PART_MAX characters. Null when nothing is left.
 */
export function cleanPart(raw: string | null | undefined): string | null {
  const line = (raw ?? '')
    .replace(/[^\p{L} ,'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, MARK_PART_MAX)
    .trim()
  return line.length > 0 ? line : null
}

export interface MarkBox {
  x: number
  y: number
  w: number
  h: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * A box on a photo, 0-1 from its top left, kept inside the photo; null for
 * one that is not a box (not numbers, or too small to circle).
 */
export function cleanBox(box: Partial<MarkBox> | null | undefined): MarkBox | null {
  if (!box) return null
  const { x, y, w, h } = box
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const left = clamp01(x as number)
  const top = clamp01(y as number)
  const width = Math.min(clamp01(w as number), 1 - left)
  const height = Math.min(clamp01(h as number), 1 - top)
  if (width < 0.01 || height < 0.01) return null
  const round = (n: number) => Math.round(n * 1000) / 1000
  return { x: round(left), y: round(top), w: round(width), h: round(height) }
}

// ─── The switch ──────────────────────────────────────────────────────────────

/** CONDITION_CHECK_ENABLED: off unless it says `on` (any case, spaces trimmed). */
export function parseConditionCheckEnabled(raw: string | undefined): boolean {
  return (raw ?? '').trim().toLowerCase() === 'on'
}

export interface ConditionCheckSetting {
  /** CONDITION_CHECK_ENABLED. */
  enabled: boolean
  /** CONDITION_CHECK_GARAGES: on for these garages whatever the switch says. */
  garages: ReadonlySet<string>
}

/** Whether a garage's jobs have the car condition check. */
export function conditionCheckOnFor(vendorId: string, setting: ConditionCheckSetting): boolean {
  return setting.enabled || setting.garages.has(vendorId.toLowerCase())
}

// ─── What the garage must do ─────────────────────────────────────────────────

/** Pickup & drop and doorstep: the car leaves the customer's sight. */
const LEAVES_SIGHT = new Set(['pickup', 'doorstep'])

/**
 * Whether the walk-round must be done (and sent) before the job moves on:
 * pickup & drop and doorstep jobs, unless Detlio waived the job's photos.
 * Optional at the garage.
 */
export function carCheckRequired(job: { bookingType: string; photosWaivedAt?: Date | null }): boolean {
  return LEAVES_SIGHT.has(job.bookingType) && job.photosWaivedAt == null
}

/**
 * The step the check stands before: Picked up for pickup & drop (the car
 * goes with the garage), Start job (Mark in progress) for everything else.
 */
export function carCheckGateStep(bookingType: string): 'picked_up' | 'start' {
  return bookingType === 'pickup' ? 'picked_up' : 'start'
}

/** The garage's photos the rules read. */
export interface CheckPhoto {
  id: string
  stage: JobPhotoStage
  angle?: string | null
  uploadedByRole?: string | null
  createdAt: Date
}

/**
 * The garage's latest photo of each car-check angle of a stage (a retake
 * replaces the one before it, as the checklist shows).
 */
export function carCheckPhotos<P extends CheckPhoto>(
  photos: readonly P[],
  stage: JobPhotoStage
): Map<CarCheckAngle, P> {
  const latest = new Map<CarCheckAngle, P>()
  for (const photo of photos) {
    if (photo.stage !== stage || (photo.uploadedByRole ?? 'garage') !== 'garage') continue
    if (!isCarCheckAngle(photo.angle)) continue
    const held = latest.get(photo.angle)
    if (!held || held.createdAt.getTime() <= photo.createdAt.getTime()) latest.set(photo.angle, photo)
  }
  return latest
}

export interface CarCheckGateRefusal {
  /** Angles still to photograph. */
  missing: number
  /** Taken but not sent to the customer yet. */
  notSent: boolean
}

/**
 * What the check still waits for before Picked up / Start job, or null when
 * nothing (or when it is not required on this job).
 *
 * Once sent, nothing: Send itself held the job to the angles it needed then,
 * and the sent check's photos cannot be retaken or added to. A check sent
 * while Detlio's waiver stood (fewer than eight) would otherwise hold the job
 * for ever once the waiver was undone.
 */
export function carCheckGateRefusal(input: {
  required: boolean
  anglesTaken: number
  sentAt: Date | null
}): CarCheckGateRefusal | null {
  if (!input.required || input.sentAt !== null) return null
  const missing = Math.max(0, CAR_CHECK_ANGLES.length - input.anglesTaken)
  const notSent = input.sentAt === null
  return missing > 0 || notSent ? { missing, notSent } : null
}

/**
 * The gate as a job step meets it (bookings.service): null unless the check
 * is on for the garage, `step` is the one the job's type stands it before,
 * and the walk-round is required and not yet complete and sent.
 */
export function carCheckGateFor(
  job: {
    on: boolean
    bookingType: string
    photosWaivedAt?: Date | null
    photos: readonly CheckPhoto[]
    sentAt: Date | null
  },
  step: 'picked_up' | 'start'
): CarCheckGateRefusal | null {
  if (!job.on || carCheckGateStep(job.bookingType) !== step) return null
  return carCheckGateRefusal({
    required: carCheckRequired(job),
    anglesTaken: carCheckPhotos(job.photos, 'before').size,
    sentAt: job.sentAt,
  })
}

/**
 * The garage's words for a refusal, one line each ("Take 2 more car check
 * photos", "Send the car check to the customer"). Twinned in packages/core,
 * which lists them beside the disabled button.
 */
export function carCheckGateLines(refusal: CarCheckGateRefusal): string[] {
  const lines: string[] = []
  if (refusal.missing > 0) {
    lines.push(
      refusal.missing === 1
        ? 'Take 1 more car check photo'
        : `Take ${refusal.missing} more car check photos`
    )
  }
  if (refusal.notSent) lines.push('Send the car check to the customer')
  return lines
}

/** The refusal as one sentence, for a 409. */
export function carCheckGateMessage(refusal: CarCheckGateRefusal): string {
  const [first, ...rest] = carCheckGateLines(refusal)
  const later = rest.map((line) => line.charAt(0).toLowerCase() + line.slice(1))
  return `${[first, ...later].join(', then ')}.`
}

// ─── Changing the record ─────────────────────────────────────────────────────

/**
 * Whether a garage photo is fixed because the check was sent: a before
 * photo of a car-check angle. Extras stay the garage's to change.
 */
export function carCheckPhotoLocked(input: {
  stage: JobPhotoStage
  angle: string | null | undefined
  sentAt: Date | null
}): boolean {
  return input.stage === 'before' && input.sentAt !== null && isCarCheckAngle(input.angle)
}

/** Whether Detlio's AI should look at a photo: the garage's, of a car-check angle, not yet read. */
export function photoToRead(photo: {
  angle?: string | null
  uploadedByRole?: string | null
  conditionRead?: string | null
}): boolean {
  return (
    (photo.uploadedByRole ?? 'garage') === 'garage' &&
    isCarCheckAngle(photo.angle) &&
    (photo.conditionRead ?? null) === null
  )
}

/** The statuses in which the garage takes the check (before photos are open). */
const CHECK_OPEN = new Set(['confirmed', 'in_progress'])

export type SendRefusal = 'job_over' | 'already_sent' | 'no_photos' | 'missing_angles'

/**
 * Whether the garage can send the before check now: while the job is
 * accepted or under way, once, with at least one car-check photo (all
 * eight where the check is required).
 */
export function sendRefusal(input: {
  status: string
  required: boolean
  anglesTaken: number
  sentAt: Date | null
}): SendRefusal | null {
  if (!CHECK_OPEN.has(input.status)) return 'job_over'
  if (input.sentAt !== null) return 'already_sent'
  if (input.anglesTaken === 0) return 'no_photos'
  if (input.required && input.anglesTaken < CAR_CHECK_ANGLES.length) return 'missing_angles'
  return null
}

export function sendRefusalMessage(refusal: SendRefusal): string {
  switch (refusal) {
    case 'job_over':
      return 'The car check can be sent while the job is accepted or under way.'
    case 'already_sent':
      return 'This car check was already sent to the customer.'
    case 'no_photos':
      return 'Take the car check photos first.'
    case 'missing_angles':
      return `Take all ${CAR_CHECK_ANGLES.length} car check photos first.`
  }
}

export type MarkEditRefusal = 'job_over' | 'sent'

/**
 * Whether the garage can remove, restore or add a before mark: until the
 * check is sent, while the job is accepted or under way.
 */
export function markEditRefusal(input: { status: string; sentAt: Date | null }): MarkEditRefusal | null {
  if (!CHECK_OPEN.has(input.status)) return 'job_over'
  if (input.sentAt !== null) return 'sent'
  return null
}

export type AnswerRefusal = 'not_sent' | 'already_answered' | 'job_over'

/**
 * Whether the customer can answer the before check: once it is sent, once,
 * on a booking that is going ahead (or done).
 */
export function answerRefusal(input: {
  status: string
  sentAt: Date | null
  answeredAt: Date | null
}): AnswerRefusal | null {
  if (input.status === 'cancelled' || input.status === 'rescheduled') return 'job_over'
  if (input.sentAt === null) return 'not_sent'
  if (input.answeredAt !== null) return 'already_answered'
  return null
}

/** A "Something's wrong" note, tidied; null when there is nothing to send. */
export function cleanNote(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\r\n?/g, '\n').trim().slice(0, CONDITION_NOTE_MAX).trim()
  return text.length > 0 ? text : null
}

// ─── What each app is told ───────────────────────────────────────────────────

export interface MarkRow {
  id: string
  photoId: string
  comparedPhotoId: string | null
  stage: JobPhotoStage
  kind: DamageKind
  part: string
  boxX: number | null
  boxY: number | null
  boxW: number | null
  boxH: number | null
  source: MarkSource
  unsure: boolean
  removedAt: Date | null
  garageAnswer: 'was_there' | null
  garageAnsweredAt?: Date | null
  customerAnswer: 'already_there' | null
  customerAnsweredAt?: Date | null
  createdAt: Date
}

export interface CheckRow {
  sentAt: Date
  customerAnswer: ConditionAnswer | null
  customerAnsweredAt: Date | null
  customerNote: string | null
}

export interface ViewPhoto extends CheckPhoto {
  url: string
  conditionRead?: string | null
}

export interface ConditionJob {
  status: string
  bookingType: string
  photosWaivedAt?: Date | null
  photos: readonly ViewPhoto[]
  check: CheckRow | null
  marks: readonly MarkRow[]
}

/** A mark as an app gets it. */
export function toMarkView(mark: MarkRow) {
  const box =
    mark.boxX !== null && mark.boxY !== null && mark.boxW !== null && mark.boxH !== null
      ? { x: mark.boxX, y: mark.boxY, w: mark.boxW, h: mark.boxH }
      : null
  return {
    id: mark.id,
    photoId: mark.photoId,
    beforePhotoId: mark.comparedPhotoId,
    stage: mark.stage,
    kind: mark.kind,
    part: mark.part,
    label: markLabel(mark.kind, mark.part),
    box,
    unsure: mark.unsure,
    source: mark.source,
    removed: mark.removedAt !== null,
    garageAnswer: mark.garageAnswer,
    customerAnswer: mark.customerAnswer,
  }
}

function byCreated(a: { createdAt: Date }, b: { createdAt: Date }) {
  return a.createdAt.getTime() - b.createdAt.getTime()
}

function answerView(check: CheckRow | null) {
  return check?.customerAnswer && check.customerAnsweredAt
    ? { kind: check.customerAnswer, at: check.customerAnsweredAt.toISOString(), note: check.customerNote }
    : null
}

/**
 * The garage's view (`conditionCheck` on its booking payload): what the
 * walk-round has, which photos Detlio has still to look at (`unread`, the
 * portal asks for each), every mark of the photos that stand (removed ones
 * too, for Undo), the customer's answer, and what Picked up / Start job wait
 * for. The photos themselves are the payload's own `photos`.
 */
export function garageConditionView(job: ConditionJob, ai: boolean) {
  const required = carCheckRequired(job)
  const before = carCheckPhotos(job.photos, 'before')
  const after = carCheckPhotos(job.photos, 'after')
  const standing = new Set([...before.values(), ...after.values()].map((photo) => photo.id))
  const sentAt = job.check?.sentAt ?? null
  return {
    required,
    ai,
    sentAt: sentAt?.toISOString() ?? null,
    canSend:
      sendRefusal({ status: job.status, required, anglesTaken: before.size, sentAt }) === null,
    taken: { before: before.size, after: after.size },
    // Only while AI is on: off, nothing will ever read them.
    unread: ai
      ? [...before.values(), ...after.values()]
          .filter((photo) => photoToRead(photo) && !(photo.stage === 'before' && sentAt !== null))
          .map((photo) => photo.id)
      : [],
    marks: [...job.marks]
      .filter((mark) => standing.has(mark.photoId))
      .sort(byCreated)
      .map(toMarkView),
    photos: [] as ReturnType<typeof toJobPhotoView>[],
    answer: answerView(job.check),
    gate: carCheckGateRefusal({ required, anglesTaken: before.size, sentAt }),
  }
}

export type ConditionView = ReturnType<typeof garageConditionView>

/**
 * The customer's view, or null when there is nothing to show: the before
 * check once the garage has sent it (its photos, its marks, their answer),
 * and once the job is completed the possible new marks with the two photos
 * of each. Removed marks, unread photos and the gate are the garage's.
 * The photos come with their own signed links (`link`), because the
 * customer's `photos` hold the garage's only once the work has started.
 */
export function customerConditionView(job: ConditionJob, ai: boolean, link: PhotoLink): ConditionView | null {
  const sentAt = job.check?.sentAt ?? null
  const done = job.status === 'completed'
  const before = carCheckPhotos(job.photos, 'before')
  const after = carCheckPhotos(job.photos, 'after')
  const shownBefore = sentAt ? [...before.values()] : []
  const standingAfter = new Set([...after.values()].map((photo) => photo.id))
  const marks = [...job.marks]
    .filter((mark) => mark.removedAt === null)
    .filter((mark) =>
      mark.stage === 'before'
        ? shownBefore.some((photo) => photo.id === mark.photoId)
        : done && standingAfter.has(mark.photoId)
    )
    .sort(byCreated)
  if (shownBefore.length === 0 && marks.length === 0) return null

  // The before photos, and for each new mark its after photo and the before
  // photo it was compared with.
  const wanted = new Set(shownBefore.map((photo) => photo.id))
  for (const mark of marks) {
    if (mark.stage !== 'after') continue
    wanted.add(mark.photoId)
    if (mark.comparedPhotoId) wanted.add(mark.comparedPhotoId)
  }
  const photos = job.photos
    .filter((photo) => wanted.has(photo.id))
    .map((photo) => toJobPhotoView({ ...photo, angle: photo.angle ?? null }, link))

  return {
    required: false,
    ai,
    sentAt: sentAt?.toISOString() ?? null,
    canSend: false,
    taken: { before: shownBefore.length, after: 0 },
    unread: [],
    marks: marks.map(toMarkView),
    photos,
    answer: answerView(job.check),
    gate: null,
  }
}

/** The angle words for a photo ("Front left"), for logs and admin. */
export function carCheckAngleLabel(angle: JobPhotoAngle | null | undefined): string {
  return angle && isCarCheckAngle(angle) ? CAR_CHECK_ANGLE_LABELS[angle] : 'Extra'
}
