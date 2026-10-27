/**
 * The base test every spec imports.
 *
 * Wraps Playwright's `test` so that each page arrives with the outside world
 * blocked, the payment sheet stubbed, the location prompt suppressed and the
 * cookie question answered — things every spec needs and none of them worth
 * repeating.
 *
 * Signing in is opt-in per spec via `test.use({ storageState: ... })`, because
 * a few specs (login, signup, guest browsing) must start signed out.
 */
import { test as base, expect } from '@playwright/test'
import { blockThirdParties, dismissLocationPrompt, stubRazorpay } from './network'
import { statePath } from './auth'
import { answerCookieQuestion } from './consent'

export const test = base.extend<{ forEachTest: void; answerCookies: boolean }>({
  // The cookie question comes answered "Only essential" (support/consent.ts);
  // `test.use({ answerCookies: false })` starts without an answer.
  answerCookies: [true, { option: true }],
  forEachTest: [
    async ({ context, answerCookies }, use) => {
      // Order matters: both stubs are addInitScript, which must be registered
      // before the first navigation to run in the page's world.
      await stubRazorpay(context)
      await dismissLocationPrompt(context)
      await blockThirdParties(context)
      await context.grantPermissions(['geolocation'])
      if (answerCookies) await answerCookieQuestion(context)
      await use()
    },
    { auto: true },
  ],
})

export { expect, statePath }

/** `test.use({ storageState: asRole('customer-book') })` */
export const asRole = (role: string) => statePath(role)
