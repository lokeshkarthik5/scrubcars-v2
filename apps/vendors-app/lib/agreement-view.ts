/**
 * Words and small rules of the garage agreement screen (apps/vendors/app/agreement/page.tsx),
 * kept pure so they can be tested. The tick and the banner line are core's (agreements.ts).
 */
export const AGREEMENT_LOAD_FAILED = 'Couldn’t load the agreement.';
export const AGREEMENT_NONE_TITLE = 'Nothing to accept yet';
export const AGREEMENT_NONE_BODY =
  'Detlio hasn’t published the garage agreement here yet. We’ll tell you when it is ready.';
export const AGREEMENT_ACCEPT_FAILED = 'Couldn’t record that. Please try again.';
export const AGREEMENT_RECORD_NOTE = 'Detlio keeps a record of who accepted which version, and when.';

/** "3 Nov 2026" from an ISO time, in IST. */
export function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** The tick is for one version of one garage's agreement: a new version (or garage) starts unticked. */
export function tickKeyFor(vendorId: string | undefined, version: number | null | undefined): string | null {
  return version === null || version === undefined ? null : `${vendorId}:${version}`;
}

export const publishedLine = (publishedAt: string, note: string | null) =>
  `Published ${dayOf(publishedAt)}${note ? ` · ${note}` : ''}`;

export const acceptedLine = (at: string, by: string) =>
  `On ${dayOf(at)}, by ${by}. You hold Bronze while this is the latest version.`;

export const graceLine = (version: number, acceptBy: string) =>
  `Detlio updated the agreement. Accept v${version} by ${acceptBy} to keep your tier.`;

export const tickDetail = (title: string) => `I have read the ${title} and agree to it for my garage.`;
