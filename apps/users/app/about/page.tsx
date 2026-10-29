import type { Metadata, Viewport } from 'next'
import {
  META,
  RESULTS,
  TESTIMONIALS,
  VIDEOS,
} from '@/components/marketing/content'
import { getLiveGarages } from '@/components/marketing/live-garages'
import { ScrollMotion } from '@/components/marketing/scroll-motion'
import { GarageSeenWatcher } from '@/components/behaviour-marks'
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
 * The marketing homepage, kept whole at /about (customer reach, 0062: "the
 * landing page becomes the app"; the story is saved, not deleted, ready to
 * become a landing page again). Linked from the app landing's footer, whose
 * "How it works" and "FAQ" open its #how-it-works and #faq. Its calls to
 * action still go where they always went (/garages, /search, /map, /login).
 *
 * Server-rendered and indexed, like the page it was. Unlike `/`, a signed-in
 * customer who opens it reads it (AppProvider treats it as a document).
 */

const { title: TITLE, description: DESCRIPTION } = META

// The share image is named here, as /garages names it: Next adds the image
// files (app/opengraph-image.png, twitter-image.png) only to the segment
// they sit in, and a page's own openGraph and twitter replace the root's
// whole, so /about would otherwise share with no picture. `metadataBase`
// comes from the root layout.
const SHARE_IMAGE = {
  url: '/opengraph-image.png',
  width: 1200,
  height: 630,
  alt: 'Detlio. Care without compromise.',
}

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'website',
    url: '/about',
    siteName: 'Detlio',
    title: TITLE,
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
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

export default async function AboutPage() {
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
      {/* Statistics → Behaviour: "Saw a garage" once one of the garage
          cards below is on screen. "Landed" is the app landing's (/), not
          this page's. */}
      <GarageSeenWatcher />
    </>
  )
}
