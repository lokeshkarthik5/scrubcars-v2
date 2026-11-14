import { AppError } from '../../lib/errors.js'
import { PAY_APPS, payAppsText, payLine, type PayApp } from '../../lib/garage-book.js'
import { isPayQrKey, payQrStorage, type PayQrType } from '../../lib/garage-pay-qr-storage.js'
import { logger } from '../../lib/logger.js'
import { readPaymentQr } from '../../lib/upi-qr.js'
import { billsRepository as repo } from './garage-book-bills.repository.js'
import type { PaymentDetailsInput } from './garage-book.validation.js'
import { normalisePhone, normalisePhoneSafe, notFound, type Viewer } from './garage-book.viewer.js'

const log = logger.child({ module: 'garage-book-pay' })

/**
 * Payment details (0074; the owner's own ask, 12 Nov): how the garage's
 * customers pay it. Its UPI QR (read when saved, so the owner can check the
 * name is theirs), a phone for payments (the garage's own phone unless it
 * says otherwise) and the apps that number takes. Owner only.
 *
 * Shown only where the toggles say: unpaid bills, money-owed reminders and
 * the booking page. The money goes straight to the garage; Detlio only shows
 * the garage's own details and never handles a rupee of it.
 */

/** What a bill, a reminder or the booking page shows, when the garage has said to. */
export interface ShownPay {
  /** A short-lived link to the QR picture (bills only). */
  qrUrl: string | null
  upiId: string | null
  upiName: string | null
  phone: string | null
  apps: PayApp[]
  /** "GPay/PhonePe". */
  appsText: string
  /** "Pay on GPay/PhonePe 98400 00000", for a WhatsApp. */
  line: string | null
}

type Where = 'bills' | 'reminders' | 'booking_page'

async function garagePhone(vendorId: string) {
  const garage = await repo.garage(vendorId)
  if (!garage) notFound('Garage')
  return normalisePhoneSafe(garage.phone)
}

export const paymentDetailsService = {
  async get(viewer: Viewer, now = Date.now()) {
    const [row, phone] = [await repo.paymentDetails(viewer.vendorId), await garagePhone(viewer.vendorId)]
    return {
      set: Boolean(row),
      qrUrl: row?.qrKey ? payQrStorage.payQrLink(row.qrKey, now) : null,
      qrKey: row?.qrKey ?? null,
      // Read from the QR; null with a QR means it couldn't be read: ask the owner to check the picture.
      upiId: row?.upiId ?? null,
      upiName: row?.upiName ?? null,
      qrRead: row?.qrKey ? (row.upiId ? ('read' as const) : ('unreadable' as const)) : null,
      phone: row?.phone ?? phone,
      phoneIsGarage: !row?.phone,
      apps: (row?.apps ?? []) as PayApp[],
      showOnBills: row?.showOnBills ?? true,
      showOnReminders: row?.showOnReminders ?? true,
      showOnBookingPage: row?.showOnBookingPage ?? true,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    }
  },

  uploadQr(viewer: Viewer, contentType: PayQrType) {
    return payQrStorage.createPayQrUpload(viewer.vendorId, contentType)
  },

  /**
   * Saves what was sent and keeps the rest. A new QR is read first: one that
   * isn't a UPI QR is refused; one with no readable QR is saved with no UPI
   * id, so the apps ask the owner to check the picture.
   */
  async save(viewer: Viewer, input: PaymentDetailsInput) {
    const current = await repo.paymentDetails(viewer.vendorId)
    let qrKey = current?.qrKey ?? null
    let upiId = current?.upiId ?? null
    let upiName = current?.upiName ?? null
    if (input.qrKey !== undefined && input.qrKey !== qrKey) {
      if (input.qrKey === null) {
        qrKey = null
        upiId = null
        upiName = null
      } else {
        if (!isPayQrKey(viewer.vendorId, input.qrKey)) {
          throw new AppError(400, 'Upload the QR picture again.', 'INVALID_QR_KEY')
        }
        const bytes = await payQrStorage.readPayQr(input.qrKey)
        const read = bytes ? readPaymentQr(bytes) : ({ status: 'unreadable' } as const)
        if (read.status === 'not_upi') {
          throw new AppError(
            400,
            'That QR isn’t a UPI payment QR. Upload the QR from GPay, PhonePe or Paytm.',
            'QR_NOT_UPI'
          )
        }
        qrKey = input.qrKey
        upiId = read.status === 'upi' ? read.upiId : null
        upiName = read.status === 'upi' ? read.upiName : null
        log.info({ vendorId: viewer.vendorId, read: read.status, stored: Boolean(bytes) }, 'pay_qr:saved')
      }
    }
    const apps = input.apps
      ? PAY_APPS.filter((app) => input.apps!.includes(app))
      : ((current?.apps ?? []) as PayApp[])
    await repo.savePaymentDetails(viewer.vendorId, {
      qrKey,
      upiId,
      upiName,
      phone: input.phone === undefined ? (current?.phone ?? null) : normalisePhone(input.phone),
      apps,
      showOnBills: input.showOnBills ?? current?.showOnBills ?? true,
      showOnReminders: input.showOnReminders ?? current?.showOnReminders ?? true,
      showOnBookingPage: input.showOnBookingPage ?? current?.showOnBookingPage ?? true,
    })
    // The old picture goes once the new one is saved: nothing names it now.
    if (current?.qrKey && current.qrKey !== qrKey) await payQrStorage.removePayQr(current.qrKey)
    return this.get(viewer)
  },

  /**
   * The details to show in one place, or null: only when the garage has set
   * them up and switched that place on, and there is a phone or a UPI id.
   */
  async shownOn(vendorId: string, where: Where, now = Date.now()): Promise<ShownPay | null> {
    const row = await repo.paymentDetails(vendorId)
    if (!row) return null
    const on = where === 'bills' ? row.showOnBills : where === 'reminders' ? row.showOnReminders : row.showOnBookingPage
    if (!on) return null
    const phone = row.phone ?? (await garagePhone(vendorId))
    if (!phone && !row.upiId) return null
    const apps = (row.apps ?? []) as PayApp[]
    return {
      qrUrl: where === 'bills' && row.qrKey ? payQrStorage.payQrLink(row.qrKey, now) : null,
      upiId: row.upiId,
      upiName: row.upiName,
      phone,
      apps,
      appsText: payAppsText(apps),
      line: payLine({ phone, apps }),
    }
  },
}
