import { apiClient } from '@repo/core/api/client'
import type { SlotAlert, SlotAlertWindow } from '@repo/core/slot-alerts'
import type { BookingType } from '@repo/core/types'

/**
 * "Notify me if a slot opens" (0047): the customer's alerts at
 * /users/me/slot-alerts. The server only ever reads and writes the
 * signed-in customer's own.
 */

export interface SlotAlerts {
  /** Waiting ones, soonest day first. */
  items: SlotAlert[]
  /** How many may wait at once. */
  max: number
}

export interface SetSlotAlertInput {
  vendorId: string
  /** YYYY-MM-DD, IST. */
  date: string
  window: SlotAlertWindow
  bookingType: BookingType
  serviceIds: string[]
}

/** GET /users/me/slot-alerts */
export function getSlotAlerts() {
  return apiClient<SlotAlerts>('/users/me/slot-alerts')
}

/**
 * POST /users/me/slot-alerts. Setting one again for the same garage and day
 * changes the one waiting (`replaced`).
 */
export function setSlotAlert(input: SetSlotAlertInput) {
  return apiClient<{ alert: SlotAlert; replaced: boolean }>('/users/me/slot-alerts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** DELETE /users/me/slot-alerts/:id */
export function cancelSlotAlert(id: string) {
  return apiClient<{ id: string; removed: true }>(`/users/me/slot-alerts/${id}`, { method: 'DELETE' })
}
