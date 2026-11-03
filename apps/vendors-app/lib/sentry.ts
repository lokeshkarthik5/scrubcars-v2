import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

/**
 * Crash reports, off unless EXPO_PUBLIC_SENTRY_DSN is set: required only then, so
 * with no DSN nothing of Sentry runs at all. No user is ever set, and every event
 * and breadcrumb is scrubbed on its way out.
 */
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event as never),
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : scrubBreadcrumb(crumb)),
  });
}
