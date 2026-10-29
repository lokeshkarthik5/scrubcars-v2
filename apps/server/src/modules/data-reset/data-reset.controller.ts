import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { dataResetService } from './data-reset.service.js'
import type {
  ExecuteInput,
  PreviewInput,
  TestBookingDeleteInput,
  TestBookingPreviewInput,
} from './data-reset.validation.js'

type DataResetContext = Context<{ Variables: AuthVariables }>

export function getConfig(c: DataResetContext) {
  return c.json({ success: true, data: dataResetService.config() })
}

export async function preview(c: DataResetContext, input: PreviewInput) {
  const data = await dataResetService.preview(input)
  return c.json({ success: true, data })
}

// Takes the token's subject for the audit row, beside the signed-in admin's
// name (adminSignedJson, 0058).
export async function execute(c: DataResetContext, input: ExecuteInput) {
  const data = await dataResetService.execute(c.get('auth').sub, input)
  return c.json({ success: true, data })
}

// One test booking, from its page (0064): not behind the reset's switch.
export async function previewTestBooking(
  c: DataResetContext,
  bookingId: string,
  input: TestBookingPreviewInput
) {
  const data = await dataResetService.previewTestBooking(bookingId, input)
  return c.json({ success: true, data })
}

export async function deleteTestBooking(
  c: DataResetContext,
  bookingId: string,
  input: TestBookingDeleteInput
) {
  const data = await dataResetService.deleteTestBooking(
    c.get('auth').sub,
    bookingId,
    input
  )
  return c.json({ success: true, data })
}
