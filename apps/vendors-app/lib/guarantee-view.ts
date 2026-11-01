import type { GarageClaim } from '@repo/core/api/guarantee';
import { GUARANTEE_RULES, timeLeftLabel } from '@repo/core/guarantee';
import type { JobPhoto } from '@repo/core/types';

/**
 * The words and small decisions of the free redo claims inbox, the parts of
 * apps/vendors/app/guarantee/page.tsx and packages/ui/src/features/guarantee-photos.tsx
 * that are not drawing. Pure, so they can be tested; the clock is a parameter.
 */

export const OWNER_ONLY = 'Only the garage owner can see and answer redo claims.';
export const NOT_SWITCHED_ON = 'Free redo claims are not switched on yet.';
export const ACCEPTED_TOAST = 'Accepted. The customer picks a time for the redo.';
export const DISPUTED_TOAST = 'Sent to Detlio to decide.';
export const ACCEPT_FAILED = 'Could not answer. Please try again.';
export const DISPUTE_FAILED = 'Could not send. Please try again.';

/** The paragraph under the title. */
export const GUARANTEE_INTRO =
  `A customer can ask for a free redo within ${GUARANTEE_RULES.claimWindowHours} hours of a wash or detailing, ` +
  `with photos. Answer within ${GUARANTEE_RULES.garageReviewHours} hours of your opening hours, or the redo is ` +
  'approved. Jobs without your before and after photos are approved at once.';

/** Under "Dispute this claim". */
export const DISPUTE_INTRO =
  `Say why the job was done properly. Detlio compares both sides' photos and decides within ` +
  `${GUARANTEE_RULES.detlioDecideHours} hours.`;

/** The shortest reason Send to Detlio takes, after trimming. */
export const DISPUTE_MIN_CHARS = 5;

/** Whether "Send to Detlio" can be pressed. */
export function canSendDispute(note: string): boolean {
  return note.trim().length >= DISPUTE_MIN_CHARS;
}

/** What is sent: trimmed, and never longer than the server takes. */
export function disputeNote(note: string): string {
  return note.trim().slice(0, GUARANTEE_RULES.garageNoteMax);
}

/** "Answer within 3 h 20 m of now (by 6:40 pm)", or null once the time has passed. */
export function answerByLine(
  claim: Pick<GarageClaim, 'garageRespondBy'>,
  now: number,
  formatTime: (iso: string) => string
): string | null {
  const left = timeLeftLabel(claim.garageRespondBy, now);
  if (!left) return null;
  const by = claim.garageRespondBy ? ` (by ${formatTime(claim.garageRespondBy)})` : '';
  return `Answer within ${left} of now${by}`;
}

/** The first line of a card: "Asha · Premium Car Wash". */
export const claimTitle = (claim: Pick<GarageClaim, 'customerFirstName' | 'service'>) =>
  `${claim.customerFirstName} · ${claim.service}`;

/** The second line: "Booking #AB12 · done Tue, 4:10 pm". */
export function claimSubtitle(
  claim: Pick<GarageClaim, 'bookingRef' | 'completedAt'>,
  formatTime: (iso: string) => string
): string {
  return `Booking #${claim.bookingRef}${claim.completedAt ? ` · done ${formatTime(claim.completedAt)}` : ''}`;
}

export interface ClaimNote {
  text: string;
  /** The redo booked line is in the primary text colour, the rest secondary. */
  primary?: boolean;
}

/** The route notes under the evidence, in the web's order. */
export function claimNotes(claim: GarageClaim, formatTime: (iso: string) => string): ClaimNote[] {
  const notes: ClaimNote[] = [];
  if (claim.route === 'auto') {
    notes.push({ text: 'Approved at once: there were no before and after photos on this job.' });
  }
  if (claim.route === 'detlio' && claim.status === 'needs_detlio' && !claim.garageResponse) {
    notes.push({ text: 'Detlio is reviewing this claim. Nothing for you to do yet.' });
  }
  if (claim.garageResponse === 'disputed' && claim.garageNote) {
    notes.push({ text: `You disputed it: “${claim.garageNote}”` });
  }
  if (claim.garageResponse === 'timed_out') {
    notes.push({ text: 'There was no answer in time, so the redo was approved.' });
  }
  if (claim.decisionReason) {
    notes.push({ text: `Detlio: “${claim.decisionReason}”` });
  }
  if (claim.status === 'refund_approved') {
    notes.push({ text: 'Detlio approved a refund instead of a redo. Nothing is paid out on this job.' });
  }
  if (claim.redoBooking) {
    notes.push({
      text: `Free redo booked for ${formatTime(claim.redoBooking.scheduledAt)} — it is on your Bookings page.`,
      primary: true,
    });
  }
  if (claim.status === 'redo_approved' && claim.redoBookBy) {
    notes.push({ text: `The customer picks a free redo time by ${formatTime(claim.redoBookBy)}.` });
  }
  return notes;
}

/** The garage's own photos of the job, split by stage; the customer's are not the garage's. */
export function garageStages(photos: readonly JobPhoto[]): { before: JobPhoto[]; after: JobPhoto[] } {
  const garage = photos.filter((photo) => photo.by === 'garage');
  return {
    before: garage.filter((photo) => photo.stage === 'before'),
    after: garage.filter((photo) => photo.stage === 'after'),
  };
}

/** Whether the garage took any photos at all. */
export const hasGaragePhotos = (photos: readonly JobPhoto[]) => photos.some((photo) => photo.by === 'garage');
