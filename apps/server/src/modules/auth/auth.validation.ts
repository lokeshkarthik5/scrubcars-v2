import { z } from 'zod'

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number')

export const authAudienceSchema = z.enum(['customer', 'vendor'])

export const otpPurposeSchema = z.enum(['login', 'register', 'vendor_onboard'])

export const sendOtpSchema = z
  .object({
    phone: phoneSchema,
    purpose: otpPurposeSchema,
    audience: authAudienceSchema,
  })
  .superRefine((data, ctx) => {
    if (data.audience === 'customer' && data.purpose === 'vendor_onboard') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'vendor_onboard is only valid for vendor audience',
        path: ['purpose'],
      })
    }

    if (data.audience === 'vendor' && data.purpose === 'register') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'register is only valid for customer audience',
        path: ['purpose'],
      })
    }
  })

export const verifyOtpSchema = z
  .object({
    phone: phoneSchema,
    otp: z.string().length(6, 'OTP must be 6 digits'),
    purpose: otpPurposeSchema,
    audience: authAudienceSchema,
    name: z.string().trim().min(1).max(255).optional(),
    // 0061: the customer app's random visit id (sessionStorage), so the
    // visit's usage events before sign-in get the account. Optional; an
    // older app, analytics off or Do Not Track sends none.
    visitId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.audience === 'customer' && data.purpose === 'vendor_onboard') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'vendor_onboard is only valid for vendor audience',
        path: ['purpose'],
      })
    }

    if (data.audience === 'vendor' && data.purpose === 'register') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'register is only valid for customer audience',
        path: ['purpose'],
      })
    }

    if (
      (data.purpose === 'register' || data.purpose === 'vendor_onboard') &&
      !data.name
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'name is required for registration',
        path: ['name'],
      })
    }
  })

// The native apps hand the refresh token over in the body: they have no cookie.
const refreshTokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid refresh token')

export const nativeRefreshSchema = z
  .object({
    refreshToken: refreshTokenSchema,
    // Which app is asking, so a person who is both a customer and a garage
    // owner stays a customer in the customer app.
    audience: authAudienceSchema,
  })
  .strict()

export const nativeLogoutSchema = z.object({ refreshToken: refreshTokenSchema }).strict()

export type SendOtpInput = z.infer<typeof sendOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type NativeRefreshInput = z.infer<typeof nativeRefreshSchema>
export type NativeLogoutInput = z.infer<typeof nativeLogoutSchema>
