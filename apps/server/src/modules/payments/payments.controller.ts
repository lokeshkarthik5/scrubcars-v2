import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { byClientIp } from '../../middleware/rate-limit.middleware.js'
import { paymentsService } from './payments.service.js'
import type { VerifyPaymentInput } from './payments.validation.js'

type PaymentsContext = Context<{ Variables: AuthVariables }>

function getAuth(c: PaymentsContext) {
  return c.get('auth')
}

export async function createOrder(c: PaymentsContext, bookingId: string) {
  const order = await paymentsService.createOrder(getAuth(c).sub, bookingId)

  return c.json({
    success: true,
    data: order,
  })
}

export async function verifyPayment(
  c: PaymentsContext,
  input: VerifyPaymentInput
) {
  // The browser's address and user agent, used only for the Meta Purchase
  // event of a customer who accepted marketing cookies.
  const result = await paymentsService.verifyPayment(getAuth(c).sub, input, {
    clientIp: byClientIp(c),
    userAgent: c.req.header('user-agent'),
  })

  return c.json({
    success: true,
    data: result,
  })
}

export async function handleWebhook(c: Context) {
  const rawBody = await c.req.text()
  const signature = c.req.header('x-razorpay-signature')
  const result = await paymentsService.handleWebhook(rawBody, signature)

  return c.json({
    success: true,
    data: result,
  })
}
