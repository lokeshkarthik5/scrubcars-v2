import { CONTACT_OPENS_HOURS_BEFORE, CONTACT_STAYS_HOURS_AFTER } from '@repo/core/contact-window';

/** What the Help centre's copy (lib/help-content.ts, the web's content.ts) needs from apps/users/lib/legal. */
export const LEGAL_PATHS = {
  terms: '/terms',
  privacy: '/privacy',
  refunds: '/refund-policy',
  delivery: '/service-delivery',
  contact: '/contact',
} as const;

const after = CONTACT_STAYS_HOURS_AFTER === 1 ? 'an hour' : `${CONTACT_STAYS_HOURS_AFTER} hours`;

/** "from 2 hours before your booking until an hour after the job is done" */
export const CONTACT_WINDOW_HOURS = `from ${CONTACT_OPENS_HOURS_BEFORE} hours before your booking until ${after} after the job is done`;
