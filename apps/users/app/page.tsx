import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@repo/ui/sc/app-shell'
import { LandingView } from '@/components/behaviour-marks'
import { LandingApp } from '@/components/landing/landing-app'
import { LandingFooter } from '@/components/landing/landing-footer'
import { getLandingList } from '@/components/landing/landing-list'
import { SkipLink } from '@/components/skip-link'

/**
 * detlio.com for a visitor who is not signed in: the app itself (customer
 * reach, 0062). About 600 visitors left the old homepage without tapping
 * anything; its headline faded in word by word and there were no garages,
 * prices or "near me" on the first screen. Now the first screen is the
 * headline, "Where's your car?" and real garages with prices, with no
 * animation before any of it. The old page is kept whole at /about.
 *
 * Server-rendered and static (revalidated every five minutes with its first
 * page of garages), so it is indexable and paints without waiting on the
 * API. It reads no URL query: anything that would must use useSearchParams
 * inside a Suspense boundary, never the `searchParams` prop, which a static
 * page gets empty. Signed-in customers are sent on to /home: before paint by
 * the script in the root layout (signed-in-landing.ts), or by AppProvider
 * once the session resolves.
 */

const TITLE = 'Detlio — Car wash & detailing near you in Chennai'
const DESCRIPTION =
  'Real prices from Chennai garages. Book a car wash, detailing, coating or scratch removal in 1 minute: at the garage, at your door, or with pickup & drop.'

// The share image is the site's own (app/opengraph-image.png and
// twitter-image.png, 1200×630), which Next adds to this segment by itself
// and ranks above any `images` set here. `metadataBase` comes from the root
// layout.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Detlio',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default async function LandingPage() {
  const initialPage = await getLandingList()

  return (
    <>
      <SkipLink />
      <AppShell
        showBrand
        className="gap-4 py-4"
        brandRight={
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-1 text-[15px] text-text-primary"
          >
            Sign in
          </Link>
        }
      >
        {/* tabIndex -1 so the skip link moves focus here, not just the view. */}
        <div id="main" tabIndex={-1} className="flex flex-col gap-4 outline-none" data-app-landing="">
          <div className="pt-2">
            <h1 className="text-[30px] font-medium leading-[1.12] tracking-[-0.025em] text-text-primary">
              Car wash &amp; detailing near you,{' '}
              <span className="text-brand-red">today.</span>
            </h1>
            <p className="mt-2 text-[15px] leading-snug text-text-secondary">
              Real prices from Chennai garages. Book in 1 minute.
            </p>
          </div>

          <LandingApp initialPage={initialPage} />

          <LandingFooter />
        </div>
      </AppShell>
      {/* Statistics → Behaviour: "Landed". "Saw a garage" is the list's own
          watcher (GarageList), which reports it with the tab. */}
      <LandingView />
    </>
  )
}
