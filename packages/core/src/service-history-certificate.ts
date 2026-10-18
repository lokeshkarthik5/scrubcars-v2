/**
 * Words and small rules for the Detlio Service History certificate (API
 * 0053), shared by the owner's page and the public /verify page. The
 * numbers twin apps/server/src/lib/service-history-certificate.ts
 * (service-history-certificate.parity.test.ts there).
 */
import { VEHICLE_TIERS } from './vehicles'

export const CERTIFICATE_TITLE = 'Detlio Service History'

/** A share token, as the API makes them: 32 URL-safe characters. */
export const CERTIFICATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

export function isCertificateTokenShaped(token: string): boolean {
  return CERTIFICATE_TOKEN_PATTERN.test(token)
}

/** How long a shared link lasts. Never, unless the customer picks a limit. */
export const SHARE_EXPIRY_OPTIONS: ReadonlyArray<{ days: 7 | 30 | 90 | null; label: string }> = [
  { days: null, label: 'No expiry' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

/** Shown before the customer can include photos on a shared certificate. */
export const PHOTO_PLATE_WARNING =
  'Photos may show your number plate. Anyone with the link will see them.'

/** What the public page and the printed copy say the record covers. */
export const CERTIFICATE_SCOPE_NOTE =
  'Lists every completed job booked through Detlio for this car. Cancelled bookings and work done elsewhere are not included.'

/** Where a shared certificate is checked. */
export function verifyPath(token: string): string {
  return `/verify/${token}`
}

/** The short link printed under the QR code: the host and path, no scheme. */
export function shortVerifyLink(origin: string, token: string): string {
  return `${origin.replace(/^https?:\/\//, '').replace(/\/$/, '')}${verifyPath(token)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-17" → "17 Oct 2026". The API sends IST dates, so no zone math here. */
export function certificateDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return dateKey
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** "SUV / MUV", from the car's stored body type. */
export function bodyTypeLabel(bodyType: string): string {
  return VEHICLE_TIERS.find((tier) => tier.value === bodyType)?.label ?? bodyType
}

/** "1 job" / "3 jobs". */
export function jobsLabel(count: number): string {
  return `${count} ${count === 1 ? 'job' : 'jobs'}`
}

/** The page title, which browsers use as the saved PDF's name. */
export function certificateFileTitle(certificateNumber: string): string {
  return `Detlio service history ${certificateNumber}`
}

/** "Viewed 3 times, last on 17 Oct 2026" for the owner. */
export function viewsLine(viewCount: number, lastViewedAt: string | null): string {
  if (viewCount === 0 || !lastViewedAt) return 'Not opened yet'
  const times = viewCount === 1 ? 'once' : `${viewCount} times`
  const shifted = new Date(new Date(lastViewedAt).getTime() + 330 * 60 * 1000)
  return `Opened ${times}, last on ${certificateDateLabel(shifted.toISOString().slice(0, 10))}`
}

/**
 * A page whose address holds a certificate token: /verify/<token>. Nothing
 * that reports page addresses to a third party runs there (the Meta Pixel),
 * and our own usage events replace the token (cleanPath).
 */
export function isVerifyPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && /^\/verify(\/|$)/.test(pathname))
}
