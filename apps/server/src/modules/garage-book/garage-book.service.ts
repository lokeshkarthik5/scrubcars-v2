import { isAnyPushEnabled } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_REMINDER_MESSAGE,
  GARAGE_BOOK_LIMITS,
  canMoveJob,
  customerRef,
  dayBounds,
  dueFor,
  fillReminder,
  formatIndianPlate,
  isDue,
  istMonth,
  messageRefusal,
  monthBounds,
  parseCustomerRef,
  percentChange,
  plateKey,
  previousMonth,
  pushAllowed,
  rupeesToPaise,
  type CustomerFilter,
  type DueState,
  type JobPayment,
  type JobStatus,
} from '../../lib/garage-book.js'
import { addDays, istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { buildXlsx } from '../../lib/xlsx.js'
import type { VendorScopedRole } from '../members/members.repository.js'
import { pushService } from '../push/push.service.js'
import { garageBookRepository as repo, type CarRow, type DetlioJobRow, type JobRow, type Tx } from './garage-book.repository.js'
import type {
  CarInput,
  CreateCustomerInput,
  CreateJobInput,
  CustomersQuery,
  LineInput,
  MarkPaidInput,
  ReminderMessageInput,
  StatsQuery,
  UpdateCustomerInput,
  UpdateJobInput,
} from './garage-book.validation.js'

/**
 * Garage Book (0069). Who may see what is decided here, once:
 *
 *   - `owner` (vendor_admin) sees money; staff (vendor_operator) never do.
 *     Every figure in paise, and every Detlio booking amount, is left out
 *     of a staff response (`money()`), and the money routes are owner-only
 *     in garage-book.routes.ts.
 *   - A Detlio customer never carries a phone number: their rows are built
 *     from the booking's user name and car only, and a reminder to one
 *     returns no number either.
 */

export interface Viewer {
  vendorId: string
  userId: string
  role: VendorScopedRole
}

const isOwner = (viewer: Pick<Viewer, 'role'>) => viewer.role === 'vendor_admin'

/** A money figure for the owner; nothing at all for staff. */
function money<T>(viewer: Pick<Viewer, 'role'>, value: T): T | undefined {
  return isOwner(viewer) ? value : undefined
}

function notFound(what = 'Customer'): never {
  throw new AppError(404, `${what} not found`, 'NOT_FOUND')
}

/** Ten national digits, or null. A number that isn't one is refused. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  while (digits.length > 10 && (digits.startsWith('0') || (digits.startsWith('91') && digits.length >= 12))) {
    digits = digits.startsWith('0') ? digits.slice(1) : digits.slice(2)
  }
  if (digits.length === 0) return null
  if (!/^[1-9]\d{9}$/.test(digits)) {
    throw new AppError(400, 'That phone number doesn’t look right. Type the 10 digits.', 'INVALID_PHONE')
  }
  return digits
}

/** The wa.me link for an Indian mobile, the message typed in. Null for a landline. */
export function whatsAppUrl(phone: string, message: string): string | null {
  if (!/^[6-9]\d{9}$/.test(phone)) return null
  return `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
}

function carLabel(car: { make?: string | null; model?: string | null } | null | undefined): string | null {
  if (!car) return null
  const label = [car.make, car.model].filter(Boolean).join(' ').trim()
  return label || null
}

function cleanPlate(plate: string | null | undefined): string | null {
  const text = plate?.trim()
  return text ? formatIndianPlate(text) : null
}

function ownJobView(viewer: Viewer, job: JobRow) {
  return {
    source: 'own' as const,
    id: job.id,
    clientId: job.clientId,
    customerId: customerRef({ kind: 'own', id: job.garageCustomerId }),
    name: job.customerName,
    scheduledAt: job.scheduledAt.toISOString(),
    status: job.status,
    doneAt: job.doneAt?.toISOString() ?? null,
    car: job.carId ? { id: job.carId, plate: job.plate, make: job.make, model: job.model } : null,
    lines: job.lines.map((line) => ({
      serviceId: line.serviceId,
      label: line.label,
      qty: line.qty,
      pricePaise: money(viewer, line.pricePaise),
    })),
    payment: job.paymentMethod,
    remindInDays: job.remindInDays,
    visitNumber: job.visitNumber,
    totalPaise: money(viewer, job.totalPaise),
  }
}

/** A Detlio booking in the book's list: today's booking fields, never the customer's phone. */
function detlioJobView(viewer: Viewer, booking: DetlioJobRow) {
  return {
    source: 'detlio' as const,
    id: booking.id,
    customerId: customerRef({ kind: 'detlio', id: booking.userId }),
    name: booking.userName,
    scheduledAt: booking.scheduledAt.toISOString(),
    status: booking.status,
    bookingType: booking.bookingType,
    durationMins: booking.durationMins,
    paymentMethod: booking.paymentMethod,
    completedAt: booking.completedAt?.toISOString() ?? null,
    car: { plate: booking.plate, make: booking.make, model: booking.model },
    lines: booking.items.map((label) => ({ label })),
    amount: money(viewer, booking.amount),
  }
}

async function settingsFor(vendorId: string) {
  const row = await repo.reminderSettings(vendorId)
  return {
    message: row?.message ?? DEFAULT_REMINDER_MESSAGE,
    defaultIntervalDays: row?.defaultIntervalDays ?? DEFAULT_INTERVAL_DAYS,
    custom: Boolean(row),
  }
}

/** The garage's own price list turned into a walk-in's lines. A service not on it is refused. */
async function resolveLines(vendorId: string, lines: LineInput[]) {
  const ids = Array.from(new Set(lines.flatMap((line) => (line.serviceId ? [line.serviceId] : []))))
  const found = new Map((await repo.servicesById(vendorId, ids)).map((service) => [service.id, service]))
  return lines.map((line) => {
    if (line.serviceId) {
      const service = found.get(line.serviceId)
      if (!service) throw new AppError(400, 'One of those services is not on your price list.', 'UNKNOWN_SERVICE')
      return {
        serviceId: service.id,
        label: line.label?.trim() || service.name.slice(0, GARAGE_BOOK_LIMITS.nameMax),
        pricePaise: line.pricePaise ?? rupeesToPaise(service.price),
        qty: line.qty ?? 1,
      }
    }
    return { serviceId: null, label: line.label!.trim(), pricePaise: line.pricePaise!, qty: line.qty ?? 1 }
  })
}

function total(lines: Array<{ pricePaise: number; qty: number }>) {
  return lines.reduce((sum, line) => sum + line.pricePaise * line.qty, 0)
}

function checkWhen(scheduledAt: Date, now: Date) {
  const earliest = now.getTime() - GARAGE_BOOK_LIMITS.pastDays * 86_400_000
  const latest = now.getTime() + GARAGE_BOOK_LIMITS.futureDays * 86_400_000
  if (scheduledAt.getTime() < earliest || scheduledAt.getTime() > latest) {
    throw new AppError(400, 'Pick a time within the last month or the next three months.', 'WHEN_OUT_OF_RANGE')
  }
}

/**
 * A Pay later job owes its total once it is done (and only then): the owed
 * row follows the job's status, payment and lines.
 */
async function syncOwed(tx: Tx, viewer: Viewer, job: { id: string; garageCustomerId: string; status: JobStatus; payment: JobPayment; totalPaise: number }) {
  const owes = job.payment === 'later' && job.status === 'done' && job.totalPaise > 0
  await repo.setOwed(
    tx,
    owes
      ? {
          vendorId: viewer.vendorId,
          garageCustomerId: job.garageCustomerId,
          jobId: job.id,
          amountPaise: job.totalPaise,
          createdBy: viewer.userId,
        }
      : null,
    job.id
  )
}

async function upsertCars(tx: Tx, vendorId: string, customerId: string, cars: CarInput[], existing: CarRow[]) {
  for (const car of cars) {
    const data = {
      plate: car.plate === undefined ? undefined : cleanPlate(car.plate),
      make: car.make === undefined ? undefined : car.make.trim() || null,
      model: car.model === undefined ? undefined : car.model.trim() || null,
      colour: car.colour === undefined ? undefined : car.colour.trim() || null,
      washIntervalDays: car.washIntervalDays,
    }
    const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    if (car.id) {
      if (!existing.some((row) => row.id === car.id)) throw new AppError(404, 'Car not found', 'NOT_FOUND')
      await repo.updateCar(tx, customerId, car.id, defined)
    } else if (data.plate || data.make || data.model) {
      await repo.insertCar(tx, {
        vendorId,
        garageCustomerId: customerId,
        plate: data.plate ?? null,
        make: data.make ?? null,
        model: data.model ?? null,
        colour: data.colour ?? null,
        washIntervalDays: data.washIntervalDays ?? null,
      })
    }
  }
}

/** A car's wash reading: days since its last visit here and how it stands. */
function reading(lastVisitAt: Date | null, intervalDays: number, remindedAt: Date | null, now: Date) {
  const due = dueFor({ lastVisitAt, intervalDays, remindedAt, now })
  return {
    lastVisitAt: lastVisitAt?.toISOString() ?? null,
    daysSinceWash: due.daysSince,
    intervalDays,
    dueOn: due.dueOn,
    dueState: due.state,
  }
}

type CustomerListItem = ReturnType<typeof ownListItem> | ReturnType<typeof detlioListItem>

function ownListItem(
  viewer: Viewer,
  row: Awaited<ReturnType<typeof repo.ownCustomers>>[number],
  now: Date
) {
  // The last visit's reminder decides: off means no reminder; on, the car's own interval wins.
  const interval = row.lastRemindIn === null ? null : (row.lastCarIntervalDays ?? row.lastRemindIn)
  const due = dueFor({ lastVisitAt: row.lastVisitAt, intervalDays: interval, remindedAt: row.remindedAt, now })
  return {
    id: customerRef({ kind: 'own', id: row.id }),
    source: 'own' as const,
    viaDetlio: false,
    name: row.name,
    phone: row.phone,
    cars: row.cars.map((car) => ({ id: car.id, plate: car.plate, make: car.make, model: car.model, colour: car.colour })),
    lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
    visits: row.visits,
    remindedAt: row.remindedAt?.toISOString() ?? null,
    due: { state: due.state, dueOn: due.dueOn, daysSince: due.daysSince, intervalDays: interval },
    spentPaise: money(viewer, row.spentPaise),
    owesPaise: money(viewer, row.owesPaise),
  }
}

function detlioListItem(
  viewer: Viewer,
  row: Awaited<ReturnType<typeof repo.detlioCustomers>>[number],
  defaultInterval: number,
  now: Date
) {
  const interval = row.cars.find((car) => car.washIntervalDays)?.washIntervalDays ?? defaultInterval
  const due = dueFor({ lastVisitAt: row.lastVisitAt, intervalDays: interval, remindedAt: row.remindedAt, now })
  return {
    id: customerRef({ kind: 'detlio', id: row.userId }),
    source: 'detlio' as const,
    viaDetlio: true,
    name: row.name,
    // Never a Detlio customer's number (owner decision, 9 Nov 2026).
    phone: null,
    cars: row.cars.map((car) => ({ id: car.id, plate: car.plate, make: car.make, model: car.model, colour: null })),
    lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
    visits: row.visits,
    remindedAt: row.remindedAt?.toISOString() ?? null,
    due: { state: due.state, dueOn: due.dueOn, daysSince: due.daysSince, intervalDays: interval },
    spentPaise: money(viewer, row.spentPaise),
    owesPaise: money(viewer, 0),
  }
}

/** Plate-shaped text (letters and digits) is looked for in plates too. */
function searchOf(q: string | undefined) {
  const text = q?.trim() || null
  if (!text) return { q: null, plate: null }
  const key = plateKey(text)
  const looksLikePlate = key.length >= 3 && /\d/.test(key)
  return { q: text, plate: looksLikePlate ? key : null }
}

export const garageBookService = {
  // ─── Today and jobs ────────────────────────────────────────────────────────

  async today(viewer: Viewer, date: string | undefined, now = new Date()) {
    const dateKey = date ?? istDateKey(now)
    const { start, end } = dayBounds(dateKey)
    const [jobs, bookings] = await Promise.all([
      repo.jobsBetween(viewer.vendorId, start, end),
      repo.detlioJobsBetween(viewer.vendorId, start, end),
    ])
    const own = jobs.filter((job) => job.status !== 'cancelled').map((job) => ownJobView(viewer, job))
    const detlio = bookings.map((booking) => detlioJobView(viewer, booking))
    const list = [...own, ...detlio].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    const finished = (row: (typeof list)[number]) =>
      row.source === 'own' ? row.status === 'done' : row.status === 'completed'

    let taken: undefined | { ownPaise: number; detlioPaise: number; upiPaise: number; cashPaise: number; totalPaise: number }
    let closing: undefined | { jobsDone: number; owing: Array<{ customerId: string; name: string; amountPaise: number }> }
    if (isOwner(viewer)) {
      const t = await repo.takings(viewer.vendorId, start, end)
      taken = {
        ownPaise: t.ownPaise,
        detlioPaise: t.detlioPaise,
        upiPaise: t.upiPaise,
        cashPaise: t.cashPaise,
        totalPaise: t.ownPaise + t.detlioPaise,
      }
      closing = {
        jobsDone: list.filter(finished).length,
        owing: jobs
          .filter((job) => job.status === 'done' && job.paymentMethod === 'later' && job.totalPaise > 0)
          .map((job) => ({
            customerId: customerRef({ kind: 'own', id: job.garageCustomerId }),
            name: job.customerName,
            amountPaise: job.totalPaise,
          })),
      }
    }

    return {
      date: dateKey,
      jobs: list,
      counts: { all: list.length, detlio: detlio.length, own: own.length },
      allDone: list.length > 0 && list.every(finished),
      lastStartsAt: list.at(-1)?.scheduledAt ?? null,
      taken,
      closing,
    }
  },

  /**
   * Adds a walk-in. The phone made `clientId`; the same one again (a phone
   * resending what it saved with no signal) returns the job already written,
   * with `created: false`, and writes nothing.
   */
  async createJob(viewer: Viewer, input: CreateJobInput, now = new Date()) {
    const scheduledAt = new Date(input.scheduledAt)
    checkWhen(scheduledAt, now)

    const result = await repo.transaction(async (tx) => {
      await repo.lockClientId(tx, viewer.vendorId, input.clientId)
      const existing = await repo.jobByClientId(viewer.vendorId, input.clientId, tx)
      if (existing) return { jobId: existing.id, created: false }

      // Who it is for: one of the garage's own customers, or a new one.
      let customerId: string
      if ('id' in input.customer) {
        const ref = parseCustomerRef(input.customer.id) ?? parseCustomerRef(`own:${input.customer.id}`)
        // A walk-in is only ever for the garage's own customer: a Detlio
        // customer coming in off Detlio would go round the booking.
        if (!ref || ref.kind !== 'own') notFound()
        const customer = await repo.ownCustomer(viewer.vendorId, ref.id, tx)
        if (!customer) notFound()
        customerId = customer.id
      } else {
        const typedPhone = normalisePhone(input.customer.phone)
        if (typedPhone) await repo.lockPhone(tx, viewer.vendorId, typedPhone)
        const known = typedPhone ? await repo.ownCustomerByPhone(tx, viewer.vendorId, typedPhone) : null
        if (known) customerId = known.id
        else {
          const plate = cleanPlate(input.customer.plate)
          const label = input.customer.name?.trim() || plate || carLabel(input.customer) || 'Walk-in'
          const created = await repo.insertCustomer(tx, {
            vendorId: viewer.vendorId,
            name: label.slice(0, GARAGE_BOOK_LIMITS.nameMax),
            phone: typedPhone,
          })
          customerId = created.id
        }
      }

      // Which car: one of theirs, the one with this plate, or a new one.
      const cars = (await repo.cars([customerId], tx)).get(customerId) ?? []
      let carId: string | null = null
      if (input.carId) {
        if (!cars.some((car) => car.id === input.carId)) notFound('Car')
        carId = input.carId
      } else if (!('id' in input.customer) && (input.customer.plate || input.customer.make || input.customer.model)) {
        const plate = cleanPlate(input.customer.plate)
        const same = plate ? cars.find((car) => car.plate && plateKey(car.plate) === plateKey(plate)) : undefined
        carId =
          same?.id ??
          (
            await repo.insertCar(tx, {
              vendorId: viewer.vendorId,
              garageCustomerId: customerId,
              plate,
              make: input.customer.make?.trim() || null,
              model: input.customer.model?.trim() || null,
            })
          ).id
      } else if (cars.length === 1) {
        carId = cars[0]!.id
      }

      const lines = await resolveLines(viewer.vendorId, input.lines)
      const totalPaise = total(lines)
      const status: JobStatus = input.status
      const job = await repo.insertJob(
        tx,
        {
          vendorId: viewer.vendorId,
          clientId: input.clientId,
          garageCustomerId: customerId,
          carId,
          scheduledAt,
          status,
          paymentMethod: input.payment,
          totalPaise,
          remindInDays: input.remindInDays ?? null,
          createdBy: viewer.userId,
          doneAt: status === 'done' ? now : null,
        },
        lines
      )
      await syncOwed(tx, viewer, { id: job.id, garageCustomerId: customerId, status, payment: input.payment, totalPaise })
      return { jobId: job.id, created: true }
    })

    const job = await repo.job(viewer.vendorId, result.jobId)
    if (!job) notFound('Job')
    return { job: ownJobView(viewer, job), created: result.created }
  },

  async updateJob(viewer: Viewer, jobId: string, patch: UpdateJobInput, now = new Date()) {
    await repo.transaction(async (tx) => {
      // Locked before it is read, so two edits at once can't write back a stale status.
      await repo.lockJob(tx, jobId)
      const job = await repo.job(viewer.vendorId, jobId, tx)
      if (!job) notFound('Job')
      await repo.lockCustomer(tx, job.garageCustomerId)
      // A finished or cancelled job's money is settled: its payment and lines stay as they were
      // (a paid-back record may already stand against a Pay later job).
      const settled = job.status === 'done' || job.status === 'cancelled'
      if (settled && ((patch.payment && patch.payment !== job.paymentMethod) || patch.lines)) {
        throw new AppError(400, 'This job is finished, so its services and payment can’t change.', 'JOB_SETTLED')
      }

      const status = patch.status ?? job.status
      if (!canMoveJob(job.status, status)) {
        throw new AppError(400, `A ${job.status.replace('_', ' ')} job can't be marked ${status.replace('_', ' ')}.`, 'INVALID_JOB_STATUS')
      }
      const lines = patch.lines ? await resolveLines(viewer.vendorId, patch.lines) : job.lines
      const totalPaise = total(lines)
      const payment = patch.payment ?? job.paymentMethod
      let scheduledAt: Date | undefined
      if (patch.scheduledAt) {
        scheduledAt = new Date(patch.scheduledAt)
        checkWhen(scheduledAt, now)
      }
      if (patch.lines) await repo.replaceLines(tx, job.id, lines)
      await repo.updateJob(tx, viewer.vendorId, job.id, {
        status,
        paymentMethod: payment,
        totalPaise,
        ...(scheduledAt ? { scheduledAt } : {}),
        doneAt: status === 'done' ? (job.doneAt ?? now) : null,
      })
      await syncOwed(tx, viewer, { id: job.id, garageCustomerId: job.garageCustomerId, status, payment, totalPaise })
    })
    const job = await repo.job(viewer.vendorId, jobId)
    if (!job) notFound('Job')
    return ownJobView(viewer, job)
  },

  /** The price list a walk-in picks from. Prices are the garage's public ones, so every seat sees them. */
  async services(viewer: Viewer) {
    const rows = await repo.priceList(viewer.vendorId)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      pricePaise: rupeesToPaise(row.price),
      durationMins: row.durationMins,
      isAddon: row.isAddon,
    }))
  },

  // ─── Customers ─────────────────────────────────────────────────────────────

  async customers(viewer: Viewer, query: CustomersQuery, now = new Date()) {
    const search = searchOf(query.q)
    const settings = await settingsFor(viewer.vendorId)
    const [own, detlio] = await Promise.all([
      repo.ownCustomers(viewer.vendorId, search),
      repo.detlioCustomers(viewer.vendorId, search),
    ])
    const ownItems = own.map((row) => ownListItem(viewer, row, now))
    const detlioItems = detlio.map((row) => detlioListItem(viewer, row, settings.defaultIntervalDays, now))
    const all: CustomerListItem[] = [...ownItems, ...detlioItems].sort((a, b) =>
      (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? '')
    )
    const pick = (filter: CustomerFilter) =>
      filter === 'own' ? ownItems : filter === 'detlio' ? detlioItems : all
    let list: CustomerListItem[] = pick(query.filter)
    if (query.due === '1') list = list.filter((row) => isDue(row.due.state))
    return {
      customers: list.slice(0, GARAGE_BOOK_LIMITS.listMax),
      counts: { all: all.length, detlio: detlioItems.length, own: ownItems.length },
      dueCount: all.filter((row) => isDue(row.due.state)).length,
    }
  },

  async customer(viewer: Viewer, refText: string, now = new Date()) {
    const ref = parseCustomerRef(refText)
    if (!ref) notFound()
    const settings = await settingsFor(viewer.vendorId)

    if (ref.kind === 'own') {
      const base = await repo.ownCustomer(viewer.vendorId, ref.id)
      if (!base) notFound()
      const remindedAt = await repo.lastWhatsAppTo(viewer.vendorId, base.id)
      const cars = (await repo.cars([base.id])).get(base.id) ?? []
      const jobs = (await repo.jobsForCustomer(viewer.vendorId, base.id)).filter((job) => job.status !== 'cancelled')
      const done = jobs.filter((job) => job.status === 'done')
      const balance = await repo.balance(viewer.vendorId, base.id)
      return {
        id: customerRef(ref),
        source: 'own' as const,
        viaDetlio: false,
        name: base.name,
        phone: base.phone,
        note: base.note,
        since: base.createdAt.toISOString(),
        cars: cars.map((car) => {
          const last = done.filter((job) => job.carId === car.id).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())[0]
          const interval = car.washIntervalDays ?? last?.remindInDays ?? settings.defaultIntervalDays
          return {
            id: car.id,
            plate: car.plate,
            make: car.make,
            model: car.model,
            colour: car.colour,
            washIntervalDays: car.washIntervalDays,
            wash: reading(last?.doneAt ?? null, interval, remindedAt, now),
          }
        }),
        visits: done.length,
        spentPaise: money(viewer, done.reduce((sum, job) => sum + job.totalPaise, 0)),
        owesPaise: money(viewer, Math.max(0, balance)),
        history: jobs
          .slice()
          .reverse()
          .map((job) => ({
            source: 'own' as const,
            id: job.id,
            at: (job.doneAt ?? job.scheduledAt).toISOString(),
            status: job.status,
            lines: job.lines.map((line) => line.label),
            payment: job.paymentMethod,
            amountPaise: money(viewer, job.totalPaise),
          })),
      }
    }

    // A Detlio customer: someone who has booked this garage on Detlio.
    const [row] = await repo.detlioCustomers(viewer.vendorId, { q: null, plate: null }, ref.id)
    if (!row) notFound()
    const bookings = await repo.detlioJobsForUser(viewer.vendorId, ref.id)
    const completed = bookings.filter((booking) => booking.status === 'completed')
    const note = await repo.detlioNote(viewer.vendorId, ref.id)
    return {
      id: customerRef(ref),
      source: 'detlio' as const,
      viaDetlio: true,
      name: row.name,
      phone: null,
      note,
      since: row.firstAt.toISOString(),
      cars: row.cars.map((car) => {
        const last = completed
          .filter((booking) => booking.plate === car.plate && booking.make === car.make && booking.model === car.model)
          .map((booking) => booking.completedAt ?? booking.scheduledAt)
          .sort((a, b) => b.getTime() - a.getTime())[0]
        const interval = car.washIntervalDays ?? settings.defaultIntervalDays
        return {
          id: car.id,
          plate: car.plate,
          make: car.make,
          model: car.model,
          colour: null,
          washIntervalDays: car.washIntervalDays,
          wash: reading(last ?? null, interval, row.remindedAt, now),
        }
      }),
      visits: completed.length,
      spentPaise: money(viewer, row.spentPaise),
      owesPaise: money(viewer, 0),
      history: bookings
        .slice()
        .reverse()
        .map((booking) => ({
          source: 'detlio' as const,
          id: booking.id,
          at: (booking.completedAt ?? booking.scheduledAt).toISOString(),
          status: booking.status,
          lines: booking.items,
          payment: booking.paymentMethod,
          amountPaise: money(viewer, rupeesToPaise(booking.amount)),
        })),
    }
  },

  async createCustomer(viewer: Viewer, input: CreateCustomerInput) {
    const phone = normalisePhone(input.phone)
    const id = await repo.transaction(async (tx) => {
      if (phone) {
        await repo.lockPhone(tx, viewer.vendorId, phone)
        const known = await repo.ownCustomerByPhone(tx, viewer.vendorId, phone)
        if (known) {
          throw new AppError(409, 'You already have a customer with that number.', 'CUSTOMER_PHONE_TAKEN')
        }
      }
      const created = await repo.insertCustomer(tx, {
        vendorId: viewer.vendorId,
        name: input.name.trim(),
        phone,
        note: input.note?.trim() || null,
      })
      await upsertCars(tx, viewer.vendorId, created.id, input.cars ?? [], [])
      return created.id
    })
    return this.customer(viewer, customerRef({ kind: 'own', id }))
  },

  async updateCustomer(viewer: Viewer, refText: string, input: UpdateCustomerInput) {
    const ref = parseCustomerRef(refText)
    if (!ref) notFound()
    if (ref.kind === 'detlio') {
      // A Detlio customer belongs to Detlio: the garage may keep a note, and nothing else.
      if (input.name !== undefined || input.phone !== undefined || input.cars !== undefined) {
        throw new AppError(400, 'Only a note can be kept on a Detlio customer.', 'DETLIO_NOTE_ONLY')
      }
      if (!(await repo.detlioCustomerExists(viewer.vendorId, ref.id))) notFound()
      await repo.setDetlioNote(viewer.vendorId, ref.id, input.note?.trim() || null)
      return this.customer(viewer, refText)
    }
    await repo.transaction(async (tx) => {
      const customer = await repo.ownCustomer(viewer.vendorId, ref.id, tx)
      if (!customer) notFound()
      const phone = input.phone === undefined ? undefined : normalisePhone(input.phone)
      if (phone && phone !== customer.phone) {
        await repo.lockPhone(tx, viewer.vendorId, phone)
        const known = await repo.ownCustomerByPhone(tx, viewer.vendorId, phone)
        if (known && known.id !== customer.id) {
          throw new AppError(409, 'You already have a customer with that number.', 'CUSTOMER_PHONE_TAKEN')
        }
      }
      await repo.updateCustomer(tx, viewer.vendorId, customer.id, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
      })
      if (input.cars) {
        const cars = (await repo.cars([customer.id], tx)).get(customer.id) ?? []
        await upsertCars(tx, viewer.vendorId, customer.id, input.cars, cars)
      }
    })
    return this.customer(viewer, refText)
  },

  // ─── Reminders ─────────────────────────────────────────────────────────────

  async reminders(viewer: Viewer, now = new Date()) {
    const settings = await settingsFor(viewer.vendorId)
    const { customers } = await this.customers(viewer, { filter: 'all' }, now)
    const today = istDateKey(now)
    const weekEnd = addDays(today, 7)
    const sentToday = (remindedAt: string | null) => Boolean(remindedAt && istDateKey(new Date(remindedAt)) === today)
    const entry = (row: CustomerListItem) => ({
      customerId: row.id,
      source: row.source,
      name: row.name,
      car: row.cars[0] ? { plate: row.cars[0].plate, make: row.cars[0].make, model: row.cars[0].model } : null,
      lastVisitAt: row.lastVisitAt,
      daysSince: row.due.daysSince,
      intervalDays: row.due.intervalDays,
      dueOn: row.due.dueOn,
      dueState: row.due.state as DueState,
      channel: row.source === 'own' ? ('whatsapp' as const) : ('detlio_push' as const),
      // An own customer with no mobile has nowhere for a WhatsApp to go.
      canSend: row.source === 'detlio' || Boolean(row.phone && /^[6-9]\d{9}$/.test(row.phone)),
      sentAt: sentToday(row.remindedAt) ? row.remindedAt : null,
    })
    const due = customers.filter((row) => isDue(row.due.state) || sentToday(row.remindedAt)).map(entry)
    // This week: who comes due in the next seven days and hasn't been reminded since their visit.
    const week = customers
      .filter((row) => row.due.dueOn !== null && row.due.dueOn > today && row.due.dueOn <= weekEnd)
      .filter((row) => !(row.remindedAt && row.lastVisitAt && row.remindedAt >= row.lastVisitAt))
      .map(entry)
    return {
      message: settings.message,
      defaultIntervalDays: settings.defaultIntervalDays,
      due,
      week,
    }
  },

  async saveMessage(viewer: Viewer, input: ReminderMessageInput) {
    const refusal = messageRefusal(input.message)
    if (refusal) throw new AppError(400, refusal, 'INVALID_MESSAGE')
    await repo.saveReminderSettings(viewer.vendorId, {
      message: input.message.trim(),
      defaultIntervalDays: input.defaultIntervalDays,
    })
    return settingsFor(viewer.vendorId)
  },

  /**
   * Sends one reminder. An own customer: the wa.me link with the message
   * filled in, and the send logged (the garage presses Send in its own
   * WhatsApp). A Detlio customer: a Detlio app notification, at most one per
   * customer per garage every 7 days, and never a phone number back.
   */
  async sendReminder(viewer: Viewer, refText: string, now = new Date()) {
    const ref = parseCustomerRef(refText)
    if (!ref) notFound()
    const vendor = await repo.vendor(viewer.vendorId)
    if (!vendor) notFound('Garage')

    if (ref.kind === 'own') {
      const customer = await repo.ownCustomer(viewer.vendorId, ref.id)
      if (!customer) notFound()
      if (!customer.phone) throw new AppError(400, 'Add their phone number first.', 'NO_PHONE')
      const settings = await settingsFor(viewer.vendorId)
      const cars = (await repo.cars([customer.id])).get(customer.id) ?? []
      const garagePhone = normalisePhoneSafe(vendor.whatsapp) ?? normalisePhoneSafe(vendor.phone)
      const text = fillReminder(settings.message, {
        name: customer.name,
        car: carLabel(cars[0]),
        garage: vendor.businessName,
        phone: garagePhone ? spacedPhone(garagePhone) : null,
      })
      const url = whatsAppUrl(customer.phone, text)
      if (!url) throw new AppError(400, 'That number is a landline, so it has no WhatsApp.', 'NOT_A_MOBILE')
      const sent = await repo.logSend(
        { vendorId: viewer.vendorId, garageCustomerId: customer.id, channel: 'whatsapp', sentBy: viewer.userId }
      )
      return { channel: 'whatsapp' as const, url, message: text, sentAt: sent.sentAt.toISOString() }
    }

    if (!(await repo.detlioCustomerExists(viewer.vendorId, ref.id))) notFound()
    if (!isAnyPushEnabled()) {
      throw new AppError(409, 'Detlio app notifications are off right now. Try again later.', 'PUSH_OFF')
    }
    const sent = await repo.transaction(async (tx) => {
      await repo.lockPush(tx, viewer.vendorId, ref.id)
      const last = await repo.lastPushTo(tx, viewer.vendorId, ref.id)
      const allowed = pushAllowed(last, now)
      if (!allowed.ok) {
        throw new AppError(429, 'You reminded them in the last 7 days. Detlio sends one a week at most.', 'REMINDER_TOO_SOON', {
          retryAfterSeconds: Math.max(1, Math.ceil((allowed.nextAt!.getTime() - now.getTime()) / 1000)),
        })
      }
      return repo.logSend({ vendorId: viewer.vendorId, userId: ref.id, channel: 'detlio_push', sentBy: viewer.userId }, tx)
    })
    // After the record is written, so a retry can't send twice. The words
    // are fixed ones, never the garage's typed message: a notification shows
    // on a lock screen (lib/push.ts PushMessage).
    pushService.notifyCustomer(ref.id, {
      title: vendor.businessName.slice(0, 60),
      body: 'Your car may be due for a wash. Book your next one in the Detlio app.',
      url: `/garage/${vendor.id}`,
      tag: `garage-reminder:${vendor.id}`,
      category: 'reminder',
      ttlSeconds: 24 * 60 * 60,
      urgency: 'normal',
    })
    return { channel: 'detlio_push' as const, sentAt: sent.sentAt.toISOString() }
  },

  // ─── Money owed (owner) ────────────────────────────────────────────────────

  async owed(viewer: Viewer) {
    const [rows, recent] = await Promise.all([repo.owed(viewer.vendorId), repo.recentPaid(viewer.vendorId)])
    return {
      totalPaise: rows.reduce((sum, row) => sum + row.balancePaise, 0),
      oldestAt: rows.reduce<Date | null>((oldest, row) => (row.oldestAt && (!oldest || row.oldestAt < oldest) ? row.oldestAt : oldest), null)?.toISOString() ?? null,
      customers: rows.map((row) => ({
        customerId: customerRef({ kind: 'own', id: row.customerId }),
        name: row.name,
        phone: row.phone,
        balancePaise: row.balancePaise,
        jobs: row.jobs,
        lastLabel: row.lastLabel,
        oldestAt: row.oldestAt?.toISOString() ?? null,
      })),
      recent: recent.map((row) => ({ name: row.name, amountPaise: row.amountPaise, method: row.method, at: row.at.toISOString() })),
    }
  },

  async markPaid(viewer: Viewer, refText: string, input: MarkPaidInput) {
    const ref = parseCustomerRef(refText)
    if (!ref || ref.kind !== 'own') notFound()
    await repo.transaction(async (tx) => {
      const customer = await repo.ownCustomer(viewer.vendorId, ref.id, tx)
      if (!customer) notFound()
      await repo.lockCustomer(tx, customer.id)
      const balance = await repo.balance(viewer.vendorId, customer.id, tx)
      if (input.amountPaise > balance) {
        throw new AppError(400, 'That is more than they owe.', 'MORE_THAN_OWED')
      }
      await repo.insertPaid(tx, {
        vendorId: viewer.vendorId,
        garageCustomerId: customer.id,
        amountPaise: input.amountPaise,
        method: input.method,
        createdBy: viewer.userId,
      })
    })
    return this.owed(viewer)
  },

  // ─── Stats (owner) ─────────────────────────────────────────────────────────

  async stats(viewer: Viewer, query: StatsQuery, now = new Date()) {
    const month = query.month ?? istMonth(now)
    const bounds = monthBounds(month)
    if (!bounds) throw new AppError(400, 'A month as YYYY-MM', 'INVALID_MONTH')
    const prev = monthBounds(previousMonth(month))!
    // "On October, same days": as far into last month as this month has gone.
    const sofar = Math.min(now.getTime(), bounds.end.getTime()) - bounds.start.getTime()
    const prevEnd = new Date(Math.min(prev.start.getTime() + Math.max(0, sofar), prev.end.getTime()))

    const [current, before, visitors, lastVisitors, owed] = await Promise.all([
      repo.takings(viewer.vendorId, bounds.start, bounds.end),
      repo.takings(viewer.vendorId, prev.start, prevEnd),
      repo.visitors(viewer.vendorId, bounds.start, bounds.end),
      repo.visitors(viewer.vendorId, prev.start, prev.end),
      repo.owed(viewer.vendorId),
    ])
    const filter = query.filter
    const sum = (t: typeof current) =>
      filter === 'own' ? t.ownPaise : filter === 'detlio' ? t.detlioPaise : t.ownPaise + t.detlioPaise
    const keep = (row: { source: 'own' | 'detlio' }) => filter === 'all' || row.source === filter
    const thisRefs = new Set(visitors.filter(keep).map((row) => row.ref))
    const lastRefs = lastVisitors.filter(keep).map((row) => row.ref)
    const cameBack = lastRefs.length > 0 ? Math.round((lastRefs.filter((ref) => thisRefs.has(ref)).length / lastRefs.length) * 100) : null
    const fresh = visitors.filter(keep).filter((row) => row.firstEver && row.firstEver >= bounds.start && row.firstEver < bounds.end)

    // Busiest days: the four weeks up to now (or to the month's end, for a past month).
    const busyEnd = new Date(Math.min(now.getTime(), bounds.end.getTime()))
    const busyStart = new Date(busyEnd.getTime() - 28 * 86_400_000)
    const byDow = await repo.jobsByWeekday(viewer.vendorId, busyStart, busyEnd, filter)
    const mondayFirst = [1, 2, 3, 4, 5, 6, 0].map((dow) => byDow[dow]!)

    return {
      month,
      filter,
      takenPaise: sum(current),
      split: { ownPaise: current.ownPaise, detlioPaise: current.detlioPaise },
      changePercent: percentChange(sum(current), sum(before)),
      cameBackPercent: cameBack,
      newCustomers: fresh.length,
      newFromDetlio: fresh.filter((row) => row.source === 'detlio').length,
      // Profit waits for Expenses (stage 2): null until then, and the apps hide the tile.
      profitPaise: null,
      owedPaise: owed.reduce((total, row) => total + row.balancePaise, 0),
      owedCustomers: owed.length,
      busiestDays: mondayFirst,
    }
  },

  // ─── Excel (owner) ─────────────────────────────────────────────────────────

  async exportBook(viewer: Viewer, now = new Date()) {
    const vendor = await repo.vendor(viewer.vendorId)
    if (!vendor) notFound('Garage')
    const [rows, detlio, owed] = await Promise.all([
      repo.exportRows(viewer.vendorId),
      repo.detlioCustomers(viewer.vendorId),
      repo.owed(viewer.vendorId),
    ])
    const rupees = (paise: number) => Math.round(paise) / 100
    const day = (date: Date | null) => (date ? istDateKey(date) : '')
    const names = new Map(rows.customers.map((customer) => [customer.id, customer.name]))
    const bytes = buildXlsx([
      {
        name: 'Customers',
        header: ['Name', 'Phone', 'Source', 'Note', 'Added'],
        rows: [
          ...rows.customers.map((c) => [c.name, c.phone ? spacedPhone(c.phone) : '', 'Your customer', c.note ?? '', day(c.createdAt)]),
          // Detlio customers: name only, never a phone number.
          ...detlio.map((c) => [c.name, '', 'Via Detlio', '', day(c.firstAt)]),
        ],
      },
      {
        name: 'Cars',
        header: ['Customer', 'Plate', 'Make', 'Model', 'Colour', 'Wash every (days)'],
        rows: [
          ...rows.cars.map((car) => [names.get(car.garageCustomerId) ?? '', car.plate ?? '', car.make ?? '', car.model ?? '', car.colour ?? '', car.washIntervalDays ?? '']),
          ...detlio.flatMap((c) => c.cars.map((car) => [c.name, car.plate ?? '', car.make, car.model, '', car.washIntervalDays ?? ''])),
        ],
      },
      {
        name: 'Jobs',
        header: ['Date', 'Time', 'Customer', 'Car', 'Services', 'Status', 'Payment', 'Total (₹)'],
        rows: rows.jobs.map((job) => [
          day(job.scheduledAt),
          job.scheduledAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
          job.customerName,
          [job.plate, carLabel(job)].filter(Boolean).join(' · '),
          job.lines.map((line) => (line.qty > 1 ? `${line.label} ×${line.qty}` : line.label)).join(', '),
          job.status.replace('_', ' '),
          job.paymentMethod === 'later' ? 'Pay later' : job.paymentMethod.toUpperCase(),
          rupees(job.totalPaise),
        ]),
      },
      {
        name: 'Payments',
        header: ['Date', 'Customer', 'Kind', 'Method', 'Amount (₹)'],
        rows: rows.payments.map((p) => [
          day(p.createdAt),
          names.get(p.garageCustomerId) ?? '',
          p.kind === 'owed' ? 'Owed' : 'Paid back',
          p.method ? p.method.toUpperCase() : '',
          rupees(p.amountPaise),
        ]),
      },
      {
        name: 'Owed',
        header: ['Customer', 'Phone', 'Owes (₹)', 'Since'],
        rows: owed.map((row) => [row.name, row.phone ? spacedPhone(row.phone) : '', rupees(row.balancePaise), day(row.oldestAt)]),
      },
    ])
    const slug = vendor.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'garage'
    return { bytes, filename: `${slug}-book-${istDateKey(now)}.xlsx` }
  },

  // ─── Admin (Detlio staff, read-only) ───────────────────────────────────────

  async adminView(vendorId: string, now = new Date()) {
    const vendor = await repo.vendor(vendorId)
    if (!vendor) notFound('Garage')
    // Detlio staff see everything a garage's owner sees, and their own
    // customers' numbers: the book is Detlio's to see (owner decision 4).
    const owner: Viewer = { vendorId, userId: '00000000-0000-0000-0000-000000000000', role: 'vendor_admin' }
    const since = new Date(now.getTime() - 90 * 86_400_000)
    const [customers, jobs, owed, stats] = await Promise.all([
      this.customers(owner, { filter: 'all' }, now),
      repo.jobsBetween(vendorId, since, new Date(now.getTime() + 90 * 86_400_000)),
      this.owed(owner),
      this.stats(owner, { filter: 'all' }, now),
    ])
    return {
      vendor: { id: vendor.id, name: vendor.businessName },
      counts: customers.counts,
      customers: customers.customers,
      jobs: jobs.map((job) => ownJobView(owner, job)).reverse(),
      owed,
      stats,
    }
  },
}

/** "98400 12345": how a phone reads in the Excel. */
function spacedPhone(phone: string): string {
  return `${phone.slice(0, 5)} ${phone.slice(5)}`
}

function normalisePhoneSafe(raw: string | null | undefined): string | null {
  try {
    return normalisePhone(raw)
  } catch (err) {
    logger.debug({ err }, 'garage_book:garage_phone_unreadable')
    return null
  }
}
