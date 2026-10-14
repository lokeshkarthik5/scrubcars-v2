/**
 * Team notices: short messages from Detlio on the customer's Home and in
 * Updates ("Slot may move: rain"). Pure rules, with the clock passed in.
 *
 *   - To every customer ('all'), or to customers with an upcoming booking
 *     between two times, optionally at one garage ('with_booking_between').
 *   - Live while active and now is in [startsAt, endsAt).
 *   - Owner decision: a notice about the customer's own booking is not a
 *     card above their car. It rides on the Next booking tile as one short
 *     line (its title) and is the first row in Updates. The 'all' notice is
 *     the pinned row of Updates.
 *   - Not the legal change-notice channel: Terms §19 and Privacy §13 promise
 *     WhatsApp or a call.
 */

export type NoticeAudience = 'all' | 'with_booking_between'

export interface NoticeRow {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  audience: NoticeAudience
  vendorId: string | null
  bookingFrom: Date | null
  bookingTo: Date | null
  startsAt: Date
  endsAt: Date
  isActive: boolean
}

export type NoticeState = 'scheduled' | 'live' | 'ended'

export function noticeState(
  notice: Pick<NoticeRow, 'isActive' | 'startsAt' | 'endsAt'>,
  now: Date
): NoticeState {
  if (!notice.isActive || now >= notice.endsAt) return 'ended'
  if (now < notice.startsAt) return 'scheduled'
  return 'live'
}

/**
 * What "End now" writes. A live notice ends now. A scheduled one is switched
 * off instead: setting its end to now would put the end before the start,
 * which the window CHECK refuses (a 500 rather than an answer). An ended one
 * needs nothing.
 */
export function endNowPatch(
  notice: Pick<NoticeRow, 'isActive' | 'startsAt' | 'endsAt'>,
  now: Date
): { endsAt: Date } | { isActive: false } | null {
  switch (noticeState(notice, now)) {
    case 'live':
      return { endsAt: now }
    case 'scheduled':
      return { isActive: false }
    case 'ended':
      return null
  }
}

/** The bookings a booking-window notice can be about: still to happen. */
const UPCOMING = new Set(['pending', 'confirmed', 'in_progress'])

/** Whether a booking-window notice is about this booking. */
export function noticeMatchesBooking(
  notice: Pick<NoticeRow, 'audience' | 'vendorId' | 'bookingFrom' | 'bookingTo'>,
  booking: { status: string; vendorId: string; scheduledAt: Date }
): boolean {
  if (notice.audience !== 'with_booking_between') return false
  if (!notice.bookingFrom || !notice.bookingTo) return false
  if (!UPCOMING.has(booking.status)) return false
  if (notice.vendorId && notice.vendorId !== booking.vendorId) return false
  return booking.scheduledAt >= notice.bookingFrom && booking.scheduledAt <= notice.bookingTo
}

/**
 * Where a notice's link may go: https://<host>, or a path inside the app.
 * A protocol-relative //evil.com would leave the app looking like an app
 * link, so a second slash is refused. So is any backslash, anywhere: a
 * browser reads `\` as `/` in an http(s) URL, so `/\evil.com` opens
 * https://evil.com. And so is whitespace, which the URL parser drops (a tab
 * in `/<tab>/evil.com` would make it `//evil.com`). 0031's CHECK holds the
 * same three rules.
 */
export const NOTICE_LINK_PATTERN = /^(https:\/\/[^/]|\/([^/]|$))/

export function isAllowedNoticeLink(url: string): boolean {
  return NOTICE_LINK_PATTERN.test(url) && !url.includes('\\') && !/\s/.test(url)
}

/** A notice as the customer's apps receive it. */
export interface NoticeView {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  startsAt: string
  endsAt: string
}

export function toNoticeView(notice: NoticeRow): NoticeView {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    linkUrl: notice.linkUrl,
    linkLabel: notice.linkLabel,
    startsAt: notice.startsAt.toISOString(),
    endsAt: notice.endsAt.toISOString(),
  }
}

/** A notice's fields as they will be stored: the row with the patch on top. */
export interface NoticeFields {
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  audience: NoticeAudience
  vendorId: string | null
  bookingFrom: Date | null
  bookingTo: Date | null
  startsAt: Date
  endsAt: Date
}

/**
 * What is wrong with a notice as a whole, or null. Run on the merged row,
 * so a PATCH that moves only the start past the end is refused; 0031's CHECKs
 * are the backstop. Wording is checked separately (lib/copy-rules.ts).
 */
export function noticeProblem(notice: NoticeFields): { field: keyof NoticeFields; message: string } | null {
  if (notice.endsAt <= notice.startsAt) {
    return { field: 'endsAt', message: 'The notice must end after it starts.' }
  }
  if (notice.audience === 'all') {
    if (notice.bookingFrom || notice.bookingTo || notice.vendorId) {
      return {
        field: 'audience',
        message: 'A notice for everyone has no booking window or garage.',
      }
    }
  } else {
    if (!notice.bookingFrom || !notice.bookingTo) {
      return { field: 'bookingTo', message: 'Give both ends of the booking window.' }
    }
    if (notice.bookingTo <= notice.bookingFrom) {
      return { field: 'bookingTo', message: 'The booking window must end after it starts.' }
    }
  }
  if ((notice.linkUrl === null) !== (notice.linkLabel === null)) {
    return {
      field: notice.linkUrl === null ? 'linkUrl' : 'linkLabel',
      message: 'A link needs both an address and a label.',
    }
  }
  if (notice.linkUrl !== null && !isAllowedNoticeLink(notice.linkUrl)) {
    return {
      field: 'linkUrl',
      message: 'Use an https:// link or a path in the app, like /bookings.',
    }
  }
  return null
}
