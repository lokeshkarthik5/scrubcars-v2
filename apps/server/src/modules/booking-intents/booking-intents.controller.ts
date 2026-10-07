import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { bookingIntentsService } from './booking-intents.service.js'
import type { CreateBookingIntentInput } from './booking-intents.validation.js'

type BookingIntentsContext = Context<{ Variables: AuthVariables }>

export async function createIntent(
  c: BookingIntentsContext,
  input: CreateBookingIntentInput
) {
  const intent = await bookingIntentsService.createIntent(
    c.get('auth').sub,
    input
  )

  return c.json(
    {
      success: true,
      data: intent,
    },
    201
  )
}

export async function getIntentStatus(c: BookingIntentsContext, intentId: string) {
  const status = await bookingIntentsService.getIntentStatus(
    c.get('auth').sub,
    intentId
  )

  return c.json({
    success: true,
    data: status,
  })
}
