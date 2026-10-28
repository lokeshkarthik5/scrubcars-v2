import { effectiveDurationMins } from '../../lib/service-duration.js'
import { AppError } from '../../lib/errors.js'
import type { BookingType } from '../../lib/booking-types.js'
import type { PickupSettings } from '../../lib/pickup.js'
import {
  alertDateProblem,
  alertDay,
  alertExpiresAt,
  alertLimitRefusal,
  askRefusal,
  firstOpening,
  MAX_ACTIVE_SLOT_ALERTS,
  RECHECK_ALERT_LIMIT,
  SLOT_ALERT_MAX_DAYS_AHEAD,
  takesBookingType,
  type AskRefusal,
  type SlotAlertWindow,
} from '../../lib/slot-alerts.js'
import type { BusyInterval, DayFacts } from '../../lib/slots.js'

/**
 * The slot alerts' rules (0047), over the reads and writes they are given:
 * slot-alerts.service.ts passes the real repository and push, the unit tests
 * stand-ins. No database or env import here, so every rule runs in a test.
 */

/** A stored alert, as the rules read it. */
export interface AlertRow {
  id: string
  userId: string
  vendorId: string
  date: string
  window: SlotAlertWindow
  bookingType: BookingType
  durationMins: number
  serviceIds: string[]
  createdAt: Date
  expiresAt: Date
  notifiedAt: Date | null
}

/** A garage as the slot rule and the booking type read it. */
export interface AlertGarage extends PickupSettings {
  id: string
  businessName: string
  bookingsPausedAt: Date | null
  slotIntervalMins: number
  bays: number | null
  jobsPerDay: number | null
  dropinEnabled: boolean
  doorstepEnabled: boolean
}

export interface SlotAlertsStore {
  findUser(userId: string): Promise<{ id: string; status: string } | undefined>
  /** Only while customers can open the garage's page. */
  findGarage(vendorId: string): Promise<AlertGarage | undefined>
  findServices(vendorId: string, serviceIds: string[]): Promise<Array<{ id: string; durationMins: number | null }>>
  readDay(
    vendorId: string,
    date: string
  ): Promise<{ hours: DayFacts['hours']; isHoliday: boolean; busy: BusyInterval[] }>
  setUnderLimit<R extends string>(input: {
    alert: {
      userId: string
      vendorId: string
      date: string
      window: SlotAlertWindow
      bookingType: BookingType
      durationMins: number
      serviceIds: string[]
      expiresAt: Date
    }
    now: Date
    decide: (facts: { activeCount: number; replacing: boolean }) => R | null
  }): Promise<{ refusal: R | null; row: AlertRow | null; replaced: boolean }>
  listWaiting(userId: string, now: Date): Promise<Array<AlertRow & { vendorName: string }>>
  removeWaiting(userId: string, id: string): Promise<boolean>
  listWaitingForGarageDay(vendorId: string, date: string, now: Date, limit: number): Promise<AlertRow[]>
  claim(id: string, slotAt: Date, now: Date): Promise<boolean>
  markChecked(ids: string[], now: Date): Promise<void>
}

/** What the screens get: the alert, never who else waits. */
export interface SlotAlertResponse {
  id: string
  vendorId: string
  vendorName: string
  date: string
  window: SlotAlertWindow
  bookingType: BookingType
  durationMins: number
  serviceIds: string[]
  createdAt: string
  expiresAt: string
}

