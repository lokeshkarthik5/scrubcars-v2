/**
 * The 5 MB a listing photo may be is the size of what is SENT: prepareForUpload re-encodes a
 * picked photo (at most 1600 px, JPEG) and checks that. A normal phone photo is 3 to 12 MB as
 * taken and a few hundred KB after, so the original is never held to 5 MB. This is only the
 * guard against something absurd (a huge non-image renamed .jpg), before it is decoded.
 */
export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

/** What may be sent: a listing photo, once re-encoded, is at most this. */
export const MAX_SENT_BYTES = 5 * 1024 * 1024;
export const sentTooLarge = (length: number) => length > MAX_SENT_BYTES;
