import { AppError } from './errors.js'
import { env } from './env.js'

const OTP_TEMPLATE = 'OTP1'
const TWO_FACTOR_BASE_URL = 'https://2factor.in/API/V1'

type TwoFactorResponse = {
  Status: string
  Details: string
}

/**
 * The SMS did not go out cleanly. `delivered` says what we know about the
 * message itself: 'no' when the provider definitely refused it (a 4xx, or a
 * 2xx whose body says it failed); 'unknown' when we never heard back properly
 * (a timeout, a network error, a 5xx, a body we could not read). Providers
 * often accept a request and still deliver after a slow answer, so in the
 * unknown case the code may be on its way to the customer.
 */
export class SmsSendError extends AppError {
  constructor(
    message: string,
    public readonly delivered: 'no' | 'unknown'
  ) {
    super(502, message, 'SMS_SEND_FAILED')
  }
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (!env.smsApiKey) {
    if (env.isDev) {
      console.log(`[SMS] OTP for +91${phone}: ${otp}`)
      return
    }

    throw new AppError(
      500,
      'SMS provider is not configured',
      'SMS_NOT_CONFIGURED'
    )
  }

  const url = `${TWO_FACTOR_BASE_URL}/${env.smsApiKey}/SMS/${phone}/${otp}/${OTP_TEMPLATE}`

  // Every way this can fail ends as SMS_SEND_FAILED carrying the provider's
  // own words, so the caller has one case to handle and the team's alert says
  // what actually went wrong. A network failure or timeout used to escape as
  // a raw error — a bare 500, or a 504 that blamed "an upstream service".
  // The message never includes the URL, which has the API key in it.
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'No answer from the SMS provider within 10 seconds'
        : 'Could not reach the SMS provider'
    throw new SmsSendError(reason, 'unknown')
  }

  if (!response.ok) {
    // A 4xx is the provider turning the request down; a 5xx can come after
    // it has already queued the message.
    throw new SmsSendError(
      `The SMS provider answered HTTP ${response.status}`,
      response.status < 500 ? 'no' : 'unknown'
    )
  }

  const body = (await response.json().catch(() => null)) as Partial<TwoFactorResponse> | null

  if (!body) {
    throw new SmsSendError('The SMS provider sent an answer we could not read', 'unknown')
  }

  if (body.Status !== 'Success') {
    throw new SmsSendError(body.Details || 'Failed to send OTP SMS', 'no')
  }
}
