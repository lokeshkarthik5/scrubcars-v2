/**
 * Shared setup for the cross-app journeys.
 *
 * Each journey drives a customer on :3000 and a garage on :3001 at the same
 * time, which needs two browser contexts with separate sessions — a single
 * context would let one app's cookies stand in for the other's.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { blockThirdParties, dismissLocationPrompt, stubRazorpay } from './network'
import { statePath } from './auth'

export const USERS_ORIGIN = 'http://localhost:3000'
export const VENDORS_ORIGIN = 'http://localhost:3001'

export type JourneyActors = {
  customerCtx: BrowserContext
  vendorCtx: BrowserContext
  customer: Page
  vendor: Page
  close: () => Promise<void>
}

export async function openActors(
  browser: Browser,
  customerRole: string,
  vendorId: string,
  // The garage's session. MAIN's owner unless the journey has a garage of
  // its own.
  vendorRole = 'vendor-owner'
): Promise<JourneyActors> {
  const customerCtx = await browser.newContext({
    storageState: statePath(customerRole),
    baseURL: USERS_ORIGIN,
  })
  const vendorCtx = await browser.newContext({
    storageState: statePath(vendorRole),
    baseURL: VENDORS_ORIGIN,
  })

  for (const ctx of [customerCtx, vendorCtx]) {
    await stubRazorpay(ctx)
    await dismissLocationPrompt(ctx)
    await blockThirdParties(ctx)
  }

  // The owner has more than one garage; pin the tenant or the vendor pages
  // show whichever the app happened to pick.
  await vendorCtx.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ['detlio.activeVendorId', vendorId] as const
  )

  const customer = await customerCtx.newPage()
  const vendor = await vendorCtx.newPage()

  return {
    customerCtx,
    vendorCtx,
    customer,
    vendor,
    close: async () => {
      await customerCtx.close()
      await vendorCtx.close()
    },
  }
}
