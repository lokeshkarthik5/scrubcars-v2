'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef } from 'react'
import { isVerifyPath } from '@repo/core/service-history-certificate'
import { carriesGiftCode } from '@/lib/gifts'
import { carriesCouponCode } from '@/lib/coupons'

/** Detlio's Meta Pixel. Public by design — it ships in the page. */
const PIXEL_ID = '891710590692874'

/**
 * Meta's base snippet, verbatim. The loader installs `fbq` (and queues calls
 * made before fbevents.js arrives), then records the landing PageView.
 */
const PIXEL_BOOT = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`

function trackPageView() {
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq
  fbq?.('track', 'PageView')
}

/**
 * Meta Pixel on every customer page but those whose address holds a gift
 * code (0049): the gift page (/gift/<code>) and sign-in on the way to
 * redeem one (?next=/gift/<code>). The code is the gift, and Meta is sent
 * the page's full address. Likewise a shared Service History certificate's
 * page (/verify/<token>, 0053): the token opens the car's record. And a
 * printed coupon's page (/c/<code>, 0055) and sign-in on the way back to it. Mounted inside a Suspense boundary (the layout's)
 * for useSearchParams.
 *
 * The boot snippet records the first view. App Router navigations do not
 * reload the document, so later views are sent when the path changes — the
 * first effect is skipped because the snippet already counted that load.
 */
export function MetaPixel() {
  const pathname = usePathname()
  const params = useSearchParams()
  const hidden =
    carriesGiftCode(pathname, params.get('next')) ||
    carriesCouponCode(pathname, params.get('next')) ||
    isVerifyPath(pathname)
  const booted = useRef(false)

  useEffect(() => {
    if (hidden) return
    if (!booted.current) {
      // This render is the one that puts the snippet on the page.
      booted.current = true
      return
    }
    trackPageView()
  }, [pathname, hidden])

  if (hidden) return null

  return (
    <>
      {/* lazyOnload: after the page has loaded and the browser is idle, so
          Meta's script (fbevents.js) never competes with the page's
          own JavaScript for the first paint and the first tap. The landing
          PageView is still sent, by this snippet, once it runs. */}
      <Script id="meta-pixel" strategy="lazyOnload">
        {PIXEL_BOOT}
      </Script>
      <noscript>
        {/* Meta's no-JS beacon. A plain img: next/image never runs without JS. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
