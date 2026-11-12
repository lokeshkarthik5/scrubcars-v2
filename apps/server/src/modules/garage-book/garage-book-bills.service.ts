import { randomBytes } from 'node:crypto'
import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import {
  DEFAULT_INTERVAL_DAYS,
  MADE_WITH,
  billNumberText,
  rupeesText,
  rupeesToPaise,
  spacedPhone,
} from '../../lib/garage-book.js'
import { addDays, istDateKey } from '../../lib/ist.js'
import { billsRepository as repo, type BillRow } from './garage-book-bills.repository.js'
import { paymentDetailsService } from './garage-book-pay.service.js'
import { resolveJobRef, targetRef } from './garage-book-team.service.js'
import type { JobTarget } from './garage-book-team.repository.js'
import { garageBookRepository } from './garage-book.repository.js'
import { normalisePhoneSafe, notFound, whatsAppUrl, type Viewer } from './garage-book.viewer.js'

/**
 * Bills (0074; owner decision 12 Nov). One bill per job, a walk-in or a
 * Detlio booking, with the garage's own running number from 0001, never
 * reused (garage_bill_counters only goes up). The bill keeps a snapshot of
 * what it said; asking for it again refreshes only whether it is paid.
 *
 * Sending: the garage's own customer gets a wa.me link with the bill's
 * number, total and page; a Detlio customer's phone never reaches the
 * garage, so their bill has a share link only (as Stage 1's reminders).
 * Every bill says "Made with Detlio for Garages"; there is no setting.
 */

