import type { Context } from 'hono'
import {
  getTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { bookingChargesService } from './booking-charges.service.js'
import type {
  AskExtraWorkInput,
  ExtraWorkUploadUrlInput,
  RaiseFinalBillInput,
  VerifyChargePaymentInput,
} from './booking-charges.validation.js'

type ChargesContext = Context<{ Variables: TenantVariables }>

function getAuth(c: ChargesContext) {
  return c.get('auth')
}

/** The active company. Produced by resolveTenant, never by a request param. */
function getVendorId(c: ChargesContext): string {
  return getTenant(c).vendorId
}

export async function getFinalBill(c: ChargesContext, bookingId: string) {
  const bill = await bookingChargesService.getFinalBill(getVendorId(c), bookingId)

  return c.json({
    success: true,
    data: bill,
  })
}

export async function raiseFinalBill(
  c: ChargesContext,
  bookingId: string,
  input: RaiseFinalBillInput
) {
  const bill = await bookingChargesService.raiseFinalBill(
    getVendorId(c),
    getAuth(c).sub,
    bookingId,
    input
  )

  return c.json(
    {
      success: true,
      data: bill,
    },
    201
  )
}

export async function payCharge(
  c: ChargesContext,
  bookingId: string,
  chargeId: string
) {
  const order = await bookingChargesService.payCharge(
    getAuth(c).sub,
    bookingId,
    chargeId
  )

  return c.json({
    success: true,
    data: order,
  })
}

export async function verifyChargePayment(
  c: ChargesContext,
  bookingId: string,
  chargeId: string,
  input: VerifyChargePaymentInput
) {
  const result = await bookingChargesService.verifyChargePayment(
    getAuth(c).sub,
    bookingId,
    chargeId,
    input
  )

  return c.json({
    success: true,
    data: result,
  })
}

export async function createExtraWorkUploadUrl(
  c: ChargesContext,
  bookingId: string,
  input: ExtraWorkUploadUrlInput
) {
  const upload = await bookingChargesService.createExtraWorkUploadUrl(getVendorId(c), bookingId, input)
  return c.json({ success: true, data: upload })
}

export async function askExtraWork(c: ChargesContext, bookingId: string, input: AskExtraWorkInput) {
  const extraWork = await bookingChargesService.askExtraWork(getVendorId(c), getAuth(c).sub, bookingId, input)
  return c.json({ success: true, data: extraWork }, 201)
}

export async function withdrawExtraWork(c: ChargesContext, bookingId: string, chargeId: string) {
  const extraWork = await bookingChargesService.withdrawExtraWork(getVendorId(c), bookingId, chargeId)
  return c.json({ success: true, data: extraWork })
}

export async function declineExtraWork(c: ChargesContext, bookingId: string, chargeId: string) {
  const extraWork = await bookingChargesService.declineExtraWork(getAuth(c).sub, bookingId, chargeId)
  return c.json({ success: true, data: extraWork })
}
