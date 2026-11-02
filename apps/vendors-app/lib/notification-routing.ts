import { rewriteSystemPath } from './deep-link';

/**
 * Where a push opens, from the path the server sends (lib/push-messages.ts). As
 * the web's service worker: a path on this app, and anything else opens the start.
 * Old tab names and `#job-…` are read further on, as for any link.
 */
export function pathFromPushUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/';
  return rewriteSystemPath(url);
}
