'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  closeConsentSettings,
  getConsentSnapshot,
  getServerConsentSnapshot,
  saveConsent,
  shouldAsk,
  subscribeConsent,
} from '@/lib/consent'
import { pixelExcluded } from '@/lib/meta-pixel'
import { LEGAL_PATHS } from '@/lib/legal/routes'

const BUTTON =
  'inline-flex h-11 min-w-[7.5rem] flex-1 items-center justify-center rounded-full px-4 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-white sm:flex-none'

/**
 * The cookie question, one for both: "Allow analytics and marketing
 * cookies?" (Microsoft Clarity, Meta's Pixel), with Allow and Only
 * essential, the two the same size, and a link to the privacy policy.
 *
 * A slim bar at the top of the page, in the flow and sticky, so it takes its
 * own room rather than covering the page: the sticky Pay and Book buttons
 * and the nav at the bottom are never under it. It sets --consent-bar to its
 * height while it is up (app/globals.css), which the few things fixed to
 * the top move down by.
 *
 * Shown until a choice is made, on every page the Pixel and Clarity may run
 * on (not the gift, coupon, certificate, invite or booking pages), again
 * from Cookie settings, and once more to a customer whose only answer was
 * the first banner's marketing yes, which did not cover analytics. A
 * browser with Do Not Track or Global Privacy Control on, or a team device,
 * is never asked: that already means "essential". Rendered only in the
 * browser, after the cookie is read, so a customer who has chosen never
 * sees it flash.
 */
export function ConsentBanner() {
  const pathname = usePathname()
  const params = useSearchParams()
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerConsentSnapshot
  )
  const hidden = pixelExcluded(pathname, params.get('next'))
  const show = consent.ready && !hidden && shouldAsk(consent)
  const bar = useRef<HTMLElement>(null)

  // Its height, for what is fixed to the top.
  useEffect(() => {
    const root = document.documentElement
    const element = bar.current
    if (!show || !element) {
      root.style.setProperty('--consent-bar', '0px')
      return
    }
    const measure = () =>
      root.style.setProperty(
        '--consent-bar',
        `${Math.ceil(element.getBoundingClientRect().height)}px`
      )
    measure()
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      root.style.setProperty('--consent-bar', '0px')
    }
  }, [show])

  // Opened from Cookie settings: the bar is at the top, the tap was lower
  // down, so focus goes to it for a keyboard or screen-reader user.
  useEffect(() => {
    if (show && consent.settingsOpen) bar.current?.focus()
  }, [show, consent.settingsOpen])

  if (!show) return null

  return (
    <section
      ref={bar}
      aria-label="Cookie choice"
      tabIndex={-1}
      data-consent-banner
      className="sticky top-0 z-50 border-b border-border bg-surface outline-none print:hidden"
    >
      <div className="mx-auto flex w-full max-w-[428px] flex-col gap-3 px-4 py-3 sm:max-w-3xl sm:flex-row sm:items-center sm:justify-between">
        {consent.teamDevice ? (
          <p className="text-[13px] leading-5 text-text-primary">
            This is a team device: nothing is measured here, and analytics and
            marketing cookies stay off.
          </p>
        ) : consent.privacySignal ? (
          <p className="text-[13px] leading-5 text-text-primary">
            Your browser asks sites not to track you, so analytics and marketing
            cookies stay off.{' '}
            <Link
              href={`${LEGAL_PATHS.privacy}#meta`}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-white"
            >
              Privacy policy
            </Link>
          </p>
        ) : (
          <p className="text-[13px] leading-5 text-text-primary">
            We use cookies to see how our site is used (Microsoft Clarity) and
            to measure our ads on Facebook and Instagram. Allow analytics and
            marketing cookies?{' '}
            <Link
              href={`${LEGAL_PATHS.privacy}#meta`}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-white"
            >
              Privacy policy
            </Link>
          </p>
        )}
        <div className="flex shrink-0 gap-2">
          {consent.privacySignal || consent.teamDevice ? (
            <button
              type="button"
              onClick={closeConsentSettings}
              className={`${BUTTON} border border-white/25 text-text-primary hover:bg-white/[0.06]`}
            >
              OK
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => saveConsent('essential')}
                className={`${BUTTON} border border-white/25 text-text-primary hover:bg-white/[0.06]`}
              >
                Only essential
              </button>
              <button
                type="button"
                onClick={() => saveConsent('all')}
                className={`${BUTTON} bg-brand-white text-brand-black hover:bg-white/90`}
              >
                Allow
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
