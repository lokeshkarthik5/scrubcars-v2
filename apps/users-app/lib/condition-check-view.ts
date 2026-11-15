import { carCheckSlots, markLabel } from '@repo/core/condition-check';
import type { ComplaintCategory } from '@repo/core/complaints';
import { t } from '@repo/core/i18n/translate';
import type { Booking, ConditionMark, JobPhoto } from '@repo/core/types';

/**
 * The car condition check's rules on the customer's booking (0075), the web's
 * (apps/users/components/condition-check-card.tsx) kept pure here so they can be
 * tested: when the answer buttons show, what the card's line says, and what the
 * complaint about a new mark starts with.
 */

/**
 * A cancelled or moved booking keeps its record, but there is nothing to answer:
 * the server refuses an answer then (BOOKING_NOT_ACTIVE).
 */
export function canAnswerConditionCheck(booking: Pick<Booking, 'status' | 'conditionCheck'>): boolean {
  const check = booking.conditionCheck;
  if (!check?.sentAt || check.answer) return false;
  return booking.status !== 'cancelled' && booking.status !== 'rescheduled';
}

/** "Detlio found no marks." / "…marked 1 thing…" / "…marked {count} things already there." */
export function marksFoundLine(count: number): string {
  if (count === 0) return t('Detlio found no marks.');
  if (count === 1) return t('Detlio marked 1 thing already there.');
  return t('Detlio marked {count} things already there.', { count });
}

export type ShownSlot = { angle: ReturnType<typeof carCheckSlots>[number]['angle']; photo: JobPhoto };

/** The walk-round photos the check shows (its own signed links), in walk-round order. */
export function shownBeforeSlots(photos: readonly JobPhoto[]): ShownSlot[] {
  return carCheckSlots(photos, 'before').filter((slot): slot is ShownSlot => slot.photo !== null);
}

/** "Raise a complaint" from a new mark: about this booking, Damage to my car, filled in. */
export function newMarkComplaint(mark: Pick<ConditionMark, 'kind' | 'part'>): { category: ComplaintCategory; message: string } {
  return {
    category: 'damage',
    message: t('{label}: it is not in the car check photos from before the job.', { label: markLabel(mark) }),
  };
}
