import { CAR_CHECK_ANGLES, CAR_CHECK_PHOTO_CAP, beforeMarks, carCheckSlots } from '@repo/core/condition-check';
import { t } from '@repo/core/i18n/translate';
import { MAX_JOB_PHOTOS_PER_STAGE } from '@repo/core/job-records';
import { angleSlots, PHOTO_ANGLES, type JobPhotoAngle } from '@repo/core/job-photo-standards';
import type { Booking, ConditionCheck, ConditionMark, JobPhoto } from '@repo/core/types';

/**
 * The car condition check's rules on the garage's screens (0075), the web's
 * (apps/vendors/components/job-photos.tsx, car-check.tsx, check-the-marks.tsx)
 * kept pure here so they can be tested: which checklist a stage shows, what the
 * walk-round's status line says, and which marks Check the marks lists.
 */

export interface PhotoChecklist {
  /** The check is on for this garage: the walk-round's 8 big tiles. */
  carCheck: boolean;
  angles: readonly JobPhotoAngle[];
  /** The stage holds the job (the check's before; else the photo standard). */
  required: boolean;
  /** Sent to the customer: the before angles are the record (no retake, no removal). */
  locked: boolean;
  /** The garage's photos per stage. */
  cap: number;
  /** Walk-round angles with a photo. */
  taken: number;
}

export function photoChecklist(booking: Booking, stage: JobPhoto['stage']): PhotoChecklist {
  const check = booking.conditionCheck;
  const standard = booking.photoStandard;
  const angles: readonly JobPhotoAngle[] = check ? CAR_CHECK_ANGLES : PHOTO_ANGLES;
  return {
    carCheck: check !== null,
    angles,
    required: check ? stage === 'before' && check.required : Boolean(standard?.required && !standard.waived),
    locked: Boolean(check?.sentAt) && stage === 'before',
    cap: check ? CAR_CHECK_PHOTO_CAP : MAX_JOB_PHOTOS_PER_STAGE,
    taken: angleSlots(booking.jobPhotos, 'garage', stage, angles).filter((slot) => slot.photo).length,
  };
}

/** Items in rows of two, the web's grid-cols-2: the last row's empty cell is null. */
export function inPairs<T>(items: readonly T[]): Array<[T, T | null]> {
  const rows: Array<[T, T | null]> = [];
  for (let i = 0; i < items.length; i += 2) rows.push([items[i]!, items[i + 1] ?? null]);
  return rows;
}

/**
 * Under the walk-round, before it is sent: Detlio still looking, how many marks it
 * found, or (AI off) a plain ask to check. Null before the first photo.
 */
export function carCheckSummaryLine(check: ConditionCheck, who: string): string | null {
  if (check.sentAt || check.taken.before === 0) return null;
  if (check.unread.length > 0) return t('Detlio is looking for scratches and dents…');
  if (!check.ai) return t('Check the photos for marks, then send them to {who}.', { who });
  const marks = beforeMarks(check);
  return marks.length === 1
    ? t('Detlio found 1 mark. Check it, then send it to {who}.', { who })
    : t('Detlio found {count} marks. Check them, then send them to {who}.', { count: marks.length, who });
}

export type TakenSlot = { angle: (typeof CAR_CHECK_ANGLES)[number]; photo: JobPhoto };

/** The walk-round's before photos that were taken, in walk-round order. */
export function takenBeforeSlots(photos: readonly JobPhoto[]): TakenSlot[] {
  return carCheckSlots(photos, 'before').filter((slot): slot is TakenSlot => slot.photo !== null);
}

/** Every before mark on a photo in view, removed ones too (for Undo). */
export function marksOnSlots(check: ConditionCheck, slots: readonly TakenSlot[]): ConditionMark[] {
  return beforeMarks(check, true).filter((mark) => slots.some((slot) => slot.photo.id === mark.photoId));
}

/** Check the marks' line under its title. `sentAt` is formatted by the screen. */
export function checkTheMarksLine(
  check: ConditionCheck,
  kept: number,
  words: { who: string; car: string; sentTime: string | null }
): string {
  const { who, car } = words;
  if (check.sentAt) {
    return t('Sent to {who} at {time}. The photos and marks stay with the booking.', { who, time: words.sentTime ?? '' });
  }
  if (check.unread.length > 0) return t('Detlio is still looking at {count} photos…', { count: check.unread.length });
  if (!check.ai) return t('Add any scratches or dents you see on {who}’s {car}, then send.', { who, car });
  return kept === 1
    ? t('Detlio found 1 mark on {who}’s {car}. Remove it if it is wrong, then send.', { who, car })
    : t('Detlio found {count} marks on {who}’s {car}. Remove any that are wrong, then send.', { count: kept, who, car });
}

/** The photo in view on Check the marks: the one tapped, else the first with a mark, else the first. */
export function selectedSlot(
  slots: readonly TakenSlot[],
  kept: readonly ConditionMark[],
  selectedId: string | null
): TakenSlot | undefined {
  return (
    slots.find((slot) => slot.photo.id === selectedId) ??
    slots.find((slot) => kept.some((mark) => mark.photoId === slot.photo.id)) ??
    slots[0]
  );
}
