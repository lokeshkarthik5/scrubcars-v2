import { bookingReference } from '../../lib/booking-ops.js'
import {
  COMPLAINT_ACTION_FROM,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_SOURCE_LABELS,
  MAX_COMPLAINTS_PER_HOUR,
  MAX_UNFINISHED_COMPLAINTS,
  complaintDueTimes,
  complaintOverdue,
  complaintSubmitRefusal,
  formatComplaintNumber,
  overdueCutoffs,
  type ComplaintAction,
  type ComplaintStatus,
} from '../../lib/complaints.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { customerComplaint } from '../../lib/push-messages.js'
import { pushService } from '../push/push.service.js'
import { pickBookingByReference, planLoggedComplaint } from './complaints.logging.js'
import {
  complaintsRepository,
  type AdminComplaintRow,
  type ComplaintListFilter,
  type ComplaintRecord,
} from './complaints.repository.js'
import type {
  CloseComplaintInput,
  ComplaintAdminNoteInput,
  ComplaintLookupQuery,
  CreateComplaintInput,
  ListComplaintsQuery,
  LogComplaintInput,
  ResolveComplaintInput,
} from './complaints.validation.js'
import { adminSubjectName } from '../admin-logins/admin-logins.service.js'

const log = logger.child({ module: 'complaints' })


/** My complaints: enough for anyone; older ones are on the team's side. */
const CUSTOMER_LIST_LIMIT = 50

/** The admin list per filter. Volumes are pilot-sized; the counts are exact. */
const ADMIN_LIST_LIMIT = 200

const HOUR_MS = 60 * 60 * 1000

/**
 * Who pressed the button, as a name: the shared break-glass login signs as
 * 'admin', a personal admin login (0058) with its name, a named super-admin
 * as themselves (as notices do).
 */
async function resolveActorName(sub: string): Promise<string> {
  const adminName = await adminSubjectName(sub)
  if (adminName) return adminName
  const user = await complaintsRepository.findUserById(sub)
  return (user?.name.trim() || user?.phone || sub).slice(0, 100)
}

/**
 * What the customer sees of their complaint. Never the team's note or who
 * on the team handled it.
 */
function toCustomerComplaint(row: ComplaintRecord) {
  return {
    id: row.id,
    number: formatComplaintNumber(row.number),
    status: row.status,
    category: row.category,
    message: row.message,
    bookingId: row.bookingId,
    bookingRef: row.bookingRef,
    garageName: row.garageName,
    // How it reached us: 'app', or how they told the team (never who logged it).
    source: row.source,
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    // Only written when it is resolved or closed, which is when it is shown.
    resolutionNote: row.resolutionNote,
    // Withdrawn by the customer before anyone answered (0066).
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    // Whether "Withdraw" applies now: theirs from the app, nobody has answered.
    canWithdraw: row.status === 'open' && row.source === 'app',
  }
}

function toAdminComplaint(row: AdminComplaintRow, now: Date) {
  const c = row.complaint
  const due = complaintDueTimes(c.receivedAt)
  return {
    id: c.id,
    number: formatComplaintNumber(c.number),
    status: c.status,
    category: c.category,
    message: c.message,
    customer: {
      id: c.userId,
      name: c.customerName,
      phone: c.customerPhone,
      // Null user id on an app complaint: the account was deleted after it
      // was made. A logged one may never have had an account (the phone was
      // not one), so it is not called deleted; admin says it has none.
      accountDeleted: c.userId === null ? c.source === 'app' : !row.accountExists,
    },
    booking: c.bookingRef
      ? {
          // Null once the booking itself is gone (the test-data reset, or
          // its garage deleted forever); the reference stays.
          id: c.bookingId,
          reference: c.bookingRef,
          scheduledAt: row.bookingScheduledAt?.toISOString() ?? null,
          status: row.bookingStatus,
        }
      : null,
    garage: c.garageName ? { id: c.vendorId, name: c.garageName } : null,
    resolutionNote: c.resolutionNote,
    adminNote: c.adminNote,
    acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: c.acknowledgedBy,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    resolvedBy: c.resolvedBy,
    closedAt: c.closedAt?.toISOString() ?? null,
    closedBy: c.closedBy,
    withdrawnAt: c.withdrawnAt?.toISOString() ?? null,
    source: c.source,
    loggedBy: c.loggedBy,
    receivedAt: c.receivedAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    acknowledgeBy: due.acknowledgeBy.toISOString(),
    resolveBy: due.resolveBy.toISOString(),
    overdue: complaintOverdue(c, now),
  }
}