function toResponse(row: AlertRow, vendorName: string): SlotAlertResponse {
  return {
    id: row.id,
    vendorId: row.vendorId,
    vendorName,
    date: row.date,
    window: row.window,
    bookingType: row.bookingType,
    durationMins: row.durationMins,
    serviceIds: row.serviceIds,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}

const ASK_REFUSALS: Record<AskRefusal, { status: number; message: string; code: string }> = {
  paused: {
    status: 409,
    message: "This garage isn't taking new bookings right now.",
    code: 'GARAGE_PAUSED',
  },
  closed: {
    status: 409,
    message: 'The garage is closed on this day. Pick another day.',
    code: 'GARAGE_CLOSED_THAT_DAY',
  },
  too_long: {
    status: 409,
    message: "These services need more time than this garage's day allows.",
    code: 'SLOT_ALERT_TOO_LONG',
  },
  no_times: {
    status: 409,
    message: 'No times are left in that part of the day. Pick another day or time.',
    code: 'SLOT_ALERT_NO_TIMES',
  },
  slot_free: {
    status: 409,
    message: 'A time is free in that part of the day right now. Book it before someone else does.',
    code: 'SLOT_ALERT_SLOT_FREE',
  },
}

/** Something the re-check found and claimed: tell this customer, once. */
export interface AlertOpened {
  alert: AlertRow
  garageName: string
  slotAt: Date
}

export function slotAlertsWith(deps: {
  store: SlotAlertsStore
  /** After a claim: the push (the Updates row is the claim itself). */
  onOpened?: (opened: AlertOpened, now: Date) => void
  onSet?: (row: AlertRow, replaced: boolean) => void
}) {
  const { store } = deps

  async function assertActive(userId: string) {
    const user = await store.findUser(userId)
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    if (user.status === 'suspended') throw new AppError(403, 'Account is suspended', 'ACCOUNT_SUSPENDED')
  }

  function dayFacts(garage: AlertGarage, date: string, day: Awaited<ReturnType<SlotAlertsStore['readDay']>>): DayFacts {
    return {
      date,
      pausedAt: garage.bookingsPausedAt,
      isHoliday: day.isHoliday,
      hours: day.hours,
      intervalMins: garage.slotIntervalMins,
      bays: garage.bays,
      jobsPerDay: garage.jobsPerDay,
      busy: day.busy,
    }
  }

  return {
    /**
     * "Notify me if a slot opens" for a day at a garage. Only for a day that
     * could open up and has nothing free in the window now (askRefusal), for
     * a booking type the garage takes. Setting it again for the same garage
     * and date changes the one waiting. At most MAX_ACTIVE_SLOT_ALERTS.
     */
    async create(
      userId: string,
      input: {
        vendorId: string
        date: string
        window: SlotAlertWindow
        bookingType: BookingType
        serviceIds: string[]
      },
      now: Date
    ): Promise<{ alert: SlotAlertResponse; replaced: boolean }> {
      await assertActive(userId)

      const dateProblem = alertDateProblem(input.date, now)
      if (dateProblem === 'in_the_past') {
        throw new AppError(400, 'That day has passed. Pick another day.', 'SLOT_ALERT_DATE_PASSED')
      }
      if (dateProblem === 'too_far_ahead') {
        throw new AppError(
          400,
          `Alerts can be set up to ${SLOT_ALERT_MAX_DAYS_AHEAD} days ahead.`,
          'SLOT_ALERT_TOO_FAR_AHEAD'
        )
      }

      const garage = await store.findGarage(input.vendorId)
      if (!garage) throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      if (!takesBookingType(garage, input.bookingType)) {
        throw new AppError(409, "This garage doesn't offer that type of booking.", 'BOOKING_TYPE_NOT_OFFERED')
      }

      // Every service must be the garage's and on sale: a partial match would
      // wait for a shorter job than the customer is booking (as the slot list).
      const services = await store.findServices(garage.id, input.serviceIds)
      if (services.length !== input.serviceIds.length) {
        throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
      }
      // An unset duration holds the default 60 minutes, as at checkout (0064).
      const durationMins = services.reduce((total, service) => total + effectiveDurationMins(service), 0)

      const day = alertDay(
        dayFacts(garage, input.date, await store.readDay(garage.id, input.date)),
        { durationMins, bookingType: input.bookingType, window: input.window },
        now.getTime()
      )
      const refusal = askRefusal(day)
      if (refusal) {
        const { status, message, code } = ASK_REFUSALS[refusal]
        throw new AppError(status, message, code)
      }

      const result = await store.setUnderLimit({
        alert: {
          userId,
          vendorId: garage.id,
          date: input.date,
          window: input.window,
          bookingType: input.bookingType,
          durationMins,
          serviceIds: input.serviceIds,
          expiresAt: alertExpiresAt(input.date),
        },
        now,
        decide: alertLimitRefusal,
      })
      if (result.refusal) {
        throw new AppError(
          409,
          `You can wait for up to ${MAX_ACTIVE_SLOT_ALERTS} days at once. Cancel one in Profile → Slot alerts to add this one.`,
          'SLOT_ALERT_LIMIT'
        )
      }
      // The waiting one was told or ran out between the read and the write.
      if (!result.row) {
        throw new AppError(409, 'That alert just changed. Try again.', 'SLOT_ALERT_CHANGED')
      }
      deps.onSet?.(result.row, result.replaced)
      return { alert: toResponse(result.row, garage.businessName), replaced: result.replaced }
    },

    /** The customer's waiting alerts. */
    async list(userId: string, now: Date) {
      const rows = await store.listWaiting(userId, now)
      return {
        items: rows.map((row) => toResponse(row, row.vendorName)),
        max: MAX_ACTIVE_SLOT_ALERTS,
      }
    },

    /** Cancels one of the customer's waiting alerts; anyone else's is a 404. */
    async remove(userId: string, id: string) {
      if (!(await store.removeWaiting(userId, id))) {
        throw new AppError(404, 'Alert not found', 'SLOT_ALERT_NOT_FOUND')
      }
      return { id, removed: true as const }
    },

    /**
     * Re-checks a garage's waiting alerts for one date with the slot rule,
     * after capacity there was freed (or by the cron). Each alert with a free
     * time in its window, for its job length and booking type, is claimed
     * (told once, whoever else is checking) and then sent. Nothing is held.
     * A dry run claims nothing and only counts.
     */
    async recheck(vendorId: string, date: string, now: Date, options: { dryRun?: boolean } = {}) {
      const alerts = await store.listWaitingForGarageDay(vendorId, date, now, RECHECK_ALERT_LIMIT)
      const summary = { waiting: alerts.length, opened: 0 }
      if (alerts.length === 0) return summary

      const garage = await store.findGarage(vendorId)
      if (garage) {
        const facts = dayFacts(garage, date, await store.readDay(vendorId, date))
        for (const alert of alerts) {
          if (!takesBookingType(garage, alert.bookingType)) continue
          const slot = firstOpening(facts, alert, now.getTime())
          if (!slot) continue
          if (options.dryRun) {
            summary.opened += 1
            continue
          }
          const slotAt = new Date(slot)
          if (!(await store.claim(alert.id, slotAt, now))) continue
          summary.opened += 1
          deps.onOpened?.({ alert, garageName: garage.businessName, slotAt }, now)
        }
      }
      if (!options.dryRun) await store.markChecked(alerts.map((alert) => alert.id), now)
      return summary
    },
  }
}
