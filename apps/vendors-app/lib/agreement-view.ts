import { msg, t } from '@repo/core/i18n/translate';
/**
 * Words and small rules of the garage agreement screen (apps/vendors/app/agreement/page.tsx),
 * kept pure so they can be tested. The tick and the banner line are core's (agreements.ts).
 * The constants stay English (msg) for the screen's t(); the lines come out in the language in use.
 */
export const AGREEMENT_LOAD_FAILED = msg('Couldn’t load the agreement.');
export const AGREEMENT_NONE_TITLE = msg('Nothing to accept yet');
export const AGREEMENT_NONE_BODY =
  msg('Detlio hasn’t published the garage agreement here yet. We’ll tell you when it is ready.');
export const AGREEMENT_ACCEPT_FAILED = msg('Couldn’t record that. Please try again.');
export const AGREEMENT_RECORD_NOTE = msg('Detlio keeps a record of who accepted which version, and when.');

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
  t('Published {date}', { date: dayOf(publishedAt) }) + (note ? ` · ${note}` : '');

export const acceptedLine = (at: string, by: string) =>
  t('On {date}, by {name}. You hold Bronze while this is the latest version.', { date: dayOf(at), name: by });

export const graceLine = (version: number, acceptBy: string) =>
  t('Detlio updated the agreement. Accept v{version} by {date} to keep your tier.', { version, date: acceptBy });

export const tickDetail = (title: string) => t('I have read the {title} and agree to it for my garage.', { title });
