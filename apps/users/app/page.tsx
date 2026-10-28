import type { Metadata, Viewport } from 'next'
import {
  META,
  RESULTS,
  TESTIMONIALS,
  VIDEOS,
} from '@/components/marketing/content'
import { getLiveGarages } from '@/components/marketing/live-garages'
import { ScrollMotion } from '@/components/marketing/scroll-motion'
import {
  GarageSeenWatcher,
  LandingView,
} from '@/components/behaviour-marks'
import { SkipLink } from '@/components/skip-link'
import {
  AppShowcase,
  Faq,
  FinalCta,
  Garages,
  Hero,
  HowItWorks,
  Instagram,
  Perks,
  Promises,
  Results,
  Services,
  SiteFooter,
  SiteHeader,
  Testimonials,
  Videos,
} from '@/components/marketing/sections'

/**
 * The marketing homepage — what detlio.com shows a visitor who is not signed
 * in. Signed-in customers are sent on to the app: before paint by the script in
 * the root layout (see signed-in-landing.ts), or by AppProvider once the
 * session resolves.
 *
 * Server-rendered, so it is indexable and paints without waiting on the API.
 */

const { title: TITLE, description: DESCRIPTION } = META

// The share image is the site's own (app/opengraph-image.png and
// twitter-image.png, 1200×630). Next ranks those files above any `images`
// set here, so naming one here would be a setting that does nothing.
// `metadataBase` comes from the root layout.
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

/**
 * Zoom to 5x, said outright. The rest of the app leaves zoom alone and caps it
 * on iOS only, to stop Safari zooming into form fields (IosZoomGuard, which
 * leaves a page that names its own maximum as it is). This page has no
 * fields, and blocking pinch-zoom on a page meant for reading fails WCAG
 * 1.4.4.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

/**
 * Placeholder results, videos and reviews are for reviewing the layout: shown locally
 * and on Vercel preview deployments, never in production — where a section
 * with nothing real in it is left out. See content.ts.
 */
const SHOW_SAMPLES =
  process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'

export default async function HomePage() {
  const garages = await getLiveGarages()

  const results = RESULTS.filter((result) => SHOW_SAMPLES || !result.sample)
  const reels = VIDEOS.filter((reel) => SHOW_SAMPLES || !reel.sample)
  const testimonials = TESTIMONIALS.filter(
    (testimonial) => SHOW_SAMPLES || !testimonial.sample
  )
  // A row of one or two looks like an empty shop window; wait for a fuller one.
  const showGarages = garages.featured.length >= 3

  const navLinks = [
    { label: 'Services', href: '#services' },
    { label: 'Why Detlio', href: '#why' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Rewards', href: '#perks' },
    { label: 'FAQ', href: '#faq' },
  ]

  return (
    <>
      <SkipLink />
      <SiteHeader links={navLinks} />
      {/* tabIndex -1 so the skip link moves focus here, not just the view. */}
      <main id="main" tabIndex={-1} data-marketing-home className="outline-none">
        <Hero
          city={garages.cities.length === 1 ? garages.cities[0] : null}
          startingPrice={garages.startingPrice}
        />
        <AppShowcase />
        <Services />
        <Promises />
        <HowItWorks />
        {reels.length > 0 && <Videos reels={reels} />}
        {results.length > 0 && <Results results={results} />}
        {showGarages && <Garages garages={garages.featured} />}
        <Perks />
        <Instagram />
        {testimonials.length > 0 && (
          <Testimonials testimonials={testimonials} />
        )}
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <ScrollMotion />
      {/* Statistics → Behaviour: "Landed", and "Saw a garage" once one of
          the garage cards below is on screen. */}
      <LandingView />
      <GarageSeenWatcher />
    </>
  )
}