/** Oldest first where the clock matters (the oldest is the most urgent); newest first otherwise. */
const LIST_ORDER: Record<ComplaintListFilter, 'oldest' | 'newest'> = {
  open: 'oldest',
  overdue: 'oldest',
  resolved: 'newest',
  all: 'newest',
}

function notFound() {
  return new AppError(404, 'Complaint not found', 'COMPLAINT_NOT_FOUND')
}

/** A press on a complaint that has moved on since the page was loaded. */
function alreadyMoved(action: ComplaintAction) {
  const words: Record<ComplaintAction, string> = {
    acknowledge: 'This complaint has already been acknowledged, resolved or closed.',
    resolve: 'This complaint is already resolved or closed.',
    close: 'This complaint is already closed.',
  }
  return new AppError(409, `${words[action]} Reload to see it as it is now.`, 'COMPLAINT_STATUS_CHANGED')
}

async function getAdminOr404(id: string) {
  const row = await complaintsRepository.findForAdmin(id)
  if (!row) throw notFound()
  return row
}

/**
 * Runs one of the team's actions: refused unless the complaint is in a
 * status the action may start from (lib/complaints.ts), checked in the
 * write itself so two presses at once cannot both go through.
 */
async function move(
  id: string,
  action: ComplaintAction,
  write: (from: readonly ComplaintStatus[]) => Promise<{ id: string } | null>
) {
  const moved = await write(COMPLAINT_ACTION_FROM[action])
  if (!moved) {
    if (!(await complaintsRepository.exists(id))) throw notFound()
    throw alreadyMoved(action)
  }
}

/**
 * The customer hears that the team moved their complaint on (0044), when
 * it is linked to an account: the number only, never the team's answer,
 * which they read in My complaints.
 */
function notifyCustomer(
  complaint: { id: string; number: number; userId: string | null },
  step: 'acknowledged' | 'resolved'
) {
  if (complaint.userId) pushService.notifyCustomer(complaint.userId, customerComplaint(complaint, step))
}

