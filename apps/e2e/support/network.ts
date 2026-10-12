/**
 * Everything that keeps a test run independent of the outside world.
 */
import type { BrowserContext, Page } from '@playwright/test'

/**
 * Hosts a page must never reach during a test.
 *
 * Not a performance measure — a correctness one. A run that silently depends
 * on OpenFreeMap being up is a run that goes red for reasons nobody changed.
 * Razorpay is on the list because `window.Razorpay` is stubbed before any
 * script loads, so a request to it means the stub failed to install and the
 * test should fail loudly rather than open a real checkout.
 * Facebook is on the list because the customer app loads the Meta Pixel;
 * a test must not depend on it being up.
 */
const BLOCKED_HOSTS = [
  'checkout.razorpay.com',
  'api.razorpay.com',
  'lumberjack.razorpay.com',
  'tiles.openfreemap.org',
  'api.olamaps.io',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'connect.facebook.net',
  'www.facebook.com',
]

export async function blockThirdParties(context: BrowserContext) {
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      return route.abort('blockedbyclient')
    }
    return route.fallback()
  })
}

/**
 * Stands in for the Razorpay checkout sheet.
 *
 * `loadRazorpayScript()` in packages/core/src/razorpay.ts returns early when
 * `window.Razorpay` already exists, so defining it before any app script runs
 * is enough — no frontend change is needed to make checkout testable.
 *
 * The default behaviour is "the customer pays successfully", because that is
 * what most specs need. Two escape hatches cover the other outcomes:
 *
 *   window.__e2ePayment.mode = 'dismiss'  → the customer closes the sheet
 *   window.__e2ePayment.mode = 'fail'     → the gateway declines the card
 *
 * The options the app passed are recorded on `window.__e2ePayment.lastOptions`
 * so a spec can assert the order id and amount that reached the gateway.
 */
export async function stubRazorpay(context: BrowserContext) {
  await context.addInitScript(() => {
    const state: {
      mode: 'success' | 'dismiss' | 'fail'
      lastOptions: Record<string, unknown> | null
      openCount: number
    } = { mode: 'success', lastOptions: null, openCount: 0 }

    ;(window as unknown as { __e2ePayment: typeof state }).__e2ePayment = state

    class FakeRazorpay {
      private failHandler?: (response: { error: { description: string } }) => void

      constructor(private options: Record<string, unknown>) {
        state.lastOptions = options
      }

      on(event: string, handler: (response: { error: { description: string } }) => void) {
        if (event === 'payment.failed') this.failHandler = handler
      }

      open() {
        state.openCount += 1
        const opts = this.options as {
          order_id: string
          handler: (r: Record<string, string>) => void
          modal?: { ondismiss?: () => void }
        }

        // Deferred so `open()` returns first, the way the real sheet behaves —
        // the app's promise wiring assumes the callback is not synchronous.
        setTimeout(() => {
          if (state.mode === 'dismiss') return opts.modal?.ondismiss?.()
          if (state.mode === 'fail') {
            return this.failHandler?.({ error: { description: 'Your card was declined.' } })
          }
          opts.handler({
            razorpay_order_id: opts.order_id,
            razorpay_payment_id: `pay_e2e_${Date.now()}`,
            // Accepted because the order id carries the order_e2e_ prefix the
            // server minted; a real id would still have to match the HMAC.
            razorpay_signature: 'e2e-signature-not-checked',
          })
        }, 10)
      }
    }

    ;(window as unknown as { Razorpay: unknown }).Razorpay = FakeRazorpay
  })
}

export type PaymentMode = 'success' | 'dismiss' | 'fail'

/** Chooses what the next checkout does. Call before clicking Pay. */
export const setPaymentMode = (page: Page, mode: PaymentMode) =>
  page.evaluate((m) => {
    ;(window as unknown as { __e2ePayment: { mode: string } }).__e2ePayment.mode = m
  }, mode)

/** The options the app handed the gateway — order id, amount, prefill. */
export const lastPaymentOptions = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __e2ePayment: { lastOptions: Record<string, unknown> | null } })
        .__e2ePayment.lastOptions
  )

/**
 * Suppresses the location sheet that auto-opens ~1.2s after results land.
 *
 * It is a persisted zustand store, so the dismissal has to be in localStorage
 * before the app hydrates. Left alone, the sheet slides over the page mid-test
 * and steals the next click — a flake that looks like a missing element.
 */
export async function dismissLocationPrompt(context: BrowserContext) {
  await context.addInitScript(() => {
    // Key and shape must match location-store's persist config exactly:
    // name 'detlio-location', partialize keeps { location, promptDismissedAt }.
    // A fresh dismissal is inside the 7-day cooldown, so the sheet stays shut.
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: { location: null, promptDismissedAt: Date.now() },
        version: 0,
      })
    )
  })
}
