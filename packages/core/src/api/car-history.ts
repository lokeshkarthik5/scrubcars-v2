import type { ServiceCategory } from '@repo/core/types'
import { apiClient } from './client'

/**
 * A car's history and its coating/detailing reminders (API 0046,
 * apps/server/src/modules/car-history). Typed here by hand, field for field,
 * from the server's own interfaces (lib/car-history.ts, car-history.service.ts),
 * as home.ts is. The server only ever reads the signed-in customer's own cars.
 */

export type ServiceReminderKind = 'maintenance_wash' | 'coating_check' | 'detailing_repeat'

export type ServiceReminderState = 'upcoming' | 'due_soon' | 'due' | 'overdue' | 'booked'

/** The nearest follow-up for a car (lib/service-reminders.ts). */
export interface ServiceReminder {
  id: string
  vehicleId: string
  kind: ServiceReminderKind
  /** "Maintenance wash for your coating". */
  title: string
  /** "3 months since your coating at Shine Studio". */
  reason: string
  /** The due date in force, "YYYY-MM-DD" (after a snooze). */
  dueOn: string
  /** The date the rules gave it, before any snooze. */
  originalDueOn: string
  snoozed: boolean
  state: ServiceReminderState
  /** Days until due (0 = today), negative once overdue; null once booked. */
  daysLeft: number | null
  /** The paid booking that answers it, still to happen. */
  booked: { bookingId: string; scheduledAt: string } | null
  /** What "Book" searches for (the search page's category). */
  bookCategory: ServiceCategory
}

/** One finished job on the car: a booking counted once, however often it was moved. */
export interface CarHistoryItem {
  /** Its page, receipt and photos. */
  bookingId: string
  /** When the job was finished. */
  doneAt: string
  bookingType: string
  vendorId: string
  vendorName: string
  services: Array<{ name: string; category: string }>
  categories: ServiceCategory[]
  /** What was paid and kept: "800.00". */
  amountPaid: string
  receiptAvailable: boolean
  photos: { before: number; after: number }
}

export interface CarHistory {
  car: {
    id: string
    make: string
    model: string
    color: string | null
    licensePlate: string | null
    vehicleType: string
    isDefault: boolean
  }
  /** Newest first; only completed jobs. */
  items: CarHistoryItem[]
  /** Over the items shown (after the filter). */
  totals: {
    washesThisYear: number
    spentThisYear: string
    washesTotal: number
    spentTotal: string
    /** "YYYY-MM-DD" of the oldest job shown. */
    since: string | null
  }
  /** Categories with a job, for the filter chips. */
  categories: ServiceCategory[]
  /** Bookings for this car that ended cancelled; not listed (My bookings has them). */
  cancelledCount: number
  reminder: ServiceReminder | null
}

/** GET /users/me/vehicles/:vehicleId/history[?category=] */
export async function getCarHistory(vehicleId: string, category?: ServiceCategory | null): Promise<CarHistory> {
  return apiClient<CarHistory>(`/users/me/vehicles/${vehicleId}/history`, {
    params: category ? { category } : undefined,
  })
}

/** POST /users/me/service-reminders/:id/dismiss — gone for good. */
export async function dismissServiceReminder(reminderId: string): Promise<void> {
  await apiClient(`/users/me/service-reminders/${reminderId}/dismiss`, { method: 'POST' })
}

/** POST /users/me/service-reminders/:id/snooze — due again in two weeks. */
export async function snoozeServiceReminder(reminderId: string): Promise<{ snoozedUntil: string }> {
  return apiClient<{ snoozedUntil: string }>(`/users/me/service-reminders/${reminderId}/snooze`, { method: 'POST' })
}
