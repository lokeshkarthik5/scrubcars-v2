/**
 * The car condition check at handover (0075), as the apps show it: the
 * walk-round's eight angles, the kinds of mark, the gate's words and the
 * helpers the screens share. Twin of apps/server/src/lib/condition-check.ts,
 * which decides; the server's condition-check.parity.test.ts keeps the two
 * the same. Pure.
 */

import type { ConditionCheck, ConditionMark, JobPhoto } from '@repo/core/types'
import { msg, t, tn } from './i18n/translate'

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
  front: msg('Front'),
  back: msg('Back'),
  left: msg('Left side'),
  right: msg('Right side'),
  front_left: msg('Front left'),
  front_right: msg('Front right'),
  back_left: msg('Back left'),
  back_right: msg('Back right'),
}

export function isCarCheckAngle(value: unknown): value is CarCheckAngle {
  return typeof value === 'string' && (CAR_CHECK_ANGLES as readonly string[]).includes(value)
}

export const DAMAGE_KINDS = ['scratch', 'dent', 'crack', 'paint_chip', 'other'] as const
export type DamageKind = (typeof DAMAGE_KINDS)[number]

export const DAMAGE_KIND_LABELS: Record<DamageKind, string> = {
  scratch: msg('Scratch'),
  dent: msg('Dent'),
  crack: msg('Crack'),
  paint_chip: msg('Paint chip'),
  other: msg('Mark'),
}

/** The garage's photos per stage while the check is on: the eight angles and four more. */
export const CAR_CHECK_PHOTO_CAP = 12

/** Where on the car, in a few words (the garage's "Add a mark"). */
export const MARK_PART_MAX = 60

/** The customer's "Something's wrong" note. */
export const CONDITION_NOTE_MAX = 500

/** "Scratch – rear left door": the kind in the language in use, the place as written. */
export function markLabel(mark: Pick<ConditionMark, 'kind' | 'part'>): string {
  return t('{kind} – {part}', { kind: t(DAMAGE_KIND_LABELS[mark.kind]), part: mark.part })
}

/** The latest photo of each walk-round angle, of one side and stage, in walk-round order. */
export function carCheckSlots(
  photos: readonly JobPhoto[],
  stage: JobPhoto['stage'],
  by: JobPhoto['by'] = 'garage'
): Array<{ angle: CarCheckAngle; photo: JobPhoto | null }> {
  const ofStage = photos.filter((photo) => photo.by === by && photo.stage === stage)
  return CAR_CHECK_ANGLES.map((angle) => ({
    angle,
    photo: [...ofStage].reverse().find((photo) => photo.angle === angle) ?? null,
  }))
}

/**
 * What the check still waits for before Picked up / Start job, one line
 * each ("Take 2 more car check photos", "Send the car check to the
 * customer"); empty when nothing.
 */
export function carCheckGateLines(gate: ConditionCheck['gate']): string[] {
  if (!gate) return []
  const lines: string[] = []
  if (gate.missing > 0) {
    lines.push(tn(gate.missing, 'Take {count} more car check photo', 'Take {count} more car check photos'))
  }
  if (gate.notSent) lines.push(t('Send the car check to the customer'))
  return lines
}

/** The before marks the customer is shown (or the garage still has). */
export function beforeMarks(check: ConditionCheck, includeRemoved = false): ConditionMark[] {
  return check.marks.filter((mark) => mark.stage === 'before' && (includeRemoved || !mark.removed))
}

/** Possible new marks after the job, not removed. */
export function newMarks(check: ConditionCheck): ConditionMark[] {
  return check.marks.filter((mark) => mark.stage === 'after' && !mark.removed)
}

/**
 * The possible new marks the garage still has to look at: not yet answered
 * "It was there". Shown above Complete job; they warn, never block.
 */
export function newMarksForGarage(check: ConditionCheck | null): ConditionMark[] {
  return check ? newMarks(check).filter((mark) => mark.garageAnswer === null) : []
}

/** The possible new marks the customer has not said were already there. */
export function newMarksForCustomer(check: ConditionCheck | null): ConditionMark[] {
  return check ? newMarks(check).filter((mark) => mark.customerAnswer === null) : []
}

/** A photo by id, from the check's own photos or the booking's. */
export function photoById(photos: readonly JobPhoto[], id: string | null | undefined): JobPhoto | null {
  return id ? (photos.find((photo) => photo.id === id) ?? null) : null
}
