import { apiClient } from './client'
import { mapJobPhoto } from './mappers'
import type { ConditionCheck } from '@repo/core/types'
import type { DamageKind } from '@repo/core/condition-check'

/**
 * The car condition check at handover (0075). The garage's side lives under
 * /vendors/me/bookings/:id/condition (the company is the session's, never a
 * parameter); the customer's under /bookings/:id/condition. Every call
 * answers the caller's own view of the check.
 */

function mapCheck(check: ConditionCheck): ConditionCheck {
  return { ...check, photos: check.photos.map(mapJobPhoto) }
}

const garage = (bookingId: string) => `/vendors/me/bookings/${bookingId}/condition`

/** Detlio looks at one car-check photo (a before photo's damage, or an after photo against its before). */
export async function readConditionPhoto(bookingId: string, photoId: string): Promise<ConditionCheck> {
  return mapCheck(
    await apiClient<ConditionCheck>(`${garage(bookingId)}/photos/${photoId}/read`, { method: 'POST' })
  )
}

/** "Add a mark Detlio missed" on one of the walk-round's before photos. */
export async function addConditionMark(
  bookingId: string,
  input: { photoId: string; kind: DamageKind; part: string }
): Promise<ConditionCheck> {
  return mapCheck(
    await apiClient<ConditionCheck>(`${garage(bookingId)}/marks`, { method: 'POST', body: JSON.stringify(input) })
  )
}

/** Remove a wrong before mark (kept for the record), until the check is sent. */
export async function removeConditionMark(bookingId: string, markId: string): Promise<ConditionCheck> {
  return mapCheck(await apiClient<ConditionCheck>(`${garage(bookingId)}/marks/${markId}/remove`, { method: 'POST' }))
}

/** Undo: put a removed before mark back. */
export async function restoreConditionMark(bookingId: string, markId: string): Promise<ConditionCheck> {
  return mapCheck(await apiClient<ConditionCheck>(`${garage(bookingId)}/marks/${markId}/restore`, { method: 'POST' }))
}

/** "Send to customer": the walk-round and its marks become the record. */
export async function sendConditionCheck(bookingId: string): Promise<ConditionCheck> {
  return mapCheck(await apiClient<ConditionCheck>(`${garage(bookingId)}/send`, { method: 'POST' }))
}

/** The garage's "It was there" on a possible new mark after the job. */
export async function markWasThere(bookingId: string, markId: string): Promise<ConditionCheck> {
  return mapCheck(await apiClient<ConditionCheck>(`${garage(bookingId)}/marks/${markId}/was-there`, { method: 'POST' }))
}

/** The customer's answer: "Looks right", or "Something's wrong" with a note. */
export async function answerConditionCheck(
  bookingId: string,
  answer: { answer: 'looks_right' } | { answer: 'something_wrong'; note: string }
): Promise<ConditionCheck | null> {
  const check = await apiClient<ConditionCheck | null>(`/bookings/${bookingId}/condition/answer`, {
    method: 'POST',
    body: JSON.stringify(answer),
  })
  return check ? mapCheck(check) : null
}

/** The customer's "It was already there" on a possible new mark. */
export async function markAlreadyThere(bookingId: string, markId: string): Promise<ConditionCheck | null> {
  const check = await apiClient<ConditionCheck | null>(`/bookings/${bookingId}/condition/marks/${markId}/already-there`, {
    method: 'POST',
  })
  return check ? mapCheck(check) : null
}
