/**
 * Where a team notice's link may go: `https://<host>`, or a path inside the
 * app. A twin of `isAllowedNoticeLink` in apps/server/src/lib/notices.ts,
 * which (with 0031's CHECK) is what actually refuses one; this copy lets the
 * admin form say so while the link is typed.
 * apps/server/src/lib/notice-link.parity.test.ts fails if the two drift, so
 * change both together. No imports, so that test can load this file by path.
 *
 * A protocol-relative //evil.com would leave the app while looking like an
 * app link, so a second slash is refused; so is any backslash (browsers read
 * `/\evil.com` as `//evil.com`) and any whitespace (the URL parser drops it).
 */
export const NOTICE_LINK_PATTERN = /^(https:\/\/[^/]|\/([^/]|$))/

export function isAllowedNoticeLink(url: string): boolean {
  return NOTICE_LINK_PATTERN.test(url) && !url.includes('\\') && !/\s/.test(url)
}
