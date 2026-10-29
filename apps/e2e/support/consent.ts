/**
 * The customer app's cookie question (apps/users components/consent).
 *
 * Every test starts with it already answered "Only essential", so the bar
 * never takes room at the top of a page, shifts a sticky button or joins an
 * axe scan it was not written for — and the Meta Pixel stays off, as it would
 * for a customer who said no (the request is also blocked, blockThirdParties).
 * Only specs/users/consent-banner.spec.ts starts without an answer.
 *
 * Cookies ignore ports, so one cookie on localhost covers the three apps.
 */
import fs from 'node:fs'
import type { BrowserContext } from '@playwright/test'

export const CONSENT_COOKIE_NAME = 'detlio_consent'

type Cookie = Parameters<BrowserContext['addCookies']>[0][number]

/** `detlio_consent=essential` for localhost, as the app writes it (a year, SameSite=Lax). */
export const essentialConsentCookie = (): Cookie & { expires: number } => ({
  name: CONSENT_COOKIE_NAME,
  value: 'essential',
  domain: 'localhost',
  path: '/',
  expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
})

/** Answers the cookie question in a context (Only essential). */
export async function answerCookieQuestion(context: BrowserContext) {
  await context.addCookies([essentialConsentCookie()])
}

/** Adds the answer to a saved storageState file, so contexts made from it start answered. */
export function addConsentToStorageState(path: string) {
  const state = JSON.parse(fs.readFileSync(path, 'utf8')) as {
    cookies: Array<{ name: string }>
    origins: unknown[]
  }
  state.cookies = [
    ...state.cookies.filter((cookie) => cookie.name !== CONSENT_COOKIE_NAME),
    essentialConsentCookie(),
  ]
  fs.writeFileSync(path, JSON.stringify(state, null, 2))
}
