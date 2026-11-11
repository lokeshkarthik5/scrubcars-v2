import type { GarageClaim } from '@repo/core/api/guarantee';
import { GUARANTEE_RULES, timeLeftLabel } from '@repo/core/guarantee';
import type { JobPhoto } from '@repo/core/types';
import { interpolate, msg, t } from '@repo/core/i18n/translate';

/**
 * The words and small decisions of the free redo claims inbox, the parts of
 * apps/vendors/app/guarantee/page.tsx and packages/ui/src/features/guarantee-photos.tsx
 * that are not drawing. Pure, so they can be tested; the clock is a parameter. The constants stay
 * English (msg) for the screen's t(); the lines built here come out in the language in use.
 */

export const OWNER_ONLY = msg('Only the garage owner can see and answer redo claims.');
export const NOT_SWITCHED_ON = msg('Free redo claims are not switched on yet.');
export const ACCEPTED_TOAST = msg('Accepted. The customer picks a time for the redo.');
export const DISPUTED_TOAST = msg('Sent to Detlio to decide.');
export const ACCEPT_FAILED = msg('Could not answer. Please try again.');
export const DISPUTE_FAILED = msg('Could not send. Please try again.');

const INTRO = msg(
  'A customer can ask for a free redo within {claimHours} hours of a wash or detailing, with photos. Answer within {reviewHours} hours of your opening hours, or the redo is approved. Jobs without your before and after photos are approved at once.'
);
const INTRO_VARS = {
  claimHours: GUARANTEE_RULES.claimWindowHours,
  reviewHours: GUARANTEE_RULES.garageReviewHours,
};
const DISPUTE = msg("Say why the job was done properly. Detlio compares both sides' photos and decides within {hours} hours.");
const DISPUTE_VARS = { hours: GUARANTEE_RULES.detlioDecideHours };

/** The paragraph under the title (the English; the screen shows guaranteeIntro()). */
export const GUARANTEE_INTRO = interpolate(INTRO, INTRO_VARS);
export const guaranteeIntro = () => t(INTRO, INTRO_VARS);

/** Under "Dispute this claim" (the English; the screen shows disputeIntro()). */
export const DISPUTE_INTRO = interpolate(DISPUTE, DISPUTE_VARS);
export const disputeIntro = () => t(DISPUTE, DISPUTE_VARS);

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
  const by = claim.garageRespondBy ? ` ${t('(by {time})', { time: formatTime(claim.garageRespondBy) })}` : '';
  return t('Answer within {left} of now', { left }) + by;
}

/** The first line of a card: "Asha · Premium Car Wash". */
export const claimTitle = (claim: Pick<GarageClaim, 'customerFirstName' | 'service'>) =>
  `${claim.customerFirstName} · ${claim.service}`;

/** The second line: "Booking #AB12 · done Tue, 4:10 pm". */
export function claimSubtitle(
  claim: Pick<GarageClaim, 'bookingRef' | 'completedAt'>,
  formatTime: (iso: string) => string
): string {
  const done = claim.completedAt ? ` · ${t('done {time}', { time: formatTime(claim.completedAt) })}` : '';
  return t('Booking #{ref}', { ref: claim.bookingRef }) + done;
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
    notes.push({ text: t('Approved at once: there were no before and after photos on this job.') });
  }
  if (claim.route === 'detlio' && claim.status === 'needs_detlio' && !claim.garageResponse) {
    notes.push({ text: t('Detlio is reviewing this claim. Nothing for you to do yet.') });
  }
  if (claim.garageResponse === 'disputed' && claim.garageNote) {
    notes.push({ text: t('You disputed it: “{note}”', { note: claim.garageNote }) });
  }
  if (claim.garageResponse === 'timed_out') {
    notes.push({ text: t('There was no answer in time, so the redo was approved.') });
  }
  if (claim.decisionReason) {
    notes.push({ text: t('Detlio: “{reason}”', { reason: claim.decisionReason }) });
  }
  if (claim.status === 'refund_approved') {
    notes.push({ text: t('Detlio approved a refund instead of a redo. Nothing is paid out on this job.') });
  }
  if (claim.redoBooking) {
    notes.push({
      text: t('Free redo booked for {time} — it is on your Bookings page.', {
        time: formatTime(claim.redoBooking.scheduledAt),
      }),
      primary: true,
    });
  }
  if (claim.status === 'redo_approved' && claim.redoBookBy) {
    notes.push({ text: t('The customer picks a free redo time by {time}.', { time: formatTime(claim.redoBookBy) }) });
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