export interface BillSnapshot {
  number: number
  source: 'own' | 'detlio'
  /** The job's day, IST "YYYY-MM-DD". */
  date: string
  garage: { name: string; address: string; phone: string | null; gstin: string | null }
  /** First name, plate and car: never a phone number. */
  customer: { firstName: string; plate: string | null; car: string | null }
  lines: Array<{ label: string; qty: number; pricePaise: number }>
  totalPaise: number
  paid: boolean
  /** How it was paid, or how it will be: upi, cash, online (through Detlio) or later. */
  method: 'upi' | 'cash' | 'online' | 'later' | null
  nextWashDue: string | null
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Customer'

function carText(car: { make: string | null; model: string | null }) {
  return [car.make, car.model].filter(Boolean).join(' ').trim() || null
}

/** "12, 3rd Main Rd, Velachery, Chennai 600042": the address with its city and pincode once. */
function fullAddress(garage: { address: string; city: string; pincode: string }) {
  let text = garage.address.replace(/\s+/g, ' ').trim()
  if (garage.city && !text.toLowerCase().includes(garage.city.toLowerCase())) text = `${text}, ${garage.city}`
  if (garage.pincode && !text.includes(garage.pincode)) text = `${text} ${garage.pincode}`
  return text
}

export function billUrl(token: string) {
  return `${env.garageBookSiteUrl}/b/${token}`
}

/** What the bill says now: the garage, the customer's first name and car, the lines, and whether it is paid. */
async function snapshotFor(vendorId: string, target: JobTarget): Promise<Omit<BillSnapshot, 'number'> & { phone: string | null }> {
  const garage = await repo.garage(vendorId)
  if (!garage) notFound('Garage')
  const head = {
    name: garage.businessName,
    address: fullAddress(garage),
    phone: (() => {
      const phone = normalisePhoneSafe(garage.phone)
      return phone ? spacedPhone(phone) : null
    })(),
    // Vendors keep no GSTIN yet: shown here the day they do.
    gstin: null,
  }

  if (target.kind === 'own') {
    const job = await garageBookRepository.job(vendorId, target.id)
    if (!job) notFound('Job')
    if (job.status === 'cancelled') throw new AppError(400, 'This job was cancelled, so it has no bill.', 'JOB_CANCELLED')
    let paid = false
    let method: BillSnapshot['method'] = job.paymentMethod
    if (job.status === 'done') {
      if (job.paymentMethod !== 'later') paid = true
      else if ((await garageBookRepository.balance(vendorId, job.garageCustomerId)) <= 0) {
        paid = true
        method = (await repo.lastPaidMethod(vendorId, job.garageCustomerId)) ?? 'later'
      }
    }
    const day = job.doneAt ?? job.scheduledAt
    return {
      source: 'own',
      date: istDateKey(day),
      garage: head,
      customer: { firstName: firstName(job.customerName), plate: job.plate, car: carText(job) },
      lines: job.lines.map((line) => ({ label: line.label, qty: line.qty, pricePaise: line.pricePaise })),
      totalPaise: job.totalPaise,
      paid,
      method,
      nextWashDue: job.remindInDays ? addDays(istDateKey(day), job.remindInDays) : null,
      // The garage's own customer's number, for the wa.me link only; never on the bill.
      phone: job.customerPhone,
    }
  }

  const booking = await repo.bookingForBill(vendorId, target.id)
  if (!booking) notFound('Job')
  if (booking.status === 'cancelled' || booking.status === 'rescheduled') {
    throw new AppError(400, 'This booking was cancelled, so it has no bill.', 'JOB_CANCELLED')
  }
  const paid = booking.paymentStatus === 'paid' || booking.paymentStatus === 'collected'
  const settings = await garageBookRepository.reminderSettings(vendorId)
  const day = booking.completedAt ?? booking.scheduledAt
  const interval = booking.washIntervalDays ?? settings?.defaultIntervalDays ?? DEFAULT_INTERVAL_DAYS
  return {
    source: 'detlio',
    date: istDateKey(day),
    garage: head,
    customer: { firstName: firstName(booking.userName), plate: booking.plate, car: carText(booking) },
    lines: booking.items.map((item) => ({ label: item.label, qty: 1, pricePaise: rupeesToPaise(item.amount) })),
    totalPaise: rupeesToPaise(booking.amount),
    paid,
    method: booking.paymentStatus === 'paid' ? 'online' : booking.paymentMethod === 'cash' ? 'cash' : 'online',
    nextWashDue: booking.status === 'completed' ? addDays(istDateKey(day), interval) : null,
    // Never a Detlio customer's number (owner decision, 9 Nov 2026).
    phone: null,
  }
}

function billMessage(snapshot: BillSnapshot, url: string, payLine: string | null) {
  const lines = [
    `Bill ${billNumberText(snapshot.number)} from ${snapshot.garage.name}`,
    `Total ${rupeesText(snapshot.totalPaise)}${snapshot.paid ? (snapshot.method === 'upi' ? ' · Paid by UPI ✓' : ' · Paid ✓') : ''}`,
    `Your bill: ${url}`,
  ]
  if (!snapshot.paid && payLine) lines.push(payLine)
  lines.push('Thank you!')
  return lines.join('\n')
}

function targetOf(bill: BillRow): JobTarget {
  return bill.garageJobId ? { kind: 'own', id: bill.garageJobId } : { kind: 'detlio', id: bill.bookingId! }
}

export const billsService = {
  /**
   * The bill for a job: made the first time (the next number), found after
   * that with only its paid state brought up to date. Owner only.
   */
  async create(viewer: Viewer, refText: string) {
    const target = await resolveJobRef(viewer.vendorId, refText)
    const { phone, ...now } = await snapshotFor(viewer.vendorId, target)
    const { bill, created } = await repo.transaction(async (tx) => {
      await repo.lockJob(tx, targetRef(target))
      const existing = await repo.billFor(tx, viewer.vendorId, target)
      if (existing) {
        const snapshot = { ...existing.snapshot, paid: now.paid, method: now.method }
        await repo.updateSnapshot(tx, existing.id, snapshot)
        return { bill: { ...existing, snapshot }, created: false }
      }
      const number = await repo.nextNumber(tx, viewer.vendorId)
      const row = await repo.insertBill(tx, {
        vendorId: viewer.vendorId,
        number,
        garageJobId: target.kind === 'own' ? target.id : null,
        bookingId: target.kind === 'detlio' ? target.id : null,
        // 24 URL-safe characters: 144 random bits.
        token: randomBytes(18).toString('base64url'),
        snapshot: { ...now, number },
      })
      return {
        bill: {
          id: row.id,
          vendorId: row.vendorId,
          number: row.number,
          garageJobId: row.garageJobId,
          bookingId: row.bookingId,
          token: row.token,
          snapshot: row.snapshot,
          createdAt: row.createdAt,
        } satisfies BillRow,
        created: true,
      }
    })
    const snapshot = bill.snapshot as unknown as BillSnapshot
    const shareUrl = billUrl(bill.token)
    const pay = snapshot.paid ? null : await paymentDetailsService.shownOn(viewer.vendorId, 'bills')
    const message = billMessage(snapshot, shareUrl, pay?.line ?? null)
    return {
      id: bill.id,
      ref: targetRef(target),
      number: bill.number,
      numberText: billNumberText(bill.number),
      token: bill.token,
      shareUrl,
      // The garage's own customer only, and only with a mobile: never for a Detlio customer.
      whatsappUrl: target.kind === 'own' && phone ? whatsAppUrl(phone, message) : null,
      message,
      snapshot,
      pay,
      madeWith: MADE_WITH,
      createdAt: bill.createdAt.toISOString(),
      created,
    }
  },

  /**
   * A bill's public page (/b/<token>): what it said, whether it is paid now,
   * and, while it isn't, the garage's own UPI QR and phone if it shows them on
   * bills. No customer phone, ever. A 404 for a token that isn't one.
   */
  async publicBill(token: string) {
    const bill = await repo.billByToken(token)
    if (!bill) notFound('Bill')
    const snapshot = bill.snapshot as unknown as BillSnapshot
    let paid = snapshot.paid
    let method = snapshot.method
    try {
      const live = await snapshotFor(bill.vendorId, targetOf(bill))
      paid = live.paid
      method = live.method
    } catch (err) {
      // A job cancelled after its bill was made: the bill stays as it was.
      if (!(err instanceof AppError)) throw err
    }
    const pay = paid ? null : await paymentDetailsService.shownOn(bill.vendorId, 'bills')
    return {
      numberText: billNumberText(bill.number),
      ...snapshot,
      paid,
      method,
      pay,
      madeWith: MADE_WITH,
    }
  },
}
