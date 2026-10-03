/**
 * The 10 national digits of an Indian mobile number, from however it arrived.
 *
 * The phone field shows +91 as a fixed label, so it holds national digits
 * only — but the number rarely arrives typed. The keyboard's autofill chip, a
 * paste from WhatsApp or a contact card hands over "+91 98765 43210",
 * "098765 43210" or "0091 …", and a field that only stripped non-digits under a
 * 10-character cap turned the first of those into "9198765": wrong, and with
 * the CTA disabled, nothing to say why. So the country code and trunk prefix
 * are peeled off first.
 *
 * Prefixes are dropped only while more than 10 digits remain, so a real number
 * that starts with 91 or 0 is never eaten. Anything still longer than 10 is
 * returned as-is — the caller decides what to do with a number that is not
 * Indian rather than have it silently cut into one that is.
 */
export function normaliseIndianMobile(raw: string): string {
  let digits = raw.replace(/\D/g, '')

  while (digits.length > 10) {
    if (digits.startsWith('0')) {
      // Trunk prefix ("098765…") or the international "00" in "0091 …".
      digits = digits.slice(1)
    } else if (digits.startsWith('91') && digits.length >= 12) {
      digits = digits.slice(2)
    } else {
      break
    }
  }

  return digits
}