export const complaintsService = {
  /**
   * A customer raises a complaint. The booking, if named, must be their own
   * (anyone else's is a 404, as if it did not exist); its garage comes with
   * it. Name and phone are taken from the account now and kept.
   */
  async submit(userId: string, input: CreateComplaintInput, now = new Date()) {
    const customer = await complaintsRepository.findCustomer(userId)
    if (!customer) throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    if (customer.status === 'suspended') {
      throw new AppError(403, 'Account is suspended', 'ACCOUNT_SUSPENDED')
    }

    let booking: { id: string; vendorId: string; garageName: string | null } | null = null
    if (input.bookingId) {
      booking = await complaintsRepository.findOwnBooking(userId, input.bookingId)
      if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
    }

    const outcome = await complaintsRepository.insertUnderLimits({
      userId,
      since: new Date(now.getTime() - HOUR_MS),
      decide: complaintSubmitRefusal,
      values: {
        customerName: customer.name.slice(0, 255),
        customerPhone: customer.phone,
        bookingId: booking?.id ?? null,
        bookingRef: booking ? bookingReference(booking.id) : null,
        vendorId: booking?.vendorId ?? null,
        garageName: booking?.garageName ?? null,
        category: input.category,
        message: input.message,
      },
    })

    if (!outcome.created) {
      log.warn({ userId, refusal: outcome.refusal }, 'complaint:refused')
      if (outcome.refusal === 'too_many_open') {
        throw new AppError(
          409,
          `You have ${MAX_UNFINISHED_COMPLAINTS} complaints waiting for an answer. We'll reply to those first; for anything urgent, call or WhatsApp us.`,
          'COMPLAINT_LIMIT_OPEN'
        )
      }
      throw new AppError(
        429,
        `You've raised ${MAX_COMPLAINTS_PER_HOUR} complaints in the last hour. Please try again later, or call or WhatsApp us.`,
        'COMPLAINT_RATE_LIMIT'
      )
    }

    const created = outcome.created
    const number = formatComplaintNumber(created.number)
    log.info(
      { complaintId: created.id, number, category: created.category, bookingId: created.bookingId },
      'complaint:created'
    )
    alertOps({
      kind: 'complaint_received',
      complaintId: created.id,
      number,
      category: COMPLAINT_CATEGORY_LABELS[created.category],
      bookingId: created.bookingId,
      garageName: created.garageName,
      customerName: created.customerName,
      message: created.message,
      acknowledgeBy: complaintDueTimes(created.receivedAt).acknowledgeBy,
      logged: null,
    })

    return toCustomerComplaint(created)
  },

  /**
   * The team logs a complaint that came by phone, WhatsApp, email or in
   * person. It gets a number and the same clock as one raised in the app,
   * counted from when it was received.
   *
   * The phone finds the account: if there is one, the complaint is theirs
   * (it shows in their My complaints, with the team's answer) and their
   * name is taken from it; if not, the name typed is kept with the phone.
   * A booking reference attaches the booking and its garage; with an
   * account it must be one of theirs.
   */
  async log(input: LogComplaintInput, now = new Date()) {
    const account = (await complaintsRepository.findUserByPhone(input.phone)) ?? null
    const bookings = input.bookingRef
      ? await complaintsRepository.findBookingsByReference(input.bookingRef)
      : []
    const values = planLoggedComplaint(input, { account, bookings }, now)
    const created = await complaintsRepository.insertLogged(values)

    const number = formatComplaintNumber(created.number)
    log.info(
      {
        complaintId: created.id,
        number,
        source: created.source,
        linkedToAccount: created.userId !== null,
        bookingId: created.bookingId,
      },
      'complaint:logged'
    )
    alertOps({
      kind: 'complaint_received',
      complaintId: created.id,
      number,
      category: COMPLAINT_CATEGORY_LABELS[created.category],
      bookingId: created.bookingId,
      garageName: created.garageName,
      customerName: created.customerName,
      message: created.message,
      acknowledgeBy: complaintDueTimes(created.receivedAt).acknowledgeBy,
      logged: { source: COMPLAINT_SOURCE_LABELS[created.source], by: input.loggedBy },
    })

    return toAdminComplaint(await getAdminOr404(created.id), now)
  },

  /**
   * The log form's look-ups: whose account a phone is (only the name: the
   * form shows "Karthik's account"), and which booking a reference is, with
   * whether it is that customer's. Nothing is written.
   */
  async lookup(query: ComplaintLookupQuery) {
    const account = query.phone ? await complaintsRepository.findUserByPhone(query.phone) : undefined
    let booking:
      | { found: true; reference: string; garageName: string | null; scheduledAt: string; status: string }
      | { found: false; refusal: 'not_found' | 'not_theirs' | 'ambiguous' }
      | null = null
    if (query.bookingRef) {
      const candidates = await complaintsRepository.findBookingsByReference(query.bookingRef)
      const picked = pickBookingByReference(candidates, account?.id ?? null)
      booking =
        'booking' in picked
          ? {
              found: true as const,
              reference: bookingReference(picked.booking.id),
              garageName: picked.booking.garageName,
              scheduledAt: picked.booking.scheduledAt.toISOString(),
              status: picked.booking.status,
            }
          : { found: false as const, refusal: picked.refusal }
    }
    return {
      customer: query.phone ? (account ? { name: account.name } : null) : undefined,
      booking: query.bookingRef ? booking : undefined,
    }
  },

  /**
   * The customer withdraws a complaint nobody has answered yet (0066): one
   * they raised in the app, still open. Anyone else's is a 404, the same as
   * none; one the team has answered (or logged for them) is a 409.
   */
  async withdraw(userId: string, id: string, now = new Date()) {
    const withdrawn = await complaintsRepository.withdrawOwn(id, userId, now)
    if (!withdrawn) {
      const own = await complaintsRepository.findOwn(id, userId)
      if (!own) throw notFound()
      throw new AppError(
        409,
        own.source !== 'app'
          ? 'Our team logged this complaint for you, so it can only be closed by the team. Contact Detlio support.'
          : 'Our team has already answered this complaint, so it can no longer be withdrawn.',
        'COMPLAINT_NOT_WITHDRAWABLE'
      )
    }
    log.info({ complaintId: id }, 'complaint:withdrawn')
    return toCustomerComplaint(withdrawn)
  },

  /** The customer's own complaints, newest first. */
  async listMine(userId: string) {
    const rows = await complaintsRepository.listForCustomer(userId, CUSTOMER_LIST_LIMIT)
    return rows.map(toCustomerComplaint)
  },

  /** One filter of the admin list, with every filter's count. */
  async list(query: ListComplaintsQuery, now = new Date()) {
    const cutoffs = overdueCutoffs(now)
    // One after the other: the API has a single connection (db/index.ts).
    const rows = await complaintsRepository.listForAdmin({
      filter: query.show,
      cutoffs,
      order: LIST_ORDER[query.show],
      limit: ADMIN_LIST_LIMIT,
    })
    const counts = await complaintsRepository.countForAdmin(cutoffs)
    return {
      complaints: rows.map((row) => toAdminComplaint(row, now)),
      counts,
      now: now.toISOString(),
    }
  },

  async get(id: string, now = new Date()) {
    return toAdminComplaint(await getAdminOr404(id), now)
  },

  async acknowledge(sub: string, id: string, now = new Date()) {
    const by = await resolveActorName(sub)
    await move(id, 'acknowledge', (from) =>
      complaintsRepository.moveTo(id, from, { status: 'acknowledged', by, at: now })
    )
    log.info({ complaintId: id }, 'complaint:acknowledged')
    const row = await getAdminOr404(id)
    notifyCustomer(row.complaint, 'acknowledged')
    return toAdminComplaint(row, now)
  },

  async resolve(sub: string, id: string, input: ResolveComplaintInput, now = new Date()) {
    const by = await resolveActorName(sub)
    await move(id, 'resolve', (from) =>
      complaintsRepository.moveTo(id, from, {
        status: 'resolved',
        by,
        at: now,
        resolutionNote: input.resolutionNote,
      })
    )
    log.info({ complaintId: id }, 'complaint:resolved')
    const row = await getAdminOr404(id)
    notifyCustomer(row.complaint, 'resolved')
    return toAdminComplaint(row, now)
  },

  async close(sub: string, id: string, input: CloseComplaintInput, now = new Date()) {
    const by = await resolveActorName(sub)
    await move(id, 'close', (from) =>
      complaintsRepository.moveTo(id, from, {
        status: 'closed',
        by,
        at: now,
        resolutionNote: input.resolutionNote,
      })
    )
    log.info({ complaintId: id }, 'complaint:closed')
    return toAdminComplaint(await getAdminOr404(id), now)
  },

  /** The team's own note, in any status. Empty clears it. */
  async setAdminNote(id: string, input: ComplaintAdminNoteInput, now = new Date()) {
    const updated = await complaintsRepository.setAdminNote(id, input.adminNote || null)
    if (!updated) throw notFound()
    return toAdminComplaint(await getAdminOr404(id), now)
  },
}
